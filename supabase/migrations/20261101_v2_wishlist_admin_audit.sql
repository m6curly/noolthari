-- NOOLTHARI V2: account wishlist + privacy-conscious admin activity log.
-- Additive, safe to run once on the existing project. It does not alter orders,
-- customer profiles, product stock, payments, or historical accounting records.
begin;

create table if not exists public.wishlist_items (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);
create index if not exists idx_wishlist_items_customer_created
  on public.wishlist_items(customer_id, created_at desc);

alter table public.wishlist_items enable row level security;
revoke all on public.wishlist_items from public, anon, authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;
drop policy if exists wishlist_owner_select on public.wishlist_items;
drop policy if exists wishlist_owner_insert on public.wishlist_items;
drop policy if exists wishlist_owner_delete on public.wishlist_items;
create policy wishlist_owner_select on public.wishlist_items
  for select to authenticated using (customer_id = auth.uid());
create policy wishlist_owner_insert on public.wishlist_items
  for insert to authenticated with check (customer_id = auth.uid());
create policy wishlist_owner_delete on public.wishlist_items
  for delete to authenticated using (customer_id = auth.uid());

create table if not exists public.admin_activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  entity_table text not null,
  entity_id text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_activity_logs_created
  on public.admin_activity_logs(created_at desc);

alter table public.admin_activity_logs enable row level security;
revoke all on public.admin_activity_logs from public, anon, authenticated;
grant select on public.admin_activity_logs to authenticated;
drop policy if exists admin_activity_logs_admin_read on public.admin_activity_logs;
create policy admin_activity_logs_admin_read on public.admin_activity_logs
  for select to authenticated using (public.is_admin());

create or replace function public.capture_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_summary jsonb;
  v_entity_id text;
begin
  -- Do not log customer-initiated writes or service-role background operations.
  if auth.uid() is null or not public.is_admin() then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
  else
    v_row := to_jsonb(NEW);
  end if;
  v_entity_id := coalesce(v_row->>'id', v_row->>'order_id', v_row->>'product_id');

  -- Deliberately store a small operational summary only. Do not copy names,
  -- emails, phone numbers, addresses, return descriptions or payment secrets.
  v_summary := jsonb_strip_nulls(jsonb_build_object(
    'status', v_row->'status',
    'sku', v_row->'sku',
    'saree_name', v_row->'saree_name',
    'stock_quantity', v_row->'stock_quantity',
    'reserved_quantity', v_row->'reserved_quantity',
    'selling_price', v_row->'selling_price',
    'sale_price', v_row->'sale_price',
    'active', v_row->'active',
    'name', case when TG_TABLE_NAME = 'categories' then v_row->'name' else null end,
    'total', v_row->'total',
    'amount', v_row->'amount',
    'category', v_row->'category'
  ));

  insert into public.admin_activity_logs(actor_id, action, entity_table, entity_id, summary)
  values (auth.uid(), TG_OP, TG_TABLE_NAME, v_entity_id, coalesce(v_summary, '{}'::jsonb));

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- Replace only our own named triggers; the underlying business tables remain intact.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['products','categories','orders','shipments','return_requests','expenses'] loop
    execute format('drop trigger if exists v2_admin_activity on public.%I', v_table);
    execute format(
      'create trigger v2_admin_activity after insert or update or delete on public.%I for each row execute function public.capture_admin_activity()',
      v_table
    );
  end loop;
end;
$$;

-- 3) Add a modest database-side contact-form rate limit. The browser
--    honeypot is only a first layer; this trigger remains effective for direct
--    API calls. It limits repeated submissions per normalized email address.
create index if not exists idx_contact_messages_email_created
  on public.contact_messages(lower(email), created_at desc);

create or replace function public.limit_contact_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
  v_email text := lower(btrim(new.email));
begin
  perform pg_advisory_xact_lock(hashtext(v_email));
  select count(*) into v_recent
  from public.contact_messages
  where lower(email) = v_email
    and created_at > now() - interval '15 minutes';
  if v_recent >= 3 then
    raise exception 'CONTACT_RATE_LIMITED';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_message_rate_limit on public.contact_messages;
create trigger contact_message_rate_limit
before insert on public.contact_messages
for each row execute function public.limit_contact_message_rate();


-- 4) Transactional email outbox. Database events queue email safely; an Edge
--    Function sends messages via a verified Resend domain using server secrets.
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in ('order_status','shipment_status','return_status','refund_status')),
  event_value text not null,
  event_ref text not null default '',
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(order_id, event_type, event_value, event_ref)
);
create index if not exists idx_notification_queue_pending
  on public.notification_queue(status, available_at, created_at);
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from public, anon, authenticated;

create or replace function public.enqueue_customer_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
  v_order_id uuid;
  v_event_type text;
  v_status text;
  v_event_ref text;
begin
  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    if v_new->>'status' is not distinct from v_old->>'status' then return NEW; end if;
  end if;

  if TG_TABLE_NAME = 'orders' then
    v_order_id := (v_new->>'id')::uuid;
    v_event_type := 'order_status';
    v_event_ref := '';
    if v_new->>'status' = 'payment_pending' then return NEW; end if;
  elsif TG_TABLE_NAME = 'shipments' then
    v_order_id := (v_new->>'order_id')::uuid;
    v_event_type := 'shipment_status';
    v_event_ref := '';
    if v_new->>'status' = 'not_shipped' then return NEW; end if;
  elsif TG_TABLE_NAME = 'return_requests' then
    v_order_id := (v_new->>'order_id')::uuid;
    v_event_type := 'return_status';
    v_event_ref := coalesce(v_new->>'id','');
  elsif TG_TABLE_NAME = 'refunds' then
    v_order_id := (v_new->>'order_id')::uuid;
    v_event_type := 'refund_status';
    v_event_ref := coalesce(v_new->>'id','');
  else
    return NEW;
  end if;

  v_status := coalesce(v_new->>'status','updated');
  insert into public.notification_queue(order_id,event_type,event_value,event_ref)
  values (v_order_id,v_event_type,v_status,v_event_ref)
  on conflict (order_id,event_type,event_value,event_ref) do nothing;
  return NEW;
end;
$$;

drop trigger if exists queue_order_customer_notification on public.orders;
create trigger queue_order_customer_notification
  after update of status on public.orders
  for each row execute function public.enqueue_customer_notification();
drop trigger if exists queue_shipment_customer_notification on public.shipments;
create trigger queue_shipment_customer_notification
  after insert or update of status on public.shipments
  for each row execute function public.enqueue_customer_notification();
drop trigger if exists queue_return_customer_notification on public.return_requests;
create trigger queue_return_customer_notification
  after insert or update of status on public.return_requests
  for each row execute function public.enqueue_customer_notification();
drop trigger if exists queue_refund_customer_notification on public.refunds;
create trigger queue_refund_customer_notification
  after insert or update of status on public.refunds
  for each row execute function public.enqueue_customer_notification();

-- 5) Safe guest-bag import. The browser stores only IDs and quantities;
-- this RPC rechecks product status/stock, merges under a customer-cart lock,
-- and uses an idempotency key so a refresh cannot duplicate an import.
create table if not exists public.guest_cart_imports (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  import_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, import_id)
);
alter table public.guest_cart_imports enable row level security;
revoke all on public.guest_cart_imports from public, anon, authenticated;

create or replace function public.sync_guest_cart(p_import_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_cart_id uuid;
  v_item record;
  v_product_id uuid;
  v_requested integer;
  v_current integer;
  v_available integer;
  v_next integer;
  v_adjusted integer := 0;
  v_rows integer;
  v_status text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role <> 'customer' then raise exception 'CUSTOMER_ACCOUNT_REQUIRED'; end if;
  if p_import_id is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_GUEST_CART';
  end if;

  insert into public.guest_cart_imports(customer_id, import_id)
  values (v_uid, p_import_id)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('already_processed', true, 'adjusted_count', 0);
  end if;

  select id into v_cart_id from public.cart where customer_id = v_uid for update;
  if v_cart_id is null then
    insert into public.cart(customer_id) values (v_uid)
    on conflict(customer_id) do update set updated_at = now()
    returning id into v_cart_id;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value->>'product_id'
  loop
    begin
      v_product_id := (v_item.value->>'product_id')::uuid;
      v_requested := (v_item.value->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_GUEST_CART_ITEM';
    end;
    if v_requested < 1 or v_requested > 50 then raise exception 'INVALID_GUEST_CART_QUANTITY'; end if;

    select greatest(p.stock_quantity - p.reserved_quantity, 0), p.status
      into v_available, v_status
    from public.products p
    where p.id = v_product_id
    for update;
    if not found or v_status <> 'active' or v_available <= 0 then
      raise exception 'GUEST_CART_ITEM_UNAVAILABLE:%', v_product_id;
    end if;

    select quantity into v_current
    from public.cart_items
    where cart_id = v_cart_id and product_id = v_product_id;
    v_next := least(v_available, coalesce(v_current, 0) + v_requested);
    if v_next < coalesce(v_current, 0) + v_requested then v_adjusted := v_adjusted + 1; end if;

    insert into public.cart_items(cart_id, product_id, quantity)
    values (v_cart_id, v_product_id, v_next)
    on conflict(cart_id, product_id) do update set quantity = excluded.quantity;
  end loop;

  return jsonb_build_object('already_processed', false, 'adjusted_count', v_adjusted);
end;
$$;
revoke all on function public.sync_guest_cart(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_guest_cart(uuid, jsonb) to authenticated;

-- 5) Keep purchase cost and reserved inventory out of every browser session.
-- A hidden UI field is not a security boundary: customers could otherwise
-- read these columns directly through the Supabase REST API.
revoke select on table public.products from public, anon, authenticated;
grant select (
  id, sku, saree_name, slug, category_id, description, fabric, colour, pattern,
  occasion, saree_length, blouse_length, blouse_included, care_instructions,
  selling_price, sale_price, stock_quantity, status, featured, bestseller,
  created_at, updated_at
) on table public.products to anon, authenticated;

-- Admin reads that need purchase_price/reserved_quantity go through this
-- protected view. The predicate uses the authenticated user's profile role;
-- normal customers receive zero rows even though the view is selectable.
create or replace view public.admin_products
with (security_barrier = true, security_invoker = false)
as
select p.*
from public.products p
where public.is_admin();
revoke all on public.admin_products from public, anon, authenticated;
grant select on public.admin_products to authenticated;

-- Refund status changes are operationally important too; log them without
-- recording payment identifiers or provider secrets.
drop trigger if exists v2_admin_activity on public.refunds;
create trigger v2_admin_activity after insert or update or delete on public.refunds
  for each row execute function public.capture_admin_activity();

create or replace function public.claim_notification_batch(p_limit integer default 20)
returns table(id uuid, order_id uuid, event_type text, event_value text, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select q.id
    from public.notification_queue q
    where q.attempts < 5
      and (
        q.status = 'pending'
        or (q.status = 'failed' and q.available_at <= now())
        or (q.status = 'processing' and q.updated_at < now() - interval '5 minutes')
      )
    order by q.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,20),1),50)
  )
  update public.notification_queue q
  set status = 'processing', attempts = q.attempts + 1, updated_at = now(), last_error = null
  from candidates c
  where q.id = c.id
  returning q.id, q.order_id, q.event_type, q.event_value, q.attempts;
end;
$$;
revoke all on function public.claim_notification_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

notify pgrst, 'reload schema';

commit;

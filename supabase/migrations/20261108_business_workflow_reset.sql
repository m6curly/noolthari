-- NOOLTHARI business workflow upgrade
-- Apply once to the EXISTING Supabase project after a backup.
-- Keeps auth.users and public.profiles intact, including the configured admin.
-- The separate reset_business_data.sql clears old shop/business records only.

begin;

-- The final upgrade is self-contained for the newer storefront fields used by the browser.
-- Re-create customer-owned wishlists even when an older project missed the V2 migration.
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

alter table public.products add column if not exists instagram_url text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='products_instagram_url_https_check'
      and conrelid='public.products'::regclass
  ) then
    alter table public.products add constraint products_instagram_url_https_check
      check (instagram_url is null or (length(btrim(instagram_url)) between 1 and 2048
        and btrim(instagram_url) ~* '^https://(www\.|m\.)?instagram\.com/[^[:space:]]+$')) not valid;
  end if;
end;
$$;
alter table public.products validate constraint products_instagram_url_https_check;

-- ---------------------------------------------------------------------------
-- 1. Remove deprecated product fields and add the vendor relationship.
--    Drop the protected view first because it depends on public.products.
-- ---------------------------------------------------------------------------
drop view if exists public.admin_products;

alter table public.products
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;
alter table public.products
  drop column if exists saree_length,
  drop column if exists blouse_length,
  drop column if exists care_instructions,
  drop column if exists sale_price;

-- The customer browser can read only store-safe columns. Purchase price,
-- vendor and reserved stock remain behind the admin-only view.
revoke select on table public.products from public, anon, authenticated;
grant select (
  id, sku, saree_name, slug, category_id, description, fabric, colour, pattern,
  occasion, instagram_url, blouse_included, selling_price, stock_quantity,
  status, featured, bestseller, created_at, updated_at
) on table public.products to anon, authenticated;

create or replace view public.admin_products
with (security_barrier = true, security_invoker = false)
as
select p.*
from public.products p
where public.is_admin();
revoke all on public.admin_products from public, anon, authenticated;
grant select on public.admin_products to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Orders can represent online purchases and manually recorded sales.
--    Customer snapshots support offline / Instagram sales without an account.
-- ---------------------------------------------------------------------------
alter table public.orders alter column customer_id drop not null;
alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists sales_channel text not null default 'online',
  add column if not exists payment_mode text,
  add column if not exists internal_note text,
  add column if not exists sale_date date,
  add column if not exists paid_date date;

alter table public.orders
  alter column shipping_full_name drop not null,
  alter column shipping_phone drop not null,
  alter column shipping_address_line1 drop not null,
  alter column shipping_city drop not null,
  alter column shipping_state drop not null,
  alter column shipping_postal_code drop not null;

update public.orders o
set customer_name = coalesce(o.customer_name, p.name),
    customer_email = coalesce(o.customer_email, p.email),
    customer_phone = coalesce(o.customer_phone, p.phone)
from public.profiles p
where p.id = o.customer_id;

update public.orders set sale_date = created_at::date where sale_date is null;
update public.orders set paid_date = coalesce(updated_at::date, created_at::date) where status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded') and paid_date is null;

-- One admin customer directory includes account holders and manual buyers with
-- no login. Offline identities are grouped by email, then phone; orders with
-- no contact details stay separate instead of merging different people.
drop view if exists public.admin_customer_directory;
create view public.admin_customer_directory
with (security_barrier = true, security_invoker = false)
as
select
  'account:' || p.id::text as customer_key,
  p.id as profile_id,
  p.name as customer_name,
  p.email as customer_email,
  p.phone as customer_phone,
  true as has_account,
  p.created_at as first_seen,
  coalesce(max(o.created_at), p.created_at) as last_activity_at,
  count(o.id)::bigint as order_count,
  coalesce(sum(o.total) filter (where o.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded')),0)::numeric(12,2) as paid_order_value
from public.profiles p
left join public.orders o on o.customer_id = p.id
where p.role = 'customer' and public.is_admin()
group by p.id, p.name, p.email, p.phone, p.created_at
union all
select
  'offline:' || coalesce(
    nullif(lower(btrim(o.customer_email)),''),
    nullif(regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g'),''),
    'order:' || o.id::text
  ) as customer_key,
  null::uuid as profile_id,
  max(coalesce(nullif(o.customer_name,''),nullif(o.shipping_full_name,''),'Offline customer')) as customer_name,
  max(nullif(o.customer_email,'')) as customer_email,
  max(nullif(o.customer_phone,'')) as customer_phone,
  false as has_account,
  min(o.created_at) as first_seen,
  max(o.created_at) as last_activity_at,
  count(o.id)::bigint as order_count,
  coalesce(sum(o.total) filter (where o.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded')),0)::numeric(12,2) as paid_order_value
from public.orders o
where o.customer_id is null and public.is_admin()
group by coalesce(
  nullif(lower(btrim(o.customer_email)),''),
  nullif(regexp_replace(coalesce(o.customer_phone,''),'[^0-9]','','g'),''),
  'order:' || o.id::text
);
revoke all on public.admin_customer_directory from public, anon, authenticated;
grant select on public.admin_customer_directory to authenticated;

alter table public.orders alter column sale_date set default current_date;
alter table public.orders alter column sale_date set not null;
create index if not exists idx_orders_sale_date on public.orders(sale_date desc);
alter table public.orders drop constraint if exists orders_sales_channel_check;
alter table public.orders add constraint orders_sales_channel_check
  check (sales_channel in ('online','offline','instagram','whatsapp','gift','collaboration'));
alter table public.orders drop constraint if exists orders_payment_mode_check;
alter table public.orders add constraint orders_payment_mode_check
  check (payment_mode is null or payment_mode in ('cash','upi','bank','razorpay','other','credit','none'));

-- ---------------------------------------------------------------------------
-- 3. Purchase and expense metadata for auditable cash movement.
-- ---------------------------------------------------------------------------
alter table public.purchases
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists payment_account text not null default 'bank',
  add column if not exists source_reference text;
create unique index if not exists idx_purchases_source_reference
  on public.purchases(source_reference) where source_reference is not null;

alter table public.expenses
  add column if not exists paid_from text not null default 'bank';
alter table public.expenses drop constraint if exists expenses_paid_from_check;
alter table public.expenses add constraint expenses_paid_from_check
  check (paid_from in ('cash','bank','upi','razorpay','other'));

-- ---------------------------------------------------------------------------
-- 4. Single business ledger. Capital is not revenue; stock purchases are not
--    P&L expenses until the saree is sold (COGS comes from order_items).
-- ---------------------------------------------------------------------------
create table if not exists public.business_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in (
    'capital_in','sale_receipt','inventory_purchase','expense','refund',
    'settlement_transfer_in','settlement_transfer_out','gateway_fee',
    'owner_withdrawal','adjustment'
  )),
  direction text not null check (direction in ('in','out')),
  account text not null check (account in ('cash','bank','upi','razorpay','other')),
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  description text,
  transaction_date date not null default current_date,
  order_id uuid references public.orders(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  reference_id text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_ledger_date
  on public.business_ledger_entries(transaction_date desc, created_at desc);
create index if not exists idx_business_ledger_account
  on public.business_ledger_entries(account, transaction_date desc);
create unique index if not exists idx_business_ledger_order_sale
  on public.business_ledger_entries(order_id, entry_type)
  where order_id is not null;
drop index if exists public.idx_business_ledger_purchase;
create index if not exists idx_business_ledger_purchase
  on public.business_ledger_entries(purchase_id) where purchase_id is not null;
create unique index if not exists idx_business_ledger_expense
  on public.business_ledger_entries(expense_id);
create unique index if not exists idx_business_ledger_refund
  on public.business_ledger_entries(refund_id);
create unique index if not exists idx_business_ledger_settlement_reference
  on public.business_ledger_entries(reference_id, entry_type)
  where reference_id is not null and entry_type in ('settlement_transfer_in','settlement_transfer_out','gateway_fee');

alter table public.business_ledger_entries enable row level security;
revoke all on public.business_ledger_entries from public, anon, authenticated;
grant select on public.business_ledger_entries to authenticated;
drop policy if exists business_ledger_admin_read on public.business_ledger_entries;
create policy business_ledger_admin_read on public.business_ledger_entries
  for select to authenticated using (public.is_admin());

create table if not exists public.vendor_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  amount numeric(12,2) not null check(amount > 0),
  payment_account text not null check(payment_account in ('cash','bank','upi','razorpay','other')),
  transaction_date date not null default current_date,
  reference text,
  idempotency_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vendor_purchase_payments_purchase on public.vendor_purchase_payments(purchase_id, transaction_date);
alter table public.vendor_purchase_payments enable row level security;
revoke all on public.vendor_purchase_payments from public, anon, authenticated;
grant select on public.vendor_purchase_payments to authenticated;
drop policy if exists vendor_purchase_payments_admin_read on public.vendor_purchase_payments;
create policy vendor_purchase_payments_admin_read on public.vendor_purchase_payments
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Single editable home banner setting.
-- ---------------------------------------------------------------------------
create table if not exists public.store_settings (
  id boolean primary key default true check (id = true),
  hero_image_url text,
  hero_image_position text not null default 'center'
    check (hero_image_position in ('center','top','bottom')),
  updated_at timestamptz not null default now()
);
insert into public.store_settings(id, hero_image_position)
values (true, 'center')
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
revoke all on public.store_settings from public, anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;
drop policy if exists store_settings_public_read on public.store_settings;
drop policy if exists store_settings_admin_update on public.store_settings;
create policy store_settings_public_read on public.store_settings
  for select to anon, authenticated using (true);
create policy store_settings_admin_update on public.store_settings
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-assets', 'store-assets', true, 12582912,
        array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists store_assets_public_read on storage.objects;
drop policy if exists store_assets_admin_manage on storage.objects;
create policy store_assets_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'store-assets');
create policy store_assets_admin_manage on storage.objects
  for all to authenticated using (bucket_id = 'store-assets' and public.is_admin())
  with check (bucket_id = 'store-assets' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Keep ledger rows synchronised with paid orders, purchases and expenses.
-- ---------------------------------------------------------------------------
create or replace function public.set_order_paid_date()
returns trigger
language plpgsql
as $$
declare
  v_was_paid boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_was_paid := old.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded');
  end if;
  if new.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded')
     and not v_was_paid then
    new.paid_date := coalesce(new.paid_date,new.sale_date,current_date);
  end if;
  return new;
end;
$$;
drop trigger if exists set_order_paid_date on public.orders;
create trigger set_order_paid_date before insert or update of status on public.orders
for each row execute function public.set_order_paid_date();

create or replace function public.record_order_receipt_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded')
     and new.total > 0
     and (tg_op = 'INSERT' or old.status not in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded')) then
    insert into public.business_ledger_entries(
      entry_type, direction, account, amount, category, description,
      transaction_date, order_id, created_by
    ) values (
      'sale_receipt', 'in',
      case
        when coalesce(new.payment_provider,'') = 'razorpay' then 'razorpay'
        when new.payment_mode in ('cash','bank','upi','razorpay','other') then new.payment_mode
        else 'other'
      end,
      new.total, 'Sale', 'Receipt for order ' || new.order_number,
      coalesce(new.paid_date, new.sale_date, new.created_at::date, current_date), new.id, auth.uid()
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists record_order_receipt_ledger on public.orders;
create trigger record_order_receipt_ledger
after insert or update of status on public.orders
for each row execute function public.record_order_receipt_ledger();

create or replace function public.record_vendor_purchase_payment_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_ledger_entries(
    entry_type, direction, account, amount, category, description,
    transaction_date, purchase_id, reference_id, created_by
  ) values (
    'inventory_purchase', 'out', new.payment_account, new.amount,
    'Saree purchase', coalesce(new.reference, 'Payment to saree vendor'),
    new.transaction_date, new.purchase_id, 'vendor-payment:' || new.id::text, new.created_by
  );
  return new;
end;
$$;

drop trigger if exists record_purchase_ledger on public.purchases;
drop trigger if exists record_vendor_purchase_payment_ledger on public.vendor_purchase_payments;
create trigger record_vendor_purchase_payment_ledger
  after insert on public.vendor_purchase_payments
  for each row execute function public.record_vendor_purchase_payment_ledger();

create or replace function public.record_expense_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_ledger_entries(
    entry_type, direction, account, amount, category, description,
    transaction_date, expense_id, created_by
  ) values (
    'expense', 'out',
    case when new.paid_from in ('cash','bank','upi','razorpay','other') then new.paid_from else 'bank' end,
    new.amount, new.category, new.title || coalesce(' — ' || new.notes, ''),
    new.expense_date, new.id, new.created_by
  ) on conflict (expense_id) do update set
    account = excluded.account,
    amount = excluded.amount,
    category = excluded.category,
    description = excluded.description,
    transaction_date = excluded.transaction_date;
  return new;
end;
$$;

drop trigger if exists record_expense_ledger on public.expenses;
create trigger record_expense_ledger
after insert or update on public.expenses
for each row execute function public.record_expense_ledger();

create or replace function public.record_refund_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_provider text;
  v_was_refunded boolean := false;
begin
  if tg_op = 'UPDATE' then v_was_refunded := old.status = 'refunded'; end if;
  if new.status = 'refunded' and not v_was_refunded then
    select payment_provider into v_order_provider from public.orders where id = new.order_id;
    insert into public.business_ledger_entries(
      entry_type, direction, account, amount, category, description,
      transaction_date, order_id, refund_id, created_by
    ) values (
      'refund', 'out', case when v_order_provider = 'razorpay' then 'razorpay' else 'bank' end,
      new.amount, 'Customer refund', 'Refund against order ' || new.order_id::text,
      coalesce(new.updated_at::date, current_date), new.order_id, new.id, auth.uid()
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists record_refund_ledger on public.refunds;
create trigger record_refund_ledger
after insert or update of status on public.refunds
for each row execute function public.record_refund_ledger();

-- ---------------------------------------------------------------------------
-- 7. Admin RPC: receive vendor stock. Each receipt becomes a purchase,
--    purchase item, stock movement and (if paid) a ledger outflow.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_receive_stock(uuid,integer,numeric,uuid,numeric,text,text,text);
create or replace function public.admin_receive_stock(
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_vendor_id uuid,
  p_paid_amount numeric,
  p_payment_account text,
  p_notes text,
  p_client_reference text,
  p_purchase_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_purchase public.purchases;
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_old_qty integer;
  v_new_qty integer;
  v_old_cost numeric(12,2);
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then raise exception 'INVALID_QUANTITY'; end if;
  if p_unit_cost is null or p_unit_cost < 0 or p_unit_cost > 9999999999.99 then raise exception 'INVALID_UNIT_COST'; end if;
  if p_payment_account is null or p_payment_account not in ('cash','bank','upi','razorpay','other') then raise exception 'INVALID_PAYMENT_ACCOUNT'; end if;

  if p_client_reference is not null then
    select * into v_purchase from public.purchases where source_reference = p_client_reference;
    if found then return jsonb_build_object('purchase_id', v_purchase.id, 'already_recorded', true); end if;
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_vendor_id is not null and not exists (select 1 from public.vendors where id = p_vendor_id) then raise exception 'VENDOR_NOT_FOUND'; end if;

  v_total := round(p_quantity * p_unit_cost, 2);
  v_paid := coalesce(p_paid_amount, v_total);
  if v_paid < 0 or v_paid > v_total then raise exception 'INVALID_PAID_AMOUNT'; end if;
  v_old_qty := greatest(v_product.stock_quantity, 0);
  v_new_qty := v_old_qty + p_quantity;
  v_old_cost := coalesce(v_product.purchase_price, 0);

  insert into public.purchases(
    vendor_id, subtotal, total, purchase_date, notes,
    paid_amount, payment_account, source_reference
  ) values (
    p_vendor_id, v_total, v_total, coalesce(p_purchase_date,current_date), nullif(btrim(p_notes),''),
    v_paid, p_payment_account, p_client_reference
  ) returning * into v_purchase;

  insert into public.purchase_items(purchase_id, product_id, quantity, unit_cost, line_total)
  values (v_purchase.id, p_product_id, p_quantity, p_unit_cost, v_total);

  if v_paid > 0 then
    insert into public.vendor_purchase_payments(
      purchase_id, amount, payment_account, transaction_date, reference,
      idempotency_key, created_by
    ) values (
      v_purchase.id, v_paid, p_payment_account, coalesce(p_purchase_date,current_date),
      coalesce(nullif(btrim(p_notes),''),'Initial vendor payment'),
      case when p_client_reference is null then null else p_client_reference || ':initial-payment' end,
      auth.uid()
    );
  end if;

  update public.products
  set stock_quantity = v_new_qty,
      purchase_price = case when v_new_qty > 0 then round(((v_old_qty * v_old_cost) + (p_quantity * p_unit_cost)) / v_new_qty, 2) else p_unit_cost end,
      vendor_id = coalesce(p_vendor_id, vendor_id),
      updated_at = now()
  where id = p_product_id;

  insert into public.stock_movements(product_id, movement_type, quantity, reference_type, reference_id)
  values (p_product_id, 'purchase', p_quantity, 'purchase', v_purchase.id);

  return jsonb_build_object('purchase_id', v_purchase.id, 'already_recorded', false,
    'stock_quantity', v_new_qty, 'total', v_total, 'paid_amount', v_paid,
    'outstanding', v_total-v_paid);
end;
$$;
revoke all on function public.admin_receive_stock(uuid,integer,numeric,uuid,numeric,text,text,text,date) from public, anon, authenticated;
grant execute on function public.admin_receive_stock(uuid,integer,numeric,uuid,numeric,text,text,text,date) to authenticated;

create or replace function public.admin_pay_vendor_balance(
  p_purchase_id uuid,
  p_amount numeric,
  p_payment_account text,
  p_transaction_date date,
  p_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases;
  v_paid numeric(12,2);
  v_due numeric(12,2);
  v_payment public.vendor_purchase_payments;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_payment_account is null or p_payment_account not in ('cash','bank','upi','razorpay','other') then raise exception 'INVALID_PAYMENT_ACCOUNT'; end if;
  select * into v_purchase from public.purchases where id=p_purchase_id for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if p_idempotency_key is not null then
    select * into v_payment from public.vendor_purchase_payments where idempotency_key=p_idempotency_key;
    if found then return jsonb_build_object('already_recorded',true,'purchase_id',p_purchase_id); end if;
  end if;
  select coalesce(sum(amount),0) into v_paid from public.vendor_purchase_payments where purchase_id=p_purchase_id;
  v_due := v_purchase.total-v_paid;
  if p_amount > v_due then raise exception 'PAYMENT_EXCEEDS_VENDOR_DUE'; end if;
  insert into public.vendor_purchase_payments(purchase_id,amount,payment_account,transaction_date,reference,idempotency_key,created_by)
  values(p_purchase_id,round(p_amount,2),p_payment_account,coalesce(p_transaction_date,current_date),nullif(btrim(p_reference),''),p_idempotency_key,auth.uid())
  returning * into v_payment;
  update public.purchases set paid_amount=v_paid+p_amount,payment_account=p_payment_account where id=p_purchase_id;
  return jsonb_build_object('saved',true,'purchase_id',p_purchase_id,'paid',v_paid+p_amount,'due',v_due-p_amount);
end;
$$;
revoke all on function public.admin_pay_vendor_balance(uuid,numeric,text,date,text,text) from public, anon, authenticated;
grant execute on function public.admin_pay_vendor_balance(uuid,numeric,text,date,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Admin RPC: record a one-saree/manual sale, even when the buyer has no
--    website account. Uses the same orders/order_items tables as online sales.
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_manual_sale(
  p_product_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_id uuid,
  p_sales_channel text,
  p_payment_mode text,
  p_is_paid boolean,
  p_internal_note text,
  p_sale_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_order public.orders;
  v_qty integer;
  v_price numeric(12,2);
  v_total numeric(12,2);
  v_name text;
  v_phone text;
  v_email text;
  v_paid boolean;
  v_mode text;
  v_channel text;
  v_status public.order_status;
  v_order_number text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then raise exception 'INVALID_QUANTITY'; end if;
  if p_unit_price is null or p_unit_price < 0 or p_unit_price > 9999999999.99 then raise exception 'INVALID_UNIT_PRICE'; end if;
  v_name := nullif(btrim(p_customer_name),'');
  if v_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  v_phone := nullif(btrim(p_customer_phone),'');
  v_email := nullif(btrim(p_customer_email),'');
  v_paid := coalesce(p_is_paid, true);
  v_mode := coalesce(nullif(p_payment_mode,''), case when p_unit_price = 0 then 'none' else 'cash' end);
  if not v_paid and p_unit_price > 0 then v_mode := 'credit'; end if;
  v_channel := coalesce(nullif(p_sales_channel,''),'offline');
  if v_mode not in ('cash','upi','bank','razorpay','other','credit','none') then raise exception 'INVALID_PAYMENT_MODE'; end if;
  if v_paid and p_unit_price > 0 and v_mode in ('credit','none') then raise exception 'SELECT_A_RECEIVED_PAYMENT_METHOD'; end if;
  if v_channel not in ('offline','instagram','whatsapp','gift','collaboration') then raise exception 'INVALID_SALES_CHANNEL'; end if;
  if p_customer_id is not null and not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then raise exception 'CUSTOMER_ACCOUNT_NOT_FOUND'; end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_quantity > greatest(v_product.stock_quantity - v_product.reserved_quantity, 0) then raise exception 'INSUFFICIENT_STOCK'; end if;

  v_qty := p_quantity;
  v_price := round(p_unit_price,2);
  v_total := round(v_qty * v_price,2);
  v_status := case when v_paid or v_total = 0 then 'paid'::public.order_status else 'payment_pending'::public.order_status end;
  v_order_number := 'NL-M-' || to_char(now(),'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));

  insert into public.orders(
    order_number, customer_id, customer_name, customer_email, customer_phone,
    sales_channel, payment_mode, internal_note, sale_date, paid_date,
    subtotal, shipping_fee, discount, total, status, payment_provider,
    shipping_full_name, shipping_phone, shipping_address_line1,
    shipping_city, shipping_state, shipping_postal_code, shipping_country
  ) values (
    v_order_number, p_customer_id, v_name, v_email, v_phone,
    v_channel, v_mode, nullif(btrim(p_internal_note),''), coalesce(p_sale_date,current_date),
    case when v_paid or v_total=0 then coalesce(p_sale_date,current_date) else null end,
    v_total, 0, 0, v_total, v_status,
    case when v_mode = 'razorpay' then 'razorpay' else 'manual' end,
    v_name, v_phone, case when v_channel = 'offline' then 'Offline sale / collection' else 'Manual sale — shipping details to be updated' end,
    'Not specified', 'Not specified', '000000', 'India'
  ) returning * into v_order;

  insert into public.shipments(order_id) values (v_order.id);

  insert into public.order_items(order_id, product_id, product_name, sku, quantity, unit_price, line_total, purchase_cost)
  values (v_order.id, v_product.id, v_product.saree_name, v_product.sku, v_qty, v_price, v_total, v_product.purchase_price);

  update public.products
  set stock_quantity = stock_quantity - v_qty,
      updated_at = now()
  where id = v_product.id;

  insert into public.stock_movements(product_id, movement_type, quantity, reference_type, reference_id)
  values (v_product.id, case when v_channel in ('gift','collaboration') then 'gift' else 'manual_sale' end, -v_qty, 'order', v_order.id);

  if v_paid and v_total > 0 then
    insert into public.payments(order_id, gateway, amount, currency, status, payment_method)
    values (v_order.id, 'manual', v_total, 'INR', 'captured', v_mode);
  elsif not v_paid then
    insert into public.payments(order_id, gateway, amount, currency, status, payment_method)
    values (v_order.id, 'manual', v_total, 'INR', 'created', v_mode);
  end if;

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status, 'total', v_order.total);
end;
$$;
revoke all on function public.admin_record_manual_sale(uuid,integer,numeric,text,text,text,uuid,text,text,boolean,text,date) from public, anon, authenticated;
grant execute on function public.admin_record_manual_sale(uuid,integer,numeric,text,text,text,uuid,text,text,boolean,text,date) to authenticated;


create or replace function public.admin_mark_manual_order_paid(
  p_order_id uuid,
  p_payment_mode text,
  p_payment_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_payment_mode not in ('cash','upi','bank','other') then raise exception 'INVALID_PAYMENT_MODE'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_provider <> 'manual' or v_order.status <> 'payment_pending' then raise exception 'ONLY_UNPAID_MANUAL_ORDERS_CAN_BE_MARKED_PAID'; end if;
  if exists(select 1 from public.payments where order_id=p_order_id and status in ('captured','authorized')) then raise exception 'PAYMENT_ALREADY_RECORDED'; end if;
  update public.orders set status='paid',payment_mode=p_payment_mode,paid_date=coalesce(p_payment_date,current_date),updated_at=now() where id=p_order_id;
  update public.payments set status='captured',payment_method=p_payment_mode,updated_at=now() where order_id=p_order_id and gateway='manual' and status='created';
  if not found then
    insert into public.payments(order_id,gateway,amount,currency,status,payment_method)
    values(p_order_id,'manual',v_order.total,'INR','captured',p_payment_mode);
  end if;
  return jsonb_build_object('paid',true,'order_id',p_order_id,'order_number',v_order.order_number,'payment_date',coalesce(p_payment_date,current_date));
end;
$$;
revoke all on function public.admin_mark_manual_order_paid(uuid,text,date) from public, anon, authenticated;
grant execute on function public.admin_mark_manual_order_paid(uuid,text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Capital contributions and Razorpay settlement reconciliation.
--    Gateway captured funds stay in the Razorpay receivable account until a
--    settlement is manually matched to the bank statement.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_capital(
  p_amount numeric,
  p_account text,
  p_transaction_date date,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 then raise exception 'INVALID_AMOUNT'; end if;
  if p_account not in ('cash','bank','upi','other') then raise exception 'INVALID_ACCOUNT'; end if;
  insert into public.business_ledger_entries(entry_type,direction,account,amount,category,description,transaction_date,created_by)
  values ('capital_in','in',p_account,round(p_amount,2),'Owner investment',nullif(btrim(p_description),''),coalesce(p_transaction_date,current_date),auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_add_capital(numeric,text,date,text) from public, anon, authenticated;
grant execute on function public.admin_add_capital(numeric,text,date,text) to authenticated;

create or replace function public.admin_record_razorpay_settlement(
  p_gross_amount numeric,
  p_bank_credit numeric,
  p_fee numeric,
  p_settlement_date date,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_settlement_date,current_date);
  v_available numeric(12,2) := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_gross_amount is null or p_bank_credit is null or p_fee is null or p_gross_amount <= 0 or p_bank_credit < 0 or p_fee < 0 then raise exception 'INVALID_SETTLEMENT_AMOUNTS'; end if;
  if nullif(btrim(p_reference),'') is null then raise exception 'SETTLEMENT_REFERENCE_REQUIRED'; end if;
  if round(p_bank_credit + p_fee,2) <> round(p_gross_amount,2) then raise exception 'SETTLEMENT_MUST_BALANCE'; end if;
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into v_available
    from public.business_ledger_entries where account='razorpay';
  if round(p_gross_amount,2) > round(v_available,2) then raise exception 'SETTLEMENT_EXCEEDS_RAZORPAY_BALANCE'; end if;
  if p_bank_credit > 0 then
    insert into public.business_ledger_entries(entry_type,direction,account,amount,category,description,transaction_date,reference_id,created_by)
    values ('settlement_transfer_out','out','razorpay',round(p_bank_credit,2),'Razorpay settlement','Net amount transferred to bank',v_date,nullif(btrim(p_reference),''),auth.uid()) on conflict do nothing;
    insert into public.business_ledger_entries(entry_type,direction,account,amount,category,description,transaction_date,reference_id,created_by)
    values ('settlement_transfer_in','in','bank',round(p_bank_credit,2),'Razorpay settlement','Net amount credited to bank',v_date,nullif(btrim(p_reference),''),auth.uid()) on conflict do nothing;
  end if;
  if p_fee > 0 then
    insert into public.business_ledger_entries(entry_type,direction,account,amount,category,description,transaction_date,reference_id,created_by)
    values ('gateway_fee','out','razorpay',round(p_fee,2),'Payment gateway fee','Razorpay fee / tax on settlement',v_date,nullif(btrim(p_reference),''),auth.uid()) on conflict do nothing;
  end if;
  return jsonb_build_object('saved',true,'gross',p_gross_amount,'bank_credit',p_bank_credit,'fee',p_fee);
end;
$$;
revoke all on function public.admin_record_razorpay_settlement(numeric,numeric,numeric,date,text) from public, anon, authenticated;
grant execute on function public.admin_record_razorpay_settlement(numeric,numeric,numeric,date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Financial summary for the single Finance page.
-- ---------------------------------------------------------------------------
create or replace function public.admin_business_summary(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue numeric := 0;
  v_cogs numeric := 0;
  v_expenses numeric := 0;
  v_refunds numeric := 0;
  v_capital numeric := 0;
  v_cash numeric := 0;
  v_bank numeric := 0;
  v_upi numeric := 0;
  v_other numeric := 0;
  v_razorpay numeric := 0;
  v_stock numeric := 0;
  v_operating numeric := 0;
  v_total_funds numeric := 0;
  v_gateway_fees numeric := 0;
  v_vendor_due numeric := 0;
  v_customer_due numeric := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select coalesce(sum(o.total),0) into v_revenue
  from public.orders o
  where coalesce(o.sale_date,o.created_at::date) between p_from and p_to
    and o.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded');
  select coalesce(sum(oi.purchase_cost * oi.quantity),0) into v_cogs
  from public.order_items oi join public.orders o on o.id=oi.order_id
  where coalesce(o.sale_date,o.created_at::date) between p_from and p_to
    and o.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered','return_requested','returned','refund_processing','refunded');
  select coalesce(sum(e.amount),0) into v_expenses
  from public.expenses e where e.expense_date between p_from and p_to;
  select coalesce(sum(amount),0) into v_gateway_fees from public.business_ledger_entries
    where entry_type='gateway_fee' and transaction_date between p_from and p_to;
  select coalesce(sum(p.total - coalesce(pp.paid,0)),0) into v_vendor_due
    from public.purchases p left join (select purchase_id,sum(amount) as paid from public.vendor_purchase_payments group by purchase_id) pp on pp.purchase_id=p.id;
  select coalesce(sum(total),0) into v_customer_due from public.orders
    where payment_provider='manual' and status='payment_pending';
  select coalesce(sum(r.amount),0) into v_refunds
  from public.refunds r where r.status='refunded' and r.updated_at::date between p_from and p_to;
  select coalesce(sum(amount),0) into v_capital
  from public.business_ledger_entries where entry_type='capital_in';
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into v_cash
  from public.business_ledger_entries where account='cash';
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into v_bank
  from public.business_ledger_entries where account='bank';
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into v_upi
  from public.business_ledger_entries where account='upi';
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into v_other
  from public.business_ledger_entries where account='other';
  select coalesce(sum(case when direction='in' then amount else -amount end),0) into v_razorpay
  from public.business_ledger_entries where account='razorpay';
  select coalesce(sum(p.purchase_price * greatest(p.stock_quantity,0)),0) into v_stock
  from public.products p;
  v_operating := v_cash + v_bank + v_upi + v_other;
  v_total_funds := v_operating + v_razorpay;
  return jsonb_build_object(
    'revenue',v_revenue,'cogs',v_cogs,'gross_profit',v_revenue-v_cogs,
    'expenses',v_expenses,'refunds',v_refunds,'gateway_fees',v_gateway_fees,'vendor_payable',v_vendor_due,
    'net_profit',v_revenue-v_cogs-v_expenses-v_refunds-v_gateway_fees,
    'capital_invested',v_capital,'customer_due',v_customer_due,'cash_balance',v_cash,'bank_balance',v_bank,
    'upi_balance',v_upi,'other_balance',v_other,'razorpay_unsettled',v_razorpay,
    'operating_balance',v_operating,'business_funds',v_total_funds,'inventory_value',v_stock
  );
end;
$$;
revoke all on function public.admin_business_summary(date,date) from public, anon, authenticated;
grant execute on function public.admin_business_summary(date,date) to authenticated;

-- The legacy dashboard finance RPCs and duplicate bookkeeping tables are no longer used.
drop function if exists public.admin_profit_loss(timestamptz,timestamptz);
drop function if exists public.admin_balance_snapshot();
drop table if exists public.transactions;
drop table if exists public.accounts;

-- Payment reservations are never released while a payment is authorised or captured.
create or replace function public.release_expired_reservations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
begin
  for v_order in
    select id from public.orders
    where status='payment_pending'
      and reservation_expires_at is not null
      and reservation_expires_at <= now()
      and not exists (
        select 1 from public.payments p
        where p.order_id=orders.id and p.status in ('captured','authorized')
      )
    for update
  loop
    for v_item in select product_id,quantity from public.order_items where order_id=v_order.id loop
      update public.products
      set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now()
      where id=v_item.product_id;
    end loop;
    update public.orders set status='cancelled',updated_at=now()
    where id=v_order.id and status='payment_pending';
    update public.payments set status='failed',updated_at=now()
    where order_id=v_order.id and status in ('created','failed');
  end loop;
end;
$$;
revoke all on function public.release_expired_reservations() from public, anon, authenticated;
grant execute on function public.release_expired_reservations() to service_role;

create or replace function public.cancel_own_pending_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_order from public.orders
  where id=p_order_id and customer_id=auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'payment_pending' then
    return jsonb_build_object('cancelled',false,'status',v_order.status);
  end if;
  if exists(select 1 from public.payments where order_id=p_order_id and status in ('captured','authorized')) then
    raise exception 'PAYMENT_REQUIRES_RECONCILIATION';
  end if;
  for v_item in select product_id,quantity from public.order_items where order_id=p_order_id loop
    update public.products
    set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity),updated_at=now()
    where id=v_item.product_id;
  end loop;
  update public.orders set status='cancelled',updated_at=now()
  where id=p_order_id and status='payment_pending';
  update public.payments set status='failed',updated_at=now()
  where order_id=p_order_id and status not in ('captured','authorized');
  return jsonb_build_object('cancelled',true,'order_id',p_order_id);
end;
$$;
revoke all on function public.cancel_own_pending_order(uuid) from public, anon;
grant execute on function public.cancel_own_pending_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. A customer may remove only their own cancelled/failed, never-captured
--     order. Admin can clean the same failed order from the admin view.
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_failed_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'cancelled' then raise exception 'ORDER_MUST_BE_CANCELLED_FIRST'; end if;
  if exists(select 1 from public.payments where order_id=p_order_id and status in ('captured','authorized')) then raise exception 'PAYMENT_REQUIRES_RECONCILIATION'; end if;
  if exists(select 1 from public.refunds where order_id=p_order_id) then raise exception 'REFUND_RECORD_EXISTS'; end if;
  delete from public.orders where id=p_order_id;
  return jsonb_build_object('deleted',true,'order_id',p_order_id);
end;
$$;
revoke all on function public.delete_own_failed_order(uuid) from public, anon, authenticated;
grant execute on function public.delete_own_failed_order(uuid) to authenticated;

create or replace function public.admin_delete_failed_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'cancelled' then raise exception 'ORDER_MUST_BE_CANCELLED_FIRST'; end if;
  if exists(select 1 from public.payments where order_id=p_order_id and status in ('captured','authorized')) then raise exception 'PAYMENT_REQUIRES_RECONCILIATION'; end if;
  if exists(select 1 from public.refunds where order_id=p_order_id) then raise exception 'REFUND_RECORD_EXISTS'; end if;
  delete from public.orders where id=p_order_id;
  return jsonb_build_object('deleted',true,'order_id',p_order_id);
end;
$$;
revoke all on function public.admin_delete_failed_order(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_failed_order(uuid) to authenticated;


-- Rebuild checkout RPC without offer-price fields. A product has one customer price.
create or replace function public.create_payment_order(p_address_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cart_id uuid;
  v_addr public.addresses;
  v_item record;
  v_order public.orders;
  v_subtotal numeric := 0;
  v_item_count integer := 0;
  v_order_number text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.release_expired_reservations();
  select id into v_cart_id from public.cart where customer_id=v_uid for update;
  if v_cart_id is null then raise exception 'CART_EMPTY'; end if;
  if exists (
    select 1 from public.orders o join public.payments p on p.order_id=o.id
    where o.customer_id=v_uid and o.status in ('payment_pending','cancelled')
      and p.gateway='razorpay' and p.status='captured'
  ) then raise exception 'CAPTURED_PAYMENT_REQUIRES_REVIEW'; end if;
  if exists(select 1 from public.orders where customer_id=v_uid and status='payment_pending' and reservation_expires_at>now()) then
    raise exception 'PENDING_PAYMENT_EXISTS';
  end if;
  select * into v_addr from public.addresses where id=p_address_id and customer_id=v_uid;
  if v_addr.id is null then raise exception 'ADDRESS_NOT_FOUND'; end if;

  for v_item in
    select ci.product_id,ci.quantity,p.saree_name,p.sku,p.selling_price,p.purchase_price,
           p.stock_quantity,p.reserved_quantity,p.status
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.cart_id=v_cart_id order by p.id for update of ci,p
  loop
    v_item_count:=v_item_count+1;
    if v_item.status<>'active' then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if v_item.quantity<1 or v_item.quantity>(v_item.stock_quantity-v_item.reserved_quantity) then raise exception 'OUT_OF_STOCK:%',v_item.saree_name; end if;
    if v_item.selling_price<=0 then raise exception 'INVALID_PRODUCT_PRICE:%',v_item.saree_name; end if;
    v_subtotal:=v_subtotal+v_item.selling_price*v_item.quantity;
  end loop;
  if v_item_count=0 or v_subtotal<=0 then raise exception 'CART_EMPTY_OR_INVALID'; end if;
  v_order_number:='NL-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.orders(
    order_number,customer_id,subtotal,total,status,payment_provider,sales_channel,sale_date,
    shipping_full_name,shipping_phone,shipping_address_line1,shipping_address_line2,
    shipping_city,shipping_state,shipping_postal_code,shipping_country,reservation_expires_at
  ) values(
    v_order_number,v_uid,v_subtotal,v_subtotal,'payment_pending'::public.order_status,'razorpay','online',current_date,
    v_addr.full_name,v_addr.phone,v_addr.address_line1,v_addr.address_line2,
    v_addr.city,v_addr.state,v_addr.postal_code,v_addr.country,now()+interval '30 minutes'
  ) returning * into v_order;
  for v_item in
    select ci.product_id,ci.quantity,p.saree_name,p.sku,p.selling_price,p.purchase_price
    from public.cart_items ci join public.products p on p.id=ci.product_id
    where ci.cart_id=v_cart_id order by p.id
  loop
    insert into public.order_items(order_id,product_id,product_name,sku,quantity,unit_price,line_total,purchase_cost)
    values(v_order.id,v_item.product_id,v_item.saree_name,v_item.sku,v_item.quantity,v_item.selling_price,v_item.selling_price*v_item.quantity,v_item.purchase_price);
    update public.products set reserved_quantity=reserved_quantity+v_item.quantity,updated_at=now() where id=v_item.product_id;
  end loop;
  insert into public.payments(order_id,amount,status,gateway,currency)
  values(v_order.id,v_order.total,'created'::public.payment_status,'razorpay','INR');
  insert into public.shipments(order_id) values(v_order.id);
  return jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number,'amount',round(v_order.total*100));
end;
$$;
revoke all on function public.create_payment_order(uuid) from public, anon;
grant execute on function public.create_payment_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Remove the Activity feature and its database audit trigger machinery.
-- ---------------------------------------------------------------------------
do $$
declare v_table text;
begin
  foreach v_table in array array['products','categories','orders','shipments','return_requests','expenses','refunds'] loop
    execute format('drop trigger if exists v2_admin_activity on public.%I', v_table);
  end loop;
end;
$$;
drop function if exists public.capture_admin_activity();
drop table if exists public.admin_activity_logs;

notify pgrst, 'reload schema';
commit;

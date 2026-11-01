-- NOOLTHARI safe follow-up migration
-- Additive and re-runnable: does not drop commerce data or existing orders.
-- Run this once in Supabase SQL Editor after reviewing the backup below.

begin;

-- 1) Contact form storage was referenced by the frontend/admin but absent from
--    the original schema. Public users may submit only the four contact fields.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  email text not null check (char_length(btrim(email)) between 5 and 254),
  subject text not null check (char_length(btrim(subject)) between 3 and 160),
  message text not null check (char_length(btrim(message)) between 5 and 5000),
  status text not null default 'new' check (status in ('new','read','replied','closed')),
  admin_note text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_contact_messages_created_at
  on public.contact_messages(created_at desc);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from public, anon, authenticated;
grant insert (name, email, subject, message) on public.contact_messages to anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (status, admin_note, replied_at) on public.contact_messages to authenticated;

drop policy if exists contact_messages_public_insert on public.contact_messages;
drop policy if exists contact_messages_admin_read on public.contact_messages;
drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_public_insert on public.contact_messages
  for insert to anon, authenticated
  with check (status = 'new' and admin_note is null and replied_at is null);
create policy contact_messages_admin_read on public.contact_messages
  for select to authenticated
  using (public.is_admin());
create policy contact_messages_admin_update on public.contact_messages
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2) A profile owner can still edit their name/phone, but cannot self-promote
--    to admin. SQL Editor operations (auth.uid() IS NULL) remain available to
--    the project owner for the documented first-admin promotion procedure.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
before update of role on public.profiles
for each row execute function public.guard_profile_role_change();

-- 3) Validate return requests at the database boundary, not only in the UI.
create or replace function public.validate_return_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item public.order_items;
begin
  select * into v_order
  from public.orders
  where id = new.order_id
  for share;

  if v_order.id is null
     or v_order.customer_id <> new.customer_id
     or new.customer_id is distinct from auth.uid() then
    raise exception 'RETURN_ORDER_NOT_OWNED';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'RETURN_ORDER_NOT_DELIVERED';
  end if;

  select * into v_item
  from public.order_items
  where id = new.order_item_id
    and order_id = new.order_id
    and product_id = new.product_id
  for update;

  if v_item.id is null then
    raise exception 'RETURN_ITEM_MISMATCH';
  end if;

  if exists (
    select 1 from public.return_requests r
    where r.order_item_id = new.order_item_id
      and r.status in ('submitted','under_review','approved','refund_processing','refunded')
  ) then
    raise exception 'RETURN_ALREADY_REQUESTED';
  end if;

  new.status := 'submitted';
  new.admin_note := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists return_request_validation on public.return_requests;
create trigger return_request_validation
before insert on public.return_requests
for each row execute function public.validate_return_request();

-- 4) Customers were allowed to upload evidence into Storage but the matching
--    return_images table lacked an INSERT policy. Keep paths scoped to owner.
drop policy if exists return_images_owner_insert on public.return_images;
create policy return_images_owner_insert on public.return_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.return_requests r
      where r.id = return_id and r.customer_id = auth.uid()
    )
    and split_part(path, '/', 1) = auth.uid()::text
  );
grant select, insert (return_id, path) on public.return_images to authenticated;

-- Limit evidence uploads to common safe formats and a 5 MB maximum.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']::text[]
where id = 'return-evidence';

-- 5) Expired reservations must never be finalized later as a paid order.
--    Cart rows are deliberately retained during payment so a failed, dismissed,
--    or expired checkout does not silently empty the customer's bag.
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
    select id
    from public.orders
    where status = 'payment_pending'
      and reservation_expires_at is not null
      and reservation_expires_at <= now()
      and not exists (
        select 1 from public.payments p
        where p.order_id = orders.id and p.status = 'captured'
      )
    for update
  loop
    for v_item in
      select product_id, quantity
      from public.order_items
      where order_id = v_order.id
    loop
      update public.products
      set reserved_quantity = greatest(0, reserved_quantity - v_item.quantity),
          updated_at = now()
      where id = v_item.product_id;
    end loop;

    update public.orders
    set status = 'cancelled', updated_at = now()
    where id = v_order.id and status = 'payment_pending';
  end loop;
end;
$$;

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
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform public.release_expired_reservations();

  -- Lock the per-customer cart before checking pending orders. This makes
  -- simultaneous checkout attempts from multiple tabs serialize correctly.
  select id into v_cart_id
  from public.cart
  where customer_id = v_uid
  for update;

  if v_cart_id is null then
    raise exception 'CART_EMPTY';
  end if;

  if exists (
    select 1
    from public.orders o
    join public.payments p on p.order_id = o.id
    where o.customer_id = v_uid
      and o.status in ('payment_pending', 'cancelled')
      and p.gateway = 'razorpay'
      and p.status = 'captured'
  ) then
    raise exception 'CAPTURED_PAYMENT_REQUIRES_REVIEW';
  end if;

  if exists (
    select 1 from public.orders
    where customer_id = v_uid
      and status = 'payment_pending'
      and reservation_expires_at > now()
  ) then
    raise exception 'PENDING_PAYMENT_EXISTS';
  end if;

  select * into v_addr
  from public.addresses
  where id = p_address_id and customer_id = v_uid;

  if v_addr.id is null then
    raise exception 'ADDRESS_NOT_FOUND';
  end if;

  for v_item in
    select ci.product_id, ci.quantity, p.saree_name, p.sku,
           p.selling_price, p.sale_price, p.purchase_price,
           p.stock_quantity, p.reserved_quantity, p.status
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
    order by p.id
    for update of ci, p
  loop
    v_item_count := v_item_count + 1;

    if v_item.status <> 'active' then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    if v_item.quantity < 1
       or v_item.quantity > (v_item.stock_quantity - v_item.reserved_quantity) then
      raise exception 'OUT_OF_STOCK:%', v_item.saree_name;
    end if;

    if v_item.selling_price <= 0 then
      raise exception 'INVALID_PRODUCT_PRICE:%', v_item.saree_name;
    end if;

    v_subtotal := v_subtotal +
      (case
        when v_item.sale_price > 0 and v_item.sale_price < v_item.selling_price
          then v_item.sale_price
        else v_item.selling_price
      end) * v_item.quantity;
  end loop;

  if v_item_count = 0 or v_subtotal <= 0 then
    raise exception 'CART_EMPTY_OR_INVALID';
  end if;

  v_order_number := 'NL-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    order_number, customer_id, subtotal, total, status, payment_provider,
    shipping_full_name, shipping_phone, shipping_address_line1,
    shipping_address_line2, shipping_city, shipping_state,
    shipping_postal_code, shipping_country, reservation_expires_at
  ) values (
    v_order_number, v_uid, v_subtotal, v_subtotal,
    'payment_pending'::public.order_status, 'razorpay',
    v_addr.full_name, v_addr.phone, v_addr.address_line1,
    v_addr.address_line2, v_addr.city, v_addr.state,
    v_addr.postal_code, v_addr.country, now() + interval '30 minutes'
  ) returning * into v_order;

  for v_item in
    select ci.product_id, ci.quantity, p.saree_name, p.sku,
           p.selling_price, p.sale_price, p.purchase_price
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
    order by p.id
  loop
    insert into public.order_items (
      order_id, product_id, product_name, sku, quantity,
      unit_price, line_total, purchase_cost
    ) values (
      v_order.id, v_item.product_id, v_item.saree_name, v_item.sku,
      v_item.quantity,
      case when v_item.sale_price > 0 and v_item.sale_price < v_item.selling_price
        then v_item.sale_price else v_item.selling_price end,
      (case when v_item.sale_price > 0 and v_item.sale_price < v_item.selling_price
        then v_item.sale_price else v_item.selling_price end) * v_item.quantity,
      v_item.purchase_price
    );

    update public.products
    set reserved_quantity = reserved_quantity + v_item.quantity,
        updated_at = now()
    where id = v_item.product_id;
  end loop;

  insert into public.payments (order_id, amount, status, gateway, currency)
  values (v_order.id, v_order.total, 'created'::public.payment_status, 'razorpay', 'INR');

  insert into public.shipments (order_id) values (v_order.id);

  -- Do not delete cart rows here. They are removed only after verified payment.
  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'amount', round(v_order.total * 100)
  );
end;
$$;

create or replace function public.cancel_own_pending_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment public.payments;
  v_item record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id and customer_id = v_uid
  for update;

  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'payment_pending' then
    return jsonb_build_object('cancelled', false, 'status', v_order.status);
  end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id
  order by created_at desc
  limit 1
  for update;

  if v_payment.status = 'captured' then
    raise exception 'PAYMENT_ALREADY_CAPTURED';
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    update public.products
    set reserved_quantity = greatest(0, reserved_quantity - v_item.quantity),
        updated_at = now()
    where id = v_item.product_id;
  end loop;

  update public.orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id and status = 'payment_pending';

  update public.payments
  set status = 'failed', updated_at = now()
  where order_id = p_order_id and status <> 'captured';

  return jsonb_build_object('cancelled', true, 'order_id', p_order_id);
end;
$$;

create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_razorpay_order_id text,
  p_payment_id text,
  p_signature text,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_item record;
  v_cart_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into v_payment
  from public.payments
  where order_id = p_order_id and gateway = 'razorpay'
  order by created_at desc
  limit 1
  for update;

  if v_payment.id is null then raise exception 'PAYMENT_RECORD_NOT_FOUND'; end if;
  if v_payment.razorpay_order_id is distinct from p_razorpay_order_id then
    raise exception 'RAZORPAY_ORDER_MISMATCH';
  end if;

  if v_order.status in (
    'paid','confirmed','processing','shipped','out_for_delivery','delivered'
  ) then
    if v_payment.razorpay_payment_id = p_payment_id
       and v_payment.status = 'captured' then
      return jsonb_build_object('order_id', v_order.id, 'verified', true);
    end if;
    raise exception 'ORDER_ALREADY_FINALIZED';
  end if;

  if p_payment_id is null or length(btrim(p_payment_id)) = 0 then
    raise exception 'PAYMENT_ID_REQUIRED';
  end if;

  if v_payment.status = 'captured'
     and v_payment.razorpay_payment_id is not null
     and v_payment.razorpay_payment_id <> p_payment_id then
    raise exception 'PAYMENT_ID_MISMATCH';
  end if;

  -- A captured payment must keep its stock reservation even if the webhook
  -- arrives just after the 30-minute deadline. Only a still-reserved order is
  -- eligible for this late finalization; already-released orders need manual
  -- payment reconciliation and must never reduce stock below zero.
  if v_order.status <> 'payment_pending'
     or v_order.reservation_expires_at is null
     or (v_order.reservation_expires_at <= now()
         and not (v_payment.status = 'captured' and v_payment.razorpay_payment_id = p_payment_id)) then
    raise exception 'ORDER_RESERVATION_EXPIRED';
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id
    order by product_id
  loop
    if not exists (
      select 1 from public.products
      where id = v_item.product_id
        and stock_quantity >= v_item.quantity
        and reserved_quantity >= v_item.quantity
    ) then
      raise exception 'STOCK_RESERVATION_LOST';
    end if;

    update public.products
    set reserved_quantity = reserved_quantity - v_item.quantity,
        stock_quantity = stock_quantity - v_item.quantity,
        updated_at = now()
    where id = v_item.product_id;

    insert into public.stock_movements(
      product_id, movement_type, quantity, reference_type, reference_id
    ) values (
      v_item.product_id, 'sale', -v_item.quantity, 'order', v_order.id
    );
  end loop;

  update public.orders
  set status = 'paid', updated_at = now()
  where id = v_order.id;

  update public.payments
  set razorpay_order_id = p_razorpay_order_id,
      razorpay_payment_id = p_payment_id,
      razorpay_signature = p_signature,
      payment_method = p_payment_method,
      status = 'captured',
      updated_at = now()
  where id = v_payment.id;

  -- Subtract exactly the purchased quantities from the existing bag. This
  -- preserves any extra quantity a customer added while checkout was open.
  select id into v_cart_id
  from public.cart
  where customer_id = v_order.customer_id;

  if v_cart_id is not null then
    update public.cart_items ci
    set quantity = greatest(0, ci.quantity - oi.quantity)
    from public.order_items oi
    where oi.order_id = v_order.id
      and ci.cart_id = v_cart_id
      and ci.product_id = oi.product_id;

    delete from public.cart_items
    where cart_id = v_cart_id and quantity <= 0;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'verified', true);
end;
$$;

-- 6) Tighten RPC execution permissions. SECURITY DEFINER is not a substitute
--    for EXECUTE grants; browser users must not be able to mark orders paid.
revoke all on function public.create_payment_order(uuid) from public, anon;
grant execute on function public.create_payment_order(uuid) to authenticated;

revoke all on function public.cancel_own_pending_order(uuid) from public, anon;
grant execute on function public.cancel_own_pending_order(uuid) to authenticated;

revoke all on function public.finalize_paid_order(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text, text, text, text)
  to service_role;

revoke all on function public.release_expired_reservations() from public, anon, authenticated;
grant execute on function public.release_expired_reservations() to service_role;

revoke all on function public.admin_profit_loss(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.admin_profit_loss(timestamptz, timestamptz)
  to authenticated;

-- Avoid creating a check that could fail because of historical rows. NOT VALID
-- still enforces the rule for new/updated products until legacy rows are audited.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_sale_price_nonnegative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_sale_price_nonnegative
      check (sale_price is null or sale_price >= 0) not valid;
  end if;
end;
$$;

commit;

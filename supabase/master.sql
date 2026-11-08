create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('customer','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('payment_pending','paid','confirmed','processing','shipped','out_for_delivery','delivered','cancelled','return_requested','returned','refund_processing','refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('created','authorized','captured','failed','refunded','partially_refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.return_status as enum ('submitted','under_review','approved','rejected','refund_processing','refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shipment_status as enum ('not_shipped','shipped','out_for_delivery','delivered'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,name text,email text,phone text,role public.user_role not null default 'customer',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.categories(id uuid primary key default gen_random_uuid(),name text not null unique,slug text not null unique,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.products(id uuid primary key default gen_random_uuid(),sku text not null unique,saree_name text not null,slug text unique,category_id uuid references public.categories(id),description text,fabric text,colour text,pattern text,occasion text,instagram_url text,saree_length text,blouse_length text,blouse_included boolean not null default false,care_instructions text,purchase_price numeric(12,2) not null default 0,selling_price numeric(12,2) not null default 0,sale_price numeric(12,2),stock_quantity integer not null default 0,reserved_quantity integer not null default 0,status text not null default 'active' check(status in ('active','inactive')),featured boolean not null default false,bestseller boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(stock_quantity>=0),check(reserved_quantity>=0),check(selling_price>=0),check(purchase_price>=0),check(instagram_url is null or (length(btrim(instagram_url)) between 1 and 2048 and btrim(instagram_url) ~* '^https://(www\.|m\.)?instagram\.com/[^[:space:]]+$')));
create table if not exists public.product_images(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id) on delete cascade,path text not null,public_url text,sort_order integer not null default 0,is_primary boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.addresses(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.profiles(id) on delete cascade,full_name text not null,phone text not null,address_line1 text not null,address_line2 text,city text not null,state text not null,postal_code text not null,country text not null default 'India',created_at timestamptz not null default now());
create table if not exists public.cart(id uuid primary key default gen_random_uuid(),customer_id uuid not null unique references public.profiles(id) on delete cascade,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.cart_items(id uuid primary key default gen_random_uuid(),cart_id uuid not null references public.cart(id) on delete cascade,product_id uuid not null references public.products(id),quantity integer not null default 1,unique(cart_id,product_id),check(quantity>0));
create table if not exists public.orders(id uuid primary key default gen_random_uuid(),order_number text not null unique,customer_id uuid not null references public.profiles(id),subtotal numeric(12,2) not null,shipping_fee numeric(12,2) not null default 0,discount numeric(12,2) not null default 0,total numeric(12,2) not null,status public.order_status not null default 'payment_pending',payment_provider text,shipping_full_name text not null,shipping_phone text not null,shipping_address_line1 text not null,shipping_address_line2 text,shipping_city text not null,shipping_state text not null,shipping_postal_code text not null,shipping_country text not null default 'India',reservation_expires_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,product_id uuid not null references public.products(id),product_name text not null,sku text not null,quantity integer not null,unit_price numeric(12,2) not null,line_total numeric(12,2) not null,purchase_cost numeric(12,2) not null default 0);
create table if not exists public.payments(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,gateway text not null default 'razorpay',razorpay_order_id text,razorpay_payment_id text,razorpay_signature text,amount numeric(12,2) not null,currency text not null default 'INR',status public.payment_status not null default 'created',payment_method text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.shipments(id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.orders(id) on delete cascade,carrier text,tracking_number text,tracking_url text,status public.shipment_status not null default 'not_shipped',updated_at timestamptz not null default now());
create table if not exists public.return_requests(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),customer_id uuid not null references public.profiles(id),product_id uuid not null references public.products(id),order_item_id uuid not null references public.order_items(id),reason text not null,description text not null,status public.return_status not null default 'submitted',admin_note text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.return_images(id uuid primary key default gen_random_uuid(),return_id uuid not null references public.return_requests(id) on delete cascade,path text not null,created_at timestamptz not null default now());
create table if not exists public.refunds(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),payment_id uuid references public.payments(id),amount numeric(12,2) not null,status text not null default 'pending',provider_reference text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.vendors(id uuid primary key default gen_random_uuid(),name text not null,phone text,email text,address text,created_at timestamptz not null default now());
create table if not exists public.purchases(id uuid primary key default gen_random_uuid(),vendor_id uuid references public.vendors(id),invoice_number text,subtotal numeric(12,2) not null default 0,total numeric(12,2) not null default 0,purchase_date date not null default current_date,notes text,created_at timestamptz not null default now());
create table if not exists public.purchase_items(id uuid primary key default gen_random_uuid(),purchase_id uuid not null references public.purchases(id) on delete cascade,product_id uuid references public.products(id),quantity integer not null,unit_cost numeric(12,2) not null,line_total numeric(12,2) not null);
create table if not exists public.expenses(id uuid primary key default gen_random_uuid(),title text not null,category text not null,amount numeric(12,2) not null,expense_date date not null default current_date,notes text,created_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table if not exists public.stock_movements(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),movement_type text not null,quantity integer not null,reference_type text,reference_id uuid,created_at timestamptz not null default now());
create table if not exists public.accounts(id uuid primary key default gen_random_uuid(),name text not null unique,account_type text not null,opening_balance numeric(12,2) not null default 0,created_at timestamptz not null default now());
create table if not exists public.transactions(id uuid primary key default gen_random_uuid(),account_id uuid references public.accounts(id),type text not null,amount numeric(12,2) not null,reference_type text,reference_id uuid,description text,transaction_date date not null default current_date,created_at timestamptz not null default now());

create index if not exists idx_products_category on public.products(category_id);create index if not exists idx_products_status on public.products(status);create index if not exists idx_orders_customer on public.orders(customer_id);create index if not exists idx_orders_status on public.orders(status);create index if not exists idx_order_items_order on public.order_items(order_id);create index if not exists idx_returns_customer on public.return_requests(customer_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,email,name,phone) values(new.id,new.email,new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'phone') on conflict(id) do update set email=excluded.email,name=coalesce(excluded.name,profiles.name),phone=coalesce(excluded.phone,profiles.phone); insert into public.cart(customer_id) values(new.id) on conflict(customer_id) do nothing; return new;end$$;
drop trigger if exists on_auth_user_created on auth.users;create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create or replace function public.updated_at_trg() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;

create or replace function public.release_expired_reservations() returns void language plpgsql security definer set search_path=public as $$declare o record;i record;begin for o in select id from public.orders where status='payment_pending' and reservation_expires_at<now() for update loop for i in select product_id,quantity from public.order_items where order_id=o.id loop update public.products set reserved_quantity=greatest(0,reserved_quantity-i.quantity) where id=i.product_id; end loop; update public.orders set status='cancelled',updated_at=now() where id=o.id; end loop;end$$;
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
  v_order_number text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform public.release_expired_reservations();

  select id
  into v_cart_id
  from public.cart
  where customer_id = v_uid;

  if v_cart_id is null then
    raise exception 'CART_EMPTY';
  end if;

  select *
  into v_addr
  from public.addresses
  where id = p_address_id
    and customer_id = v_uid;

  if v_addr.id is null then
    raise exception 'ADDRESS_NOT_FOUND';
  end if;

  for v_item in
    select
      ci.product_id,
      ci.quantity,
      p.saree_name,
      p.sku,
      p.selling_price,
      p.sale_price,
      p.purchase_price,
      p.stock_quantity,
      p.reserved_quantity,
      p.status
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
    for update of p
  loop
    if v_item.status <> 'active' then
      raise exception 'PRODUCT_UNAVAILABLE';
    end if;

    if v_item.quantity > (v_item.stock_quantity - v_item.reserved_quantity) then
      raise exception 'OUT_OF_STOCK:%', v_item.saree_name;
    end if;

    v_subtotal := v_subtotal
      + coalesce(nullif(v_item.sale_price, 0), v_item.selling_price) * v_item.quantity;
  end loop;

  v_order_number :=
    'NL-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.orders (
    order_number,
    customer_id,
    subtotal,
    total,
    status,
    payment_provider,
    shipping_full_name,
    shipping_phone,
    shipping_address_line1,
    shipping_address_line2,
    shipping_city,
    shipping_state,
    shipping_postal_code,
    shipping_country,
    reservation_expires_at
  )
  values (
    v_order_number,
    v_uid,
    v_subtotal,
    v_subtotal,
    'payment_pending'::public.order_status,
    'razorpay',
    v_addr.full_name,
    v_addr.phone,
    v_addr.address_line1,
    v_addr.address_line2,
    v_addr.city,
    v_addr.state,
    v_addr.postal_code,
    v_addr.country,
    now() + interval '30 minutes'
  )
  returning * into v_order;

  for v_item in
    select
      ci.product_id,
      ci.quantity,
      p.saree_name,
      p.sku,
      p.selling_price,
      p.sale_price,
      p.purchase_price
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      sku,
      quantity,
      unit_price,
      line_total,
      purchase_cost
    )
    values (
      v_order.id,
      v_item.product_id,
      v_item.saree_name,
      v_item.sku,
      v_item.quantity,
      coalesce(nullif(v_item.sale_price, 0), v_item.selling_price),
      coalesce(nullif(v_item.sale_price, 0), v_item.selling_price) * v_item.quantity,
      v_item.purchase_price
    );

    update public.products
    set reserved_quantity = reserved_quantity + v_item.quantity,
        updated_at = now()
    where id = v_item.product_id;
  end loop;

  insert into public.payments (
    order_id,
    amount,
    status,
    gateway,
    currency
  )
  values (
    v_order.id,
    v_order.total,
    'created'::public.payment_status,
    'razorpay',
    'INR'
  );

  insert into public.shipments (order_id)
  values (v_order.id);

  delete from public.cart_items
  where cart_id = v_cart_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'amount', round(v_order.total * 100)
  );
end;
$$;
create or replace function public.finalize_paid_order(p_order_id uuid,p_razorpay_order_id text,p_payment_id text,p_signature text,p_payment_method text) returns jsonb language plpgsql security definer set search_path=public as $$declare o public.orders;i record;begin select * into o from public.orders where id=p_order_id for update;if o.id is null then raise exception 'ORDER_NOT_FOUND';end if; if o.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered') then return jsonb_build_object('order_id',o.id,'verified',true);end if;for i in select product_id,quantity from public.order_items where order_id=o.id loop update public.products set reserved_quantity=greatest(0,reserved_quantity-i.quantity),stock_quantity=stock_quantity-i.quantity where id=i.product_id;insert into public.stock_movements(product_id,movement_type,quantity,reference_type,reference_id) values(i.product_id,'sale',-i.quantity,'order',o.id);end loop;update public.orders set status='paid',updated_at=now() where id=o.id;update public.payments set razorpay_order_id=p_razorpay_order_id,razorpay_payment_id=p_payment_id,razorpay_signature=p_signature,payment_method=p_payment_method,status='captured',updated_at=now() where order_id=o.id;return jsonb_build_object('order_id',o.id,'verified',true);end$$;
create or replace function public.admin_profit_loss(p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$declare rev numeric:=0;cogs numeric:=0;exp numeric:=0;begin if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'FORBIDDEN';end if;select coalesce(sum(total),0) into rev from public.orders where created_at>=p_from and created_at<p_to and status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered');select coalesce(sum(oi.purchase_cost*oi.quantity),0) into cogs from public.order_items oi join public.orders o on o.id=oi.order_id where o.created_at>=p_from and o.created_at<p_to and o.status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered');select coalesce(sum(amount),0) into exp from public.expenses where expense_date>=p_from::date and expense_date<p_to::date;return jsonb_build_object('revenue',rev,'cogs',cogs,'expenses',exp,'net_profit',rev-cogs-exp);end$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::public.user_role
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.addresses enable row level security;
alter table public.cart enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.return_requests enable row level security;
alter table public.return_images enable row level security;
alter table public.refunds enable row level security;
alter table public.vendors enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

-- Public/profile policies. Every policy is dropped first so this file can be safely rerun.
drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_self on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists categories_public on public.categories;
drop policy if exists categories_admin on public.categories;
create policy categories_public on public.categories
  for select using (active or public.is_admin());
create policy categories_admin on public.categories
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists products_public on public.products;
drop policy if exists products_admin on public.products;
create policy products_public on public.products
  for select using (status = 'active' or public.is_admin());
create policy products_admin on public.products
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists product_images_public on public.product_images;
drop policy if exists product_images_admin on public.product_images;
create policy product_images_public on public.product_images
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (p.status = 'active' or public.is_admin())
    )
  );
create policy product_images_admin on public.product_images
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists address_owner on public.addresses;
create policy address_owner on public.addresses
  for all using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists cart_owner on public.cart;
drop policy if exists cart_items_owner on public.cart_items;
create policy cart_owner on public.cart
  for all using (customer_id = auth.uid())
  with check (customer_id = auth.uid());
create policy cart_items_owner on public.cart_items
  for all using (
    exists (
      select 1 from public.cart c
      where c.id = cart_id and c.customer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cart c
      where c.id = cart_id and c.customer_id = auth.uid()
    )
  );

drop policy if exists orders_customer on public.orders;
drop policy if exists orders_admin_update on public.orders;
create policy orders_customer on public.orders
  for select using (customer_id = auth.uid() or public.is_admin());
create policy orders_admin_update on public.orders
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists order_items_customer on public.order_items;
create policy order_items_customer on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists payments_customer on public.payments;
create policy payments_customer on public.payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists shipments_customer on public.shipments;
drop policy if exists shipments_admin on public.shipments;
create policy shipments_customer on public.shipments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_admin())
    )
  );
create policy shipments_admin on public.shipments
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists returns_customer on public.return_requests;
drop policy if exists returns_create on public.return_requests;
drop policy if exists returns_admin on public.return_requests;
create policy returns_customer on public.return_requests
  for select using (customer_id = auth.uid() or public.is_admin());
create policy returns_create on public.return_requests
  for insert with check (customer_id = auth.uid());
create policy returns_admin on public.return_requests
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists return_images_customer on public.return_images;
drop policy if exists return_images_admin on public.return_images;
create policy return_images_customer on public.return_images
  for select using (
    exists (
      select 1 from public.return_requests r
      where r.id = return_id and r.customer_id = auth.uid()
    )
  );
create policy return_images_admin on public.return_images
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists future_tables_admin_vendors on public.vendors;
drop policy if exists future_tables_admin_purchases on public.purchases;
drop policy if exists future_tables_admin_purchase_items on public.purchase_items;
drop policy if exists future_tables_admin_stock on public.stock_movements;
drop policy if exists future_tables_admin_accounts on public.accounts;
drop policy if exists future_tables_admin_transactions on public.transactions;
drop policy if exists refunds_admin on public.refunds;
create policy future_tables_admin_vendors on public.vendors
  for all using (public.is_admin()) with check (public.is_admin());
create policy future_tables_admin_purchases on public.purchases
  for all using (public.is_admin()) with check (public.is_admin());
create policy future_tables_admin_purchase_items on public.purchase_items
  for all using (public.is_admin()) with check (public.is_admin());
create policy future_tables_admin_stock on public.stock_movements
  for all using (public.is_admin()) with check (public.is_admin());
create policy future_tables_admin_accounts on public.accounts
  for all using (public.is_admin()) with check (public.is_admin());
create policy future_tables_admin_transactions on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());
create policy refunds_admin on public.refunds
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.categories(name,slug)
values
  ('Silk Sarees','silk-sarees'),
  ('Kanchipuram Sarees','kanchipuram-sarees'),
  ('Cotton Sarees','cotton-sarees'),
  ('Linen Sarees','linen-sarees'),
  ('Handloom Sarees','handloom-sarees'),
  ('Semi Silk Sarees','semi-silk-sarees')
on conflict(slug) do nothing;

insert into storage.buckets(id,name,public)
values('product-images','product-images',true)
on conflict(id) do nothing;
insert into storage.buckets(id,name,public)
values('return-evidence','return-evidence',false)
on conflict(id) do nothing;

-- Storage policies: CREATE POLICY does not support IF NOT EXISTS, so drop first.
drop policy if exists product_storage_read on storage.objects;
drop policy if exists product_storage_admin on storage.objects;
drop policy if exists return_storage_owner on storage.objects;
drop policy if exists return_storage_read on storage.objects;
drop policy if exists return_storage_delete on storage.objects;

create policy product_storage_read on storage.objects
  for select using (bucket_id = 'product-images');
create policy product_storage_admin on storage.objects
  for all using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy return_storage_owner on storage.objects
  for insert with check (
    bucket_id = 'return-evidence'
    and auth.uid()::text = split_part(name, '/', 1)
  );
create policy return_storage_read on storage.objects
  for select using (
    bucket_id = 'return-evidence'
    and (
      auth.uid()::text = split_part(name, '/', 1)
      or public.is_admin()
    )
  );
create policy return_storage_delete on storage.objects
  for delete using (
    bucket_id = 'return-evidence'
    and (auth.uid()::text = split_part(name, '/', 1) or public.is_admin())
  );


-- Master finance snapshot used by the admin dashboard.
create or replace function public.admin_balance_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_cash numeric := 0;
  v_inventory numeric := 0;
  v_receivables numeric := 0;
  v_liabilities numeric := 0;
  v_equity numeric := 0;
  v_expenses numeric := 0;
  v_refunds numeric := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select coalesce(sum(total),0) into v_cash
  from public.orders where status in ('paid','confirmed','processing','shipped','out_for_delivery','delivered');
  select coalesce(sum(purchase_price * greatest(stock_quantity,0)),0) into v_inventory
  from public.products where status='active';
  select coalesce(sum(amount),0) into v_expenses from public.expenses;
  select coalesce(sum(amount),0) into v_refunds from public.refunds where status in ('pending','approved','processing');
  v_liabilities := v_refunds;
  v_equity := v_cash + v_inventory - v_liabilities - v_expenses;
  return jsonb_build_object('cash',v_cash,'inventory',v_inventory,'receivables',v_receivables,'liabilities',v_liabilities,'equity',v_equity);
end;
$$;
revoke all on function public.admin_balance_snapshot() from public;
grant execute on function public.admin_balance_snapshot() to authenticated;

-- Safe admin order-status function; prevents customers from altering fulfilment.
create or replace function public.admin_set_order_status(p_order_id uuid,p_status public.order_status)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_current public.order_status;
  v_current_rank integer;
  v_next_rank integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('confirmed','processing','shipped','out_for_delivery','delivered') then
    raise exception 'INVALID_FULFILMENT_STATUS';
  end if;

  select status into v_current
  from public.orders
  where id=p_order_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  v_current_rank := case v_current
    when 'paid' then 0
    when 'confirmed' then 1
    when 'processing' then 2
    when 'shipped' then 3
    when 'out_for_delivery' then 4
    when 'delivered' then 5
    else -1
  end;
  v_next_rank := case p_status
    when 'confirmed' then 1
    when 'processing' then 2
    when 'shipped' then 3
    when 'out_for_delivery' then 4
    when 'delivered' then 5
    else -1
  end;

  if v_current_rank < 0 or v_next_rank < v_current_rank then
    raise exception 'ORDER_STATUS_CANNOT_MOVE_BACKWARDS_OR_BYPASS_PAYMENT';
  end if;

  update public.orders set status=p_status, updated_at=now() where id=p_order_id;
end;
$$;
revoke all on function public.admin_set_order_status(uuid,public.order_status) from public, anon, authenticated;
grant execute on function public.admin_set_order_status(uuid,public.order_status) to authenticated;

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
  occasion, instagram_url, saree_length, blouse_length, blouse_included, care_instructions,
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


notify pgrst, 'reload schema';

commit;

-- The following block finalises the fresh-project schema to the current app version.
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

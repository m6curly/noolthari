create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('customer','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('payment_pending','paid','confirmed','processing','shipped','out_for_delivery','delivered','cancelled','return_requested','returned','refund_processing','refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('created','authorized','captured','failed','refunded','partially_refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.return_status as enum ('submitted','under_review','approved','rejected','refund_processing','refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shipment_status as enum ('not_shipped','shipped','out_for_delivery','delivered'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,name text,email text,phone text,role public.user_role not null default 'customer',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.categories(id uuid primary key default gen_random_uuid(),name text not null unique,slug text not null unique,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.products(id uuid primary key default gen_random_uuid(),sku text not null unique,saree_name text not null,slug text unique,category_id uuid references public.categories(id),description text,fabric text,colour text,pattern text,occasion text,saree_length text,blouse_length text,blouse_included boolean not null default false,care_instructions text,purchase_price numeric(12,2) not null default 0,selling_price numeric(12,2) not null default 0,sale_price numeric(12,2),stock_quantity integer not null default 0,reserved_quantity integer not null default 0,status text not null default 'active' check(status in ('active','inactive')),featured boolean not null default false,bestseller boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(stock_quantity>=0),check(reserved_quantity>=0),check(selling_price>=0),check(purchase_price>=0));
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
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.orders set status=p_status, updated_at=now() where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.admin_set_order_status(uuid,public.order_status) from public;
grant execute on function public.admin_set_order_status(uuid,public.order_status) to authenticated;

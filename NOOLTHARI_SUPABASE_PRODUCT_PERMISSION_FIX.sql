-- NOOLTHARI product fields + Admin permission correction (existing project)
-- Safe, re-runnable patch. Does not delete products, orders, customers or finance data.
-- Admin-only reads use public.admin_products; public users retain only store-safe columns.

begin;

-- admin_products depends on products columns, so rebuild it after the column cleanup.
drop view if exists public.admin_products;

alter table public.products
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

alter table public.products
  drop column if exists sale_price,
  drop column if exists saree_length,
  drop column if exists blouse_length,
  drop column if exists care_instructions,
  drop column if exists fabric,
  drop column if exists pattern,
  drop column if exists occasion;

-- Public storefront must never receive private purchase cost/vendor/reservation columns.
revoke all privileges on table public.products from public, anon, authenticated;
grant select (
  id, sku, saree_name, slug, category_id, description, colour, instagram_url,
  blouse_included, selling_price, stock_quantity, status, featured, bestseller,
  created_at, updated_at
) on table public.products to anon, authenticated;

-- Admin writes are allowed at the SQL privilege layer but enforced by RLS below.
grant insert, update, delete on table public.products to authenticated;

alter table public.products enable row level security;
drop policy if exists products_admin on public.products;
create policy products_admin on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The view owner can read the protected base columns; is_admin() filters rows
-- for the current JWT. Normal customers receive no rows from this view.
create view public.admin_products
with (security_barrier = true, security_invoker = false)
as
select p.*
from public.products p
where public.is_admin();

revoke all privileges on table public.admin_products from public, anon, authenticated;
grant select on table public.admin_products to authenticated;

notify pgrst, 'reload schema';
commit;

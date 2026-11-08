-- NOOLTHARI™ 2026-11-08 product Instagram link + protected order fulfilment.
-- Additive/re-runnable migration for an EXISTING store.
-- Does not drop/reset customer accounts, products, orders, payments or stock.

begin;

-- 1. Optional public-facing Instagram Reel/video URL on each product.
alter table public.products
  add column if not exists instagram_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_instagram_url_https_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_instagram_url_https_check
      check (
        instagram_url is null
        or (
          length(btrim(instagram_url)) between 1 and 2048
          and btrim(instagram_url) ~* '^https://(www\.|m\.)?instagram\.com/[^[:space:]]+$'
        )
      ) not valid;
  end if;
end;
$$;

alter table public.products
  validate constraint products_instagram_url_https_check;

-- Instagram links are safe to expose alongside the other catalogue fields.
-- The earlier security migration revoked broad SELECT and granted an explicit
-- column allow-list; this adds only the new public field to that allow-list.
grant select (instagram_url)
  on table public.products
  to anon, authenticated;

-- 2. Keep admin-only costs/reserved stock behind the existing protected view.
-- Recreate after adding the column so admin_products includes instagram_url.
create or replace view public.admin_products
with (security_barrier = true, security_invoker = false)
as
select p.*
from public.products p
where public.is_admin();

revoke all on public.admin_products from public, anon, authenticated;
grant select on public.admin_products to authenticated;

-- 3. Make fulfilment status updates one-way and admin-only.
-- A dashboard must never manually mark an unpaid order as paid/refunded.
create or replace function public.admin_set_order_status(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.order_status;
  v_current_rank integer;
  v_next_rank integer;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if p_status not in ('confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered') then
    raise exception 'INVALID_FULFILMENT_STATUS';
  end if;

  select status
    into v_current
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

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

  update public.orders
     set status = p_status,
         updated_at = now()
   where id = p_order_id;
end;
$$;

revoke all on function public.admin_set_order_status(uuid, public.order_status)
  from public, anon, authenticated;
grant execute on function public.admin_set_order_status(uuid, public.order_status)
  to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- NOOLTHARI™ LATEST MASTER UPDATE
-- Existing Supabase project only. Safe additive update.
--
-- IMPORTANT:
--   * This file does NOT truncate or delete products, orders, customers,
--     profiles, purchases, expenses, stock, images or financial history.
--   * It refreshes the protected admin_products view so product description
--     is available on edit while customer-facing grants remain column-limited.
--   * It creates an owner-email notification queue for signups, orders,
--     order-status changes, returns and contact messages.
--   * Email delivery also requires deploying:
--       supabase/functions/send-admin-notifications/index.ts
--     and configuring Resend + the cron secret as described in the guide.
-- ============================================================================

begin;

-- 1) Restore the safe product permission contract and protected Admin view.
-- This changes grants/policies/view metadata only; it does not change product rows.
-- Storefront roles can read only public-facing columns. Purchase cost, vendor,
-- reserved stock and other internal fields remain behind the Admin-only view.
-- Existing admin_products is dropped/recreated inside this transaction so the
-- view never remains half-updated and existing products/images stay untouched.
drop view if exists public.admin_products;

alter table public.products
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

revoke all privileges on table public.products from public, anon, authenticated;
grant select (
  id, sku, saree_name, slug, category_id, description, colour, instagram_url,
  blouse_included, selling_price, stock_quantity, status, featured, bestseller,
  created_at, updated_at
) on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;

alter table public.products enable row level security;
drop policy if exists products_admin on public.products;
create policy products_admin on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create view public.admin_products
with (security_barrier = true, security_invoker = false)
as
select p.*
from public.products as p
where public.is_admin();

revoke all privileges on public.admin_products from public, anon, authenticated;
grant select on public.admin_products to authenticated;

-- The existing products_public policy remains in place for active storefront
-- items. The products_admin policy above is the only write path for admins.

-- 2) Ensure the existing editable homepage banner setting is present.
create table if not exists public.store_settings (
  id boolean primary key default true check (id = true),
  hero_image_url text,
  hero_image_position text not null default 'center'
    check (hero_image_position in ('center','top','bottom')),
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, hero_image_position)
values (true, 'center')
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
revoke all on public.store_settings from public, anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;

drop policy if exists store_settings_public_read on public.store_settings;
create policy store_settings_public_read
  on public.store_settings
  for select to anon, authenticated
  using (true);

drop policy if exists store_settings_admin_update on public.store_settings;
create policy store_settings_admin_update
  on public.store_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The collage is uploaded as one optimised 16:9 JPEG to this existing bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets',
  'store-assets',
  true,
  12582912,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists store_assets_public_read on storage.objects;
create policy store_assets_public_read
  on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'store-assets');

drop policy if exists store_assets_admin_manage on storage.objects;
create policy store_assets_admin_manage
  on storage.objects
  for all to authenticated
  using (bucket_id = 'store-assets' and public.is_admin())
  with check (bucket_id = 'store-assets' and public.is_admin());

-- 3) Private outbox for emails sent to the NOOLTHARI owner.
-- The existing notification_queue and customer email flow are left untouched.
create table if not exists public.admin_email_notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'signup',
      'order_created',
      'order_status',
      'return_created',
      'return_status',
      'shipment_status',
      'payment_status',
      'contact_message'
    )
  ),
  entity_id uuid not null,
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.admin_email_notifications
  drop constraint if exists admin_email_notifications_event_type_check;
alter table public.admin_email_notifications
  add constraint admin_email_notifications_event_type_check
  check (event_type in (
    'signup','order_created','order_status','return_created','return_status',
    'shipment_status','payment_status','contact_message'
  ));

create index if not exists idx_admin_email_notifications_pending
  on public.admin_email_notifications(status, available_at, created_at);

alter table public.admin_email_notifications enable row level security;
revoke all on public.admin_email_notifications from public, anon, authenticated;
grant select, insert, update, delete on public.admin_email_notifications to service_role;

-- 4) Central enqueue helper. Trigger functions call it transactionally.
create or replace function public.enqueue_admin_email_notification(
  p_event_type text,
  p_entity_id uuid,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in (
    'signup','order_created','order_status',
    'return_created','return_status','shipment_status',
    'payment_status','contact_message'
  ) then
    raise exception 'INVALID_ADMIN_NOTIFICATION_EVENT';
  end if;

  if p_entity_id is null or nullif(btrim(p_dedupe_key),'') is null then
    raise exception 'INVALID_ADMIN_NOTIFICATION_REFERENCE';
  end if;

  insert into public.admin_email_notifications(event_type, entity_id, dedupe_key)
  values (p_event_type, p_entity_id, p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.enqueue_admin_email_notification(text,uuid,text)
from public, anon, authenticated;

-- 5) New customer signup.
create or replace function public.queue_admin_signup_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_admin_email_notification(
    'signup',
    new.id,
    'signup:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists queue_admin_signup_email on public.profiles;
create trigger queue_admin_signup_email
after insert on public.profiles
for each row execute function public.queue_admin_signup_email();

-- 6) New orders and meaningful order status changes.
create or replace function public.queue_admin_order_created_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_admin_email_notification(
    'order_created',
    new.id,
    'order-created:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists queue_admin_order_created_email on public.orders;
create trigger queue_admin_order_created_email
after insert on public.orders
for each row execute function public.queue_admin_order_created_email();

create or replace function public.queue_admin_order_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.enqueue_admin_email_notification(
      'order_status',
      new.id,
      'order-status:' || new.id::text || ':' || new.status::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists queue_admin_order_status_email on public.orders;
create trigger queue_admin_order_status_email
after update of status on public.orders
for each row execute function public.queue_admin_order_status_email();

-- 7) New return requests and subsequent return-status changes.
create or replace function public.queue_admin_return_created_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_admin_email_notification(
    'return_created',
    new.id,
    'return-created:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists queue_admin_return_created_email on public.return_requests;
create trigger queue_admin_return_created_email
after insert on public.return_requests
for each row execute function public.queue_admin_return_created_email();

create or replace function public.queue_admin_return_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.enqueue_admin_email_notification(
      'return_status',
      new.id,
      'return-status:' || new.id::text || ':' || new.status::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists queue_admin_return_status_email on public.return_requests;
create trigger queue_admin_return_status_email
after update of status on public.return_requests
for each row execute function public.queue_admin_return_status_email();

-- 8) Shipment tracking and payment status changes are order-critical events.
create or replace function public.queue_admin_shipment_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.enqueue_admin_email_notification(
      'shipment_status',
      new.id,
      'shipment-status:' || new.id::text || ':' || new.status::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists queue_admin_shipment_status_email on public.shipments;
create trigger queue_admin_shipment_status_email
after update of status on public.shipments
for each row execute function public.queue_admin_shipment_status_email();

create or replace function public.queue_admin_payment_status_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text in ('authorized','captured','failed','partially_refunded','refunded') then
    if tg_op = 'INSERT' then
      perform public.enqueue_admin_email_notification(
        'payment_status',
        new.id,
        'payment-status:' || new.id::text || ':' || new.status::text
      );
    elsif new.status is distinct from old.status then
      perform public.enqueue_admin_email_notification(
        'payment_status',
        new.id,
        'payment-status:' || new.id::text || ':' || new.status::text
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_admin_payment_status_email on public.payments;
create trigger queue_admin_payment_status_email
after insert or update of status on public.payments
for each row execute function public.queue_admin_payment_status_email();

-- 9) New website contact enquiries.
create or replace function public.queue_admin_contact_message_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_admin_email_notification(
    'contact_message',
    new.id,
    'contact-message:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists queue_admin_contact_message_email on public.contact_messages;
create trigger queue_admin_contact_message_email
after insert on public.contact_messages
for each row execute function public.queue_admin_contact_message_email();

-- 10) Atomically claim the next batch. Only the Edge Function service role
-- can execute this function; browser roles cannot read the private email queue.
create or replace function public.claim_admin_email_notifications(p_limit integer default 20)
returns table (
  id uuid,
  event_type text,
  entity_id uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select q.id
    from public.admin_email_notifications as q
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
  update public.admin_email_notifications as q
  set status = 'processing',
      attempts = q.attempts + 1,
      updated_at = now(),
      last_error = null
  from candidates as c
  where q.id = c.id
  returning q.id, q.event_type, q.entity_id, q.attempts;
end;
$$;

revoke all on function public.claim_admin_email_notifications(integer)
from public, anon, authenticated;
grant execute on function public.claim_admin_email_notifications(integer)
to service_role;

-- 11) Try to enable the hosted Supabase scheduling/network extensions.
-- If project permissions or plan configuration prevent this, the schema and
-- triggers above remain valid; scheduling can be enabled from Dashboard.
do $$
begin
  if to_regnamespace('cron') is null then
    execute 'create extension if not exists pg_cron';
  end if;
  if to_regnamespace('net') is null then
    execute 'create extension if not exists pg_net';
  end if;
exception
  when others then
    raise notice 'pg_cron/pg_net could not be enabled automatically: %', sqlerrm;
end;
$$;

-- 12) Optional: schedule the email worker if pg_cron, pg_net and the two
-- Vault entries already exist. Otherwise this block safely skips scheduling.
--
-- Required Vault names:
--   noोलthari_supabase_url                  -> https://moptzrldmubkfteemyql.supabase.co
--   noolthari_notification_cron_secret      -> same value as Edge Function
--                                             secret NOTIFICATION_CRON_SECRET
--
-- Deploy the Edge Function and set secrets before expecting emails to arrive.
do $$
declare
  v_job record;
  v_command text;
  v_supabase_url text;
  v_cron_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regclass('cron.job') is null
     or to_regnamespace('net') is null then
    raise notice 'Email worker schema is ready. Automatic schedule was skipped because Vault/pg_cron/pg_net is not fully enabled or configured.';
    return;
  end if;

  execute $q$
    select
      max(case when name = 'noolthari_supabase_url' then decrypted_secret end),
      max(case when name = 'noolthari_notification_cron_secret' then decrypted_secret end)
    from vault.decrypted_secrets
    where name in ('noolthari_supabase_url','noolthari_notification_cron_secret')
  $q$ into v_supabase_url, v_cron_secret;

  if nullif(v_supabase_url,'') is null or nullif(v_cron_secret,'') is null then
    raise notice 'Email worker schema is ready. Add the two NOOLTHARI Vault secrets and rerun this master SQL to schedule delivery.';
    return;
  end if;

  v_command := $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'noolthari_supabase_url')
             || '/functions/v1/send-admin-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'noolthari_notification_cron_secret')
      ),
      body := jsonb_build_object('limit', 20)
    );
  $job$;

  for v_job in
    select jobid from cron.job
    where jobname = 'noolthari-admin-email-notifications'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'noolthari-admin-email-notifications',
    '* * * * *',
    v_command
  );
  raise notice 'NOOLTHARI admin email worker scheduled once per minute.';
exception
  when others then
    raise notice 'Email queue and triggers were installed, but automatic scheduling was skipped: %', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Safe result check: this only reports objects; it changes no additional data.
select
  to_regclass('public.admin_products') is not null as admin_products_view_ready,
  to_regclass('public.store_settings') is not null as banner_settings_ready,
  to_regclass('public.admin_email_notifications') is not null as admin_email_queue_ready,
  to_regprocedure('public.claim_admin_email_notifications(integer)') is not null as email_claim_function_ready;

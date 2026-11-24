-- NOOLTHARI homepage gallery carousel
create table if not exists public.store_gallery (
 id uuid primary key default gen_random_uuid(),
 public_url text not null,
 storage_path text,
 sort_order bigint not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.store_gallery enable row level security;
drop policy if exists "Gallery active images public read" on public.store_gallery;
create policy "Gallery active images public read" on public.store_gallery for select using (active=true);
drop policy if exists "Gallery admin manage" on public.store_gallery;
create policy "Gallery admin manage" on public.store_gallery for all using (public.is_admin()) with check (public.is_admin());

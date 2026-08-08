create table if not exists public.marketplace_services (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (char_length(platform) between 2 and 40),
  service_type text not null check (char_length(service_type) between 2 and 60),
  name_en text not null check (char_length(name_en) between 2 and 140),
  name_bn text check (name_bn is null or char_length(name_bn) <= 140),
  description_en text check (description_en is null or char_length(description_en) <= 1200),
  description_bn text check (description_bn is null or char_length(description_bn) <= 1200),
  quantity integer not null check (quantity > 0),
  price numeric(12,2) not null check (price > 0),
  delivery_note text check (delivery_note is null or char_length(delivery_note) <= 240),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_services_active_sort_idx
  on public.marketplace_services(is_active, sort_order, created_at desc);

drop trigger if exists marketplace_services_set_updated_at on public.marketplace_services;
create trigger marketplace_services_set_updated_at
  before update on public.marketplace_services
  for each row execute function public.set_updated_at();

alter table public.marketplace_services enable row level security;

drop policy if exists marketplace_services_public_read on public.marketplace_services;
create policy marketplace_services_public_read
  on public.marketplace_services
  for select
  to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists marketplace_services_admin_all on public.marketplace_services;
create policy marketplace_services_admin_all
  on public.marketplace_services
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, update, delete on public.marketplace_services from anon;
grant select on public.marketplace_services to anon;
grant select, insert, update, delete on public.marketplace_services to authenticated;

update public.site_settings
set value = jsonb_set(value, '{siteName}', to_jsonb('Taskora'::text), true),
    updated_at = now()
where key = 'general';
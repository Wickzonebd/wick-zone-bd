create table public.reselling_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 80),
  name_bn text check (name_bn is null or char_length(name_bn) <= 80),
  image_url text check (image_url is null or public.is_safe_http_url(image_url)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reselling_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text check (description is null or char_length(description) <= 1000),
  logo_url text check (logo_url is null or public.is_safe_http_url(logo_url)),
  website_url text check (website_url is null or public.is_safe_http_url(website_url)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reselling_banners (
  id uuid primary key default gen_random_uuid(),
  title_en text not null check (char_length(btrim(title_en)) between 1 and 120),
  title_bn text check (title_bn is null or char_length(title_bn) <= 120),
  subtitle_en text check (subtitle_en is null or char_length(subtitle_en) <= 240),
  subtitle_bn text check (subtitle_bn is null or char_length(subtitle_bn) <= 240),
  image_url text check (image_url is null or public.is_safe_http_url(image_url)),
  destination_url text check (destination_url is null or public.is_safe_http_url(destination_url)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reselling_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.reselling_categories(id) on delete set null,
  vendor_id uuid references public.reselling_vendors(id) on delete set null,
  name_en text not null check (char_length(btrim(name_en)) between 1 and 140),
  name_bn text check (name_bn is null or char_length(name_bn) <= 140),
  description_en text check (description_en is null or char_length(description_en) <= 2000),
  description_bn text check (description_bn is null or char_length(description_bn) <= 2000),
  image_url text check (image_url is null or public.is_safe_http_url(image_url)),
  price numeric(12,2) not null check (price > 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  stock_count integer check (stock_count is null or stock_count >= 0),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reselling_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.reselling_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index reselling_products_category_idx on public.reselling_products(category_id);
create index reselling_products_vendor_idx on public.reselling_products(vendor_id);

alter table public.reselling_categories enable row level security;
alter table public.reselling_vendors enable row level security;
alter table public.reselling_banners enable row level security;
alter table public.reselling_products enable row level security;
alter table public.reselling_favorites enable row level security;

create policy "reselling_categories_read" on public.reselling_categories for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "reselling_categories_admin_insert" on public.reselling_categories for insert to authenticated with check ((select public.is_admin()));
create policy "reselling_categories_admin_update" on public.reselling_categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "reselling_categories_admin_delete" on public.reselling_categories for delete to authenticated using ((select public.is_admin()));

create policy "reselling_vendors_read" on public.reselling_vendors for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "reselling_vendors_admin_insert" on public.reselling_vendors for insert to authenticated with check ((select public.is_admin()));
create policy "reselling_vendors_admin_update" on public.reselling_vendors for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "reselling_vendors_admin_delete" on public.reselling_vendors for delete to authenticated using ((select public.is_admin()));

create policy "reselling_banners_read" on public.reselling_banners for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "reselling_banners_admin_insert" on public.reselling_banners for insert to authenticated with check ((select public.is_admin()));
create policy "reselling_banners_admin_update" on public.reselling_banners for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "reselling_banners_admin_delete" on public.reselling_banners for delete to authenticated using ((select public.is_admin()));

create policy "reselling_products_read" on public.reselling_products for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "reselling_products_admin_insert" on public.reselling_products for insert to authenticated with check ((select public.is_admin()));
create policy "reselling_products_admin_update" on public.reselling_products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "reselling_products_admin_delete" on public.reselling_products for delete to authenticated using ((select public.is_admin()));

create policy "reselling_favorites_read_own" on public.reselling_favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy "reselling_favorites_add_own" on public.reselling_favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reselling_favorites_delete_own" on public.reselling_favorites for delete to authenticated using ((select auth.uid()) = user_id);

grant select on public.reselling_categories, public.reselling_vendors, public.reselling_banners, public.reselling_products to anon, authenticated;
grant insert, update, delete on public.reselling_categories, public.reselling_vendors, public.reselling_banners, public.reselling_products to authenticated;
grant select, insert, delete on public.reselling_favorites to authenticated;
revoke all on public.reselling_favorites from anon;
grant all on public.reselling_categories, public.reselling_vendors, public.reselling_banners, public.reselling_products, public.reselling_favorites to service_role;

create trigger reselling_categories_set_updated_at before update on public.reselling_categories for each row execute function public.set_updated_at();
create trigger reselling_vendors_set_updated_at before update on public.reselling_vendors for each row execute function public.set_updated_at();
create trigger reselling_banners_set_updated_at before update on public.reselling_banners for each row execute function public.set_updated_at();
create trigger reselling_products_set_updated_at before update on public.reselling_products for each row execute function public.set_updated_at();

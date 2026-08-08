alter table public.marketplace_services
  add column if not exists image_url text
  check (image_url is null or public.is_safe_http_url(image_url));

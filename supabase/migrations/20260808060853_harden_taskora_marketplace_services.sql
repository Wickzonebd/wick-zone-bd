drop policy if exists marketplace_services_admin_all on public.marketplace_services;
drop policy if exists marketplace_services_public_read on public.marketplace_services;

create policy marketplace_services_public_read
  on public.marketplace_services
  for select
  to anon, authenticated
  using (is_active or (select public.is_admin()));

create policy marketplace_services_admin_insert
  on public.marketplace_services
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy marketplace_services_admin_update
  on public.marketplace_services
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy marketplace_services_admin_delete
  on public.marketplace_services
  for delete
  to authenticated
  using ((select public.is_admin()));
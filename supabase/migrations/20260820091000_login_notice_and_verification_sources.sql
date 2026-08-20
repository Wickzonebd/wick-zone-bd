alter table public.profiles
  drop constraint if exists profiles_social_verification_state_check;

alter table public.profiles
  add constraint profiles_social_verification_state_check
  check (
    (is_social_verified and social_verified_at is not null and social_verification_source = any (array['purchase'::text, 'admin'::text, 'payment'::text, 'wallet'::text]))
    or
    ((not is_social_verified) and social_verified_at is null and social_verification_source is null)
  );

create or replace function public.get_login_notice()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','public','auth','pg_temp'
as $$
  select case
    when auth.uid() is null then null::jsonb
    else (
      select jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'body', n.body,
        'destinationUrl', n.destination_url,
        'priority', coalesce(n.priority, 'normal'),
        'createdAt', n.created_at
      )
      from public.notifications n
      where n.user_id = auth.uid()
        and n.broadcast_id is not null
      order by n.created_at desc
      limit 1
    )
  end;
$$;

revoke all on function public.get_login_notice() from public, anon;
grant execute on function public.get_login_notice() to authenticated;

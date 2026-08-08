-- Taskora Social verification is an independent product. Membership never
-- grants or removes this state.

alter table public.profiles
  add column if not exists is_social_verified boolean not null default false,
  add column if not exists social_verified_at timestamptz,
  add column if not exists social_verification_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_social_verification_state_check'
  ) then
    alter table public.profiles
      add constraint profiles_social_verification_state_check
      check (
        (is_social_verified and social_verified_at is not null and social_verification_source in ('purchase','admin'))
        or
        (not is_social_verified and social_verified_at is null and social_verification_source is null)
      );
  end if;
end;
$$;

-- Temporary migration-aware guard. It is replaced with the final strict guard
-- immediately after legacy Verified labels have been classified and cleared.
create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if pg_catalog.current_setting('taskora.social_verification_migration', true) = '1' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.badge_label is distinct from old.badge_label
     or new.is_suspended is distinct from old.is_suspended then
    raise exception 'Protected profile fields cannot be changed';
  end if;

  if (
    new.is_social_verified is distinct from old.is_social_verified
    or new.social_verified_at is distinct from old.social_verified_at
    or new.social_verification_source is distinct from old.social_verification_source
  ) and coalesce(pg_catalog.current_setting('taskora.social_verification_write', true), '') <> '1' then
    raise exception 'Social verification cannot be changed directly';
  end if;

  return new;
end;
$$;

-- Preserve genuinely manual legacy verification, but do not preserve the old
-- membership-coupled "Verified badge for complimentary full access" grants.
do $$
begin
  perform pg_catalog.set_config('taskora.social_verification_migration', '1', true);

  update public.profiles p
  set is_social_verified = true,
      social_verified_at = now(),
      social_verification_source = 'admin'
  where lower(trim(coalesce(p.badge_label, ''))) = 'verified'
    and coalesce((
      select l.reason
      from public.admin_audit_logs l
      where l.target_type = 'user'
        and l.target_id = p.id
        and l.action = 'user_badge_updated'
      order by l.created_at desc
      limit 1
    ), '') <> 'Verified badge for complimentary full access';

  update public.profiles
  set badge_label = null
  where lower(trim(coalesce(badge_label, ''))) = 'verified';

  perform pg_catalog.set_config('taskora.social_verification_migration', '0', true);
end;
$$;

-- Final guard: ordinary profile edits stay available, but every verification
-- state change must come through the dedicated purchase/admin RPCs.
create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by
     or new.badge_label is distinct from old.badge_label
     or new.is_suspended is distinct from old.is_suspended then
    raise exception 'Protected profile fields cannot be changed';
  end if;

  if (
    new.is_social_verified is distinct from old.is_social_verified
    or new.social_verified_at is distinct from old.social_verified_at
    or new.social_verification_source is distinct from old.social_verification_source
  ) and coalesce(pg_catalog.current_setting('taskora.social_verification_write', true), '') <> '1' then
    raise exception 'Social verification cannot be changed directly';
  end if;

  return new;
end;
$$;

create or replace function private.purchase_social_verification_impl()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_balance numeric;
  v_already_verified boolean;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.is_social_verified
  into v_already_verified
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_already_verified then
    return jsonb_build_object('verified', true, 'charged', false);
  end if;

  select case
    when jsonb_typeof(s.value -> 'socialVerificationPrice') = 'number'
      then (s.value ->> 'socialVerificationPrice')::numeric
    else null
  end
  into v_price
  from public.site_settings s
  where s.key = 'general';

  if v_price is null or v_price <= 0 then
    raise exception 'Blue Badge price is not configured.';
  end if;

  select coalesce(sum(w.amount), 0)
  into v_balance
  from public.wallet_transactions w
  where w.user_id = v_user_id;

  if v_balance < v_price then
    raise exception 'Insufficient wallet balance for Blue Badge.';
  end if;

  insert into public.wallet_transactions(
    user_id,
    amount,
    transaction_type,
    reference_type,
    reference_id,
    description,
    idempotency_key,
    created_by
  ) values (
    v_user_id,
    -v_price,
    'social_verification',
    'social_verification',
    v_user_id,
    'Taskora Social Blue Badge purchase',
    'social_verification:' || gen_random_uuid()::text,
    v_user_id
  )
  returning id into v_transaction_id;

  perform pg_catalog.set_config('taskora.social_verification_write', '1', true);
  update public.profiles
  set is_social_verified = true,
      social_verified_at = now(),
      social_verification_source = 'purchase'
  where id = v_user_id;
  perform pg_catalog.set_config('taskora.social_verification_write', '0', true);

  insert into public.notifications(user_id, type, title, body, destination_url)
  values (
    v_user_id,
    'social_verification',
    'Blue Badge activated',
    'Your Taskora Social Blue Badge is now active.',
    '/feed'
  );

  return jsonb_build_object(
    'verified', true,
    'charged', true,
    'price', v_price,
    'transaction_id', v_transaction_id
  );
end;
$$;

create or replace function public.purchase_social_verification()
returns jsonb
language sql
set search_path = public, private
as $$
  select private.purchase_social_verification_impl();
$$;

create or replace function private.admin_set_social_verification_impl(
  p_user_id uuid,
  p_verified boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'A reason is required';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;

  perform pg_catalog.set_config('taskora.social_verification_write', '1', true);
  update public.profiles
  set is_social_verified = p_verified,
      social_verified_at = case when p_verified then now() else null end,
      social_verification_source = case when p_verified then 'admin' else null end
  where id = p_user_id;
  perform pg_catalog.set_config('taskora.social_verification_write', '0', true);

  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason, metadata)
  values (
    auth.uid(),
    case when p_verified then 'social_verification_granted' else 'social_verification_revoked' end,
    'user',
    p_user_id,
    v_reason,
    jsonb_build_object('verified', p_verified, 'source', case when p_verified then 'admin' else null end)
  );

  insert into public.notifications(user_id, type, title, body, destination_url)
  values (
    p_user_id,
    'social_verification',
    case when p_verified then 'Blue Badge granted' else 'Blue Badge removed' end,
    v_reason,
    '/feed'
  );

  return p_user_id;
end;
$$;

create or replace function public.admin_set_social_verification(
  p_user_id uuid,
  p_verified boolean,
  p_reason text
)
returns uuid
language sql
set search_path = public, private
as $$
  select private.admin_set_social_verification_impl(p_user_id, p_verified, p_reason);
$$;

-- Generic text badges remain available, but "Verified" is reserved for the
-- dedicated Social Blue Badge state above.
create or replace function public.admin_set_user_badge(p_user_id uuid, p_badge text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_badge text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A reason is required'; end if;
  normalized_badge := nullif(trim(coalesce(p_badge,'')), '');
  if normalized_badge is not null and char_length(normalized_badge) > 60 then raise exception 'Badge is too long'; end if;
  if lower(coalesce(normalized_badge,'')) = 'verified' then
    raise exception 'Use the Social Blue Badge control for verification.';
  end if;
  update public.profiles set badge_label = normalized_badge where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason, metadata)
  values(auth.uid(), 'user_badge_updated', 'user', p_user_id, trim(p_reason), jsonb_build_object('badge',normalized_badge));
  return p_user_id;
end;
$$;

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
    select jsonb_build_object(
      'id',p.id,
      'full_name',p.full_name,
      'mobile',priv.mobile,
      'badge_label',p.badge_label,
      'is_social_verified',p.is_social_verified,
      'is_suspended',p.is_suspended,
      'membership_status',coalesce(m.status,'locked'),
      'created_at',p.created_at
    ) row_data
    from public.profiles p
    left join public.user_private_profiles priv on priv.user_id=p.id
    left join public.memberships m on m.user_id=p.id
    where p_search is null
      or p.full_name ilike '%'||p_search||'%'
      or priv.mobile ilike '%'||p_search||'%'
      or p.referral_code ilike '%'||p_search||'%'
    order by p.created_at desc
    limit least(greatest(p_limit,1),100)
    offset greatest(p_offset,0)
  ) rows;
  return result;
end;
$$;

create or replace function public.list_feed(p_limit integer default 10, p_offset integer default 0)
returns jsonb
language sql
stable
set search_path = public
as $$
select coalesce(jsonb_agg(item order by (item->>'is_pinned')::boolean desc,(item->>'created_at')::timestamptz desc),'[]'::jsonb)
from (
  select jsonb_build_object(
    'id',p.id,
    'author_id',p.author_id,
    'body',p.body,
    'external_url',p.external_url,
    'is_pinned',p.is_pinned,
    'created_at',p.created_at,
    'author',jsonb_build_object(
      'id',a.id,
      'full_name',a.full_name,
      'avatar_url',a.avatar_url,
      'bio',a.bio,
      'badge_label',a.badge_label,
      'is_social_verified',a.is_social_verified,
      'referral_code',a.referral_code,
      'created_at',a.created_at,
      'is_suspended',a.is_suspended
    ),
    'media',coalesce((
      select jsonb_agg(jsonb_build_object('id',pm.id,'storage_path',pm.storage_path,'public_url',pm.public_url,'sort_order',pm.sort_order) order by pm.sort_order)
      from public.post_media pm
      where pm.post_id=p.id
    ),'[]'::jsonb),
    'like_count',(select count(*) from public.post_likes pl where pl.post_id=p.id),
    'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.is_hidden),
    'liked_by_me',exists(select 1 from public.post_likes pl where pl.post_id=p.id and pl.user_id=auth.uid()),
    'connection_status',case
      when p.author_id=auth.uid() then 'connected'
      when exists(
        select 1 from public.connections c
        where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.author_id)
          and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.author_id)
          and c.status='accepted'
      ) then 'connected'
      when exists(
        select 1 from public.connections c
        where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.author_id)
          and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.author_id)
          and c.status='pending'
      ) then 'pending'
      else 'none'
    end
  ) item
  from public.posts p
  join public.profiles a on a.id=p.author_id
  where not p.is_hidden and not a.is_suspended
  order by p.is_pinned desc,p.created_at desc
  limit least(greatest(p_limit,1),50)
  offset greatest(p_offset,0)
) feed;
$$;

revoke all on function private.purchase_social_verification_impl() from public, anon;
revoke all on function private.admin_set_social_verification_impl(uuid,boolean,text) from public, anon;
grant execute on function private.purchase_social_verification_impl() to authenticated;
grant execute on function private.admin_set_social_verification_impl(uuid,boolean,text) to authenticated;

revoke all on function public.purchase_social_verification() from public, anon;
revoke all on function public.admin_set_social_verification(uuid,boolean,text) from public, anon;
revoke all on function public.admin_set_user_badge(uuid,text,text) from public, anon;
grant execute on function public.purchase_social_verification() to authenticated;
grant execute on function public.admin_set_social_verification(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_user_badge(uuid,text,text) to authenticated;

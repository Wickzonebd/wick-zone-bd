begin;

create or replace function public.admin_set_user_suspension(p_user_id uuid, p_suspended boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_user_id=auth.uid() and p_suspended then raise exception 'Administrators cannot suspend their own account'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required'; end if;
  update public.profiles set is_suspended=p_suspended where id=p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason)
  values(auth.uid(),case when p_suspended then 'user_suspended' else 'user_restored' end,'user',p_user_id,trim(p_reason));
  return p_user_id;
end;
$$;

create or replace function public.admin_set_user_badge(p_user_id uuid, p_badge text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare normalized_badge text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required'; end if;
  normalized_badge := nullif(trim(coalesce(p_badge,'')), '');
  if normalized_badge is not null and char_length(normalized_badge)>60 then raise exception 'Badge is too long'; end if;
  update public.profiles set badge_label=normalized_badge where id=p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'user_badge_updated','user',p_user_id,trim(p_reason),jsonb_build_object('badge',normalized_badge));
  return p_user_id;
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) into result from (
    select jsonb_build_object('id',p.id,'full_name',p.full_name,'mobile',priv.mobile,'badge_label',p.badge_label,'is_suspended',p.is_suspended,'membership_status',coalesce(m.status,'locked'),'created_at',p.created_at) row_data
    from public.profiles p left join public.user_private_profiles priv on priv.user_id=p.id left join public.memberships m on m.user_id=p.id
    where p_search is null or p.full_name ilike '%'||p_search||'%' or priv.mobile ilike '%'||p_search||'%' or p.referral_code ilike '%'||p_search||'%'
    order by p.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
  ) rows;
  return result;
end;
$$;

grant execute on function public.admin_set_user_suspension(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_user_badge(uuid,text,text) to authenticated;

commit;

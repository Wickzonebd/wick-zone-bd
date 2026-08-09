-- Taskora unified Inbox, richer social profiles, saved posts, cart, orders,
-- reviews and administrator messaging/store controls.

create table public.admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  body text check (body is null or char_length(body) <= 2000),
  audience text not null default 'all' check (audience in ('all','active','locked','verified','individual')),
  recipient_user_id uuid references auth.users(id) on delete set null,
  category text not null default 'general' check (category in ('general','wallet','job','order','social','security','promotion')),
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  destination_url text check (destination_url is null or destination_url ~ '^/[^[:space:]]*$' or public.is_safe_http_url(destination_url)),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check ((audience = 'individual' and recipient_user_id is not null) or (audience <> 'individual' and recipient_user_id is null))
);

alter table public.notifications
  add column broadcast_id uuid references public.admin_broadcasts(id) on delete set null,
  add column category text not null default 'system' check (category in ('system','general','wallet','job','order','social','security','promotion')),
  add column priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  add column sender_label text not null default 'Taskora' check (char_length(sender_label) between 1 and 80);

alter table public.notifications drop constraint if exists notifications_body_check;
alter table public.notifications add constraint notifications_body_check check (body is null or char_length(body) <= 2000);

create index notifications_user_category_time_idx on public.notifications(user_id, category, created_at desc);
create index notifications_broadcast_idx on public.notifications(broadcast_id) where broadcast_id is not null;
create index admin_broadcasts_created_idx on public.admin_broadcasts(created_at desc);

alter table public.admin_broadcasts enable row level security;
create policy admin_broadcasts_admin_read on public.admin_broadcasts for select to authenticated using ((select public.is_admin()));
create policy admin_broadcasts_admin_insert on public.admin_broadcasts for insert to authenticated with check ((select public.is_admin()));
create policy admin_broadcasts_admin_update on public.admin_broadcasts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admin_broadcasts_admin_delete on public.admin_broadcasts for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.admin_broadcasts to authenticated;
grant all on public.admin_broadcasts to service_role;

create or replace function public.classify_taskora_notification()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.category = 'system' then
    new.category := case
      when new.type like 'wallet%' or new.type like 'withdrawal%' or new.type = 'admin_wallet_adjustment' then 'wallet'
      when new.type like 'job%' or new.type like 'membership%' then 'job'
      when new.type like 'order%' or new.type like 'reselling%' then 'order'
      when new.type like 'post%' or new.type like 'connection%' or new.type like 'social%' then 'social'
      when new.type like 'security%' or new.type like 'user_susp%' then 'security'
      when new.type like 'admin%' then 'general'
      else 'system'
    end;
  end if;
  if new.priority = 'normal' and new.type in (
    'job_proof_approved','job_proof_rejected','job_proof_resubmission',
    'withdrawal_update','membership_update','admin_wallet_adjustment','order_update','security_account_update'
  ) then
    new.priority := 'important';
  end if;
  if new.type like 'admin_%' and new.sender_label = 'Taskora' then
    new.sender_label := 'Taskora Admin';
  end if;
  return new;
end;
$$;

create trigger classify_taskora_notifications
before insert on public.notifications
for each row execute function public.classify_taskora_notification();

create or replace function public.admin_send_inbox_message(
  p_title text,
  p_body text default null,
  p_audience text default 'all',
  p_user_id uuid default null,
  p_category text default 'general',
  p_priority text default 'normal',
  p_destination_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  broadcast_uuid uuid;
  affected integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(p_title,''))) < 1 or char_length(trim(p_title)) > 180 then raise exception 'A valid title is required'; end if;
  if char_length(coalesce(p_body,'')) > 2000 then raise exception 'Message body is too long'; end if;
  if p_audience not in ('all','active','locked','verified','individual') then raise exception 'Invalid audience'; end if;
  if p_category not in ('general','wallet','job','order','social','security','promotion') then raise exception 'Invalid category'; end if;
  if p_priority not in ('normal','important','urgent') then raise exception 'Invalid priority'; end if;
  if p_audience = 'individual' and p_user_id is null then raise exception 'Choose a recipient'; end if;
  if p_audience <> 'individual' then p_user_id := null; end if;

  insert into public.admin_broadcasts(title,body,audience,recipient_user_id,category,priority,destination_url,sent_by)
  values(trim(p_title),nullif(trim(coalesce(p_body,'')),''),p_audience,p_user_id,p_category,p_priority,nullif(trim(coalesce(p_destination_url,'')),''),auth.uid())
  returning id into broadcast_uuid;

  insert into public.notifications(user_id,type,title,body,destination_url,broadcast_id,category,priority,sender_label)
  select p.id,'admin_message',trim(p_title),nullif(trim(coalesce(p_body,'')),''),nullif(trim(coalesce(p_destination_url,'')),''),broadcast_uuid,p_category,p_priority,'Taskora Admin'
  from public.profiles p
  left join public.memberships m on m.user_id = p.id
  where not p.is_suspended
    and case p_audience
      when 'all' then true
      when 'active' then m.status = 'active'
      when 'locked' then coalesce(m.status::text,'locked') <> 'active'
      when 'verified' then p.is_social_verified
      when 'individual' then p.id = p_user_id
      else false
    end;
  get diagnostics affected = row_count;

  update public.admin_broadcasts set recipient_count = affected where id = broadcast_uuid;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'inbox_message_sent','admin_broadcast',broadcast_uuid,trim(p_title),jsonb_build_object('audience',p_audience,'category',p_category,'priority',p_priority,'recipients',affected));
  return jsonb_build_object('id',broadcast_uuid,'recipients',affected);
end;
$$;

create or replace function public.admin_list_inbox_messages(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_admin() then coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc),'[]'::jsonb) else '[]'::jsonb end
  from (
    select jsonb_build_object(
      'id',b.id,'title',b.title,'body',b.body,'audience',b.audience,'recipient_user_id',b.recipient_user_id,
      'category',b.category,'priority',b.priority,'destination_url',b.destination_url,'recipient_count',b.recipient_count,
      'read_count',(select count(*) from public.notifications n where n.broadcast_id=b.id and n.read_at is not null),
      'unread_count',(select count(*) from public.notifications n where n.broadcast_id=b.id and n.read_at is null),
      'archived_at',b.archived_at,'created_at',b.created_at
    ) row_data
    from public.admin_broadcasts b
    order by b.created_at desc
    limit least(greatest(p_limit,1),100)
  ) messages;
$$;

create or replace function public.admin_archive_inbox_message(p_broadcast_id uuid, p_archived boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.admin_broadcasts set archived_at = case when p_archived then now() else null end where id = p_broadcast_id;
  if not found then raise exception 'Message not found'; end if;
  return p_broadcast_id;
end;
$$;

create or replace function public.admin_broadcast_notification(p_title text, p_body text default null, p_destination_url text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  result := public.admin_send_inbox_message(p_title,p_body,'all',null,'general','normal',p_destination_url);
  return coalesce((result->>'recipients')::integer,0);
end;
$$;

-- Every administrator wallet adjustment now creates an Inbox message.
create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare tx_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_amount = 0 or char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A non-zero amount and reason are required'; end if;
  insert into public.wallet_transactions(user_id,amount,transaction_type,description,admin_reason,idempotency_key,created_by)
  values(p_user_id,p_amount,'admin_adjustment','Administrator wallet adjustment',trim(p_reason),'admin_adjustment:'||gen_random_uuid()::text,auth.uid())
  returning id into tx_id;
  insert into public.notifications(user_id,type,title,body,destination_url,category,priority,sender_label)
  values(
    p_user_id,'admin_wallet_adjustment',
    case when p_amount > 0 then 'Wallet credit approved' else 'Wallet balance adjusted' end,
    case when p_amount > 0 then 'Your wallet received ' else 'Your wallet was adjusted by ' end || abs(p_amount)::text || '. ' || trim(p_reason),
    '/wallet','wallet','important','Taskora Admin'
  );
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'wallet_adjustment','wallet_transaction',tx_id,trim(p_reason),jsonb_build_object('user_id',p_user_id,'amount',p_amount));
  return tx_id;
end;
$$;

create or replace function public.admin_set_user_suspension(p_user_id uuid, p_suspended boolean, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_user_id = auth.uid() and p_suspended then raise exception 'Administrators cannot suspend their own account'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A reason is required'; end if;
  update public.profiles set is_suspended = p_suspended where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.notifications(user_id,type,title,body,destination_url,category,priority,sender_label)
  values(p_user_id,'security_account_update',case when p_suspended then 'Account access suspended' else 'Account access restored' end,trim(p_reason),'/profile','security','urgent','Taskora Admin');
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason)
  values(auth.uid(),case when p_suspended then 'user_suspended' else 'user_restored' end,'user',p_user_id,trim(p_reason));
  return p_user_id;
end;
$$;

-- Richer public social profile fields.
alter table public.profiles
  add column headline text check (headline is null or char_length(headline) <= 120),
  add column location text check (location is null or char_length(location) <= 120),
  add column website_url text check (website_url is null or public.is_safe_http_url(website_url)),
  add column cover_url text check (cover_url is null or public.is_safe_http_url(cover_url));

create table public.post_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id,post_id)
);
create index post_bookmarks_post_idx on public.post_bookmarks(post_id);
alter table public.post_bookmarks enable row level security;
create policy post_bookmarks_read_own on public.post_bookmarks for select to authenticated using ((select auth.uid()) = user_id);
create policy post_bookmarks_insert_own on public.post_bookmarks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy post_bookmarks_delete_own on public.post_bookmarks for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on public.post_bookmarks to authenticated;
grant all on public.post_bookmarks to service_role;

create or replace function public.get_public_profile_summary(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when auth.uid() is null then '{}'::jsonb else jsonb_build_object(
    'post_count',(select count(*) from public.posts p where p.author_id=p_profile_id and not p.is_hidden),
    'connection_count',(select count(*) from public.connections c where c.status='accepted' and (c.requester_id=p_profile_id or c.addressee_id=p_profile_id)),
    'like_count',(select count(*) from public.post_likes l join public.posts p on p.id=l.post_id where p.author_id=p_profile_id and not p.is_hidden),
    'mutual_count',(
      with mine as (
        select case when c.requester_id=auth.uid() then c.addressee_id else c.requester_id end id
        from public.connections c where c.status='accepted' and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
      ), theirs as (
        select case when c.requester_id=p_profile_id then c.addressee_id else c.requester_id end id
        from public.connections c where c.status='accepted' and (c.requester_id=p_profile_id or c.addressee_id=p_profile_id)
      ) select count(*) from mine join theirs using(id)
    ),
    'joined_at',(select created_at from public.profiles where id=p_profile_id)
  ) end;
$$;

create or replace function public.list_people_suggestions(p_limit integer default 10)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(person order by (person->>'mutual_count')::integer desc,person->>'full_name'),'[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,'bio',p.bio,'headline',p.headline,'location',p.location,
      'badge_label',p.badge_label,'is_social_verified',p.is_social_verified,'referral_code',p.referral_code,'created_at',p.created_at,'is_suspended',p.is_suspended,
      'connection_status',case
        when exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.id) and c.status='accepted') then 'connected'
        when exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.id) and c.status='pending') then 'pending'
        else 'none'
      end,
      'mutual_count',(
        with mine as (
          select case when c.requester_id=auth.uid() then c.addressee_id else c.requester_id end id
          from public.connections c where c.status='accepted' and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
        ), theirs as (
          select case when c.requester_id=p.id then c.addressee_id else c.requester_id end id
          from public.connections c where c.status='accepted' and (c.requester_id=p.id or c.addressee_id=p.id)
        ) select count(*) from mine join theirs using(id)
      )
    ) person
    from public.profiles p
    where auth.uid() is not null and p.id <> auth.uid() and not p.is_suspended
      and not exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.id) and c.status='blocked')
    order by p.created_at desc
    limit least(greatest(p_limit,1),30)
  ) suggestions;
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
    'id',p.id,'author_id',p.author_id,'body',p.body,'external_url',p.external_url,'is_pinned',p.is_pinned,'created_at',p.created_at,
    'author',jsonb_build_object(
      'id',a.id,'full_name',a.full_name,'avatar_url',a.avatar_url,'bio',a.bio,'headline',a.headline,'location',a.location,'website_url',a.website_url,'cover_url',a.cover_url,
      'badge_label',a.badge_label,'is_social_verified',a.is_social_verified,'referral_code',a.referral_code,'created_at',a.created_at,'is_suspended',a.is_suspended
    ),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'storage_path',pm.storage_path,'public_url',pm.public_url,'sort_order',pm.sort_order) order by pm.sort_order) from public.post_media pm where pm.post_id=p.id),'[]'::jsonb),
    'like_count',(select count(*) from public.post_likes pl where pl.post_id=p.id),
    'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.is_hidden),
    'liked_by_me',exists(select 1 from public.post_likes pl where pl.post_id=p.id and pl.user_id=auth.uid()),
    'bookmarked_by_me',exists(select 1 from public.post_bookmarks pb where pb.post_id=p.id and pb.user_id=auth.uid()),
    'connection_status',case
      when p.author_id=auth.uid() then 'connected'
      when exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.author_id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.author_id) and c.status='accepted') then 'connected'
      when exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.author_id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.author_id) and c.status='pending') then 'pending'
      else 'none'
    end
  ) item
  from public.posts p join public.profiles a on a.id=p.author_id
  where not p.is_hidden and not a.is_suspended
  order by p.is_pinned desc,p.created_at desc
  limit least(greatest(p_limit,1),50) offset greatest(p_offset,0)
) feed;
$$;

-- Reselling cart, order tracking, coupons and verified-buyer reviews.
create table public.reselling_cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.reselling_products(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,product_id)
);

create table public.reselling_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  maximum_discount numeric(12,2) check (maximum_discount is null or maximum_discount > 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table public.reselling_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default ('TK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','confirmed','processing','completed','cancelled')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  coupon_id uuid references public.reselling_coupons(id) on delete set null,
  coupon_code text,
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 100),
  contact_mobile text not null check (char_length(btrim(contact_mobile)) between 7 and 25),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 5 and 500),
  customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  payment_method text not null default 'manual',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reselling_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.reselling_orders(id) on delete cascade,
  product_id uuid references public.reselling_products(id) on delete set null,
  product_name text not null,
  image_url text,
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(12,2) not null check (unit_price > 0),
  line_total numeric(12,2) not null check (line_total > 0),
  created_at timestamptz not null default now()
);

create table public.reselling_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.reselling_products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 1000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,user_id)
);

create index reselling_cart_user_idx on public.reselling_cart_items(user_id,updated_at desc);
create index reselling_orders_user_time_idx on public.reselling_orders(user_id,created_at desc);
create index reselling_orders_status_time_idx on public.reselling_orders(status,created_at desc);
create index reselling_order_items_order_idx on public.reselling_order_items(order_id);
create index reselling_reviews_product_idx on public.reselling_reviews(product_id,created_at desc);
create index reselling_coupons_active_idx on public.reselling_coupons(is_active,expires_at);

alter table public.reselling_cart_items enable row level security;
alter table public.reselling_coupons enable row level security;
alter table public.reselling_orders enable row level security;
alter table public.reselling_order_items enable row level security;
alter table public.reselling_reviews enable row level security;

create policy reselling_cart_read_own on public.reselling_cart_items for select to authenticated using ((select auth.uid())=user_id);
create policy reselling_coupons_admin_all on public.reselling_coupons for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy reselling_orders_read_own_or_admin on public.reselling_orders for select to authenticated using ((select auth.uid())=user_id or (select public.is_admin()));
create policy reselling_order_items_read_own_or_admin on public.reselling_order_items for select to authenticated using (exists(select 1 from public.reselling_orders o where o.id=order_id and (o.user_id=(select auth.uid()) or (select public.is_admin()))));
create policy reselling_reviews_read on public.reselling_reviews for select to authenticated using (not is_hidden or user_id=(select auth.uid()) or (select public.is_admin()));
create policy reselling_reviews_admin_update on public.reselling_reviews for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy reselling_reviews_delete_own_or_admin on public.reselling_reviews for delete to authenticated using (user_id=(select auth.uid()) or (select public.is_admin()));

grant select on public.reselling_cart_items, public.reselling_orders, public.reselling_order_items, public.reselling_reviews to authenticated;
grant select, insert, update, delete on public.reselling_coupons to authenticated;
grant update on public.reselling_reviews to authenticated;
grant delete on public.reselling_reviews to authenticated;
grant all on public.reselling_cart_items, public.reselling_coupons, public.reselling_orders, public.reselling_order_items, public.reselling_reviews to service_role;

create trigger reselling_cart_set_updated_at before update on public.reselling_cart_items for each row execute function public.set_updated_at();
create trigger reselling_coupons_set_updated_at before update on public.reselling_coupons for each row execute function public.set_updated_at();
create trigger reselling_orders_set_updated_at before update on public.reselling_orders for each row execute function public.set_updated_at();
create trigger reselling_reviews_set_updated_at before update on public.reselling_reviews for each row execute function public.set_updated_at();

create or replace function public.set_reselling_cart_item(p_product_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare selected_product public.reselling_products%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity < 0 or p_quantity > 99 then raise exception 'Quantity must be between 0 and 99'; end if;
  if p_quantity = 0 then
    delete from public.reselling_cart_items where user_id=auth.uid() and product_id=p_product_id;
    return jsonb_build_object('product_id',p_product_id,'quantity',0);
  end if;
  select * into selected_product from public.reselling_products where id=p_product_id and is_active for share;
  if not found then raise exception 'Product is unavailable'; end if;
  if selected_product.stock_count is not null and selected_product.stock_count < p_quantity then raise exception 'Not enough stock'; end if;
  insert into public.reselling_cart_items(user_id,product_id,quantity)
  values(auth.uid(),p_product_id,p_quantity)
  on conflict(user_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
  return jsonb_build_object('product_id',p_product_id,'quantity',p_quantity);
end;
$$;

create or replace function public.get_my_reselling_cart()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'product_id',p.id,'name_en',p.name_en,'name_bn',p.name_bn,'image_url',p.image_url,'price',p.price,
      'stock_count',p.stock_count,'quantity',c.quantity,'line_total',p.price*c.quantity
    ) order by c.updated_at desc) filter(where p.id is not null),'[]'::jsonb),
    'item_count',coalesce(sum(c.quantity),0),
    'subtotal',coalesce(sum(p.price*c.quantity),0)
  )
  from public.reselling_cart_items c
  join public.reselling_products p on p.id=c.product_id and p.is_active
  where c.user_id=auth.uid();
$$;

create or replace function public.place_reselling_order(
  p_contact_name text,
  p_contact_mobile text,
  p_delivery_address text,
  p_customer_note text default null,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_ref text;
  subtotal_value numeric(12,2);
  discount_value numeric(12,2) := 0;
  coupon_row public.reselling_coupons%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_contact_name,''))) < 2 then raise exception 'Contact name is required'; end if;
  if char_length(trim(coalesce(p_contact_mobile,''))) < 7 then raise exception 'Contact mobile is required'; end if;
  if char_length(trim(coalesce(p_delivery_address,''))) < 5 then raise exception 'Delivery address is required'; end if;

  perform 1 from public.reselling_products p join public.reselling_cart_items c on c.product_id=p.id where c.user_id=auth.uid() for update of p;
  if not found then raise exception 'Your cart is empty'; end if;
  if exists(
    select 1 from public.reselling_cart_items c join public.reselling_products p on p.id=c.product_id
    where c.user_id=auth.uid() and (not p.is_active or (p.stock_count is not null and p.stock_count<c.quantity))
  ) then raise exception 'A cart item is unavailable or out of stock'; end if;

  select sum(p.price*c.quantity) into subtotal_value
  from public.reselling_cart_items c join public.reselling_products p on p.id=c.product_id
  where c.user_id=auth.uid();
  if subtotal_value is null or subtotal_value <= 0 then raise exception 'Your cart is empty'; end if;

  if nullif(upper(trim(coalesce(p_coupon_code,''))),'') is not null then
    select * into coupon_row from public.reselling_coupons
    where code=upper(trim(p_coupon_code)) and is_active
      and (starts_at is null or starts_at<=now()) and (expires_at is null or expires_at>now())
      and (usage_limit is null or used_count<usage_limit)
    for update;
    if not found then raise exception 'Coupon is invalid or expired'; end if;
    if subtotal_value < coupon_row.minimum_order then raise exception 'Order does not meet the coupon minimum'; end if;
    discount_value := case when coupon_row.discount_type='percent' then subtotal_value*coupon_row.discount_value/100 else coupon_row.discount_value end;
    if coupon_row.maximum_discount is not null then discount_value := least(discount_value,coupon_row.maximum_discount); end if;
    discount_value := least(round(discount_value,2),subtotal_value);
  end if;

  insert into public.reselling_orders(user_id,subtotal,discount,total,coupon_id,coupon_code,contact_name,contact_mobile,delivery_address,customer_note)
  values(auth.uid(),subtotal_value,discount_value,subtotal_value-discount_value,coupon_row.id,coupon_row.code,trim(p_contact_name),trim(p_contact_mobile),trim(p_delivery_address),nullif(trim(coalesce(p_customer_note,'')),''))
  returning id,order_code into order_uuid,order_ref;

  insert into public.reselling_order_items(order_id,product_id,product_name,image_url,quantity,unit_price,line_total)
  select order_uuid,p.id,p.name_en,p.image_url,c.quantity,p.price,p.price*c.quantity
  from public.reselling_cart_items c join public.reselling_products p on p.id=c.product_id
  where c.user_id=auth.uid();

  update public.reselling_products p set stock_count=p.stock_count-c.quantity
  from public.reselling_cart_items c
  where c.user_id=auth.uid() and c.product_id=p.id and p.stock_count is not null;
  delete from public.reselling_cart_items where user_id=auth.uid();
  if coupon_row.id is not null then update public.reselling_coupons set used_count=used_count+1 where id=coupon_row.id; end if;

  insert into public.notifications(user_id,type,title,body,destination_url,category,priority,sender_label)
  values(auth.uid(),'order_created','Order request received','Your order '||order_ref||' is waiting for admin confirmation.','/reselling?view=orders','order','important','Taskora Store');
  return jsonb_build_object('id',order_uuid,'order_code',order_ref,'subtotal',subtotal_value,'discount',discount_value,'total',subtotal_value-discount_value);
end;
$$;

create or replace function public.admin_update_reselling_order(p_order_id uuid, p_status text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare selected_order public.reselling_orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('confirmed','processing','completed','cancelled') then raise exception 'Invalid order status'; end if;
  select * into selected_order from public.reselling_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if selected_order.status in ('completed','cancelled') then raise exception 'Order is already final'; end if;
  if p_status='cancelled' then
    update public.reselling_products p set stock_count=p.stock_count+i.quantity
    from public.reselling_order_items i
    where i.order_id=selected_order.id and i.product_id=p.id and p.stock_count is not null;
  end if;
  update public.reselling_orders
  set status=p_status,admin_note=nullif(trim(coalesce(p_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now()
  where id=p_order_id;
  insert into public.notifications(user_id,type,title,body,destination_url,category,priority,sender_label)
  values(selected_order.user_id,'order_update','Order '||selected_order.order_code||' · '||initcap(p_status),coalesce(nullif(trim(coalesce(p_note,'')),''),'Your order status was updated.'),'/reselling?view=orders','order',case when p_status in ('completed','cancelled') then 'important' else 'normal' end,'Taskora Store');
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'reselling_order_'||p_status,'reselling_order',p_order_id,p_note,jsonb_build_object('order_code',selected_order.order_code,'total',selected_order.total));
  return p_order_id;
end;
$$;

create or replace function public.submit_reselling_review(p_product_id uuid, p_rating integer, p_body text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare review_uuid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if not exists(
    select 1 from public.reselling_orders o join public.reselling_order_items i on i.order_id=o.id
    where o.user_id=auth.uid() and o.status='completed' and i.product_id=p_product_id
  ) then raise exception 'Only verified buyers can review this product'; end if;
  insert into public.reselling_reviews(product_id,user_id,rating,body,is_hidden)
  values(p_product_id,auth.uid(),p_rating,nullif(trim(coalesce(p_body,'')),''),false)
  on conflict(product_id,user_id) do update set rating=excluded.rating,body=excluded.body,is_hidden=false,updated_at=now()
  returning id into review_uuid;
  return review_uuid;
end;
$$;

create or replace function public.get_reselling_product_rating(p_product_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('average',coalesce(round(avg(rating)::numeric,1),0),'count',count(*))
  from public.reselling_reviews where product_id=p_product_id and not is_hidden;
$$;

create or replace function public.admin_store_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_admin() then jsonb_build_object(
    'orders',(select count(*) from public.reselling_orders),
    'pending',(select count(*) from public.reselling_orders where status='pending'),
    'processing',(select count(*) from public.reselling_orders where status in ('confirmed','processing')),
    'completed',(select count(*) from public.reselling_orders where status='completed'),
    'revenue',(select coalesce(sum(total),0) from public.reselling_orders where status='completed'),
    'low_stock',(select count(*) from public.reselling_products where is_active and stock_count is not null and stock_count between 0 and 5),
    'active_coupons',(select count(*) from public.reselling_coupons where is_active and (expires_at is null or expires_at>now())),
    'reviews',(select count(*) from public.reselling_reviews where not is_hidden)
  ) else '{}'::jsonb end;
$$;

revoke all on function public.admin_send_inbox_message(text,text,text,uuid,text,text,text) from public, anon;
revoke all on function public.admin_list_inbox_messages(integer) from public, anon;
revoke all on function public.admin_archive_inbox_message(uuid,boolean) from public, anon;
revoke all on function public.get_public_profile_summary(uuid) from public, anon;
revoke all on function public.list_people_suggestions(integer) from public, anon;
revoke all on function public.set_reselling_cart_item(uuid,integer) from public, anon;
revoke all on function public.get_my_reselling_cart() from public, anon;
revoke all on function public.place_reselling_order(text,text,text,text,text) from public, anon;
revoke all on function public.admin_update_reselling_order(uuid,text,text) from public, anon;
revoke all on function public.submit_reselling_review(uuid,integer,text) from public, anon;
revoke all on function public.get_reselling_product_rating(uuid) from public, anon;
revoke all on function public.admin_store_dashboard() from public, anon;

grant execute on function public.admin_send_inbox_message(text,text,text,uuid,text,text,text) to authenticated;
grant execute on function public.admin_list_inbox_messages(integer) to authenticated;
grant execute on function public.admin_archive_inbox_message(uuid,boolean) to authenticated;
grant execute on function public.get_public_profile_summary(uuid) to authenticated;
grant execute on function public.list_people_suggestions(integer) to authenticated;
grant execute on function public.set_reselling_cart_item(uuid,integer) to authenticated;
grant execute on function public.get_my_reselling_cart() to authenticated;
grant execute on function public.place_reselling_order(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_reselling_order(uuid,text,text) to authenticated;
grant execute on function public.submit_reselling_review(uuid,integer,text) to authenticated;
grant execute on function public.get_reselling_product_rating(uuid) to authenticated;
grant execute on function public.admin_store_dashboard() to authenticated;

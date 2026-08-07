create extension if not exists pgcrypto;

create type public.app_role as enum ('user', 'admin');
create type public.membership_status as enum ('locked', 'active', 'deactivated');
create type public.payment_order_status as enum ('pending', 'requires_action', 'paid', 'failed', 'cancelled', 'refunded');
create type public.job_submission_status as enum ('started', 'pending', 'approved', 'rejected', 'resubmission_requested');
create type public.wallet_transaction_type as enum ('job_reward', 'withdrawal_hold', 'withdrawal_reversal', 'admin_adjustment');
create type public.withdrawal_status as enum ('pending', 'approved', 'rejected', 'paid');
create type public.connection_status as enum ('pending', 'accepted', 'blocked');
create type public.report_status as enum ('open', 'reviewed', 'dismissed', 'actioned');

create or replace function public.is_safe_http_url(value text)
returns boolean language sql immutable as $$
  select value is null or value ~* '^https?://[^[:space:]]+$';
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  avatar_url text check (public.is_safe_http_url(avatar_url)),
  bio text check (bio is null or char_length(bio) <= 500),
  badge_label text check (badge_label is null or char_length(badge_label) <= 50),
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{6,20}$'),
  referred_by uuid references public.profiles(id) on delete set null,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referred_by is null or referred_by <> id)
);

create table public.user_private_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mobile text not null unique check (mobile ~ '^\+8801[3-9][0-9]{8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text check (public.is_safe_http_url(image_url)),
  destination_url text check (public.is_safe_http_url(destination_url)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcement_tickers (
  id uuid primary key default gen_random_uuid(),
  text_en text not null check (char_length(text_en) between 1 and 500),
  text_bn text check (text_bn is null or char_length(text_bn) <= 500),
  icon text,
  destination_url text check (public.is_safe_http_url(destination_url)),
  text_color text not null default '#FFFFFF' check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#FF4D1F' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  direction text not null default 'rtl' check (direction in ('ltr', 'rtl')),
  speed_seconds integer not null default 14 check (speed_seconds between 4 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_links (
  id uuid primary key default gen_random_uuid(),
  label_en text not null check (char_length(label_en) between 1 and 100),
  label_bn text,
  icon_name text,
  icon_url text check (public.is_safe_http_url(icon_url)),
  destination_url text not null check (public.is_safe_http_url(destination_url)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_cards (
  id uuid primary key default gen_random_uuid(),
  title_en text not null check (char_length(title_en) between 1 and 120),
  title_bn text,
  description_en text,
  description_bn text,
  image_url text check (public.is_safe_http_url(image_url)),
  icon_name text,
  destination_url text check (public.is_safe_http_url(destination_url)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.membership_status not null default 'locked',
  activated_at timestamptz,
  deactivated_at timestamptz,
  activation_source text,
  payment_order_id uuid,
  updated_at timestamptz not null default now()
);

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  gateway text not null,
  provider_reference text unique,
  status public.payment_order_status not null default 'pending',
  idempotency_key text not null unique,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memberships add constraint memberships_payment_order_fkey foreign key (payment_order_id) references public.payment_orders(id) on delete set null;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_code text not null unique check (job_code ~ '^[A-Z0-9_-]{2,30}$'),
  title_en text not null check (char_length(title_en) between 1 and 180),
  title_bn text,
  short_description_en text,
  short_description_bn text,
  full_instructions_en text not null,
  full_instructions_bn text,
  category text not null default 'General',
  thumbnail_url text check (public.is_safe_http_url(thumbnail_url)),
  instruction_image_url text check (public.is_safe_http_url(instruction_image_url)),
  target_url text not null check (public.is_safe_http_url(target_url)),
  reward numeric(12,2) not null check (reward > 0),
  max_slots integer not null check (max_slots > 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  proof_requirements jsonb not null default '{"text":true,"url":false,"images":true,"maxImages":1}'::jsonb,
  deadline timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  allow_resubmission boolean not null default true,
  allow_repeat boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_count <= max_slots)
);

create table public.job_submissions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_no integer not null default 1 check (attempt_no > 0),
  status public.job_submission_status not null default 'started',
  proof_text text check (proof_text is null or char_length(proof_text) <= 3000),
  proof_url text check (public.is_safe_http_url(proof_url)),
  proof_media_paths text[] not null default '{}',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, user_id, attempt_no)
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount <> 0),
  transaction_type public.wallet_transaction_type not null,
  reference_type text,
  reference_id uuid,
  description text,
  admin_reason text,
  idempotency_key text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (transaction_type <> 'admin_adjustment' or char_length(coalesce(admin_reason, '')) >= 3)
);

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (char_length(payment_method) between 2 and 60),
  destination text not null check (char_length(destination) between 3 and 120),
  status public.withdrawal_status not null default 'pending',
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) <= 5000),
  external_url text check (public.is_safe_http_url(external_url)),
  is_pinned boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null unique,
  public_url text check (public.is_safe_http_url(public_url)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index connections_unique_pair_idx on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (char_length(type) between 2 and 60),
  title text not null check (char_length(title) between 1 and 180),
  body text check (body is null or char_length(body) <= 1000),
  destination_url text check (destination_url is null or destination_url ~ '^/[^[:space:]]*$' or public.is_safe_http_url(destination_url)),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status public.report_status not null default 'open',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((post_id is not null)::int + (comment_id is not null)::int = 1)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index profiles_referred_by_idx on public.profiles(referred_by);
create index jobs_active_sort_idx on public.jobs(is_active, sort_order, created_at desc);
create index submissions_user_idx on public.job_submissions(user_id, created_at desc);
create index submissions_status_idx on public.job_submissions(status, submitted_at);
create index wallet_user_time_idx on public.wallet_transactions(user_id, created_at desc);
create index withdrawals_user_status_idx on public.withdrawal_requests(user_id, status, created_at desc);
create index posts_feed_idx on public.posts(is_hidden, is_pinned desc, created_at desc);
create index comments_post_idx on public.comments(post_id, created_at);
create index notifications_user_unread_idx on public.notifications(user_id, read_at, created_at desc);
create index reports_status_idx on public.content_reports(status, created_at desc);
create index audit_created_idx on public.admin_audit_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','user_private_profiles','site_settings','banners','announcement_tickers','service_links','project_cards','memberships','payment_orders','jobs','job_submissions','withdrawal_requests','posts','comments','connections']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.has_active_membership(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = target_user and status = 'active');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  referrer uuid;
  referral_input text;
  generated_code text;
  mobile_input text;
begin
  referral_input := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')), ''));
  mobile_input := nullif(trim(coalesce(new.raw_user_meta_data->>'mobile', '')), '');
  if mobile_input is null or mobile_input !~ '^\+8801[3-9][0-9]{8}$' then
    raise exception 'A valid Bangladesh mobile number is required';
  end if;
  if referral_input is not null then select id into referrer from public.profiles where referral_code = referral_input limit 1; end if;
  generated_code := upper(substr(replace(new.id::text, '-', ''), 1, 10));
  insert into public.profiles (id, full_name, referral_code, referred_by)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Member'), generated_code, referrer);
  insert into public.user_private_profiles (user_id, mobile) values (new.id, mobile_input);
  insert into public.memberships (user_id, status) values (new.id, 'locked');
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.guard_profile_sensitive_fields()
returns trigger language plpgsql security invoker as $$
begin
  if not public.is_admin() and (
    new.referral_code is distinct from old.referral_code or new.referred_by is distinct from old.referred_by or
    new.badge_label is distinct from old.badge_label or new.is_suspended is distinct from old.is_suspended
  ) then raise exception 'Protected profile fields cannot be changed'; end if;
  return new;
end;
$$;
create trigger guard_profile_sensitive before update on public.profiles for each row execute function public.guard_profile_sensitive_fields();

create or replace function public.guard_post_moderation_fields()
returns trigger language plpgsql security invoker as $$
begin
  if not public.is_admin() and (new.is_pinned is distinct from old.is_pinned or new.is_hidden is distinct from old.is_hidden) then
    raise exception 'Moderation fields require administrator access';
  end if;
  return new;
end;
$$;
create trigger guard_post_moderation before update on public.posts for each row execute function public.guard_post_moderation_fields();

create or replace function public.guard_comment_moderation_fields()
returns trigger language plpgsql security invoker as $$
begin
  if not public.is_admin() and new.is_hidden is distinct from old.is_hidden then raise exception 'Moderation fields require administrator access'; end if;
  return new;
end;
$$;
create trigger guard_comment_moderation before update on public.comments for each row execute function public.guard_comment_moderation_fields();

alter table public.profiles enable row level security;
alter table public.user_private_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.site_settings enable row level security;
alter table public.banners enable row level security;
alter table public.announcement_tickers enable row level security;
alter table public.service_links enable row level security;
alter table public.project_cards enable row level security;
alter table public.memberships enable row level security;
alter table public.payment_orders enable row level security;
alter table public.jobs enable row level security;
alter table public.job_submissions enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.connections enable row level security;
alter table public.notifications enable row level security;
alter table public.content_reports enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy private_profile_read on public.user_private_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy roles_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy settings_read on public.site_settings for select to anon, authenticated using (true);
create policy settings_admin_all on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy banners_public_read on public.banners for select to anon, authenticated using (is_active or public.is_admin());
create policy banners_admin_all on public.banners for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tickers_public_read on public.announcement_tickers for select to anon, authenticated using (is_active or public.is_admin());
create policy tickers_admin_all on public.announcement_tickers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy links_public_read on public.service_links for select to anon, authenticated using (is_active or public.is_admin());
create policy links_admin_all on public.service_links for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy projects_public_read on public.project_cards for select to anon, authenticated using (is_active or public.is_admin());
create policy projects_admin_all on public.project_cards for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy memberships_read on public.memberships for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy payment_orders_read on public.payment_orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy jobs_admin_all on public.jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy submissions_read on public.job_submissions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy wallet_read on public.wallet_transactions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy withdrawals_read on public.withdrawal_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy posts_read on public.posts for select to authenticated using ((not is_hidden) or author_id = auth.uid() or public.is_admin());
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid() and not is_pinned and not is_hidden);
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());
create policy media_read on public.post_media for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id and ((not p.is_hidden) or p.author_id = auth.uid() or public.is_admin())));
create policy media_insert on public.post_media for insert to authenticated with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
create policy media_delete on public.post_media for delete to authenticated using (exists (select 1 from public.posts p where p.id = post_id and (p.author_id = auth.uid() or public.is_admin())));
create policy likes_read on public.post_likes for select to authenticated using (true);
create policy likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());
create policy comments_read on public.comments for select to authenticated using ((not is_hidden) or user_id = auth.uid() or public.is_admin());
create policy comments_insert on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy comments_update on public.comments for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy comments_delete on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());
create policy connections_read on public.connections for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_admin());
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy reports_insert on public.content_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read on public.content_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.content_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy audit_admin_read on public.admin_audit_logs for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.user_roles, public.memberships, public.payment_orders, public.job_submissions, public.wallet_transactions, public.withdrawal_requests, public.connections, public.notifications, public.admin_audit_logs from anon, authenticated;
revoke insert, update, delete on public.user_private_profiles from anon, authenticated;
revoke all on public.jobs from anon;
grant select on public.site_settings, public.banners, public.announcement_tickers, public.service_links, public.project_cards to anon;

create or replace function public.list_job_previews()
returns table (
  id uuid, job_code text, title_en text, title_bn text, short_description_en text, short_description_bn text,
  category text, thumbnail_url text, reward numeric, max_slots integer, completed_count integer, deadline timestamptz, sort_order integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query select j.id,j.job_code,j.title_en,j.title_bn,j.short_description_en,j.short_description_bn,j.category,j.thumbnail_url,j.reward,j.max_slots,j.completed_count,j.deadline,j.sort_order
  from public.jobs j where j.is_active and (j.deadline is null or j.deadline > now()) and j.completed_count < j.max_slots order by j.sort_order, j.created_at desc;
end;
$$;

create or replace function public.get_job_details(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.has_active_membership(auth.uid()) then raise exception 'Active Micro Job membership required' using errcode = '42501'; end if;
  select to_jsonb(j) into result from public.jobs j where j.id = p_job_id and j.is_active and (j.deadline is null or j.deadline > now()) and j.completed_count < j.max_slots;
  if result is null then raise exception 'Job unavailable'; end if;
  return result;
end;
$$;

create or replace function public.start_job_submission(p_job_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype; existing public.job_submissions%rowtype; next_attempt integer; result_id uuid;
begin
  if auth.uid() is null or not public.has_active_membership(auth.uid()) then raise exception 'Active Micro Job membership required'; end if;
  select * into j from public.jobs where id = p_job_id for update;
  if not found or not j.is_active or (j.deadline is not null and j.deadline <= now()) or j.completed_count >= j.max_slots then raise exception 'No job slots are available'; end if;
  select * into existing from public.job_submissions where job_id = p_job_id and user_id = auth.uid() order by attempt_no desc limit 1 for update;
  if found then
    if existing.status in ('started','resubmission_requested') then return existing.id; end if;
    if existing.status = 'pending' then raise exception 'A proof submission is already pending'; end if;
    if existing.status = 'rejected' and j.allow_resubmission then update public.job_submissions set status='started', proof_text=null, proof_url=null, proof_media_paths='{}' where id=existing.id returning id into result_id; return result_id; end if;
    if not j.allow_repeat then raise exception 'This job can only be completed once'; end if;
  end if;
  select coalesce(max(attempt_no),0)+1 into next_attempt from public.job_submissions where job_id=p_job_id and user_id=auth.uid();
  insert into public.job_submissions(job_id,user_id,attempt_no,status) values(p_job_id,auth.uid(),next_attempt,'started') returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.submit_job_proof(p_submission_id uuid, p_proof_text text default null, p_proof_url text default null, p_media_paths text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare submission public.job_submissions%rowtype; requirements jsonb; max_images integer;
begin
  select * into submission from public.job_submissions where id=p_submission_id and user_id=auth.uid() for update;
  if not found or submission.status not in ('started','resubmission_requested') then raise exception 'Submission is not editable'; end if;
  if not public.has_active_membership(auth.uid()) then raise exception 'Active Micro Job membership required'; end if;
  select proof_requirements into requirements from public.jobs where id=submission.job_id and is_active and completed_count < max_slots;
  if requirements is null then raise exception 'Job is no longer available'; end if;
  max_images := greatest(0, least(coalesce((requirements->>'maxImages')::integer, 1), 5));
  if coalesce((requirements->>'text')::boolean,false) and nullif(trim(coalesce(p_proof_text,'')),'') is null then raise exception 'Proof text is required'; end if;
  if coalesce((requirements->>'url')::boolean,false) and not public.is_safe_http_url(p_proof_url) then raise exception 'A valid proof URL is required'; end if;
  if coalesce((requirements->>'images')::boolean,false) and coalesce(array_length(p_media_paths,1),0)=0 then raise exception 'Proof image is required'; end if;
  if coalesce(array_length(p_media_paths,1),0) > max_images then raise exception 'Too many proof images'; end if;
  if exists (select 1 from unnest(coalesce(p_media_paths,'{}')) path where path not like auth.uid()::text || '/' || submission.job_id::text || '/%') then raise exception 'Invalid proof media path'; end if;
  update public.job_submissions set proof_text=nullif(trim(p_proof_text),''), proof_url=nullif(trim(p_proof_url),''), proof_media_paths=coalesce(p_media_paths,'{}'), status='pending', submitted_at=now() where id=submission.id;
  return submission.id;
end;
$$;

create or replace function public.admin_approve_job_submission(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare submission public.job_submissions%rowtype; j public.jobs%rowtype; inserted_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into submission from public.job_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if submission.status='approved' then return jsonb_build_object('status','already_approved','submission_id',submission.id); end if;
  if submission.status<>'pending' then raise exception 'Only pending submissions can be approved'; end if;
  select * into j from public.jobs where id=submission.job_id for update;
  if j.completed_count >= j.max_slots then raise exception 'Job slots are exhausted'; end if;
  insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
  values(submission.user_id,j.reward,'job_reward','job_submission',submission.id,'Approved micro-job reward','job_reward:'||submission.id::text,auth.uid())
  on conflict (idempotency_key) do nothing returning id into inserted_id;
  if inserted_id is null then raise exception 'Reward transaction already exists'; end if;
  update public.job_submissions set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),reviewer_note=null where id=submission.id;
  update public.jobs set completed_count=completed_count+1 where id=j.id;
  insert into public.notifications(user_id,type,title,body,destination_url) values(submission.user_id,'job_proof_approved','Job proof approved','Your proof was approved and the exact job reward was added to your wallet.','/wallet');
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'job_proof_approved','job_submission',submission.id,jsonb_build_object('reward',j.reward,'job_id',j.id));
  return jsonb_build_object('status','approved','reward',j.reward,'submission_id',submission.id);
end;
$$;

create or replace function public.admin_review_job_submission(p_submission_id uuid, p_action text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare submission public.job_submissions%rowtype; next_status public.job_submission_status; notice_type text; notice_title text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_action not in ('reject','resubmit') or char_length(trim(coalesce(p_note,'')))<2 then raise exception 'A review note is required'; end if;
  select * into submission from public.job_submissions where id=p_submission_id for update;
  if not found or submission.status<>'pending' then raise exception 'Only pending submissions can be reviewed'; end if;
  next_status := case when p_action='reject' then 'rejected'::public.job_submission_status else 'resubmission_requested'::public.job_submission_status end;
  notice_type := case when p_action='reject' then 'job_proof_rejected' else 'job_proof_resubmission' end;
  notice_title := case when p_action='reject' then 'Job proof rejected' else 'Job proof needs resubmission' end;
  update public.job_submissions set status=next_status,reviewed_at=now(),reviewed_by=auth.uid(),reviewer_note=trim(p_note) where id=p_submission_id;
  insert into public.notifications(user_id,type,title,body,destination_url) values(submission.user_id,notice_type,notice_title,trim(p_note),'/jobs/'||submission.job_id::text);
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),'job_proof_'||p_action,'job_submission',p_submission_id,trim(p_note));
  return p_submission_id;
end;
$$;

create or replace function public.get_wallet_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance',coalesce(sum(amount),0),
    'today',coalesce(sum(amount) filter(where amount>0 and created_at>=date_trunc('day',now())),0),
    'yesterday',coalesce(sum(amount) filter(where amount>0 and created_at>=date_trunc('day',now())-interval '1 day' and created_at<date_trunc('day',now())),0),
    'last_7_days',coalesce(sum(amount) filter(where amount>0 and created_at>=now()-interval '7 days'),0),
    'last_30_days',coalesce(sum(amount) filter(where amount>0 and created_at>=now()-interval '30 days'),0)
  ) from public.wallet_transactions where user_id=auth.uid();
$$;

create or replace function public.request_withdrawal(p_amount numeric, p_payment_method text, p_destination text)
returns uuid language plpgsql security definer set search_path = public as $$
declare min_amount numeric; methods jsonb; balance numeric; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce((value->>'withdrawalMinimum')::numeric,0),coalesce(value->'payoutMethods','[]'::jsonb) into min_amount,methods from public.site_settings where key='general';
  if p_amount < min_amount or p_amount <= 0 then raise exception 'Amount is below the withdrawal minimum'; end if;
  if not methods ? p_payment_method then raise exception 'Payment method is not available'; end if;
  if char_length(trim(coalesce(p_destination,'')))<3 then raise exception 'Destination is required'; end if;
  select coalesce(sum(amount),0) into balance from public.wallet_transactions where user_id=auth.uid();
  if p_amount > balance then raise exception 'Insufficient available balance'; end if;
  request_id := gen_random_uuid();
  insert into public.withdrawal_requests(id,user_id,amount,payment_method,destination) values(request_id,auth.uid(),p_amount,p_payment_method,trim(p_destination));
  insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
  values(auth.uid(),-p_amount,'withdrawal_hold','withdrawal',request_id,'Withdrawal request hold','withdrawal_hold:'||request_id::text,auth.uid());
  return request_id;
end;
$$;

create or replace function public.admin_update_withdrawal(p_request_id uuid, p_status text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare request public.withdrawal_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('approved','rejected','paid') then raise exception 'Invalid withdrawal status'; end if;
  select * into request from public.withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if request.status in ('rejected','paid') then raise exception 'Withdrawal is already final'; end if;
  if p_status='approved' and request.status<>'pending' then raise exception 'Only pending withdrawals can be approved'; end if;
  if p_status='paid' and request.status<>'approved' then raise exception 'Only approved withdrawals can be marked paid'; end if;
  if p_status='rejected' then
    insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
    values(request.user_id,request.amount,'withdrawal_reversal','withdrawal',request.id,'Rejected withdrawal reversal','withdrawal_reversal:'||request.id::text,auth.uid()) on conflict(idempotency_key) do nothing;
  end if;
  update public.withdrawal_requests set status=p_status::public.withdrawal_status,admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),paid_at=case when p_status='paid' then now() else paid_at end where id=p_request_id;
  insert into public.notifications(user_id,type,title,body,destination_url) values(request.user_id,'withdrawal_update','Withdrawal update','Your withdrawal status is now '||p_status||'.','/wallet');
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(auth.uid(),'withdrawal_'||p_status,'withdrawal_request',request.id,p_note,jsonb_build_object('amount',request.amount));
  return request.id;
end;
$$;

create or replace function public.admin_set_membership(p_user_id uuid, p_active boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required'; end if;
  insert into public.memberships(user_id,status,activated_at,deactivated_at,activation_source)
  values(p_user_id,case when p_active then 'active'::public.membership_status else 'deactivated'::public.membership_status end,case when p_active then now() end,case when not p_active then now() end,case when p_active then 'manual_admin' else null end)
  on conflict(user_id) do update set status=excluded.status,activated_at=case when p_active then now() else public.memberships.activated_at end,deactivated_at=case when not p_active then now() else null end,activation_source=case when p_active then 'manual_admin' else public.memberships.activation_source end;
  insert into public.notifications(user_id,type,title,body,destination_url) values(p_user_id,'membership_update',case when p_active then 'Micro Jobs activated' else 'Micro Jobs deactivated' end,trim(p_reason),'/jobs');
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),case when p_active then 'membership_activated' else 'membership_deactivated' end,'user',p_user_id,trim(p_reason));
  return p_user_id;
end;
$$;

create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare tx_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_amount=0 or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'A non-zero amount and reason are required'; end if;
  insert into public.wallet_transactions(user_id,amount,transaction_type,description,admin_reason,idempotency_key,created_by)
  values(p_user_id,p_amount,'admin_adjustment','Administrator wallet adjustment',trim(p_reason),'admin_adjustment:'||gen_random_uuid()::text,auth.uid()) returning id into tx_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(auth.uid(),'wallet_adjustment','wallet_transaction',tx_id,trim(p_reason),jsonb_build_object('user_id',p_user_id,'amount',p_amount));
  return tx_id;
end;
$$;

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

create or replace function public.update_private_phone(p_mobile text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_mobile !~ '^\+8801[3-9][0-9]{8}$' then raise exception 'Invalid mobile number'; end if;
  update public.user_private_profiles set mobile=p_mobile where user_id=auth.uid();
  return true;
exception when unique_violation then raise exception 'Mobile number is already in use';
end;
$$;

create or replace function public.get_referral_network(p_max_depth integer default 10)
returns jsonb language sql stable security definer set search_path = public as $$
with recursive tree as (
  select p.id,p.full_name,p.avatar_url,p.referred_by,1 as level from public.profiles p where p.referred_by=auth.uid()
  union all
  select child.id,child.full_name,child.avatar_url,child.referred_by,tree.level+1 from public.profiles child join tree on child.referred_by=tree.id where tree.level<least(greatest(p_max_depth,1),10)
), enriched as (
  select tree.*,coalesce(m.status,'locked'::public.membership_status) membership_status from tree left join public.memberships m on m.user_id=tree.id
), levels as (
  select g level,count(e.id) total,count(e.id) filter(where e.membership_status='active') active,count(e.id) filter(where e.membership_status<>'active') inactive from generate_series(1,10) g left join enriched e on e.level=g group by g order by g
)
select jsonb_build_object(
  'total',(select count(*) from enriched),
  'active',(select count(*) from enriched where membership_status='active'),
  'inactive',(select count(*) from enriched where membership_status<>'active'),
  'levels',(select jsonb_agg(to_jsonb(levels)) from levels),
  'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'avatar_url',avatar_url,'level',level,'membership_status',membership_status) order by level,full_name) from enriched),'[]'::jsonb)
);
$$;

create or replace function public.send_connection_request(p_addressee_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare connection_id uuid; existing public.connections%rowtype; sender_name text;
begin
  if auth.uid() is null or p_addressee_id=auth.uid() then raise exception 'Invalid connection target'; end if;
  select * into existing from public.connections where least(requester_id,addressee_id)=least(auth.uid(),p_addressee_id) and greatest(requester_id,addressee_id)=greatest(auth.uid(),p_addressee_id) limit 1;
  if found then raise exception 'A connection already exists or is pending'; end if;
  insert into public.connections(requester_id,addressee_id,status) values(auth.uid(),p_addressee_id,'pending') returning id into connection_id;
  select full_name into sender_name from public.profiles where id=auth.uid();
  insert into public.notifications(user_id,type,title,body,destination_url) values(p_addressee_id,'connection_request','New connection request',sender_name||' sent you a connection request.','/profile?user='||auth.uid()::text);
  return connection_id;
end;
$$;

create or replace function public.respond_connection_request(p_connection_id uuid, p_action text)
returns uuid language plpgsql security definer set search_path = public as $$
declare connection public.connections%rowtype;
begin
  select * into connection from public.connections where id=p_connection_id for update;
  if not found or connection.addressee_id<>auth.uid() or connection.status<>'pending' then raise exception 'Connection request is not actionable'; end if;
  if p_action='accept' then
    update public.connections set status='accepted' where id=p_connection_id;
    insert into public.notifications(user_id,type,title,body,destination_url) values(connection.requester_id,'connection_accepted','Connection accepted','Your connection request was accepted.','/profile?user='||auth.uid()::text);
  elsif p_action='reject' then delete from public.connections where id=p_connection_id;
  elsif p_action='block' then update public.connections set status='blocked' where id=p_connection_id;
  else raise exception 'Invalid connection action'; end if;
  return p_connection_id;
end;
$$;

create or replace function public.remove_connection(p_connection_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.connections where id=p_connection_id and (requester_id=auth.uid() or addressee_id=auth.uid());
  return found;
end;
$$;

create or replace function public.list_feed(p_limit integer default 10, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
select coalesce(jsonb_agg(item order by (item->>'is_pinned')::boolean desc,(item->>'created_at')::timestamptz desc),'[]'::jsonb)
from (
  select jsonb_build_object(
    'id',p.id,'author_id',p.author_id,'body',p.body,'external_url',p.external_url,'is_pinned',p.is_pinned,'created_at',p.created_at,
    'author',jsonb_build_object('id',a.id,'full_name',a.full_name,'avatar_url',a.avatar_url,'bio',a.bio,'badge_label',a.badge_label,'referral_code',a.referral_code,'created_at',a.created_at,'is_suspended',a.is_suspended),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'storage_path',pm.storage_path,'public_url',pm.public_url,'sort_order',pm.sort_order) order by pm.sort_order) from public.post_media pm where pm.post_id=p.id),'[]'::jsonb),
    'like_count',(select count(*) from public.post_likes pl where pl.post_id=p.id),
    'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.is_hidden),
    'liked_by_me',exists(select 1 from public.post_likes pl where pl.post_id=p.id and pl.user_id=auth.uid()),
    'connection_status',case when p.author_id=auth.uid() then 'connected' when exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.author_id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.author_id) and c.status='accepted') then 'connected' when exists(select 1 from public.connections c where least(c.requester_id,c.addressee_id)=least(auth.uid(),p.author_id) and greatest(c.requester_id,c.addressee_id)=greatest(auth.uid(),p.author_id) and c.status='pending') then 'pending' else 'none' end
  ) item
  from public.posts p join public.profiles a on a.id=p.author_id
  where not p.is_hidden and not a.is_suspended
  order by p.is_pinned desc,p.created_at desc
  limit least(greatest(p_limit,1),50) offset greatest(p_offset,0)
) feed;
$$;

create or replace function public.mark_notifications_read(p_notification_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and (p_notification_id is null or id=p_notification_id);
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'total_users',(select count(*) from public.profiles),
    'activated_users',(select count(*) from public.memberships where status='active'),
    'locked_users',(select count(*) from public.memberships where status<>'active'),
    'active_jobs',(select count(*) from public.jobs where is_active),
    'pending_proofs',(select count(*) from public.job_submissions where status='pending'),
    'proofs_approved_today',(select count(*) from public.job_submissions where status='approved' and reviewed_at>=date_trunc('day',now())),
    'wallet_liabilities',(select coalesce(sum(amount),0) from public.wallet_transactions),
    'pending_withdrawals',(select count(*) from public.withdrawal_requests where status in ('pending','approved')),
    'total_posts',(select count(*) from public.posts)
  );
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

create or replace function public.admin_broadcast_notification(p_title text, p_body text default null, p_destination_url text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if char_length(trim(coalesce(p_title,'')))<1 then raise exception 'Title is required'; end if;
  insert into public.notifications(user_id,type,title,body,destination_url) select id,'admin_announcement',trim(p_title),p_body,p_destination_url from public.profiles where not is_suspended;
  get diagnostics affected=row_count;
  insert into public.admin_audit_logs(actor_id,action,target_type,reason,metadata) values(auth.uid(),'notification_broadcast','notifications',trim(p_title),jsonb_build_object('recipients',affected));
  return affected;
end;
$$;

create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; liker_name text;
begin
  select author_id into owner_id from public.posts where id=new.post_id; if owner_id is null or owner_id=new.user_id then return new; end if;
  select full_name into liker_name from public.profiles where id=new.user_id;
  insert into public.notifications(user_id,type,title,body,destination_url) values(owner_id,'post_like','New post like',liker_name||' liked your post.','/feed?post='||new.post_id::text);
  return new;
end;
$$;
create trigger post_like_notification after insert on public.post_likes for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; commenter_name text;
begin
  select author_id into owner_id from public.posts where id=new.post_id; if owner_id is null or owner_id=new.user_id then return new; end if;
  select full_name into commenter_name from public.profiles where id=new.user_id;
  insert into public.notifications(user_id,type,title,body,destination_url) values(owner_id,'post_comment','New comment',commenter_name||' commented on your post.','/feed?post='||new.post_id::text);
  return new;
end;
$$;
create trigger comment_notification after insert on public.comments for each row execute function public.notify_on_comment();

grant execute on function public.list_job_previews() to authenticated;
grant execute on function public.get_job_details(uuid) to authenticated;
grant execute on function public.start_job_submission(uuid) to authenticated;
grant execute on function public.submit_job_proof(uuid,text,text,text[]) to authenticated;
grant execute on function public.get_wallet_summary() to authenticated;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;
grant execute on function public.update_private_phone(text) to authenticated;
grant execute on function public.get_referral_network(integer) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid,text) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.list_feed(integer,integer) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
grant execute on function public.admin_approve_job_submission(uuid) to authenticated;
grant execute on function public.admin_review_job_submission(uuid,text,text) to authenticated;
grant execute on function public.admin_update_withdrawal(uuid,text,text) to authenticated;
grant execute on function public.admin_set_membership(uuid,boolean,text) to authenticated;
grant execute on function public.admin_adjust_wallet(uuid,numeric,text) to authenticated;
grant execute on function public.admin_set_user_suspension(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_user_badge(uuid,text,text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;
grant execute on function public.admin_broadcast_notification(text,text,text) to authenticated;

insert into public.site_settings(key,value) values
('general', jsonb_build_object(
  'siteName','Community Hub','logoUrl',null,'faviconUrl',null,'primaryColor','#FF4D1F','accentColor','#FF6B3D','backgroundColor','#FFF9ED',
  'currency','BDT','activationPrice',299,'activationGateScope','micro_jobs','memberBadgeWording','Member','withdrawalMinimum',100,
  'payoutMethods',jsonb_build_array('bKash','Nagad','Bank Transfer'),'paymentGatewayStatus','not_configured',
  'paymentPendingMessage','Payment gateway setup is currently pending. Please contact support.','generalNotice','','privacyContent',''
)),
('support', jsonb_build_object('enabled',false,'label','Support','iconUrl',null,'contactUrl',null,'phone',null,'position','right'));

insert into public.banners(title,sort_order,is_active) values ('Welcome to your community',1,true),('Complete tasks after secure activation',2,true);
insert into public.announcement_tickers(text_en,background_color,direction,speed_seconds,sort_order,is_active) values ('Welcome. All business content on this site can be managed from the Admin Panel.','#FF4D1F','rtl',16,1,true);
insert into public.service_links(label_en,icon_name,destination_url,sort_order,is_active) values ('YouTube','youtube','https://www.youtube.com/',1,true),('Facebook','globe','https://www.facebook.com/',2,true);
insert into public.project_cards(title_en,description_en,icon_name,sort_order,is_active) values ('Starter Service','Replace this card from the Admin Panel.','globe',1,true),('Community Resource','Replace this card from the Admin Panel.','link',2,true);
insert into public.jobs(job_code,title_en,short_description_en,full_instructions_en,category,target_url,reward,max_slots,proof_requirements,sort_order,is_active) values
('DEMO101','Read a public information page','Open the public page and submit a screenshot.','Open the target page, review the information, then submit one screenshot as proof.','Reading','https://example.com/',0.50,200,'{"text":false,"url":false,"images":true,"maxImages":1}',1,true),
('DEMO102','Write a short usability note','Review the target page and submit a short text note.','Open the target page and submit a short, honest usability note.','Feedback','https://example.com/',0.75,100,'{"text":true,"url":false,"images":false,"maxImages":0}',2,true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('branding','branding',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml']),
('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
('post-media','post-media',true,8388608,array['image/jpeg','image/png','image/webp']),
('job-media','job-media',true,8388608,array['image/jpeg','image/png','image/webp']),
('job-proofs','job-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

create policy storage_public_read on storage.objects for select to anon, authenticated using (bucket_id in ('branding','avatars','post-media','job-media'));
create policy storage_branding_admin_insert on storage.objects for insert to authenticated with check (bucket_id in ('branding','job-media') and public.is_admin());
create policy storage_branding_admin_update on storage.objects for update to authenticated using (bucket_id in ('branding','job-media') and public.is_admin()) with check (bucket_id in ('branding','job-media') and public.is_admin());
create policy storage_branding_admin_delete on storage.objects for delete to authenticated using (bucket_id in ('branding','job-media') and public.is_admin());
create policy storage_avatar_insert on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name))=any(array['jpg','jpeg','png','webp']));
create policy storage_avatar_update on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy storage_avatar_delete on storage.objects for delete to authenticated using (bucket_id='avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy storage_post_insert on storage.objects for insert to authenticated with check (bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name))=any(array['jpg','jpeg','png','webp']));
create policy storage_post_delete on storage.objects for delete to authenticated using (bucket_id='post-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy storage_proof_insert on storage.objects for insert to authenticated with check (bucket_id='job-proofs' and (storage.foldername(name))[1]=auth.uid()::text and lower(storage.extension(name))=any(array['jpg','jpeg','png','webp']));
create policy storage_proof_read on storage.objects for select to authenticated using (bucket_id='job-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy storage_proof_delete on storage.objects for delete to authenticated using (bucket_id='job-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.site_settings;

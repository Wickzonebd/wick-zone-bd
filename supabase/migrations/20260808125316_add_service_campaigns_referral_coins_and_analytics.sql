update public.site_settings
set value = value || jsonb_build_object(
      'referralRewardCoins', coalesce(value->'referralRewardCoins', to_jsonb(100)),
      'coinsPerCurrencyUnit', coalesce(value->'coinsPerCurrencyUnit', to_jsonb(100)),
      'minimumCoinExchange', coalesce(value->'minimumCoinExchange', to_jsonb(100))
    ),
    updated_at = now()
where key = 'general';

create table public.service_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.marketplace_services(id) on delete set null,
  service_name text not null check (char_length(service_name) between 2 and 140),
  platform text not null check (char_length(platform) between 2 and 40),
  service_type text not null check (char_length(service_type) between 2 and 60),
  target_url text not null check (public.is_safe_http_url(target_url)),
  quantity integer not null check (quantity > 0),
  delivered_count integer not null default 0 check (delivered_count >= 0 and delivered_count <= quantity),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  payment_status text not null default 'pending' check (payment_status in ('pending','confirmed','refunded')),
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or delivered_count = quantity)
);

create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  transaction_type text not null check (transaction_type in ('referral_reward','exchange')),
  referred_user_id uuid references public.profiles(id) on delete set null,
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  description text check (description is null or char_length(description) <= 500),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index service_campaigns_user_time_idx
  on public.service_campaigns(user_id, created_at desc);
create index service_campaigns_status_time_idx
  on public.service_campaigns(status, created_at desc);
create index service_campaigns_service_idx
  on public.service_campaigns(service_id);
create index coin_transactions_user_time_idx
  on public.coin_transactions(user_id, created_at desc);
create index coin_transactions_referred_user_idx
  on public.coin_transactions(referred_user_id)
  where referred_user_id is not null;

create trigger service_campaigns_set_updated_at
  before update on public.service_campaigns
  for each row execute function public.set_updated_at();

alter table public.service_campaigns enable row level security;
alter table public.coin_transactions enable row level security;

create policy service_campaigns_read_own_or_admin
  on public.service_campaigns
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy coin_transactions_read_own_or_admin
  on public.coin_transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

revoke all on public.service_campaigns from anon, authenticated;
revoke all on public.coin_transactions from anon, authenticated;
grant select on public.service_campaigns to authenticated;
grant select on public.coin_transactions to authenticated;
grant all on public.service_campaigns to service_role;
grant all on public.coin_transactions to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.reward_referral_coins()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reward integer;
begin
  if new.referred_by is null then
    return new;
  end if;

  select greatest(0, coalesce((value->>'referralRewardCoins')::integer, 100))
  into reward
  from public.site_settings
  where key = 'general';

  reward := coalesce(reward, 100);
  if reward > 0 then
    insert into public.coin_transactions(
      user_id, amount, transaction_type, referred_user_id, description, idempotency_key
    ) values (
      new.referred_by, reward, 'referral_reward', new.id,
      'Referral reward', 'referral_reward:' || new.id::text
    ) on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.reward_referral_coins() from public, anon, authenticated;

create trigger profiles_reward_referral_coins
  after insert on public.profiles
  for each row execute function private.reward_referral_coins();

insert into public.coin_transactions(
  user_id, amount, transaction_type, referred_user_id, description, idempotency_key
)
select
  p.referred_by,
  greatest(0, coalesce((s.value->>'referralRewardCoins')::integer, 100)),
  'referral_reward',
  p.id,
  'Referral reward',
  'referral_reward:' || p.id::text
from public.profiles p
cross join public.site_settings s
where p.referred_by is not null
  and s.key = 'general'
  and greatest(0, coalesce((s.value->>'referralRewardCoins')::integer, 100)) > 0
on conflict (idempotency_key) do nothing;

create or replace function public.create_service_campaign(p_service_id uuid, p_target_url text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_service public.marketplace_services%rowtype;
  configured_currency text;
  campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(coalesce(p_target_url, '')), '') is null
    or not public.is_safe_http_url(trim(p_target_url)) then
    raise exception 'A valid target URL is required';
  end if;

  select * into selected_service
  from public.marketplace_services
  where id = p_service_id and is_active
  limit 1;
  if not found then
    raise exception 'This service is not available';
  end if;

  select upper(coalesce(value->>'currency', 'BDT'))
  into configured_currency
  from public.site_settings
  where key = 'general';
  if configured_currency is null or configured_currency !~ '^[A-Z]{3}$' then
    configured_currency := 'BDT';
  end if;

  insert into public.service_campaigns(
    user_id, service_id, service_name, platform, service_type, target_url,
    quantity, amount, currency
  ) values (
    auth.uid(), selected_service.id, selected_service.name_en, selected_service.platform,
    selected_service.service_type, trim(p_target_url), selected_service.quantity,
    selected_service.price, configured_currency
  ) returning id into campaign_id;

  insert into public.notifications(user_id, type, title, body, destination_url)
  values (
    auth.uid(), 'service_campaign_created', 'Service order received',
    'Your campaign is waiting for payment confirmation and admin start.',
    '/services/' || selected_service.id::text
  );

  return campaign_id;
end;
$$;

create or replace function public.admin_update_service_campaign(
  p_campaign_id uuid,
  p_delivered_count integer,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  campaign public.service_campaigns%rowtype;
  delivered integer;
  next_status text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('pending','active','completed','cancelled') then
    raise exception 'Invalid campaign status';
  end if;

  select * into campaign
  from public.service_campaigns
  where id = p_campaign_id
  for update;
  if not found then
    raise exception 'Campaign not found';
  end if;
  if campaign.status in ('completed','cancelled') and p_status <> campaign.status then
    raise exception 'A final campaign cannot be reopened';
  end if;

  delivered := coalesce(p_delivered_count, campaign.delivered_count);
  if delivered < 0 or delivered > campaign.quantity then
    raise exception 'Delivered count must be between 0 and the campaign quantity';
  end if;

  next_status := p_status;
  if next_status = 'completed' then
    delivered := campaign.quantity;
  elsif delivered = campaign.quantity and next_status <> 'cancelled' then
    next_status := 'completed';
  elsif delivered > 0 and next_status = 'pending' then
    next_status := 'active';
  end if;

  update public.service_campaigns
  set delivered_count = delivered,
      status = next_status,
      payment_status = case
        when next_status in ('active','completed') and payment_status = 'pending' then 'confirmed'
        else payment_status
      end,
      admin_note = nullif(trim(coalesce(p_note, '')), ''),
      started_at = case when next_status in ('active','completed') then coalesce(started_at, now()) else started_at end,
      completed_at = case when next_status = 'completed' then coalesce(completed_at, now()) else completed_at end
  where id = campaign.id
  returning * into campaign;

  insert into public.notifications(user_id, type, title, body, destination_url)
  values (
    campaign.user_id,
    'service_campaign_update',
    case when campaign.status = 'completed' then 'Campaign completed' else 'Campaign progress updated' end,
    campaign.service_name || ': ' || campaign.delivered_count::text || ' / ' || campaign.quantity::text || ' delivered.',
    case when campaign.service_id is null then '/dashboard' else '/services/' || campaign.service_id::text end
  );

  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, reason, metadata)
  values (
    auth.uid(), 'service_campaign_updated', 'service_campaign', campaign.id,
    nullif(trim(coalesce(p_note, '')), ''),
    jsonb_build_object('delivered_count', campaign.delivered_count, 'quantity', campaign.quantity, 'status', campaign.status)
  );

  return jsonb_build_object(
    'id', campaign.id,
    'status', campaign.status,
    'delivered_count', campaign.delivered_count,
    'quantity', campaign.quantity
  );
end;
$$;

create or replace function public.get_coin_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with settings as (
    select
      greatest(0, coalesce((value->>'referralRewardCoins')::integer, 100)) as referral_reward,
      greatest(1, coalesce((value->>'coinsPerCurrencyUnit')::integer, 100)) as exchange_rate,
      greatest(1, coalesce((value->>'minimumCoinExchange')::integer, 100)) as minimum_exchange
    from public.site_settings where key = 'general'
  ), coin_totals as (
    select coalesce(sum(amount), 0)::bigint as balance
    from public.coin_transactions
    where user_id = (select auth.uid())
  )
  select jsonb_build_object(
    'balance', (select balance from coin_totals),
    'referral_count', (select count(*) from public.profiles where referred_by = (select auth.uid())),
    'referral_reward', coalesce((select referral_reward from settings), 100),
    'coins_per_currency_unit', coalesce((select exchange_rate from settings), 100),
    'minimum_exchange', coalesce((select minimum_exchange from settings), 100)
  );
$$;

create or replace function public.exchange_coins(p_coins integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  balance bigint;
  exchange_rate integer;
  minimum_exchange integer;
  wallet_amount numeric(12,2);
  coin_tx_id uuid;
  wallet_tx_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    greatest(1, coalesce((value->>'coinsPerCurrencyUnit')::integer, 100)),
    greatest(1, coalesce((value->>'minimumCoinExchange')::integer, 100))
  into exchange_rate, minimum_exchange
  from public.site_settings
  where key = 'general';
  exchange_rate := coalesce(exchange_rate, 100);
  minimum_exchange := coalesce(minimum_exchange, 100);

  if p_coins is null or p_coins < minimum_exchange then
    raise exception 'Coin amount is below the minimum exchange';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('taskora-coins:' || auth.uid()::text, 0));

  select coalesce(sum(amount), 0)::bigint into balance
  from public.coin_transactions
  where user_id = auth.uid();
  if p_coins > balance then
    raise exception 'Insufficient coin balance';
  end if;

  wallet_amount := round(p_coins::numeric / exchange_rate::numeric, 2);
  if wallet_amount <= 0 then
    raise exception 'Coin amount is too small to exchange';
  end if;

  insert into public.coin_transactions(user_id, amount, transaction_type, description, idempotency_key)
  values (
    auth.uid(), -p_coins, 'exchange', 'Coins exchanged to wallet',
    'coin_exchange:' || gen_random_uuid()::text
  ) returning id into coin_tx_id;

  insert into public.wallet_transactions(
    user_id, amount, transaction_type, reference_type, reference_id,
    description, idempotency_key, created_by
  ) values (
    auth.uid(), wallet_amount, 'coin_exchange', 'coin_transaction', coin_tx_id,
    'Referral coins exchanged to wallet', 'coin_exchange_wallet:' || coin_tx_id::text, auth.uid()
  ) returning id into wallet_tx_id;

  update public.coin_transactions
  set wallet_transaction_id = wallet_tx_id
  where id = coin_tx_id;

  return jsonb_build_object(
    'coins', p_coins,
    'wallet_amount', wallet_amount,
    'remaining_coins', balance - p_coins
  );
end;
$$;

create or replace function public.get_my_activity_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with counts as (
    select
      (select count(*) from public.job_submissions where user_id = (select auth.uid()) and status = 'approved')::bigint as approved_jobs,
      (select count(*) from public.service_campaigns where user_id = (select auth.uid()) and status <> 'cancelled')::bigint as campaigns,
      (select count(*) from public.service_campaigns where user_id = (select auth.uid()) and status = 'completed')::bigint as completed_campaigns
  ), scored as (
    select *, approved_jobs + campaigns as activity_score from counts
  ), leveled as (
    select *, case
      when activity_score >= 20000 then 10
      when activity_score >= 15000 then 9
      when activity_score >= 10000 then 8
      when activity_score >= 6000 then 7
      when activity_score >= 3000 then 6
      when activity_score >= 1500 then 5
      when activity_score >= 750 then 4
      when activity_score >= 300 then 3
      when activity_score >= 100 then 2
      else 1
    end as level
    from scored
  )
  select jsonb_build_object(
    'approved_jobs', approved_jobs,
    'campaigns', campaigns,
    'completed_campaigns', completed_campaigns,
    'activity_score', activity_score,
    'level', level,
    'next_level_score', case level
      when 1 then 100 when 2 then 300 when 3 then 750 when 4 then 1500 when 5 then 3000
      when 6 then 6000 when 7 then 10000 when 8 then 15000 when 9 then 20000 else null
    end,
    'level_floor', case level
      when 1 then 0 when 2 then 100 when 3 then 300 when 4 then 750 when 5 then 1500
      when 6 then 3000 when 7 then 6000 when 8 then 10000 when 9 then 15000 else 20000
    end
  ) from leveled;
$$;

create or replace function public.get_wallet_analytics()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as month_start
  ), earned as (
    select date_trunc('month', created_at) as month_start, sum(amount) as amount
    from public.wallet_transactions
    where user_id = (select auth.uid())
      and amount > 0
      and transaction_type not in ('withdrawal_reversal','ludo_refund')
    group by 1
  ), withdrawn as (
    select date_trunc('month', coalesce(paid_at, reviewed_at, created_at)) as month_start, sum(amount) as amount
    from public.withdrawal_requests
    where user_id = (select auth.uid()) and status = 'paid'
    group by 1
  )
  select jsonb_build_object(
    'total_earned', coalesce((select sum(amount) from public.wallet_transactions where user_id = (select auth.uid()) and amount > 0 and transaction_type not in ('withdrawal_reversal','ludo_refund')), 0),
    'total_withdrawn', coalesce((select sum(amount) from public.withdrawal_requests where user_id = (select auth.uid()) and status = 'paid'), 0),
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'earned', coalesce(e.amount, 0),
        'withdrawn', coalesce(w.amount, 0)
      ) order by m.month_start)
      from months m
      left join earned e using (month_start)
      left join withdrawn w using (month_start)
    )
  );
$$;

revoke all on function public.create_service_campaign(uuid, text) from public, anon;
revoke all on function public.admin_update_service_campaign(uuid, integer, text, text) from public, anon;
revoke all on function public.get_coin_summary() from public, anon;
revoke all on function public.exchange_coins(integer) from public, anon;
revoke all on function public.get_my_activity_summary() from public, anon;
revoke all on function public.get_wallet_analytics() from public, anon;

grant execute on function public.create_service_campaign(uuid, text) to authenticated;
grant execute on function public.admin_update_service_campaign(uuid, integer, text, text) to authenticated;
grant execute on function public.get_coin_summary() to authenticated;
grant execute on function public.exchange_coins(integer) to authenticated;
grant execute on function public.get_my_activity_summary() to authenticated;
grant execute on function public.get_wallet_analytics() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'service_campaigns'
    ) then
    alter publication supabase_realtime add table public.service_campaigns;
  end if;
end $$;

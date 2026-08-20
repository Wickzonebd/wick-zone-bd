create or replace function public.enforce_wallet_debit_balance()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public','pg_temp'
as $$
declare
  current_balance numeric;
begin
  if new.amount >= 0 then return new; end if;
  if new.transaction_type::text not in ('wallet_purchase','withdrawal_hold','ludo_entry','social_verification') then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select coalesce(sum(w.amount),0) into current_balance
  from public.wallet_transactions w
  where w.user_id = new.user_id;

  if current_balance + new.amount < 0 then
    raise exception 'insufficient_wallet_balance';
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_debit_balance_guard on public.wallet_transactions;
create trigger wallet_debit_balance_guard
before insert on public.wallet_transactions
for each row execute function public.enforce_wallet_debit_balance();

create or replace function public.get_wallet_summary()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'balance',coalesce(sum(amount),0),
    'today',coalesce(sum(amount) filter(where amount>0 and transaction_type::text <> 'deposit' and created_at>=date_trunc('day',now())),0),
    'yesterday',coalesce(sum(amount) filter(where amount>0 and transaction_type::text <> 'deposit' and created_at>=date_trunc('day',now())-interval '1 day' and created_at<date_trunc('day',now())),0),
    'last_7_days',coalesce(sum(amount) filter(where amount>0 and transaction_type::text <> 'deposit' and created_at>=now()-interval '7 days'),0),
    'last_30_days',coalesce(sum(amount) filter(where amount>0 and transaction_type::text <> 'deposit' and created_at>=now()-interval '30 days'),0)
  ) from public.wallet_transactions where user_id=auth.uid();
$$;

create or replace function public.get_wallet_analytics()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with months as (
    select generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as month_start
  ), earned as (
    select date_trunc('month', created_at) as month_start, sum(amount) as amount
    from public.wallet_transactions
    where user_id = (select auth.uid())
      and amount > 0
      and transaction_type::text not in ('withdrawal_reversal','ludo_refund','deposit')
    group by 1
  ), withdrawn as (
    select date_trunc('month', coalesce(paid_at, reviewed_at, created_at)) as month_start, sum(amount) as amount
    from public.withdrawal_requests
    where user_id = (select auth.uid()) and status = 'paid'
    group by 1
  )
  select jsonb_build_object(
    'total_earned', coalesce((select sum(amount) from public.wallet_transactions where user_id = (select auth.uid()) and amount > 0 and transaction_type::text not in ('withdrawal_reversal','ludo_refund','deposit')), 0),
    'total_withdrawn', coalesce((select sum(amount) from public.withdrawal_requests where user_id = (select auth.uid()) and status = 'paid'), 0),
    'months', (
      select jsonb_agg(jsonb_build_object('month', to_char(m.month_start, 'YYYY-MM'),'earned', coalesce(e.amount, 0),'withdrawn', coalesce(w.amount, 0)) order by m.month_start)
      from months m left join earned e using (month_start) left join withdrawn w using (month_start)
    )
  );
$$;

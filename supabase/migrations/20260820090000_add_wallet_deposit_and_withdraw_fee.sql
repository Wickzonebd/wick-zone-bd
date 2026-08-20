alter type public.wallet_transaction_type add value if not exists 'deposit';
alter type public.wallet_transaction_type add value if not exists 'wallet_purchase';

alter table public.payments
  drop constraint if exists payments_payment_type_check;

alter table public.payments
  add constraint payments_payment_type_check
  check (payment_type = any (array['micro_jobs'::text, 'verification'::text, 'reselling'::text, 'deposit'::text, 'other'::text]));

alter table public.withdrawal_requests
  add column if not exists gross_amount numeric(12,2),
  add column if not exists charge_amount numeric(12,2) not null default 0;

update public.withdrawal_requests
set gross_amount = amount
where gross_amount is null;

alter table public.withdrawal_requests
  alter column gross_amount set not null;

alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_gross_amount_check,
  drop constraint if exists withdrawal_requests_charge_amount_check;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_gross_amount_check check (gross_amount > 0),
  add constraint withdrawal_requests_charge_amount_check check (charge_amount >= 0 and charge_amount <= gross_amount);

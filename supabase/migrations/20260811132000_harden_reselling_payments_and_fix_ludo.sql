begin;

-- Public Ludo wrappers intentionally call a small set of explicitly granted
-- functions in the non-exposed private schema. USAGE is required for Postgres
-- to resolve those names; it does not grant access to private tables.
grant usage on schema private to authenticated;

create or replace function public.sync_reselling_order_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  order_id uuid;
begin
  if new.payment_type <> 'reselling' or new.item_id is null then
    return new;
  end if;

  begin
    order_id := new.item_id::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  update public.reselling_orders
  set payment_status = case
        when new.status = 'paid' then 'paid'
        when new.status = 'refunded' then 'refunded'
        when new.status in ('pending', 'processing') then 'pending'
        else 'unpaid'
      end,
      updated_at = now()
  where id = order_id
    and (payment_status <> 'paid' or new.status in ('paid', 'refunded'));

  return new;
end;
$$;

revoke all on function public.sync_reselling_order_payment_status() from public, anon, authenticated;

drop trigger if exists payments_sync_reselling_order_status on public.payments;
create trigger payments_sync_reselling_order_status
after insert or update of status on public.payments
for each row
execute function public.sync_reselling_order_payment_status();

create or replace function public.enforce_reselling_payment_before_fulfillment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status in ('confirmed', 'processing', 'completed')
     and new.payment_status <> 'paid' then
    raise exception 'Verified payment is required before this order can be fulfilled';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_reselling_payment_before_fulfillment() from public, anon, authenticated;

drop trigger if exists reselling_orders_require_verified_payment on public.reselling_orders;
create trigger reselling_orders_require_verified_payment
before insert or update of status, payment_status on public.reselling_orders
for each row
execute function public.enforce_reselling_payment_before_fulfillment();

comment on trigger reselling_orders_require_verified_payment on public.reselling_orders is
  'Prevents fulfillment until the linked server-verified payment is paid.';

commit;

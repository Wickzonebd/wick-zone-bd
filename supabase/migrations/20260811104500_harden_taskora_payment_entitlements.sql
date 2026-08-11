-- Production hardening for Taskora verified-payment fulfillment.
-- Keeps entitlement writes compatible with the existing profile guard and
-- ensures reselling/payment notifications are updated atomically.

create or replace function public.finalize_verified_payment(
  p_payment_id uuid,
  p_transaction_id text,
  p_provider_transaction_id text,
  p_payment_method text,
  p_provider_response jsonb default '{}'::jsonb
)
returns public.payments
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  pay public.payments%rowtype;
  order_id uuid;
begin
  select * into pay
  from public.payments
  where id = p_payment_id
  for update;

  if not found then raise exception 'payment_not_found'; end if;
  if pay.status = 'paid' then return pay; end if;
  if pay.status in ('cancelled','refunded') then raise exception 'payment_not_payable'; end if;

  if p_transaction_id is null or btrim(p_transaction_id) = '' then
    raise exception 'missing_transaction_id';
  end if;

  if exists (
    select 1 from public.payments
    where transaction_id = p_transaction_id and id <> pay.id
  ) then
    raise exception 'duplicate_transaction';
  end if;

  update public.payments
  set status = 'paid',
      transaction_id = p_transaction_id,
      provider_transaction_id = coalesce(nullif(p_provider_transaction_id, ''), provider_transaction_id),
      payment_method = coalesce(nullif(p_payment_method, ''), payment_method),
      provider_response = coalesce(p_provider_response, '{}'::jsonb),
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = pay.id
  returning * into pay;

  update public.invoices
  set status = 'paid',
      transaction_id = pay.transaction_id,
      payment_method = pay.payment_method,
      paid_at = pay.paid_at
  where payment_id = pay.id;

  if pay.payment_type = 'micro_jobs' then
    insert into public.memberships (user_id, status, activated_at, deactivated_at, activation_source)
    values (pay.user_id, 'active', pay.paid_at, null, 'payment')
    on conflict (user_id) do update
      set status = 'active',
          activated_at = excluded.activated_at,
          deactivated_at = null,
          activation_source = 'payment',
          updated_at = now();

  elsif pay.payment_type = 'verification' then
    perform pg_catalog.set_config('taskora.social_verification_write', '1', true);
    update public.profiles
    set is_social_verified = true,
        social_verified_at = coalesce(social_verified_at, pay.paid_at),
        social_verification_source = 'payment'
    where id = pay.user_id;
    perform pg_catalog.set_config('taskora.social_verification_write', '0', true);

  elsif pay.payment_type = 'reselling' and pay.item_id is not null then
    begin
      order_id := pay.item_id::uuid;
      update public.reselling_orders
      set payment_status = 'paid',
          payment_method = coalesce(nullif(pay.payment_method, ''), payment_method),
          status = case when status = 'cancelled' then status else 'processing' end,
          updated_at = now()
      where id = order_id and user_id = pay.user_id;
    exception when invalid_text_representation then
      raise exception 'invalid_reselling_order_id';
    end;
  end if;

  insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
  values (
    pay.id,
    pay.invoice_id,
    'payment_verified',
    jsonb_build_object(
      'transaction_id', pay.transaction_id,
      'provider_transaction_id', pay.provider_transaction_id,
      'payment_type', pay.payment_type
    )
  );

  begin
    insert into public.notifications(
      user_id, type, title, body, destination_url, category, priority, sender_label
    ) values (
      pay.user_id,
      'payment_success',
      'Payment successful',
      case
        when pay.payment_type = 'micro_jobs' then 'আপনার পেমেন্ট সফলভাবে সম্পন্ন হয়েছে। Micro Jobs অ্যাক্সেস সক্রিয় করা হয়েছে।'
        when pay.payment_type = 'verification' then 'আপনার পেমেন্ট সফলভাবে সম্পন্ন হয়েছে। Verified Badge সক্রিয় করা হয়েছে।'
        when pay.payment_type = 'reselling' then 'আপনার অর্ডারের পেমেন্ট সফল হয়েছে এবং অর্ডারটি প্রসেসিংয়ে গেছে।'
        else 'আপনার পেমেন্ট সফলভাবে সম্পন্ন হয়েছে।'
      end,
      case
        when pay.payment_type = 'micro_jobs' then '/jobs'
        when pay.payment_type = 'verification' then '/profile'
        when pay.payment_type = 'reselling' then '/reselling?view=orders'
        else '/profile/payments'
      end,
      'payment',
      'important',
      'Taskora Payments'
    );
  exception when others then
    insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
    values (pay.id, pay.invoice_id, 'notification_failed', jsonb_build_object('message', sqlerrm));
  end;

  return pay;
end;
$$;

revoke all on function public.finalize_verified_payment(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.finalize_verified_payment(uuid,text,text,text,jsonb) to service_role;

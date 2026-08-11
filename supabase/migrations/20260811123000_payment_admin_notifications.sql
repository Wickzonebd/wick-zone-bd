-- Notify Taskora administrators exactly once when a payment transitions to paid,
-- and record the fulfillment completion event in the payment audit trail.

create or replace function public.notify_admins_on_verified_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.notifications(
      user_id, type, title, body, destination_url, category, priority, sender_label
    )
    select
      ur.user_id,
      'admin_payment_success',
      'Payment verified · ' || new.invoice_id,
      coalesce(new.customer_name, new.customer_email, 'A Taskora member') ||
        ' paid ' || new.amount::text || ' ' || new.currency ||
        ' for ' || new.item_name || '.',
      '/admin/payments/' || new.id::text,
      'payment',
      'important',
      'Taskora Payments'
    from public.user_roles ur
    where ur.role = 'admin';

    insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
    values (
      new.id,
      new.invoice_id,
      case
        when new.payment_type in ('micro_jobs','verification') then 'activation_completed'
        when new.payment_type = 'reselling' then 'fulfillment_started'
        else 'payment_completed'
      end,
      jsonb_build_object('payment_type', new.payment_type, 'item_id', new.item_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_admins_on_verified_payment() from public, anon, authenticated;
grant execute on function public.notify_admins_on_verified_payment() to service_role;

drop trigger if exists payments_notify_admins_after_paid on public.payments;
create trigger payments_notify_admins_after_paid
after update of status on public.payments
for each row
when (new.status = 'paid' and old.status is distinct from 'paid')
execute function public.notify_admins_on_verified_payment();

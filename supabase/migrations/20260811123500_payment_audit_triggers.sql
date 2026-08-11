-- Server-owned audit events for invoice generation and provider redirect readiness.

create or replace function public.audit_generated_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
  values (new.payment_id, new.invoice_number, 'invoice_generated', jsonb_build_object('total', new.total, 'currency', new.currency));
  return new;
end;
$$;

revoke all on function public.audit_generated_invoice() from public, anon, authenticated;
grant execute on function public.audit_generated_invoice() to service_role;

drop trigger if exists invoices_audit_generated on public.invoices;
create trigger invoices_audit_generated
after insert on public.invoices
for each row execute function public.audit_generated_invoice();

create or replace function public.audit_payment_redirect_ready()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.provider_checkout_url is not null and old.provider_checkout_url is null then
    insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
    values (new.id, new.invoice_id, 'payment_redirected', jsonb_build_object('provider_session_id', new.provider_session_id));
  end if;
  return new;
end;
$$;

revoke all on function public.audit_payment_redirect_ready() from public, anon, authenticated;
grant execute on function public.audit_payment_redirect_ready() to service_role;

drop trigger if exists payments_audit_redirect_ready on public.payments;
create trigger payments_audit_redirect_ready
after update of provider_checkout_url on public.payments
for each row
when (new.provider_checkout_url is not null and old.provider_checkout_url is null)
execute function public.audit_payment_redirect_ready();

begin;

-- Taskora uses the provider-hosted checkout exclusively. Customers choose an
-- available mobile banking or card method on that secure page; Taskora never
-- asks for a merchant receiving number or a manually entered transaction ID.
alter table public.payment_settings
  alter column manual_payment_enabled set default false;

update public.payment_settings
set manual_payment_enabled = false,
    bkash_enabled = false,
    bkash_number = null,
    nagad_enabled = false,
    nagad_number = null,
    rocket_enabled = false,
    rocket_number = null,
    updated_at = now()
where id = true;

create or replace function public.get_payment_checkout_config(p_type text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  s public.payment_settings%rowtype;
  price numeric(12,2);
begin
  select * into s from public.payment_settings where id = true;
  if not found then return jsonb_build_object('enabled', false); end if;

  if p_type = 'micro_jobs' then
    price := s.micro_job_activation_price;
  elsif p_type = 'verification' then
    if not s.verification_enabled then
      return jsonb_build_object('enabled', false, 'reason', 'verification_disabled');
    end if;
    price := s.verification_price;
  else
    price := null;
  end if;

  return jsonb_build_object(
    'enabled', s.payment_enabled,
    'currency', s.currency,
    'merchantName', s.merchant_name,
    'merchantLogo', s.merchant_logo,
    'supportPhone', s.support_phone,
    'supportEmail', s.support_email,
    'termsText', s.terms_text,
    'price', price
  );
end;
$$;

revoke all on function public.get_payment_checkout_config(text) from public, anon;
grant execute on function public.get_payment_checkout_config(text) to authenticated;

-- Keep the previous migration reversible, but make its manual submission and
-- review entry points unavailable while hosted checkout is the product flow.
revoke execute on function public.submit_manual_payment(text,text,text,text,text) from authenticated;
revoke execute on function private.submit_manual_payment_impl(text,text,text,text,text) from authenticated;
revoke execute on function public.review_manual_payment(uuid,boolean,text) from authenticated;
revoke execute on function private.review_manual_payment_impl(uuid,boolean,text) from authenticated;

commit;

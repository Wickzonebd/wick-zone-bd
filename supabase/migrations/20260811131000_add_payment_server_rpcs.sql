begin;

-- Keep payment tables private. Edge Functions receive access only through
-- narrowly scoped SECURITY DEFINER RPCs instead of table-wide service grants.

create or replace function public.reserve_payment_attempt(
  p_user_id uuid,
  p_payment_type text,
  p_item_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  settings_row public.payment_settings%rowtype;
  payment_row public.payments%rowtype;
  order_row public.reselling_orders%rowtype;
  customer_email text;
  customer_name text;
  customer_phone text;
  social_verified boolean := false;
  membership_status text;
  amount_due numeric(12,2);
  normalized_item_id text;
  item_name text;
  item_description text;
  invoice_number text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_user_id is null or p_payment_type not in ('micro_jobs', 'verification', 'reselling') then
    raise exception 'invalid_payment_request';
  end if;

  select * into settings_row
  from public.payment_settings
  where id = true;

  if not found then raise exception 'payment_settings_unavailable'; end if;
  if not settings_row.payment_enabled then raise exception 'payments_disabled'; end if;
  if p_payment_type = 'verification' and not settings_row.verification_enabled then
    raise exception 'verification_disabled';
  end if;

  select u.email, coalesce(nullif(btrim(p.full_name), ''), u.email, 'Taskora Member'),
         pp.mobile, coalesce(p.is_social_verified, false)
    into customer_email, customer_name, customer_phone, social_verified
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_private_profiles pp on pp.user_id = u.id
  where u.id = p_user_id;

  if not found then raise exception 'user_not_found'; end if;

  if p_payment_type = 'micro_jobs' then
    select m.status into membership_status
    from public.memberships m
    where m.user_id = p_user_id;
    if membership_status = 'active' then raise exception 'already_active'; end if;

    amount_due := settings_row.micro_job_activation_price;
    normalized_item_id := null;
    item_name := 'Micro Jobs Activation';
    item_description := 'One-time Taskora Micro Jobs activation';

  elsif p_payment_type = 'verification' then
    if social_verified then raise exception 'already_verified'; end if;

    amount_due := settings_row.verification_price;
    normalized_item_id := null;
    item_name := 'Blue Verification Badge';
    item_description := 'Taskora Social profile verification';

  else
    begin
      normalized_item_id := nullif(btrim(p_item_id), '')::uuid::text;
    exception when invalid_text_representation then
      raise exception 'invalid_reselling_order';
    end;

    select * into order_row
    from public.reselling_orders
    where id = normalized_item_id::uuid and user_id = p_user_id;

    if not found then raise exception 'reselling_order_not_found'; end if;
    if order_row.payment_status = 'paid' then raise exception 'order_already_paid'; end if;
    if order_row.status = 'cancelled' then raise exception 'order_cancelled'; end if;

    amount_due := order_row.total;
    item_name := 'Reselling Order ' || order_row.order_code;
    item_description := 'Payment for Taskora Store order ' || order_row.order_code;
    customer_name := coalesce(nullif(btrim(order_row.contact_name), ''), customer_name);
    customer_phone := coalesce(nullif(btrim(order_row.contact_mobile), ''), customer_phone);
  end if;

  if amount_due is null or amount_due <= 0 then
    raise exception 'invalid_admin_price';
  end if;

  select * into payment_row
  from public.payments p
  where p.user_id = p_user_id
    and p.payment_type = p_payment_type
    and p.item_id is not distinct from normalized_item_id
    and p.status in ('pending', 'processing')
  order by p.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'state', case when payment_row.provider_checkout_url is null then 'initializing' else 'reused' end,
      'paymentId', payment_row.id,
      'invoiceId', payment_row.invoice_id,
      'checkoutUrl', payment_row.provider_checkout_url
    );
  end if;

  invoice_number := 'TASK-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.taskora_invoice_sequence')::text, 6, '0');

  insert into public.payments (
    user_id, invoice_id, amount, currency, status, payment_type, item_id,
    item_name, customer_name, customer_email, customer_phone, metadata
  ) values (
    p_user_id, invoice_number, amount_due, settings_row.currency, 'pending',
    p_payment_type, normalized_item_id, item_name, customer_name, customer_email,
    customer_phone,
    case when p_payment_type = 'reselling'
      then jsonb_build_object('reselling_order_id', normalized_item_id)
      else '{}'::jsonb end
  ) returning * into payment_row;

  insert into public.invoices (
    invoice_number, user_id, payment_id, customer_name, customer_email,
    customer_phone, item_name, item_description, subtotal, discount, total,
    currency, status
  ) values (
    invoice_number, p_user_id, payment_row.id, customer_name, customer_email,
    customer_phone, item_name, item_description, amount_due, 0, amount_due,
    settings_row.currency, 'pending'
  );

  return jsonb_build_object(
    'state', 'created',
    'paymentId', payment_row.id,
    'invoiceId', invoice_number,
    'amount', amount_due,
    'currency', settings_row.currency,
    'itemName', item_name,
    'customerName', customer_name,
    'customerEmail', customer_email,
    'customerPhone', customer_phone
  );

exception when unique_violation then
  select * into payment_row
  from public.payments p
  where p.user_id = p_user_id
    and p.payment_type = p_payment_type
    and p.item_id is not distinct from normalized_item_id
    and p.status in ('pending', 'processing')
  order by p.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'state', case when payment_row.provider_checkout_url is null then 'initializing' else 'reused' end,
      'paymentId', payment_row.id,
      'invoiceId', payment_row.invoice_id,
      'checkoutUrl', payment_row.provider_checkout_url
    );
  end if;
  raise;
end;
$$;

create or replace function public.set_payment_provider_state(
  p_payment_id uuid,
  p_checkout_url text,
  p_provider_session_id text,
  p_provider_response jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_checkout_url is null or p_checkout_url !~ '^https://' then
    raise exception 'invalid_provider_checkout_url';
  end if;

  update public.payments
  set provider_checkout_url = p_checkout_url,
      provider_session_id = nullif(p_provider_session_id, ''),
      provider_response = coalesce(p_provider_response, '{}'::jsonb),
      updated_at = now()
  where id = p_payment_id and status in ('pending', 'processing');

  if not found then raise exception 'payment_not_pending'; end if;
  return true;
end;
$$;

create or replace function public.record_payment_provider_event(
  p_payment_id uuid,
  p_provider_invoice_id text,
  p_event text,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare payment_row public.payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_event not in ('manual_verification_checked', 'manual_verification_error', 'webhook_received') then
    raise exception 'invalid_payment_event';
  end if;

  update public.payments
  set provider_session_id = coalesce(nullif(p_provider_invoice_id, ''), provider_session_id),
      updated_at = now()
  where id = p_payment_id
  returning * into payment_row;

  if not found then raise exception 'payment_not_found'; end if;

  insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
  values (payment_row.id, payment_row.invoice_id, p_event, coalesce(p_details, '{}'::jsonb));
  return true;
end;
$$;

create or replace function public.get_payment_for_provider(p_invoice_id text)
returns table (
  id uuid,
  invoice_id text,
  amount numeric,
  currency text,
  status text,
  provider_session_id text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return query
  select p.id, p.invoice_id, p.amount, p.currency, p.status, p.provider_session_id
  from public.payments p
  where p.invoice_id = p_invoice_id
  limit 1;
end;
$$;

revoke all on function public.reserve_payment_attempt(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_payment_provider_state(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_payment_provider_event(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_payment_for_provider(text) from public, anon, authenticated;

grant execute on function public.reserve_payment_attempt(uuid, text, text) to service_role;
grant execute on function public.set_payment_provider_state(uuid, text, text, jsonb) to service_role;
grant execute on function public.record_payment_provider_event(uuid, text, text, jsonb) to service_role;
grant execute on function public.get_payment_for_provider(text) to service_role;

commit;

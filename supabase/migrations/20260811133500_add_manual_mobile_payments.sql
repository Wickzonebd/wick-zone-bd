begin;

-- Existing payment notification functions already use the payment category.
-- Keep the notification constraint aligned so payment submission/review does
-- not roll back after the financial records have been validated.
alter table public.notifications
  drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check check (
    category in ('system','general','wallet','job','order','social','security','promotion','payment')
  );

alter table public.payment_settings
  add column if not exists manual_payment_enabled boolean not null default true,
  add column if not exists bkash_enabled boolean not null default false,
  add column if not exists bkash_number text,
  add column if not exists bkash_account_type text not null default 'Personal',
  add column if not exists nagad_enabled boolean not null default false,
  add column if not exists nagad_number text,
  add column if not exists nagad_account_type text not null default 'Personal',
  add column if not exists rocket_enabled boolean not null default false,
  add column if not exists rocket_number text,
  add column if not exists rocket_account_type text not null default 'Personal';

alter table public.payment_settings
  drop constraint if exists payment_settings_bkash_account_type_check,
  drop constraint if exists payment_settings_nagad_account_type_check,
  drop constraint if exists payment_settings_rocket_account_type_check;

alter table public.payment_settings
  add constraint payment_settings_bkash_account_type_check
    check (bkash_account_type in ('Personal', 'Merchant', 'Agent')),
  add constraint payment_settings_nagad_account_type_check
    check (nagad_account_type in ('Personal', 'Merchant', 'Agent')),
  add constraint payment_settings_rocket_account_type_check
    check (rocket_account_type in ('Personal', 'Merchant', 'Agent'));

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
  methods jsonb := '[]'::jsonb;
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

  if s.manual_payment_enabled then
    if s.bkash_enabled and nullif(btrim(s.bkash_number), '') is not null then
      methods := methods || jsonb_build_array(jsonb_build_object(
        'id', 'bkash', 'label', 'bKash', 'number', btrim(s.bkash_number),
        'accountType', s.bkash_account_type
      ));
    end if;
    if s.nagad_enabled and nullif(btrim(s.nagad_number), '') is not null then
      methods := methods || jsonb_build_array(jsonb_build_object(
        'id', 'nagad', 'label', 'Nagad', 'number', btrim(s.nagad_number),
        'accountType', s.nagad_account_type
      ));
    end if;
    if s.rocket_enabled and nullif(btrim(s.rocket_number), '') is not null then
      methods := methods || jsonb_build_array(jsonb_build_object(
        'id', 'rocket', 'label', 'Rocket', 'number', btrim(s.rocket_number),
        'accountType', s.rocket_account_type
      ));
    end if;
  end if;

  return jsonb_build_object(
    'enabled', s.payment_enabled,
    'providerName', s.provider_name,
    'currency', s.currency,
    'merchantName', s.merchant_name,
    'merchantLogo', s.merchant_logo,
    'supportPhone', s.support_phone,
    'supportEmail', s.support_email,
    'termsText', s.terms_text,
    'price', price,
    'manualPaymentEnabled', s.manual_payment_enabled,
    'manualMethods', methods
  );
end;
$$;

revoke all on function public.get_payment_checkout_config(text) from public, anon;
grant execute on function public.get_payment_checkout_config(text) to authenticated;

create or replace function private.submit_manual_payment_impl(
  p_payment_type text,
  p_item_id text,
  p_method text,
  p_sender_mobile text,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  requester uuid := auth.uid();
  settings_row public.payment_settings%rowtype;
  payment_row public.payments%rowtype;
  order_row public.reselling_orders%rowtype;
  customer_email text;
  customer_name text;
  customer_phone text;
  sender_mobile text;
  transaction_ref text;
  receiver_number text;
  amount_due numeric(12,2);
  normalized_item_id text;
  item_name text;
  item_description text;
  invoice_number text;
  membership_status text;
  social_verified boolean := false;
begin
  if requester is null then raise exception 'authentication_required'; end if;
  if p_payment_type not in ('micro_jobs', 'verification', 'reselling') then
    raise exception 'invalid_payment_request';
  end if;
  if p_method not in ('bkash', 'nagad', 'rocket') then
    raise exception 'invalid_manual_payment_method';
  end if;

  sender_mobile := regexp_replace(coalesce(p_sender_mobile, ''), '[^0-9]', '', 'g');
  if sender_mobile !~ '^01[3-9][0-9]{8}$' then raise exception 'invalid_sender_mobile'; end if;

  transaction_ref := upper(btrim(coalesce(p_transaction_id, '')));
  if transaction_ref !~ '^[A-Z0-9]{6,32}$' then raise exception 'invalid_transaction_id'; end if;

  select * into settings_row from public.payment_settings where id = true;
  if not found then raise exception 'payment_settings_unavailable'; end if;
  if not settings_row.payment_enabled then raise exception 'payments_disabled'; end if;
  if not settings_row.manual_payment_enabled then raise exception 'manual_payments_disabled'; end if;

  receiver_number := case p_method
    when 'bkash' then case when settings_row.bkash_enabled then nullif(btrim(settings_row.bkash_number), '') end
    when 'nagad' then case when settings_row.nagad_enabled then nullif(btrim(settings_row.nagad_number), '') end
    when 'rocket' then case when settings_row.rocket_enabled then nullif(btrim(settings_row.rocket_number), '') end
  end;
  if receiver_number is null then raise exception 'manual_payment_method_unavailable'; end if;

  if exists (select 1 from public.payments where transaction_id = transaction_ref) then
    raise exception 'duplicate_transaction';
  end if;

  select u.email,
         coalesce(nullif(btrim(p.full_name), ''), u.email, 'Taskora Member'),
         pp.mobile,
         coalesce(p.is_social_verified, false)
    into customer_email, customer_name, customer_phone, social_verified
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_private_profiles pp on pp.user_id = u.id
  where u.id = requester;
  if not found then raise exception 'user_not_found'; end if;

  if p_payment_type = 'micro_jobs' then
    select m.status into membership_status from public.memberships m where m.user_id = requester;
    if membership_status = 'active' then raise exception 'already_active'; end if;
    amount_due := settings_row.micro_job_activation_price;
    normalized_item_id := null;
    item_name := 'Micro Jobs Activation';
    item_description := 'One-time Taskora Micro Jobs activation';
  elsif p_payment_type = 'verification' then
    if not settings_row.verification_enabled then raise exception 'verification_disabled'; end if;
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
    where id = normalized_item_id::uuid and user_id = requester
    for update;
    if not found then raise exception 'reselling_order_not_found'; end if;
    if order_row.payment_status = 'paid' then raise exception 'order_already_paid'; end if;
    if order_row.status = 'cancelled' then raise exception 'order_cancelled'; end if;
    amount_due := order_row.total;
    item_name := 'Reselling Order ' || order_row.order_code;
    item_description := 'Payment for Taskora Store order ' || order_row.order_code;
    customer_name := coalesce(nullif(btrim(order_row.contact_name), ''), customer_name);
    customer_phone := coalesce(nullif(btrim(order_row.contact_mobile), ''), customer_phone);
  end if;

  if amount_due is null or amount_due <= 0 then raise exception 'invalid_admin_price'; end if;

  select * into payment_row
  from public.payments p
  where p.user_id = requester
    and p.payment_type = p_payment_type
    and p.item_id is not distinct from normalized_item_id
    and p.status in ('pending', 'processing')
  order by p.created_at desc
  limit 1
  for update;

  if found and payment_row.transaction_id is not null then
    raise exception 'manual_payment_already_submitted';
  end if;

  if not found then
    invoice_number := 'TASK-' || to_char(current_date, 'YYYY') || '-' ||
      lpad(nextval('public.taskora_invoice_sequence')::text, 6, '0');

    insert into public.payments (
      user_id, invoice_id, amount, currency, status, payment_type, item_id,
      item_name, customer_name, customer_email, customer_phone, metadata
    ) values (
      requester, invoice_number, amount_due, settings_row.currency, 'pending',
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
      invoice_number, requester, payment_row.id, customer_name, customer_email,
      customer_phone, item_name, item_description, amount_due, 0, amount_due,
      settings_row.currency, 'pending'
    );
  end if;

  update public.payments
  set status = 'processing',
      transaction_id = transaction_ref,
      payment_method = 'manual_' || p_method,
      provider_checkout_url = null,
      provider_response = jsonb_build_object(
        'source', 'customer_manual_submission',
        'method', p_method,
        'sender_mobile', sender_mobile,
        'receiver_number', receiver_number,
        'submitted_at', now()
      ),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'manual_sender_mobile', sender_mobile,
        'manual_receiver_number', receiver_number
      ),
      failed_at = null,
      updated_at = now()
  where id = payment_row.id
  returning * into payment_row;

  update public.invoices
  set status = 'pending', transaction_id = transaction_ref,
      payment_method = payment_row.payment_method
  where payment_id = payment_row.id;

  insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
  values (payment_row.id, payment_row.invoice_id, 'manual_payment_submitted', jsonb_build_object(
    'method', p_method, 'sender_mobile', sender_mobile, 'transaction_id', transaction_ref
  ));

  insert into public.notifications(
    user_id, type, title, body, destination_url, category, priority, sender_label
  )
  select ur.user_id, 'admin_manual_payment_review',
    'Manual payment review · ' || payment_row.invoice_id,
    coalesce(payment_row.customer_name, payment_row.customer_email, 'A Taskora member') ||
      ' submitted ' || payment_row.amount::text || ' ' || payment_row.currency ||
      ' via ' || upper(p_method) || '. TxID: ' || transaction_ref,
    '/admin/payments/' || payment_row.id::text,
    'payment', 'important', 'Taskora Payments'
  from public.user_roles ur where ur.role = 'admin';

  if p_payment_type = 'reselling' then
    update public.reselling_orders set payment_status = 'pending', updated_at = now()
    where id = normalized_item_id::uuid and user_id = requester;
  end if;

  return jsonb_build_object(
    'status', 'under_review', 'paymentId', payment_row.id,
    'invoiceId', payment_row.invoice_id, 'amount', payment_row.amount,
    'currency', payment_row.currency
  );
end;
$$;

create or replace function public.submit_manual_payment(
  p_payment_type text,
  p_item_id text,
  p_method text,
  p_sender_mobile text,
  p_transaction_id text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.submit_manual_payment_impl(
    p_payment_type, p_item_id, p_method, p_sender_mobile, p_transaction_id
  );
$$;

revoke all on function private.submit_manual_payment_impl(text,text,text,text,text) from public, anon;
grant execute on function private.submit_manual_payment_impl(text,text,text,text,text) to authenticated;
revoke all on function public.submit_manual_payment(text,text,text,text,text) from public, anon;
grant execute on function public.submit_manual_payment(text,text,text,text,text) to authenticated;

create or replace function private.review_manual_payment_impl(
  p_payment_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  reviewer uuid := auth.uid();
  pay public.payments%rowtype;
  reviewed_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if reviewer is null or not exists (
    select 1 from public.user_roles where user_id = reviewer and role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if pay.payment_method not in ('manual_bkash', 'manual_nagad', 'manual_rocket') then
    raise exception 'not_manual_payment';
  end if;
  if pay.status <> 'processing' then raise exception 'payment_not_awaiting_review'; end if;

  if p_approve then
    select * into pay from public.finalize_verified_payment(
      pay.id,
      pay.transaction_id,
      null,
      pay.payment_method,
      coalesce(pay.provider_response, '{}'::jsonb) || jsonb_build_object(
        'manual_review', 'approved', 'reviewed_by', reviewer,
        'reviewed_at', now(), 'note', reviewed_note
      )
    );
  else
    update public.payments
    set status = 'failed', failed_at = now(), updated_at = now(),
        provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object(
          'manual_review', 'rejected', 'reviewed_by', reviewer,
          'reviewed_at', now(), 'note', reviewed_note
        )
    where id = pay.id returning * into pay;

    update public.invoices set status = 'failed' where payment_id = pay.id;

    insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
    values (pay.id, pay.invoice_id, 'manual_payment_rejected', jsonb_build_object(
      'reviewed_by', reviewer, 'note', reviewed_note
    ));

    insert into public.notifications(
      user_id, type, title, body, destination_url, category, priority, sender_label
    ) values (
      pay.user_id, 'manual_payment_rejected', 'Payment verification failed',
      'আপনার জমা দেওয়া Transaction ID যাচাই করা যায়নি। তথ্য ঠিক করে আবার পেমেন্ট জমা দিন।' ||
        case when reviewed_note is null then '' else ' কারণ: ' || reviewed_note end,
      case
        when pay.payment_type = 'reselling' and pay.item_id is not null
          then '/payment/checkout?type=reselling&itemId=' || pay.item_id
        else '/payment/checkout?type=' || pay.payment_type
      end,
      'payment', 'important', 'Taskora Payments'
    );
  end if;

  insert into public.payment_audit_logs(payment_id, invoice_id, event, details)
  values (pay.id, pay.invoice_id, 'manual_payment_reviewed', jsonb_build_object(
    'decision', case when p_approve then 'approved' else 'rejected' end,
    'reviewed_by', reviewer, 'note', reviewed_note
  ));

  return jsonb_build_object('paymentId', pay.id, 'invoiceId', pay.invoice_id, 'status', pay.status);
end;
$$;

create or replace function public.review_manual_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.review_manual_payment_impl(p_payment_id, p_approve, p_note);
$$;

revoke all on function private.review_manual_payment_impl(uuid,boolean,text) from public, anon;
grant execute on function private.review_manual_payment_impl(uuid,boolean,text) to authenticated;
revoke all on function public.review_manual_payment(uuid,boolean,text) from public, anon;
grant execute on function public.review_manual_payment(uuid,boolean,text) to authenticated;

commit;

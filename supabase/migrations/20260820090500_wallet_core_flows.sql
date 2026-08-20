create or replace function public.request_withdrawal(p_amount numeric, p_payment_method text, p_destination text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','pg_temp'
as $$
declare
  min_amount numeric;
  methods jsonb;
  balance numeric;
  request_id uuid;
  charge numeric(12,2);
  net_amount numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce((value->>'withdrawalMinimum')::numeric,0),coalesce(value->'payoutMethods','[]'::jsonb)
    into min_amount,methods from public.site_settings where key='general';
  if p_amount < min_amount or p_amount <= 0 then raise exception 'Amount is below the withdrawal minimum'; end if;
  if not methods ? p_payment_method then raise exception 'Payment method is not available'; end if;
  if char_length(trim(coalesce(p_destination,'')))<3 then raise exception 'Destination is required'; end if;

  select coalesce(sum(amount),0) into balance
  from public.wallet_transactions where user_id=auth.uid();
  if p_amount > balance then raise exception 'Insufficient available balance'; end if;

  charge := round(p_amount * 0.10, 2);
  net_amount := p_amount - charge;
  if net_amount <= 0 then raise exception 'Withdrawal amount is too low'; end if;

  request_id := gen_random_uuid();
  insert into public.withdrawal_requests(id,user_id,amount,gross_amount,charge_amount,payment_method,destination)
  values(request_id,auth.uid(),net_amount,p_amount,charge,p_payment_method,trim(p_destination));

  insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
  values(auth.uid(),-p_amount,'withdrawal_hold','withdrawal',request_id,
    'Withdrawal request: gross '||p_amount::text||', charge '||charge::text||', net '||net_amount::text,
    'withdrawal_hold:'||request_id::text,auth.uid());
  return request_id;
end;
$$;

create or replace function public.admin_update_withdrawal(p_request_id uuid, p_status text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','pg_temp'
as $$
declare request public.withdrawal_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('approved','rejected','paid') then raise exception 'Invalid withdrawal status'; end if;
  select * into request from public.withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if request.status in ('rejected','paid') then raise exception 'Withdrawal is already final'; end if;
  if p_status='approved' and request.status<>'pending' then raise exception 'Only pending withdrawals can be approved'; end if;
  if p_status='paid' and request.status<>'approved' then raise exception 'Only approved withdrawals can be marked paid'; end if;
  if p_status='rejected' then
    insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
    values(request.user_id,request.gross_amount,'withdrawal_reversal','withdrawal',request.id,'Rejected withdrawal reversal','withdrawal_reversal:'||request.id::text,auth.uid())
    on conflict(idempotency_key) do nothing;
  end if;
  update public.withdrawal_requests
  set status=p_status::public.withdrawal_status,admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),
      paid_at=case when p_status='paid' then now() else paid_at end
  where id=p_request_id;
  insert into public.notifications(user_id,type,title,body,destination_url)
  values(request.user_id,'withdrawal_update','Withdrawal update','Your withdrawal status is now '||p_status||'.','/wallet');
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'withdrawal_'||p_status,'withdrawal_request',request.id,p_note,
    jsonb_build_object('gross_amount',request.gross_amount,'charge_amount',request.charge_amount,'net_amount',request.amount));
  return request.id;
end;
$$;

create or replace function public.reserve_deposit_attempt(p_user_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','pg_temp'
as $$
declare
  s public.payment_settings%rowtype;
  pay public.payments%rowtype;
  customer_email text;
  customer_name text;
  customer_phone text;
  invoice_number text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_user_id is null then raise exception 'user_not_found'; end if;
  if p_amount is null or p_amount < 10 or p_amount > 100000 then raise exception 'invalid_deposit_amount'; end if;
  select * into s from public.payment_settings where id=true;
  if not found or not s.payment_enabled then raise exception 'payments_disabled'; end if;
  select u.email, coalesce(nullif(btrim(p.full_name),''),u.email,'Taskora Member'), pp.mobile
    into customer_email,customer_name,customer_phone
  from auth.users u left join public.profiles p on p.id=u.id left join public.user_private_profiles pp on pp.user_id=u.id
  where u.id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;

  invoice_number := 'DEP-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.payments(user_id,invoice_id,amount,currency,status,payment_type,item_name,customer_name,customer_email,customer_phone,metadata)
  values(p_user_id,invoice_number,round(p_amount,2),s.currency,'pending','deposit','Wallet Deposit',customer_name,customer_email,customer_phone,'{}'::jsonb)
  returning * into pay;
  insert into public.invoices(invoice_number,user_id,payment_id,customer_name,customer_email,customer_phone,item_name,item_description,subtotal,discount,total,currency,status)
  values(invoice_number,p_user_id,pay.id,customer_name,customer_email,customer_phone,'Wallet Deposit','Add money to main wallet',pay.amount,0,pay.amount,s.currency,'pending');
  return jsonb_build_object('state','created','paymentId',pay.id,'invoiceId',invoice_number,'amount',pay.amount,'currency',s.currency,
    'itemName','Wallet Deposit','customerName',customer_name,'customerEmail',customer_email,'customerPhone',customer_phone);
end;
$$;

create or replace function public.purchase_with_wallet(p_payment_type text, p_item_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','pg_temp'
as $$
declare
  uid uuid := auth.uid();
  s public.payment_settings%rowtype;
  order_row public.reselling_orders%rowtype;
  amount_due numeric(12,2);
  wallet_balance numeric(12,2);
  item_name text;
  item_description text;
  normalized_item_id text;
  customer_email text;
  customer_name text;
  customer_phone text;
  invoice_number text;
  pay public.payments%rowtype;
  social_verified boolean;
  membership_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_payment_type not in ('micro_jobs','verification','reselling') then raise exception 'invalid_payment_type'; end if;
  select * into s from public.payment_settings where id=true;
  if not found then raise exception 'payment_settings_unavailable'; end if;

  select u.email,coalesce(nullif(btrim(p.full_name),''),u.email,'Taskora Member'),pp.mobile,coalesce(p.is_social_verified,false)
  into customer_email,customer_name,customer_phone,social_verified
  from auth.users u left join public.profiles p on p.id=u.id left join public.user_private_profiles pp on pp.user_id=u.id where u.id=uid;

  if p_payment_type='micro_jobs' then
    select status into membership_status from public.memberships where user_id=uid;
    if membership_status='active' then raise exception 'already_active'; end if;
    amount_due := s.micro_job_activation_price; item_name := 'Micro Jobs Activation'; item_description := 'Paid from main wallet'; normalized_item_id := null;
  elsif p_payment_type='verification' then
    if not s.verification_enabled then raise exception 'verification_disabled'; end if;
    if social_verified then raise exception 'already_verified'; end if;
    amount_due := s.verification_price; item_name := 'Blue Verification Badge'; item_description := 'Paid from main wallet'; normalized_item_id := null;
  else
    begin normalized_item_id := nullif(btrim(p_item_id),'')::uuid::text; exception when invalid_text_representation then raise exception 'invalid_reselling_order'; end;
    select * into order_row from public.reselling_orders where id=normalized_item_id::uuid and user_id=uid for update;
    if not found then raise exception 'reselling_order_not_found'; end if;
    if order_row.payment_status='paid' then raise exception 'order_already_paid'; end if;
    if order_row.status='cancelled' then raise exception 'order_cancelled'; end if;
    amount_due := order_row.total; item_name := 'Reselling Order '||order_row.order_code; item_description := 'Paid from main wallet';
    customer_name := coalesce(nullif(btrim(order_row.contact_name),''),customer_name);
    customer_phone := coalesce(nullif(btrim(order_row.contact_mobile),''),customer_phone);
  end if;

  if amount_due is null or amount_due <= 0 then raise exception 'invalid_admin_price'; end if;
  select coalesce(sum(amount),0) into wallet_balance from public.wallet_transactions where user_id=uid;
  if wallet_balance < amount_due then raise exception 'insufficient_wallet_balance'; end if;

  invoice_number := 'WAL-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.payments(user_id,invoice_id,amount,currency,payment_method,status,payment_type,item_id,item_name,customer_name,customer_email,customer_phone,metadata,transaction_id,paid_at)
  values(uid,invoice_number,amount_due,s.currency,'wallet','paid',p_payment_type,normalized_item_id,item_name,customer_name,customer_email,customer_phone,
    jsonb_build_object('source','wallet'), 'WALLET-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)), now()) returning * into pay;

  insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
  values(uid,-amount_due,'wallet_purchase','payment',pay.id,item_name,'wallet_purchase:'||pay.id::text,uid);

  insert into public.invoices(invoice_number,user_id,payment_id,customer_name,customer_email,customer_phone,item_name,item_description,subtotal,discount,total,currency,status,transaction_id,payment_method,paid_at)
  values(invoice_number,uid,pay.id,customer_name,customer_email,customer_phone,item_name,item_description,amount_due,0,amount_due,s.currency,'paid',pay.transaction_id,'wallet',pay.paid_at);

  if p_payment_type='micro_jobs' then
    insert into public.memberships(user_id,status,activated_at,deactivated_at,activation_source)
    values(uid,'active',now(),null,'wallet') on conflict(user_id) do update set status='active',activated_at=now(),deactivated_at=null,activation_source='wallet',updated_at=now();
  elsif p_payment_type='verification' then
    perform pg_catalog.set_config('taskora.social_verification_write','1',true);
    update public.profiles set is_social_verified=true,social_verified_at=coalesce(social_verified_at,now()),social_verification_source='wallet' where id=uid;
    perform pg_catalog.set_config('taskora.social_verification_write','0',true);
  elsif p_payment_type='reselling' then
    update public.reselling_orders set payment_status='paid',payment_method='wallet',status=case when status='cancelled' then status else 'processing' end,updated_at=now() where id=normalized_item_id::uuid and user_id=uid;
  end if;

  insert into public.payment_audit_logs(payment_id,invoice_id,event,details)
  values(pay.id,pay.invoice_id,'wallet_payment_completed',jsonb_build_object('payment_type',p_payment_type,'amount',amount_due));
  return jsonb_build_object('success',true,'paymentId',pay.id,'invoiceId',pay.invoice_id,'amount',amount_due,'currency',s.currency,'balance',wallet_balance-amount_due);
end;
$$;

grant execute on function public.purchase_with_wallet(text,text) to authenticated;
revoke all on function public.reserve_deposit_attempt(uuid,numeric) from public, anon, authenticated;
grant execute on function public.reserve_deposit_attempt(uuid,numeric) to service_role;

create or replace function public.finalize_verified_payment(p_payment_id uuid, p_transaction_id text, p_provider_transaction_id text, p_payment_method text, p_provider_response jsonb default '{}'::jsonb)
returns public.payments
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','pg_temp'
as $$
declare pay public.payments%rowtype; order_id uuid;
begin
  select * into pay from public.payments where id=p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if pay.status='paid' then return pay; end if;
  if pay.status in ('cancelled','refunded') then raise exception 'payment_not_payable'; end if;
  if p_transaction_id is null or btrim(p_transaction_id)='' then raise exception 'missing_transaction_id'; end if;
  if exists(select 1 from public.payments where transaction_id=p_transaction_id and id<>pay.id) then raise exception 'duplicate_transaction'; end if;
  update public.payments set status='paid',transaction_id=p_transaction_id,provider_transaction_id=coalesce(nullif(p_provider_transaction_id,''),provider_transaction_id),
    payment_method=coalesce(nullif(p_payment_method,''),payment_method),provider_response=coalesce(p_provider_response,'{}'::jsonb),paid_at=coalesce(paid_at,now()),updated_at=now()
  where id=pay.id returning * into pay;
  update public.invoices set status='paid',transaction_id=pay.transaction_id,payment_method=pay.payment_method,paid_at=pay.paid_at where payment_id=pay.id;

  if pay.payment_type='deposit' then
    insert into public.wallet_transactions(user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by)
    values(pay.user_id,pay.amount,'deposit','payment',pay.id,'Wallet deposit','deposit:'||pay.id::text,pay.user_id)
    on conflict(idempotency_key) do nothing;
  elsif pay.payment_type='micro_jobs' then
    insert into public.memberships(user_id,status,activated_at,deactivated_at,activation_source)
    values(pay.user_id,'active',pay.paid_at,null,'payment') on conflict(user_id) do update set status='active',activated_at=excluded.activated_at,deactivated_at=null,activation_source='payment',updated_at=now();
  elsif pay.payment_type='verification' then
    perform pg_catalog.set_config('taskora.social_verification_write','1',true);
    update public.profiles set is_social_verified=true,social_verified_at=coalesce(social_verified_at,pay.paid_at),social_verification_source='payment' where id=pay.user_id;
    perform pg_catalog.set_config('taskora.social_verification_write','0',true);
  elsif pay.payment_type='reselling' and pay.item_id is not null then
    begin order_id:=pay.item_id::uuid; update public.reselling_orders set payment_status='paid',payment_method=coalesce(nullif(pay.payment_method,''),payment_method),status=case when status='cancelled' then status else 'processing' end,updated_at=now() where id=order_id and user_id=pay.user_id; exception when invalid_text_representation then raise exception 'invalid_reselling_order_id'; end;
  end if;

  insert into public.payment_audit_logs(payment_id,invoice_id,event,details) values(pay.id,pay.invoice_id,'payment_verified',jsonb_build_object('transaction_id',pay.transaction_id,'payment_type',pay.payment_type));
  insert into public.notifications(user_id,type,title,body,destination_url,category,priority,sender_label)
  values(pay.user_id,'payment_success','Payment successful',case when pay.payment_type='deposit' then 'আপনার ওয়ালেটে '||pay.amount::text||' '||pay.currency||' যোগ হয়েছে।' else 'আপনার পেমেন্ট সফলভাবে সম্পন্ন হয়েছে।' end,
    case when pay.payment_type='deposit' then '/wallet' when pay.payment_type='micro_jobs' then '/jobs' when pay.payment_type='verification' then '/profile' when pay.payment_type='reselling' then '/reselling?view=orders' else '/profile/payments' end,
    'payment','important','Taskora Payments');
  return pay;
end;
$$;

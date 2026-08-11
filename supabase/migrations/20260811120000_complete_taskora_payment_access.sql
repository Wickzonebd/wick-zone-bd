-- Complete Taskora payment access and reselling checkout handoff.
-- Keeps prices server-authoritative and routes newly created store orders to the
-- secure payment checkout without exposing any payment secret to the browser.

grant update on table public.payment_settings to authenticated;
grant usage, select, update on sequence public.taskora_invoice_sequence to service_role;

create or replace function public.place_reselling_order(
  p_contact_name text,
  p_contact_mobile text,
  p_delivery_address text,
  p_customer_note text default null,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_uuid uuid;
  order_ref text;
  subtotal_value numeric(12,2);
  discount_value numeric(12,2) := 0;
  coupon_row public.reselling_coupons%rowtype;
  payment_url text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_contact_name,''))) < 2 then raise exception 'Contact name is required'; end if;
  if char_length(trim(coalesce(p_contact_mobile,''))) < 7 then raise exception 'Contact mobile is required'; end if;
  if char_length(trim(coalesce(p_delivery_address,''))) < 5 then raise exception 'Delivery address is required'; end if;

  perform 1
  from public.reselling_products p
  join public.reselling_cart_items c on c.product_id = p.id
  where c.user_id = auth.uid()
  for update of p;
  if not found then raise exception 'Your cart is empty'; end if;

  if exists(
    select 1
    from public.reselling_cart_items c
    join public.reselling_products p on p.id = c.product_id
    where c.user_id = auth.uid()
      and (not p.is_active or (p.stock_count is not null and p.stock_count < c.quantity))
  ) then
    raise exception 'A cart item is unavailable or out of stock';
  end if;

  select sum(p.price * c.quantity)
  into subtotal_value
  from public.reselling_cart_items c
  join public.reselling_products p on p.id = c.product_id
  where c.user_id = auth.uid();
  if subtotal_value is null or subtotal_value <= 0 then raise exception 'Your cart is empty'; end if;

  if nullif(upper(trim(coalesce(p_coupon_code,''))),'') is not null then
    select * into coupon_row
    from public.reselling_coupons
    where code = upper(trim(p_coupon_code))
      and is_active
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at > now())
      and (usage_limit is null or used_count < usage_limit)
    for update;
    if not found then raise exception 'Coupon is invalid or expired'; end if;
    if subtotal_value < coupon_row.minimum_order then raise exception 'Order does not meet the coupon minimum'; end if;

    discount_value := case
      when coupon_row.discount_type = 'percent' then subtotal_value * coupon_row.discount_value / 100
      else coupon_row.discount_value
    end;
    if coupon_row.maximum_discount is not null then
      discount_value := least(discount_value, coupon_row.maximum_discount);
    end if;
    discount_value := least(round(discount_value,2), subtotal_value);
  end if;

  insert into public.reselling_orders(
    user_id, subtotal, discount, total, coupon_id, coupon_code,
    contact_name, contact_mobile, delivery_address, customer_note
  ) values (
    auth.uid(), subtotal_value, discount_value, subtotal_value - discount_value,
    coupon_row.id, coupon_row.code, trim(p_contact_name), trim(p_contact_mobile),
    trim(p_delivery_address), nullif(trim(coalesce(p_customer_note,'')),'')
  )
  returning id, order_code into order_uuid, order_ref;

  insert into public.reselling_order_items(
    order_id, product_id, product_name, image_url, quantity, unit_price, line_total
  )
  select order_uuid, p.id, p.name_en, p.image_url, c.quantity, p.price, p.price * c.quantity
  from public.reselling_cart_items c
  join public.reselling_products p on p.id = c.product_id
  where c.user_id = auth.uid();

  update public.reselling_products p
  set stock_count = p.stock_count - c.quantity
  from public.reselling_cart_items c
  where c.user_id = auth.uid()
    and c.product_id = p.id
    and p.stock_count is not null;

  delete from public.reselling_cart_items where user_id = auth.uid();
  if coupon_row.id is not null then
    update public.reselling_coupons set used_count = used_count + 1 where id = coupon_row.id;
  end if;

  payment_url := '/payment/checkout?type=reselling&itemId=' || order_uuid::text;

  insert into public.notifications(
    user_id, type, title, body, destination_url, category, priority, sender_label
  ) values (
    auth.uid(),
    'order_payment_required',
    'Order ' || order_ref || ' · Payment required',
    'Your order has been created. Complete the secure online payment to move it into processing.',
    payment_url,
    'order',
    'important',
    'Taskora Store'
  );

  return jsonb_build_object(
    'id', order_uuid,
    'order_code', order_ref,
    'subtotal', subtotal_value,
    'discount', discount_value,
    'total', subtotal_value - discount_value,
    'payment_url', payment_url
  );
end;
$$;

grant execute on function public.place_reselling_order(text,text,text,text,text) to authenticated;

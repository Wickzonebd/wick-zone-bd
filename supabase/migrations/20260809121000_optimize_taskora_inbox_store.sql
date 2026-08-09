-- Query-planner hardening for the Taskora Inbox and store release.

create index if not exists admin_broadcasts_recipient_user_idx
  on public.admin_broadcasts(recipient_user_id)
  where recipient_user_id is not null;

create index if not exists admin_broadcasts_sent_by_idx
  on public.admin_broadcasts(sent_by);

create index if not exists reselling_cart_product_idx
  on public.reselling_cart_items(product_id);

create index if not exists reselling_coupons_created_by_idx
  on public.reselling_coupons(created_by)
  where created_by is not null;

create index if not exists reselling_order_items_product_idx
  on public.reselling_order_items(product_id)
  where product_id is not null;

create index if not exists reselling_orders_coupon_idx
  on public.reselling_orders(coupon_id)
  where coupon_id is not null;

create index if not exists reselling_orders_reviewed_by_idx
  on public.reselling_orders(reviewed_by)
  where reviewed_by is not null;

create index if not exists reselling_reviews_user_idx
  on public.reselling_reviews(user_id);

drop policy if exists notifications_read on public.notifications;
create policy notifications_read
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

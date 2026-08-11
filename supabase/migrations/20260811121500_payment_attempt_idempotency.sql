-- Prevent more than one open checkout attempt for the same user/purchase.
-- NULL item_id is normalized so Micro Jobs and Verification are protected too.

create unique index if not exists payments_one_open_attempt_idx
on public.payments (user_id, payment_type, coalesce(item_id, ''))
where status in ('pending', 'processing');

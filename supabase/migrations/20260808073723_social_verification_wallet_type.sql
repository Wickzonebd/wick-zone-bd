-- Keep the new wallet ledger event separate so the enum value is committed
-- before later migrations reference it.
alter type public.wallet_transaction_type
  add value if not exists 'social_verification';

-- Identify the configured Taskora payment provider without storing any secret in the database.
-- Payment remains disabled until deployment secrets are present and an admin enables it.
update public.payment_settings
set provider_name = 'UddoktaPay',
    updated_at = now()
where id = true
  and (provider_name is null or btrim(provider_name) = '');

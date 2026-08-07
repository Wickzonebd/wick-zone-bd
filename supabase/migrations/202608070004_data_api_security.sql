begin;

-- Supabase no longer grants Data API table privileges automatically for new tables.
-- Keep RLS as the authorization boundary and grant only the SQL privileges the app needs.
grant usage on schema public to anon, authenticated;

grant select on table
  public.profiles,
  public.user_private_profiles,
  public.user_roles,
  public.site_settings,
  public.banners,
  public.announcement_tickers,
  public.service_links,
  public.project_cards,
  public.memberships,
  public.payment_orders,
  public.jobs,
  public.job_submissions,
  public.wallet_transactions,
  public.withdrawal_requests,
  public.posts,
  public.post_media,
  public.post_likes,
  public.comments,
  public.connections,
  public.notifications,
  public.content_reports,
  public.admin_audit_logs
to authenticated;

grant update on table public.profiles to authenticated;

grant insert, update, delete on table
  public.site_settings,
  public.banners,
  public.announcement_tickers,
  public.service_links,
  public.project_cards,
  public.jobs
to authenticated;

grant insert, update, delete on table public.posts to authenticated;
grant insert, delete on table public.post_media to authenticated;
grant insert, delete on table public.post_likes to authenticated;
grant insert, update, delete on table public.comments to authenticated;
grant insert, update on table public.content_reports to authenticated;

-- Sensitive state is changed only by audited RPCs or trusted server-side flows.
revoke insert, update, delete on table
  public.user_private_profiles,
  public.user_roles,
  public.memberships,
  public.payment_orders,
  public.job_submissions,
  public.wallet_transactions,
  public.withdrawal_requests,
  public.connections,
  public.notifications,
  public.admin_audit_logs
from anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- inherited capability, then expose only the application RPC surface explicitly.
revoke execute on all functions in schema public from public, anon;

grant execute on function public.is_safe_http_url(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.guard_profile_sensitive_fields() to authenticated;
grant execute on function public.guard_post_moderation_fields() to authenticated;
grant execute on function public.guard_comment_moderation_fields() to authenticated;

grant execute on function public.list_job_previews() to authenticated;
grant execute on function public.get_job_details(uuid) to authenticated;
grant execute on function public.start_job_submission(uuid) to authenticated;
grant execute on function public.submit_job_proof(uuid,text,text,text[]) to authenticated;
grant execute on function public.get_wallet_summary() to authenticated;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;
grant execute on function public.update_private_phone(text) to authenticated;
grant execute on function public.get_referral_network(integer) to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid,text) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.list_feed(integer,integer) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;

grant execute on function public.admin_approve_job_submission(uuid) to authenticated;
grant execute on function public.admin_review_job_submission(uuid,text,text) to authenticated;
grant execute on function public.admin_update_withdrawal(uuid,text,text) to authenticated;
grant execute on function public.admin_set_membership(uuid,boolean,text) to authenticated;
grant execute on function public.admin_adjust_wallet(uuid,numeric,text) to authenticated;
grant execute on function public.admin_set_user_suspension(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_user_badge(uuid,text,text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;
grant execute on function public.admin_broadcast_notification(text,text,text) to authenticated;

-- Pin helper search paths so object resolution cannot be redirected by callers.
alter function public.is_safe_http_url(text) set search_path = pg_catalog, public;
alter function public.set_updated_at() set search_path = pg_catalog, public;
alter function public.guard_profile_sensitive_fields() set search_path = pg_catalog, public;
alter function public.guard_post_moderation_fields() set search_path = pg_catalog, public;
alter function public.guard_comment_moderation_fields() set search_path = pg_catalog, public;

commit;

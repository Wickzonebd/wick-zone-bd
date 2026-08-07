begin;

-- Image-only posts are valid because media rows are attached after the post row exists.
alter table public.posts drop constraint if exists posts_check;

-- Give PostgREST an explicit public-profile relationship for administrator proof review.
alter table public.job_submissions
  add constraint job_submissions_user_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- These functions are internal implementation details and must not be called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_active_membership(uuid) from public, anon, authenticated;
revoke execute on function public.notify_on_like() from public, anon, authenticated;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;

-- These read functions do not need RLS bypass privileges.
alter function public.get_wallet_summary() security invoker;
alter function public.list_feed(integer, integer) security invoker;

commit;

drop policy if exists "ludo_tournaments_read" on public.ludo_tournaments;
create policy "ludo_tournaments_read" on public.ludo_tournaments
for select to authenticated
using (
  is_active
  or (select public.is_admin())
  or exists (
    select 1 from public.ludo_entries e
    where e.tournament_id = ludo_tournaments.id
      and e.user_id = (select auth.uid())
  )
);
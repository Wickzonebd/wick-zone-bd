create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.ludo_tournaments (
  id uuid primary key default gen_random_uuid(),
  title_en text not null check (char_length(btrim(title_en)) between 1 and 120),
  title_bn text check (title_bn is null or char_length(title_bn) <= 120),
  description_en text check (description_en is null or char_length(description_en) <= 1200),
  description_bn text check (description_bn is null or char_length(description_bn) <= 1200),
  rules_en text not null check (char_length(btrim(rules_en)) between 3 and 5000),
  rules_bn text check (rules_bn is null or char_length(rules_bn) <= 5000),
  max_players integer not null default 2 check (max_players between 2 and 100),
  participant_count integer not null default 0 check (participant_count >= 0 and participant_count <= max_players),
  entry_fee numeric(12,2) not null default 0 check (entry_fee >= 0),
  prize_amount numeric(12,2) not null default 0 check (prize_amount >= 0),
  status text not null default 'draft' check (status in ('draft','open','full','ongoing','completed','cancelled')),
  starts_at timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ludo_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.ludo_tournaments(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_fee_paid numeric(12,2) not null default 0 check (entry_fee_paid >= 0),
  status text not null default 'joined' check (status in ('joined','winner','lost','refunded')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id),
  unique (id, user_id, tournament_id)
);

create table public.ludo_proofs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.ludo_tournaments(id) on delete restrict,
  entry_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ludo_username text not null check (char_length(btrim(ludo_username)) between 2 and 80),
  screenshot_path text not null check (char_length(screenshot_path) between 8 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','resubmit')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1200),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id),
  constraint ludo_proofs_entry_owner_fkey foreign key (entry_id,user_id,tournament_id)
    references public.ludo_entries(id,user_id,tournament_id) on delete cascade
);

create unique index ludo_one_approved_winner_idx on public.ludo_proofs(tournament_id) where status='approved';
create index ludo_entries_user_idx on public.ludo_entries(user_id, joined_at desc);
create index ludo_proofs_user_idx on public.ludo_proofs(user_id, created_at desc);
create index ludo_proofs_tournament_idx on public.ludo_proofs(tournament_id, status);
create index ludo_tournaments_visible_idx on public.ludo_tournaments(is_active, status, sort_order);

alter table public.ludo_tournaments enable row level security;
alter table public.ludo_entries enable row level security;
alter table public.ludo_proofs enable row level security;

create policy "ludo_tournaments_read" on public.ludo_tournaments
for select to authenticated
using (is_active or (select public.is_admin()));

create policy "ludo_tournaments_admin_insert" on public.ludo_tournaments
for insert to authenticated
with check ((select public.is_admin()));

create policy "ludo_tournaments_admin_update" on public.ludo_tournaments
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "ludo_tournaments_admin_delete" on public.ludo_tournaments
for delete to authenticated
using ((select public.is_admin()));

create policy "ludo_entries_read" on public.ludo_entries
for select to authenticated
using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy "ludo_proofs_read" on public.ludo_proofs
for select to authenticated
using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy "ludo_proofs_insert_own" on public.ludo_proofs
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
  and admin_note is null
  and reviewed_by is null
  and reviewed_at is null
  and screenshot_path like ((select auth.uid())::text || '/ludo/%')
  and exists (
    select 1 from public.ludo_entries e
    where e.id = entry_id
      and e.user_id = (select auth.uid())
      and e.tournament_id = tournament_id
      and e.status = 'joined'
  )
);

create policy "ludo_proofs_resubmit_own" on public.ludo_proofs
for update to authenticated
using ((select auth.uid()) = user_id and status = 'resubmit')
with check (
  (select auth.uid()) = user_id
  and status = 'pending'
  and screenshot_path like ((select auth.uid())::text || '/ludo/%')
);

grant select on public.ludo_tournaments to authenticated;
grant insert, update, delete on public.ludo_tournaments to authenticated;
grant select on public.ludo_entries to authenticated;
grant select on public.ludo_proofs to authenticated;
grant insert (tournament_id,entry_id,user_id,ludo_username,screenshot_path) on public.ludo_proofs to authenticated;
grant update (ludo_username,screenshot_path,status) on public.ludo_proofs to authenticated;
grant all on public.ludo_tournaments, public.ludo_entries, public.ludo_proofs to service_role;

create trigger ludo_tournaments_set_updated_at
before update on public.ludo_tournaments
for each row execute function public.set_updated_at();

create trigger ludo_entries_set_updated_at
before update on public.ludo_entries
for each row execute function public.set_updated_at();

create trigger ludo_proofs_set_updated_at
before update on public.ludo_proofs
for each row execute function public.set_updated_at();

create or replace function private.ludo_join_tournament_impl(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  t public.ludo_tournaments%rowtype;
  current_balance numeric;
  entry_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into t from public.ludo_tournaments
  where id = p_tournament_id
  for update;

  if not found or not t.is_active then raise exception 'Tournament is not available'; end if;
  if t.status <> 'open' then raise exception 'This tournament is not open for joining'; end if;
  if t.participant_count >= t.max_players then
    update public.ludo_tournaments set status='full' where id=t.id;
    raise exception 'Tournament is full';
  end if;
  if exists(select 1 from public.ludo_entries where tournament_id=t.id and user_id=auth.uid()) then
    raise exception 'You already joined this tournament';
  end if;

  select coalesce(sum(amount),0) into current_balance
  from public.wallet_transactions
  where user_id=auth.uid();

  if current_balance < t.entry_fee then
    raise exception 'Insufficient balance to join this tournament.';
  end if;

  insert into public.ludo_entries(tournament_id,user_id,entry_fee_paid)
  values(t.id,auth.uid(),t.entry_fee)
  returning id into entry_id;

  if t.entry_fee > 0 then
    insert into public.wallet_transactions(
      user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by
    ) values(
      auth.uid(),-t.entry_fee,'ludo_entry','ludo_tournament',t.id,
      'Ludo tournament entry fee','ludo_entry:'||entry_id::text,auth.uid()
    );
  end if;

  update public.ludo_tournaments
  set participant_count=participant_count+1,
      status=case when participant_count+1 >= max_players then 'full' else status end
  where id=t.id;

  return entry_id;
end;
$function$;

create or replace function public.ludo_join_tournament(p_tournament_id uuid)
returns uuid
language sql
security invoker
set search_path to 'public','private'
as $function$
  select private.ludo_join_tournament_impl(p_tournament_id);
$function$;

create or replace function private.admin_review_ludo_proof_impl(p_proof_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  p public.ludo_proofs%rowtype;
  t public.ludo_tournaments%rowtype;
  clean_action text := lower(trim(coalesce(p_action,'')));
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if clean_action not in ('approve','reject','resubmit') then raise exception 'Invalid review action'; end if;

  select * into p from public.ludo_proofs where id=p_proof_id for update;
  if not found then raise exception 'Proof not found'; end if;
  if p.status <> 'pending' then raise exception 'This proof is not pending review'; end if;

  select * into t from public.ludo_tournaments where id=p.tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;

  if clean_action='approve' then
    if exists(select 1 from public.ludo_proofs where tournament_id=p.tournament_id and status='approved' and id<>p.id) then
      raise exception 'This tournament already has an approved winner';
    end if;

    update public.ludo_proofs set status='approved',admin_note=nullif(trim(coalesce(p_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now() where id=p.id;
    update public.ludo_entries set status='winner' where id=p.entry_id;
    update public.ludo_entries set status='lost' where tournament_id=p.tournament_id and id<>p.entry_id and status='joined';
    update public.ludo_tournaments set status='completed' where id=p.tournament_id;

    if t.prize_amount > 0 then
      insert into public.wallet_transactions(
        user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by
      ) values(
        p.user_id,t.prize_amount,'ludo_prize','ludo_tournament',p.tournament_id,
        'Ludo tournament prize','ludo_prize:'||p.tournament_id::text,auth.uid()
      ) on conflict (idempotency_key) do nothing;
    end if;
  elsif clean_action='reject' then
    update public.ludo_proofs set status='rejected',admin_note=nullif(trim(coalesce(p_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now() where id=p.id;
    update public.ludo_entries set status='lost' where id=p.entry_id;
  else
    update public.ludo_proofs set status='resubmit',admin_note=nullif(trim(coalesce(p_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now() where id=p.id;
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'ludo_proof_'||clean_action,'ludo_proof',p.id,nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('tournament_id',p.tournament_id,'user_id',p.user_id));
end;
$function$;

create or replace function public.admin_review_ludo_proof(p_proof_id uuid, p_action text, p_note text default null)
returns void
language sql
security invoker
set search_path to 'public','private'
as $function$
  select private.admin_review_ludo_proof_impl(p_proof_id,p_action,p_note);
$function$;

create or replace function private.admin_cancel_ludo_tournament_impl(p_tournament_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  t public.ludo_tournaments%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;

  select * into t from public.ludo_tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if t.status in ('completed','cancelled') then raise exception 'Completed or cancelled tournaments cannot be cancelled again'; end if;

  insert into public.wallet_transactions(
    user_id,amount,transaction_type,reference_type,reference_id,description,idempotency_key,created_by
  )
  select e.user_id,e.entry_fee_paid,'ludo_refund','ludo_tournament',t.id,
         'Ludo tournament entry refund','ludo_refund:'||e.id::text,auth.uid()
  from public.ludo_entries e
  where e.tournament_id=t.id and e.status<>'refunded' and e.entry_fee_paid>0
  on conflict (idempotency_key) do nothing;

  update public.ludo_entries set status='refunded' where tournament_id=t.id and status<>'refunded';
  update public.ludo_tournaments set status='cancelled',is_active=false where id=t.id;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,metadata)
  values(auth.uid(),'ludo_tournament_cancel','ludo_tournament',t.id,nullif(trim(coalesce(p_reason,'')),''),jsonb_build_object('refund_entries',t.participant_count));
end;
$function$;

create or replace function public.admin_cancel_ludo_tournament(p_tournament_id uuid, p_reason text default null)
returns void
language sql
security invoker
set search_path to 'public','private'
as $function$
  select private.admin_cancel_ludo_tournament_impl(p_tournament_id,p_reason);
$function$;

revoke all on function private.ludo_join_tournament_impl(uuid) from public, anon;
revoke all on function private.admin_review_ludo_proof_impl(uuid,text,text) from public, anon;
revoke all on function private.admin_cancel_ludo_tournament_impl(uuid,text) from public, anon;
grant execute on function private.ludo_join_tournament_impl(uuid) to authenticated;
grant execute on function private.admin_review_ludo_proof_impl(uuid,text,text) to authenticated;
grant execute on function private.admin_cancel_ludo_tournament_impl(uuid,text) to authenticated;

revoke all on function public.ludo_join_tournament(uuid) from public, anon;
revoke all on function public.admin_review_ludo_proof(uuid,text,text) from public, anon;
revoke all on function public.admin_cancel_ludo_tournament(uuid,text) from public, anon;
grant execute on function public.ludo_join_tournament(uuid) to authenticated;
grant execute on function public.admin_review_ludo_proof(uuid,text,text) to authenticated;
grant execute on function public.admin_cancel_ludo_tournament(uuid,text) to authenticated;
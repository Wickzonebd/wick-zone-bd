create index ludo_proofs_entry_owner_idx on public.ludo_proofs(entry_id,user_id,tournament_id);
create index ludo_proofs_reviewed_by_idx on public.ludo_proofs(reviewed_by);
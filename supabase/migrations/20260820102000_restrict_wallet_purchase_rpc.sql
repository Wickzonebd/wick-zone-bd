revoke all on function public.purchase_with_wallet(text,text) from public, anon;
grant execute on function public.purchase_with_wallet(text,text) to authenticated;

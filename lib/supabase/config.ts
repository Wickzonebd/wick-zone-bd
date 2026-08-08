export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://nfjxdqpzkcibzqdozpmt.supabase.co";

export const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "sb_publishable_OHy8mSkv-hgTm-g-tFlXxw_eLgOhrWU";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

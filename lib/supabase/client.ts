"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase publishable credentials are intentionally safe to ship in browser code.
// Keep environment overrides for other deployments, but use this production project
// as a fallback so Cloudflare builds cannot silently ship Auth without public config.
const defaultSupabaseUrl = "https://nfjxdqpzkcibzqdozpmt.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_OHy8mSkv-hgTm-g-tFlXxw_eLgOhrWU";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || defaultSupabaseUrl;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  defaultSupabasePublishableKey;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return browserClient;
}

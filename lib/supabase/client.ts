"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublicKey, supabaseUrl } from "@/lib/supabase/config";

// Supabase publishable credentials are intentionally safe to ship in browser code.
// Keep environment overrides for other deployments, but use this production project
// as a fallback so Cloudflare builds cannot silently ship Auth without public config.
export { isSupabaseConfigured } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabasePublicKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return browserClient;
}

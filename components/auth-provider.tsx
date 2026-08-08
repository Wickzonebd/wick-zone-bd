"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Membership, PublicProfile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: PublicProfile | null;
  membership: Membership | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    const nextUser = authData.user ?? null;
    setUser(nextUser);
    if (!nextUser) {
      setProfile(null);
      setMembership(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const [profileResult, membershipResult, roleResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,avatar_url,bio,badge_label,is_social_verified,referral_code,created_at,is_suspended").eq("id", nextUser.id).maybeSingle(),
      supabase.from("memberships").select("user_id,status,activated_at,activation_source").eq("user_id", nextUser.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", nextUser.id).eq("role", "admin").maybeSingle(),
    ]);
    setProfile((profileResult.data as PublicProfile | null) ?? null);
    setMembership((membershipResult.data as Membership | null) ?? null);
    setIsAdmin(Boolean(roleResult.data));
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void refresh();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setMembership(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({ user, profile, membership, isAdmin, loading, refresh, signOut }),
    [user, profile, membership, isAdmin, loading, refresh, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

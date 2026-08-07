"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SiteGeneralSettings, SupportSettings } from "@/lib/types";

const defaultGeneral: SiteGeneralSettings = {
  siteName: "Community Hub",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#FF4D1F",
  accentColor: "#FF6B3D",
  backgroundColor: "#FFF9ED",
  currency: "BDT",
  activationPrice: null,
  activationGateScope: "micro_jobs",
  memberBadgeWording: "Member",
  withdrawalMinimum: 0,
  payoutMethods: [],
  paymentGatewayStatus: "not_configured",
  paymentPendingMessage: "Payment gateway setup is currently pending. Please contact support.",
  generalNotice: "",
  privacyContent: "",
};

const defaultSupport: SupportSettings = {
  enabled: false,
  label: "Support",
  iconUrl: null,
  contactUrl: null,
  phone: null,
  position: "right",
};

interface SiteConfigValue {
  general: SiteGeneralSettings;
  support: SupportSettings;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SiteConfigContext = createContext<SiteConfigValue | null>(null);

export function SiteConfigProvider({ children }: { children: React.ReactNode }) {
  const [general, setGeneral] = useState(defaultGeneral);
  const [support, setSupport] = useState(defaultSupport);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("site_settings").select("key,value").in("key", ["general", "support"]);
    for (const row of data ?? []) {
      if (row.key === "general") setGeneral({ ...defaultGeneral, ...(row.value as Partial<SiteGeneralSettings>) });
      if (row.key === "support") setSupport({ ...defaultSupport, ...(row.value as Partial<SupportSettings>) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void refresh();
    if (!supabase) return;
    const channel = supabase
      .channel("site-config")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.style.setProperty("--primary", general.primaryColor);
    document.documentElement.style.setProperty("--accent", general.accentColor);
    document.documentElement.style.setProperty("--app-background", general.backgroundColor);
  }, [general]);

  const value = useMemo(() => ({ general, support, loading, refresh }), [general, support, loading, refresh]);
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  const context = useContext(SiteConfigContext);
  if (!context) throw new Error("useSiteConfig must be used within SiteConfigProvider");
  return context;
}

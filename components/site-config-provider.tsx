"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { legalContentDefaults } from "@/lib/legal-content";
import type { SiteGeneralSettings, SupportSettings } from "@/lib/types";

const defaultGeneral: SiteGeneralSettings = {
  siteName: "Taskora",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#FF5722",
  accentColor: "#FF7043",
  backgroundColor: "#F8F9FA",
  currency: "BDT",
  activationPrice: null,
  socialVerificationPrice: null,
  activationGateScope: "micro_jobs",
  memberBadgeWording: "Member",
  withdrawalMinimum: 0,
  referralRewardCoins: 100,
  coinsPerCurrencyUnit: 100,
  minimumCoinExchange: 100,
  payoutMethods: [],
  paymentGatewayStatus: "not_configured",
  paymentPendingMessage: "Payment gateway setup is currently pending. Please contact support.",
  generalNotice: "",
  aboutContent: legalContentDefaults.about.en,
  aboutContentBn: legalContentDefaults.about.bn,
  privacyContent: legalContentDefaults.privacy.en,
  privacyContentBn: legalContentDefaults.privacy.bn,
  termsContent: legalContentDefaults.terms.en,
  termsContentBn: legalContentDefaults.terms.bn,
};

const defaultSupport: SupportSettings = {
  enabled: false,
  label: "Support",
  iconUrl: null,
  contactUrl: null,
  phone: null,
  position: "right",
};

function mergeGeneralSettings(value?: Partial<SiteGeneralSettings>): SiteGeneralSettings {
  const merged = { ...defaultGeneral, ...value };
  return {
    ...merged,
    aboutContent: merged.aboutContent?.trim() ? merged.aboutContent : legalContentDefaults.about.en,
    aboutContentBn: merged.aboutContentBn?.trim() ? merged.aboutContentBn : legalContentDefaults.about.bn,
    privacyContent: merged.privacyContent?.trim() ? merged.privacyContent : legalContentDefaults.privacy.en,
    privacyContentBn: merged.privacyContentBn?.trim() ? merged.privacyContentBn : legalContentDefaults.privacy.bn,
    termsContent: merged.termsContent?.trim() ? merged.termsContent : legalContentDefaults.terms.en,
    termsContentBn: merged.termsContentBn?.trim() ? merged.termsContentBn : legalContentDefaults.terms.bn,
  };
}

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
      if (row.key === "general") setGeneral(mergeGeneralSettings(row.value as Partial<SiteGeneralSettings>));
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

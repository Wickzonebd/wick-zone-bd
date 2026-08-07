"use client";

import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";

export function PrivacyClient() {
  const { t } = useI18n();
  const { general } = useSiteConfig();
  return <AppShell><main className="page-shell"><div className="page-narrow"><section className="card" style={{ padding: 24 }}><div className="quick-icon"><FileText /></div><h1 className="section-title" style={{ fontSize: "2rem", margin: "16px 0" }}>{t("common.privacy")}</h1><div className="post-body">{general.privacyContent || t("common.privacyEmpty")}</div></section></div></main></AppShell>;
}

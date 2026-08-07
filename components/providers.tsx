"use client";

import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteConfigProvider } from "@/components/site-config-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <SiteConfigProvider>
        <AuthProvider>{children}</AuthProvider>
      </SiteConfigProvider>
    </I18nProvider>
  );
}

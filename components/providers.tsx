"use client";

import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { LoginNotice } from "@/components/login-notice";
import { SiteConfigProvider } from "@/components/site-config-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <SiteConfigProvider>
        <AuthProvider>
          {children}
          <LoginNotice />
        </AuthProvider>
      </SiteConfigProvider>
    </I18nProvider>
  );
}

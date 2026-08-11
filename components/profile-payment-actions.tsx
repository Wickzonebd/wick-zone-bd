"use client";

import Link from "next/link";
import { BadgeCheck, CreditCard } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";

export function ProfilePaymentActions() {
  const { user, profile } = useAuth();
  const { language } = useI18n();
  if (!user) return null;
  const verified = Boolean(profile?.is_social_verified);

  return <div aria-label="Profile payment actions" style={{ position: "fixed", right: 16, bottom: 88, zIndex: 35, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
    {!verified && <Link className="primary-button" href="/payment/checkout?type=verification" style={{ boxShadow: "0 10px 30px rgba(0,0,0,.14)", textDecoration: "none" }}><BadgeCheck size={17} />{language === "bn" ? "Get Verified" : "Get Verified"}</Link>}
    <Link className="secondary-button" href="/profile/payments" style={{ background: "var(--surface, #fff)", boxShadow: "0 8px 24px rgba(0,0,0,.10)", textDecoration: "none" }}><CreditCard size={17} />{language === "bn" ? "পেমেন্টসমূহ" : "Payments"}</Link>
  </div>;
}

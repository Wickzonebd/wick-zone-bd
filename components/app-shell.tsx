"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft, BadgeCheck, Bell, BriefcaseBusiness, ChevronRight, CircleUserRound, Home, Languages, LayoutDashboard, LogOut,
  Menu, Network, Newspaper, ShieldCheck, UserRoundCog, WalletCards, X, LifeBuoy, LockKeyhole, FileText, KeyRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";

const mainNav = [
  { href: "/dashboard", label: "common.home", icon: Home },
  { href: "/feed", label: "common.feed", icon: Newspaper },
  { href: "/jobs", label: "common.jobs", icon: BriefcaseBusiness },
  { href: "/wallet", label: "common.wallet", icon: WalletCards },
  { href: "/profile", label: "common.profile", icon: CircleUserRound },
];

const drawerNav = [
  { href: "/dashboard", label: "common.home", icon: LayoutDashboard },
  { href: "/feed", label: "common.feed", icon: Newspaper },
  { href: "/jobs", label: "common.jobs", icon: BriefcaseBusiness },
  { href: "/wallet", label: "common.wallet", icon: WalletCards },
  { href: "/network", label: "common.network", icon: Network },
  { href: "/notifications", label: "common.notifications", icon: Bell },
  { href: "/profile", label: "profile.update", icon: UserRoundCog },
];

export function AppShell({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "home" | "feed" | "hub" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, language, toggleLanguage } = useI18n();
  const { general, support } = useSiteConfig();
  const { user, profile, membership, isAdmin, loading, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const update = async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      setUnread(count ?? 0);
    };
    void update();
    const channel = supabase.channel(`notifications-${user.id}`).on(
      "postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void update(),
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const activePath = useMemo(() => (pathname === "/" ? "/dashboard" : pathname), [pathname]);
  const homeVariant = variant === "home";
  const feedVariant = variant === "feed";
  const hubVariant = variant === "hub";
  const navItems = mainNav.map((item) => ({ href: item.href, icon: item.icon, text: t(item.label) }));
  const supportHref = isSafeExternalUrl(support.contactUrl)
    ? support.contactUrl
    : support.phone && /^\+?[0-9 ()-]{5,25}$/.test(support.phone) ? `tel:${support.phone.replace(/[^+0-9]/g, "")}` : null;

  if (loading || !user) {
    return <div className="page-shell"><div className="skeleton" style={{ height: 84 }} /><div className="skeleton" style={{ height: 280, marginTop: 18 }} /></div>;
  }

  return (
    <div className={`app-frame ${homeVariant ? "home-app-frame" : ""} ${feedVariant ? "feed-app-frame" : ""} ${hubVariant ? "hub-app-frame" : ""}`}>
      {!feedVariant && <header className={`app-header ${homeVariant ? "home-app-header" : ""} ${hubVariant ? "hub-app-header" : ""}`}>
        {hubVariant ? <div className="header-inner hub-header-inner">
          <div className="hub-header-left">
            <button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <button className="icon-button" onClick={() => router.back()} aria-label="Go back"><ArrowLeft size={19} /></button>
            <Link href="/dashboard" className="hub-header-title">{general.siteName}</Link>
          </div>
          <div className="header-actions">
            <button className="icon-button" onClick={toggleLanguage} aria-label="Change language"><Languages size={18} /></button>
            <Link href="/notifications" className="icon-button bell" aria-label="Notifications">
              <Bell size={20} />{unread > 0 && <span className="unread-dot" />}
            </Link>
          </div>
        </div> : <div className="header-inner">
          <button className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu /></button>
          <Link href="/dashboard" className={`brand ${homeVariant ? "home-brand" : ""}`} style={{ color: "inherit", textDecoration: "none" }}>
            {!homeVariant && (general.logoUrl ? <img src={general.logoUrl} alt="" className="brand-mark" /> : <div className="brand-fallback">{general.siteName.slice(0, 1).toUpperCase()}</div>)}
            <span className="brand-name">{homeVariant ? "WICK ZONE BD" : general.siteName}</span>
          </Link>
          <div className="header-actions">
            {!homeVariant && <button className="lang-pill" onClick={toggleLanguage} aria-label="Change language"><Languages size={17} /></button>}
            <Link href="/notifications" className="icon-button bell" aria-label="Notifications">
              <Bell size={23} />{unread > 0 && <span className="unread-dot" />}
            </Link>
          </div>
        </div>}
      </header>}

      <nav className={`bottom-nav ${homeVariant ? "home-bottom-nav" : ""}`} aria-label="Primary navigation">
        <div className="bottom-nav-inner">
          {navItems.map(({ href, text, icon: Icon }) => {
            const active = activePath === href || activePath.startsWith(`${href}/`);
            return <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}>{href === "/profile" && profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="nav-profile-avatar" /> : <Icon size={22} />}<span>{text}</span></Link>;
          })}
        </div>
      </nav>

      {children}

      {support.enabled && supportHref && (
        <a className={`support-fab ${homeVariant ? "home-support-fab" : ""}`} href={supportHref} target={supportHref.startsWith("http") ? "_blank" : undefined} rel={supportHref.startsWith("http") ? "noreferrer" : undefined} style={support.position === "left" ? { left: 16, right: "auto" } : { right: 16, left: "auto" }}>{support.iconUrl && isSafeExternalUrl(support.iconUrl) ? <img src={support.iconUrl} alt="" style={{ width: 21, height: 21, objectFit: "contain" }} /> : <LifeBuoy size={21} />}{homeVariant && language === "bn" ? "সাপোর্ট" : support.label || t("common.support")}</a>
      )}

      {drawerOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawerOpen(false)}>
          <aside className="drawer" aria-label="Navigation drawer">
            <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}><button className="secondary-button" style={{ minHeight: 44, width: 44, padding: 0 }} onClick={() => setDrawerOpen(false)}><X size={20} /></button></div>
            <div className="drawer-profile">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="drawer-avatar" /> : <div className="drawer-avatar"><CircleUserRound size={38} /></div>}
              <h2 style={{ margin: 0, fontSize: "1.35rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{profile?.full_name ?? user.email}{membership?.status === "active" && <BadgeCheck className="verified-check" size={20} aria-label="Verified" />}</h2>
              <span className={`status ${membership?.status === "active" ? "active" : "pending"}`} style={{ marginTop: 9 }}>
                {membership?.status === "active" ? <ShieldCheck size={14} /> : <LockKeyhole size={14} />}{membership?.status ?? "locked"}
              </span>
            </div>
            <div className="drawer-menu">
              {drawerNav.map(({ href, label, icon: Icon }) => <Link key={href} className="drawer-link" href={href} onClick={() => setDrawerOpen(false)}><Icon size={21} />{t(label)}<ChevronRight size={17} style={{ marginLeft: "auto" }} /></Link>)}
              {support.enabled && supportHref && <a className="drawer-link" href={supportHref} target={supportHref.startsWith("http") ? "_blank" : undefined} rel={supportHref.startsWith("http") ? "noreferrer" : undefined}><LifeBuoy size={21} />{t("common.support")}<ChevronRight size={17} style={{ marginLeft: "auto" }} /></a>}
              <Link className="drawer-link" href="/privacy" onClick={() => setDrawerOpen(false)}><FileText size={21} />{t("common.privacy")}<ChevronRight size={17} style={{ marginLeft: "auto" }} /></Link>
              <Link className="drawer-link" href="/reset-password" onClick={() => setDrawerOpen(false)}><KeyRound size={21} />{t("profile.password")}<ChevronRight size={17} style={{ marginLeft: "auto" }} /></Link>
              {isAdmin && <Link className="drawer-link" href="/admin" onClick={() => setDrawerOpen(false)}><ShieldCheck size={21} />{t("common.admin")}<ChevronRight size={17} style={{ marginLeft: "auto" }} /></Link>}
              <button className="drawer-link danger" style={{ border: 0, background: "transparent", width: "100%" }} onClick={async () => { await signOut(); router.replace("/login"); }}><LogOut size={21} />{t("common.logout")}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

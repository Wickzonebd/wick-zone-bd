"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft, BadgeCheck, Bell, BriefcaseBusiness, CircleUserRound, Home, Languages, LayoutDashboard, LogOut,
  Menu, Network, Newspaper, ShoppingCart, ShieldCheck, Trophy, UserRoundCog, WalletCards, X, LifeBuoy, LockKeyhole, FileText, KeyRound, Info, ScrollText,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { TaskoraLockup, TaskoraMark } from "@/components/taskora-brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";

const mainNav = [
  { href: "/dashboard", label: "common.home", icon: Home },
  { href: "/feed", label: "common.feed", icon: Newspaper },
  { href: "/reselling", label: "common.reselling", icon: ShoppingCart },
  { href: "/jobs", label: "common.jobs", icon: BriefcaseBusiness },
  { href: "/profile", label: "common.profile", icon: CircleUserRound },
];

const drawerNav = [
  { href: "/dashboard", label: "common.home", icon: LayoutDashboard },
  { href: "/feed", label: "common.feed", icon: Newspaper },
  { href: "/ludo", label: "common.ludo", icon: Trophy },
  { href: "/jobs", label: "common.jobs", icon: BriefcaseBusiness },
  { href: "/wallet", label: "common.wallet", icon: WalletCards },
  { href: "/network", label: "common.network", icon: Network },
  { href: "/notifications", label: "common.notifications", icon: Bell },
  { href: "/profile", label: "profile.update", icon: UserRoundCog },
];

type AdminNavigation = {
  activeId: string;
  items: Array<{ id: string; label: string; icon: LucideIcon }>;
  onSelect: (id: string) => void;
};

export function AppShell({ children, variant = "default", hidePrimaryNav = false, adminNavigation }: { children: React.ReactNode; variant?: "default" | "home" | "feed" | "hub"; hidePrimaryNav?: boolean; adminNavigation?: AdminNavigation }) {
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
  const hasFullAccess = isAdmin || membership?.status === "active";
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
            <TaskoraMark size={28} className="hub-taskora-mark" />
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
          <Link href={hidePrimaryNav && isAdmin ? "/admin-login" : "/dashboard"} className={`brand ${homeVariant ? "home-brand" : ""}`} style={{ color: "inherit", textDecoration: "none" }}>
            {hidePrimaryNav && isAdmin ? <TaskoraMark size={38} /> : general.logoUrl ? <img src={general.logoUrl} alt="" className="brand-mark" /> : <TaskoraMark size={38} />}
            <span className="brand-name">{hidePrimaryNav && isAdmin ? "Taskora Admin" : general.siteName}</span>
          </Link>
          <div className="header-actions">
            {!homeVariant && <button className="lang-pill" onClick={toggleLanguage} aria-label="Change language"><Languages size={17} /></button>}
            <Link href="/notifications" className="icon-button bell" aria-label="Notifications">
              <Bell size={23} />{unread > 0 && <span className="unread-dot" />}
            </Link>
          </div>
        </div>}
      </header>}

      {!hidePrimaryNav && <nav className={`bottom-nav ${homeVariant ? "home-bottom-nav" : ""}`} aria-label="Primary navigation">
        <div className="bottom-nav-inner">
          {navItems.map(({ href, text, icon: Icon }) => {
            const active = activePath === href || activePath.startsWith(`${href}/`);
            return <Link key={href} href={href} className={`nav-item ${href === "/reselling" ? "nav-item-reselling" : ""} ${active ? "active" : ""}`}><span className="nav-icon-wrap">{href === "/profile" && profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="nav-profile-avatar" /> : <Icon size={22} />}</span><span>{text}</span></Link>;
          })}
        </div>
      </nav>}

      {children}

      {!hidePrimaryNav && support.enabled && supportHref && (
        <a className={`support-fab ${homeVariant ? "home-support-fab" : ""}`} href={supportHref} target={supportHref.startsWith("http") ? "_blank" : undefined} rel={supportHref.startsWith("http") ? "noreferrer" : undefined} style={support.position === "left" ? { left: 16, right: "auto" } : { right: 16, left: "auto" }}>{support.iconUrl && isSafeExternalUrl(support.iconUrl) ? <img src={support.iconUrl} alt="" style={{ width: 21, height: 21, objectFit: "contain" }} /> : <LifeBuoy size={21} />}{homeVariant && language === "bn" ? "সাপোর্ট" : support.label || t("common.support")}</a>
      )}

      {drawerOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawerOpen(false)}>
          <aside className={`drawer ${adminNavigation ? "admin-drawer" : ""}`} aria-label={adminNavigation ? "Admin navigation" : "Navigation drawer"}>
            <div className="drawer-close-row"><button className="secondary-button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}><X size={20} /></button></div>
            {adminNavigation ? <div className="admin-drawer-head">
              <TaskoraLockup markSize={42} />
              <span>Control Center</span>
              <small><ShieldCheck size={13} /> Administrator · Full access</small>
            </div> : <div className="drawer-profile">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="drawer-avatar" /> : <div className="drawer-avatar"><CircleUserRound size={38} /></div>}
              <h2 style={{ margin: 0, fontSize: "1.35rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{profile?.full_name ?? user.email}{hasFullAccess && <BadgeCheck className="verified-check" size={20} aria-label="Verified" />}</h2>
              <span className={`status ${hasFullAccess ? "active" : "pending"}`} style={{ marginTop: 9 }}>
                {hasFullAccess ? <ShieldCheck size={14} /> : <LockKeyhole size={14} />}{membership?.status ?? "locked"}
              </span>
            </div>}
            <div className="drawer-menu">
              {adminNavigation ? <>
                {adminNavigation.items.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={`drawer-link admin-drawer-link ${adminNavigation.activeId === id ? "active" : ""}`} onClick={() => { adminNavigation.onSelect(id); setDrawerOpen(false); }}><Icon size={20} /><span>{label}</span>{adminNavigation.activeId === id && <span className="admin-drawer-active-dot" />}</button>)}
                <div className="admin-drawer-divider" />
                <button className="drawer-link admin-drawer-link danger" type="button" onClick={async () => { await signOut(); router.replace("/login"); }}><LogOut size={20} /><span>{t("common.logout")}</span></button>
              </> : <>
                {drawerNav.map(({ href, label, icon: Icon }) => {
                  const active = activePath === href || activePath.startsWith(`${href}/`);
                  return <Link key={href} className={`drawer-link ${active ? "active" : ""}`} href={href} onClick={() => setDrawerOpen(false)}><Icon size={19} /><span>{t(label)}</span></Link>;
                })}
                <div className="drawer-menu-divider" />
                {support.enabled && supportHref && <a className="drawer-link" href={supportHref} target={supportHref.startsWith("http") ? "_blank" : undefined} rel={supportHref.startsWith("http") ? "noreferrer" : undefined}><LifeBuoy size={19} /><span>{t("common.support")}</span></a>}
                <Link className={`drawer-link ${activePath === "/about" ? "active" : ""}`} href="/about" onClick={() => setDrawerOpen(false)}><Info size={19} /><span>{t("common.about")}</span></Link>
                <Link className={`drawer-link ${activePath === "/privacy" ? "active" : ""}`} href="/privacy" onClick={() => setDrawerOpen(false)}><FileText size={19} /><span>{t("common.privacy")}</span></Link>
                <Link className={`drawer-link ${activePath === "/terms" ? "active" : ""}`} href="/terms" onClick={() => setDrawerOpen(false)}><ScrollText size={19} /><span>{t("common.terms")}</span></Link>
                <Link className={`drawer-link ${activePath === "/reset-password" ? "active" : ""}`} href="/reset-password" onClick={() => setDrawerOpen(false)}><KeyRound size={19} /><span>{t("profile.password")}</span></Link>
                {isAdmin && <Link className={`drawer-link ${activePath.startsWith("/admin") ? "active" : ""}`} href="/admin-login" onClick={() => setDrawerOpen(false)}><ShieldCheck size={19} /><span>{t("common.admin")}</span></Link>}
                <button className="drawer-link danger" style={{ border: 0, background: "transparent", width: "100%" }} onClick={async () => { await signOut(); router.replace("/login"); }}><LogOut size={21} />{t("common.logout")}</button>
              </>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Globe2, ImageIcon, Link2, LockKeyhole, Mail, MessageCircle, Play, Send, Youtube } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivationModal } from "@/components/activation-modal";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";
import type { AnnouncementTicker, Banner, ProjectCard, ServiceLink } from "@/lib/types";

const iconMap = { youtube: Youtube, mail: Mail, message: MessageCircle, send: Send, link: Link2, globe: Globe2, play: Play };

export function DashboardClient() {
  const { t, language } = useI18n();
  const { profile, membership } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [tickers, setTickers] = useState<AnnouncementTicker[]>([]);
  const [links, setLinks] = useState<ServiceLink[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slide, setSlide] = useState(0);
  const [activationOpen, setActivationOpen] = useState(false);
  const touchStart = useRef<number | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    const [bannerResult, tickerResult, linksResult, projectsResult] = await Promise.all([
      supabase.from("banners").select("id,title,image_url,destination_url,sort_order").eq("is_active", true).order("sort_order").limit(10),
      supabase.from("announcement_tickers").select("id,text_en,text_bn,icon,destination_url,text_color,background_color,direction,speed_seconds,sort_order").eq("is_active", true).order("sort_order").limit(2),
      supabase.from("service_links").select("id,label_en,label_bn,icon_name,icon_url,destination_url,sort_order").eq("is_active", true).order("sort_order").limit(12),
      supabase.from("project_cards").select("id,title_en,title_bn,description_en,description_bn,image_url,icon_name,destination_url,sort_order").eq("is_active", true).order("sort_order").limit(24),
    ]);
    const failed = [bannerResult, tickerResult, linksResult, projectsResult].some((result) => result.error);
    setError(failed);
    setBanners((bannerResult.data as Banner[]) ?? []);
    setTickers((tickerResult.data as AnnouncementTicker[]) ?? []);
    setLinks((linksResult.data as ServiceLink[]) ?? []);
    setProjects((projectsResult.data as ProjectCard[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (banners.length < 2) return;
    const interval = window.setInterval(() => setSlide((value) => (value + 1) % banners.length), 5000);
    return () => window.clearInterval(interval);
  }, [banners.length]);

  const activeBanner = banners[slide];
  const bannerStyle = useMemo(() => activeBanner?.image_url ? { backgroundImage: `url(${activeBanner.image_url})` } : undefined, [activeBanner]);

  return (
    <AppShell>
      <main className="page-shell">
        <div className="dashboard-columns">
          <div style={{ display: "grid", gap: 16 }}>
            {tickers.map((ticker) => (
              <div key={ticker.id} className="ticker" style={{ background: ticker.background_color, color: ticker.text_color }}>
                <div className={`ticker-track ${ticker.direction}`} style={{ "--ticker-speed": `${ticker.speed_seconds}s` } as React.CSSProperties}>
                  {language === "bn" && ticker.text_bn ? ticker.text_bn : ticker.text_en}
                </div>
              </div>
            ))}

            {loading ? <div className="skeleton" style={{ height: 190 }} /> : error ? <ErrorState message={t("common.error")} /> : banners.length ? (
              <div className="hero-carousel" onTouchStart={(event) => touchStart.current = event.touches[0]?.clientX ?? null} onTouchEnd={(event) => {
                if (touchStart.current == null || !banners.length) return;
                const delta = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
                if (Math.abs(delta) > 45) setSlide((value) => (value + (delta < 0 ? 1 : banners.length - 1)) % banners.length);
                touchStart.current = null;
              }}>
                <div className="hero-slide" style={bannerStyle}>
                  <div className="hero-slide-content">
                    <span className="status" style={{ background: "rgba(255,255,255,.16)", color: "white" }}>Community</span>
                    <h1 style={{ maxWidth: 430, fontSize: "clamp(1.65rem,7vw,2.65rem)", lineHeight: 1.08, margin: "10px 0 0" }}>{activeBanner.title || t("dashboard.hello")}</h1>
                  </div>
                </div>
                <div className="hero-dots">{banners.map((banner, index) => <button key={banner.id} className={`hero-dot ${index === slide ? "active" : ""}`} onClick={() => setSlide(index)} aria-label={`Banner ${index + 1}`} />)}</div>
              </div>
            ) : <div className="hero-carousel"><div className="hero-slide"><div className="hero-slide-content"><span className="muted" style={{ color: "#ccd4e0" }}>{t("dashboard.hello")}</span><h1 style={{ margin: "8px 0 0" }}>{profile?.full_name}</h1></div></div></div>}

            {membership?.status !== "active" && (
              <section className="activation-card">
                <div className="activation-row"><div className="activation-icon"><LockKeyhole /></div><div><h2 className="section-title" style={{ fontSize: "1.22rem" }}>{t("dashboard.lockedTitle")}</h2><p className="muted" style={{ margin: "5px 0 13px", lineHeight: 1.6 }}>{t("dashboard.lockedBody")}</p><button className="primary-button" onClick={() => setActivationOpen(true)}>{t("dashboard.activate")}<ArrowRight size={18} /></button></div></div>
              </section>
            )}

            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><div className="quick-icon" style={{ width: 42, height: 42 }}><Link2 size={20} /></div><h2 className="section-title">{t("dashboard.portal")}</h2></div>
              {loading ? <LoadingCards count={2} /> : links.length ? <div className="quick-grid">{links.map((link) => {
                const Icon = iconMap[(link.icon_name ?? "globe").toLowerCase() as keyof typeof iconMap] ?? Globe2;
                return <a key={link.id} className="quick-card" href={isSafeExternalUrl(link.destination_url) ? link.destination_url : "#"} target="_blank" rel="noreferrer"><div className="quick-icon">{link.icon_url ? <img src={link.icon_url} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} /> : <Icon size={28} />}</div><strong>{language === "bn" && link.label_bn ? link.label_bn : link.label_en}</strong></a>;
              })}</div> : <EmptyState message={t("dashboard.noLinks")} />}
            </section>
          </div>

          <aside style={{ display: "grid", gap: 16 }}>
            <section><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><div className="quick-icon" style={{ width: 42, height: 42 }}><BriefcaseBusiness size={20} /></div><h2 className="section-title">{t("dashboard.services")}</h2></div>
              {loading ? <LoadingCards count={3} /> : projects.length ? <div className="quick-grid">{projects.map((project) => <a key={project.id} className="quick-card" href={project.destination_url && isSafeExternalUrl(project.destination_url) ? project.destination_url : "#"} target={project.destination_url ? "_blank" : undefined} rel="noreferrer"><div className="quick-icon">{project.image_url ? <img src={project.image_url} alt="" style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 10 }} /> : <ImageIcon size={26} />}</div><strong>{language === "bn" && project.title_bn ? project.title_bn : project.title_en}</strong></a>)}</div> : <EmptyState message={t("dashboard.noProjects")} />}
            </section>
            <Link href="/network" className="network-hero" style={{ textDecoration: "none" }}><span className="status" style={{ color: "white", background: "rgba(255,255,255,.12)" }}>Network</span><h2 style={{ margin: "12px 0 8px", fontSize: "1.6rem" }}>{t("network.title")}</h2><p style={{ margin: 0, color: "#cbd2df", lineHeight: 1.6 }}>{t("network.body")}</p></Link>
          </aside>
        </div>
      </main>
      <ActivationModal open={activationOpen} onClose={() => setActivationOpen(false)} />
    </AppShell>
  );
}

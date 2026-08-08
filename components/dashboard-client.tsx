"use client";

import Link from "next/link";
import { BriefcaseBusiness, ChevronRight, CircleDollarSign, ClipboardList, Globe2, ImageIcon, Link2, Mail, MessageCircle, PackageOpen, Play, Send, ShieldCheck, ShoppingBag, ShoppingCart, Trophy, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivationModal } from "@/components/activation-modal";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { isSafeExternalUrl } from "@/lib/url";
import type { Banner, ProjectCard, ServiceLink } from "@/lib/types";

const iconMap = { mail: Mail, message: MessageCircle, send: Send, link: Link2, globe: Globe2, play: Play };

type SocialBrand = "facebook" | "messenger" | "telegram" | "youtube" | "whatsapp" | "instagram" | "tiktok";

interface MarketplaceService {
  id: string;
  platform: string;
  service_type: string;
  name_en: string;
  name_bn: string | null;
  image_url: string | null;
  quantity: number;
  price: number | string;
  delivery_note: string | null;
  sort_order: number;
}

interface HomeProduct {
  id: string;
  name_en: string;
  name_bn: string | null;
  image_url: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock_count: number | null;
  is_featured: boolean;
}

const socialBrands: Record<SocialBrand, { color: string; path: string }> = {
  facebook: {
    color: "#1877F2",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  messenger: {
    color: "#0866FF",
    path: "M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.008a.7.7 0 0 1 .364-.13",
  },
  telegram: {
    color: "#26A5E4",
    path: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  },
  youtube: {
    color: "#FF0000",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  whatsapp: {
    color: "#25D366",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z",
  },
  instagram: {
    color: "#E4405F",
    path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  },
  tiktok: {
    color: "#111111",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.93-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.72-.03-.5-.04-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.45 3.98-2.14 6.15-1.74.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.62.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
};

function getSocialBrand(link: ServiceLink): SocialBrand | null {
  const value = [link.icon_name, link.label_en, link.label_bn, link.destination_url].filter(Boolean).join(" ").toLowerCase();
  if (value.includes("messenger") || value.includes("m.me")) return "messenger";
  if (value.includes("facebook") || value.includes("fb.com") || value.includes("fb.me")) return "facebook";
  if (value.includes("telegram") || value.includes("t.me")) return "telegram";
  if (value.includes("youtube") || value.includes("youtu.be")) return "youtube";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("whatsapp") || value.includes("wa.me")) return "whatsapp";
  if (value.includes("instagram")) return "instagram";
  return null;
}

function SocialBrandIcon({ brand }: { brand: SocialBrand }) {
  const icon = socialBrands[brand];
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="30" height="30" style={{ color: icon.color }}><path fill="currentColor" d={icon.path} /></svg>;
}

const preferredPortalBrands: SocialBrand[] = ["facebook", "telegram", "youtube", "whatsapp"];
const portalFallbackLabels: Record<SocialBrand, string> = {
  facebook: "Facebook Group",
  messenger: "Messenger",
  telegram: "Telegram Group",
  youtube: "YouTube Channel",
  whatsapp: "WhatsApp Group",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const marketplacePlatforms = ["facebook", "instagram", "youtube", "tiktok", "telegram"] as const;
type MarketplacePlatform = (typeof marketplacePlatforms)[number];
const marketplacePlatformLabels: Record<MarketplacePlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  telegram: "Telegram",
};

export function DashboardClient() {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const { membership, isAdmin } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [links, setLinks] = useState<ServiceLink[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [marketplaceServices, setMarketplaceServices] = useState<MarketplaceService[]>([]);
  const [homeProducts, setHomeProducts] = useState<HomeProduct[]>([]);
  const [dashboardStats, setDashboardStats] = useState({ earnings: 0, activeJobs: 0, orders: 0 });
  const [selectedMarketplacePlatform, setSelectedMarketplacePlatform] = useState<MarketplacePlatform>("facebook");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slide, setSlide] = useState(0);
  const [activationOpen, setActivationOpen] = useState(false);
  const touchStart = useRef<number | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    const [bannerResult, linksResult, projectsResult, marketplaceResult, productResult, earningsResult, jobsResult, ordersResult, campaignsResult] = await Promise.all([
      supabase.from("banners").select("id,title,image_url,destination_url,sort_order").eq("is_active", true).order("sort_order").limit(10),
      supabase.from("service_links").select("id,label_en,label_bn,icon_name,icon_url,destination_url,sort_order").eq("is_active", true).order("sort_order").limit(12),
      supabase.from("project_cards").select("id,title_en,title_bn,description_en,description_bn,image_url,icon_name,destination_url,sort_order").eq("is_active", true).order("sort_order").limit(24),
      supabase.from("marketplace_services").select("id,platform,service_type,name_en,name_bn,image_url,quantity,price,delivery_note,sort_order").eq("is_active", true).order("sort_order").order("created_at", { ascending: false }),
      supabase.from("reselling_products").select("id,name_en,name_bn,image_url,price,compare_at_price,stock_count,is_featured").eq("is_active", true).order("is_featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false }).limit(6),
      supabase.from("wallet_transactions").select("amount").gt("amount", 0),
      supabase.rpc("list_job_previews"),
      supabase.from("payment_orders").select("id", { count: "exact", head: true }),
      supabase.from("service_campaigns").select("id", { count: "exact", head: true }),
    ]);
    const failed = [bannerResult, linksResult, projectsResult, marketplaceResult, productResult, earningsResult, jobsResult, ordersResult, campaignsResult].some((result) => result.error);
    setError(failed);
    setBanners((bannerResult.data as Banner[]) ?? []);
    setLinks((linksResult.data as ServiceLink[]) ?? []);
    setProjects((projectsResult.data as ProjectCard[]) ?? []);
    setMarketplaceServices((marketplaceResult.data as MarketplaceService[]) ?? []);
    setHomeProducts((productResult.data as HomeProduct[]) ?? []);
    setDashboardStats({
      earnings: ((earningsResult.data as Array<{ amount: number | string }> | null) ?? []).reduce((total, item) => total + Number(item.amount || 0), 0),
      activeJobs: Array.isArray(jobsResult.data) ? jobsResult.data.length : 0,
      orders: (ordersResult.count ?? 0) + (campaignsResult.count ?? 0),
    });
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
  const isVerified = isAdmin || membership?.status === "active";
  const portalItems = useMemo(() => {
    const claimed = new Set<string>();
    const preferred = preferredPortalBrands.map((brand) => {
      const link = links.find((item) => !claimed.has(item.id) && getSocialBrand(item) === brand);
      if (link) claimed.add(link.id);
      return {
        key: link?.id ?? `placeholder-${brand}`,
        brand,
        link,
        label: link ? (language === "bn" && link.label_bn ? link.label_bn : link.label_en) : portalFallbackLabels[brand],
      };
    });
    const extra = links.filter((item) => !claimed.has(item.id)).map((link) => ({
      key: link.id,
      brand: getSocialBrand(link),
      link,
      label: language === "bn" && link.label_bn ? link.label_bn : link.label_en,
    }));
    return [...preferred, ...extra];
  }, [language, links]);
  const visibleMarketplaceServices = useMemo(
    () => marketplaceServices.filter((service) => service.platform.toLowerCase() === selectedMarketplacePlatform),
    [marketplaceServices, selectedMarketplacePlatform],
  );

  return (
    <AppShell variant="home">
      <main className="home-page">
        <div className="home-dashboard">
          {loading ? <div className="skeleton home-banner-skeleton" /> : (
            <div className="home-banner-carousel" onTouchStart={(event) => touchStart.current = event.touches[0]?.clientX ?? null} onTouchEnd={(event) => {
              if (touchStart.current == null || !banners.length) return;
              const delta = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
              if (Math.abs(delta) > 45) setSlide((value) => (value + (delta < 0 ? 1 : banners.length - 1)) % banners.length);
              touchStart.current = null;
            }}>
              <div className={`home-banner ${activeBanner?.image_url ? "has-image" : ""}`} style={bannerStyle}>
                {activeBanner?.image_url ? activeBanner.title && <span className="home-banner-image-title">{activeBanner.title}</span> : <>
                  <div className="home-banner-copy"><span className="home-banner-badge">NUMBER ONE</span><h1>{activeBanner?.title || "BANGLADESH TRUSTED ORGANIZATION"}</h1><strong>Taskora</strong></div>
                  <div className="home-banner-art"><ShoppingCart size={50} /></div>
                </>}
              </div>
              {banners.length > 1 && <div className="home-banner-dots">{banners.map((banner, index) => <button key={banner.id} className={`home-banner-dot ${index === slide ? "active" : ""}`} onClick={() => setSlide(index)} aria-label={`Banner ${index + 1}`} />)}</div>}
            </div>
          )}

          <section className="home-summary-grid" aria-label={language === "bn" ? "অ্যাকাউন্ট সামারি" : "Account summary"}>
            <article className="home-summary-card earnings">
              <span className="home-summary-icon"><CircleDollarSign size={21} /></span>
              <div><small>{language === "bn" ? "মোট আয়" : "Total Earnings"}</small><strong>{formatMoney(dashboardStats.earnings, general.currency, language)}</strong></div>
            </article>
            <article className="home-summary-card jobs">
              <span className="home-summary-icon"><BriefcaseBusiness size={21} /></span>
              <div><small>{language === "bn" ? "চলমান কাজ" : "Active Jobs"}</small><strong>{dashboardStats.activeJobs.toLocaleString(language === "bn" ? "bn-BD" : "en")}</strong></div>
            </article>
            <article className="home-summary-card orders">
              <span className="home-summary-icon"><ClipboardList size={21} /></span>
              <div><small>{language === "bn" ? "অর্ডার" : "Orders"}</small><strong>{dashboardStats.orders.toLocaleString(language === "bn" ? "bn-BD" : "en")}</strong></div>
            </article>
          </section>

          <Link href="/ludo" className="home-ludo-feature">
            <span className="home-ludo-icon"><Trophy size={28} /></span>
            <span className="home-ludo-copy"><span>GAMING ZONE · NEW</span><strong>{language === "bn" ? "লুডু টুর্নামেন্ট" : "Ludo Tournament"}</strong><small>{language === "bn" ? "ম্যাচে যোগ দিন, খেলুন এবং পুরস্কার জিতুন" : "Join a match, play Ludo and win prizes"}</small></span>
            <span className="home-ludo-cta">{language === "bn" ? "এখনই যোগ দিন" : "Join Now"}<ChevronRight size={16} /></span>
          </Link>

          {error && !loading && <div className="form-message error">{t("common.error")}</div>}

          <section className={`home-verification ${isVerified ? "verified" : ""}`}>
            <div className="home-verification-row">
              <div className="home-verification-icon"><ShieldCheck size={23} /></div>
              <strong>{language === "bn" ? (isVerified ? "আপনার অ্যাকাউন্ট ভেরিফাইড" : "আপনার অ্যাকাউন্ট এখনো ভেরিফাইড নয়") : (isVerified ? "Your account is verified" : "Your account is not verified yet")}</strong>
              <span className="home-verification-status"><span />{isVerified ? "Verified" : "Verification Required"}</span>
            </div>
            {!isVerified && <button className="home-verify-button" onClick={() => setActivationOpen(true)}>{language === "bn" ? "আপনার অ্যাকাউন্ট এখনই ভেরিফাই করে নিন" : "Verify your account now"}</button>}
          </section>

          <section className="home-section home-reference-section home-official-section">
            <div className="home-section-head"><div className="home-section-title"><span className="home-section-icon"><Link2 size={20} /></span><div><h2>{language === "bn" ? "অফিসিয়াল এক্সেস পোর্টাল" : "Official access portal"}</h2><small>{language === "bn" ? "Facebook, Telegram, YouTube ও WhatsApp-এর অফিসিয়াল গ্রুপ লিংক" : "Official Facebook, Telegram, YouTube and WhatsApp links"}</small></div></div><div className="home-live"><span />Live</div></div>
            <div className="home-social-grid">{portalItems.map((item) => {
              const link = item.link;
              const Icon = iconMap[(link?.icon_name ?? "globe").toLowerCase() as keyof typeof iconMap] ?? Globe2;
              const content = <><div className="home-social-icon">{link?.icon_url ? <img src={link.icon_url} alt="" /> : item.brand ? <SocialBrandIcon brand={item.brand} /> : <Icon size={27} />}</div><strong>{item.label}</strong></>;
              return link && isSafeExternalUrl(link.destination_url)
                ? <a key={item.key} className="home-social-card" href={link.destination_url} target="_blank" rel="noreferrer">{content}</a>
                : <div key={item.key} className="home-social-card is-placeholder" aria-disabled="true">{content}</div>;
            })}</div>
          </section>

          <section className="home-marketplace" aria-label={language === "bn" ? "আমাদের সার্ভিস" : "Our services"}>
            <div className="home-section-head"><div className="home-section-title"><span className="home-section-icon"><ShoppingBag size={20} /></span><div><h2>{language === "bn" ? "আমাদের সার্ভিস" : "Our Services"}</h2><small>{language === "bn" ? "Facebook, YouTube, TikTok, Instagram ও Telegram প্যাকেজ" : "Facebook, YouTube, TikTok, Instagram and Telegram packages"}</small></div></div><div className="home-live"><span />Live</div></div>
            <div className="home-marketplace-platforms">
              {marketplacePlatforms.map((platform) => <button type="button" key={platform} className={selectedMarketplacePlatform === platform ? "active" : ""} onClick={() => setSelectedMarketplacePlatform(platform)}><span><SocialBrandIcon brand={platform} /></span><strong>{marketplacePlatformLabels[platform]}</strong></button>)}
            </div>
            {loading ? <div className="home-marketplace-services">{[0,1].map((item) => <div className="skeleton home-marketplace-skeleton" key={item} />)}</div> : visibleMarketplaceServices.length > 0 ? <div className="home-marketplace-services">
              {visibleMarketplaceServices.map((service) => <Link href={`/services/${service.id}`} className="home-marketplace-service" key={service.id}>
                <div className="home-marketplace-service-image">{service.image_url ? <img src={service.image_url} alt="" loading="lazy" /> : <SocialBrandIcon brand={selectedMarketplacePlatform} />}</div>
                <div className="home-marketplace-service-copy"><span>{service.service_type} · {service.quantity.toLocaleString()}</span><strong>{language === "bn" && service.name_bn ? service.name_bn : service.name_en}</strong>{service.delivery_note && <small>{service.delivery_note}</small>}<div className="home-marketplace-service-price"><b>{formatMoney(Number(service.price), general.currency, language)}</b><em>{language === "bn" ? "বিস্তারিত" : "Details"}<ChevronRight size={13} /></em></div></div>
              </Link>)}
            </div> : <div className="home-marketplace-empty">{language === "bn" ? `${marketplacePlatformLabels[selectedMarketplacePlatform]}-এর কোনো সার্ভিস এখনো যোগ করা হয়নি।` : `No ${marketplacePlatformLabels[selectedMarketplacePlatform]} services have been added yet.`}</div>}
          </section>

          <section className="home-storefront">
            <div className="home-section-head"><div className="home-section-title"><span className="home-section-icon"><PackageOpen size={20} /></span><div><h2>{language === "bn" ? "আমাদের প্রোডাক্ট" : "Our Products"}</h2><small>{language === "bn" ? "রিসেলিং স্টোরের নতুন ও জনপ্রিয় প্রোডাক্ট" : "Featured and recent products from the Reselling store"}</small></div></div><Link href="/reselling" className="home-storefront-view-all">{language === "bn" ? "সব দেখুন" : "View all"}<ChevronRight size={15} /></Link></div>
            {loading ? <div className="home-storefront-grid">{[0,1,2,3].map((item) => <div className="skeleton home-storefront-skeleton" key={item} />)}</div> : homeProducts.length ? <div className="home-storefront-grid">{homeProducts.map((product) => {
              const price = Number(product.price);
              const compare = product.compare_at_price == null ? null : Number(product.compare_at_price);
              const discount = compare && compare > price ? Math.round((1 - price / compare) * 100) : 0;
              return <Link href={`/reselling/${product.id}`} className="home-storefront-card" key={product.id}>
                <div className="home-storefront-image">{product.image_url ? <img src={product.image_url} alt={language === "bn" && product.name_bn ? product.name_bn : product.name_en} loading="lazy" /> : <PackageOpen size={36} />}{product.is_featured && <span className="home-storefront-featured">{language === "bn" ? "জনপ্রিয়" : "Featured"}</span>}{discount > 0 && <b>-{discount}%</b>}</div>
                <div className="home-storefront-copy"><h3>{language === "bn" && product.name_bn ? product.name_bn : product.name_en}</h3><div><strong>{formatMoney(price, general.currency, language)}</strong>{compare && compare > price && <del>{formatMoney(compare, general.currency, language)}</del>}</div><span className={product.stock_count === 0 ? "sold" : "available"}>{product.stock_count === 0 ? (language === "bn" ? "স্টক শেষ" : "Sold out") : (language === "bn" ? "বিস্তারিত দেখুন" : "View product")}</span></div>
              </Link>;
            })}</div> : <div className="home-marketplace-empty">{language === "bn" ? "রিসেলিং-এ এখনো কোনো প্রোডাক্ট প্রকাশ করা হয়নি।" : "No Reselling products have been published yet."}</div>}
          </section>

          <section className="home-section home-reference-section home-projects-section">
            <div className="home-section-head"><div className="home-section-title"><span className="home-section-icon"><Zap size={20} /></span><div><h2>{language === "bn" ? "আমাদের প্রজেক্ট সমূহ" : "Our projects"}</h2><small>{language === "bn" ? "আমাদের অন্যান্য সেবা ও কমিউনিটি প্রজেক্ট" : "Explore our services and community projects"}</small></div></div><div className="home-project-live"><span />Project Links</div></div>
            {loading ? <div className="home-project-grid">{[0,1,2].map((item) => <div key={item} className="skeleton home-project-skeleton" />)}</div> : projects.length ? <div className="home-project-grid">{projects.map((project) => {
              const ProjectIcon = iconMap[(project.icon_name ?? "").toLowerCase() as keyof typeof iconMap] ?? ImageIcon;
              const content = <><div className="home-project-icon">{project.image_url ? <img src={project.image_url} alt="" /> : <ProjectIcon size={25} />}</div><strong>{language === "bn" && project.title_bn ? project.title_bn : project.title_en}</strong></>;
              return project.destination_url && isSafeExternalUrl(project.destination_url)
                ? <a key={project.id} className="home-project-card" href={project.destination_url} target="_blank" rel="noreferrer">{content}</a>
                : <div key={project.id} className="home-project-card">{content}</div>;
            })}</div> : <div className="home-empty">{t("dashboard.noProjects")}</div>}
          </section>
        </div>
      </main>
      <ActivationModal open={activationOpen} onClose={() => setActivationOpen(false)} />
    </AppShell>
  );
}

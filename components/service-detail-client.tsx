"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock3, ExternalLink, FileText, Gauge, Link2, PackageCheck, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";

interface ServiceDetail {
  id: string;
  platform: string;
  service_type: string;
  name_en: string;
  name_bn: string | null;
  image_url: string | null;
  description_en: string | null;
  description_bn: string | null;
  quantity: number;
  price: number | string;
  delivery_note: string | null;
}

interface ServiceCampaign {
  id: string;
  service_id: string | null;
  service_name: string;
  target_url: string;
  quantity: number;
  delivered_count: number;
  amount: number | string;
  currency: string;
  payment_status: string;
  status: "pending" | "active" | "completed" | "cancelled";
  admin_note: string | null;
  created_at: string;
}

const statusLabel = (status: ServiceCampaign["status"], language: "bn" | "en") => {
  if (language === "bn") return status === "pending" ? "অপেক্ষমাণ" : status === "active" ? "চলমান" : status === "completed" ? "সম্পন্ন" : "বাতিল";
  return status === "pending" ? "Pending" : status === "active" ? "Active" : status === "completed" ? "Completed" : "Cancelled";
};

export function ServiceDetailClient() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { language } = useI18n();
  const { general } = useSiteConfig();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [campaigns, setCampaigns] = useState<ServiceCampaign[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const localize = useCallback((en: string | null | undefined, bn: string | null | undefined) => language === "bn" && bn ? bn : en ?? "", [language]);

  const load = useCallback(async () => {
    const id = params?.id;
    const supabase = getSupabaseBrowserClient();
    if (!id || !supabase) { setError(true); setLoading(false); return; }
    const serviceResult = await supabase.from("marketplace_services")
      .select("id,platform,service_type,name_en,name_bn,image_url,description_en,description_bn,quantity,price,delivery_note")
      .eq("id", id).eq("is_active", true).maybeSingle();
    if (serviceResult.error || !serviceResult.data) {
      setService(null); setCampaigns([]); setError(true); setLoading(false); return;
    }
    setService(serviceResult.data as ServiceDetail);
    if (user) {
      const campaignResult = await supabase.from("service_campaigns")
        .select("id,service_id,service_name,target_url,quantity,delivered_count,amount,currency,payment_status,status,admin_note,created_at")
        .eq("user_id", user.id).eq("service_id", id).order("created_at", { ascending: false });
      if (!campaignResult.error) setCampaigns((campaignResult.data as ServiceCampaign[]) ?? []);
    }
    setError(false);
    setLoading(false);
  }, [params?.id, user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user || !params?.id) return;
    const channel = supabase.channel(`service-campaigns:${user.id}:${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_campaigns", filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, params?.id, user]);

  const placeOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!service || placing) return;
    if (!isSafeExternalUrl(targetUrl.trim())) {
      setMessage({ type: "error", text: language === "bn" ? "যে প্রোফাইল/পোস্ট/চ্যানেলে সার্ভিস চান তার সঠিক লিংক দিন।" : "Enter a valid target profile, post, or channel URL." });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPlacing(true); setMessage(null);
    const { error: orderError } = await supabase.rpc("create_service_campaign", { p_service_id: service.id, p_target_url: targetUrl.trim() });
    setPlacing(false);
    if (orderError) {
      setMessage({ type: "error", text: orderError.message });
      return;
    }
    setTargetUrl("");
    setMessage({ type: "success", text: language === "bn" ? "অর্ডার তৈরি হয়েছে। পেমেন্ট/অ্যাডমিন কনফার্ম হলে ক্যাম্পেইন শুরু হবে এবং অগ্রগতি এখানে লাইভ দেখা যাবে।" : "Order created. After payment/admin confirmation, the campaign will start and progress will update here live." });
    await load();
  };

  const latestCampaign = campaigns[0] ?? null;
  const campaignPercent = latestCampaign ? Math.min(100, Math.round((latestCampaign.delivered_count / latestCampaign.quantity) * 100)) : 0;
  const price = Number(service?.price ?? 0);
  const name = service ? localize(service.name_en, service.name_bn) : "";
  const description = service ? localize(service.description_en, service.description_bn) : "";
  const platformLabel = service?.platform ? service.platform.charAt(0).toUpperCase() + service.platform.slice(1) : "";

  return <AppShell variant="hub"><main className="service-detail-page"><div className="service-detail-container">
    <Link href="/dashboard" className="service-detail-back"><ArrowLeft size={18} />{language === "bn" ? "হোমে ফিরুন" : "Back to Home"}</Link>
    {loading ? <div className="service-detail-skeleton"><div className="skeleton" /><div className="skeleton" /></div> : error || !service ? <section className="service-detail-empty"><ShoppingBag size={38} /><h2>{language === "bn" ? "সার্ভিস পাওয়া যায়নি" : "Service not found"}</h2></section> : <>
      <section className="service-detail-hero">
        <div className="service-detail-media">{service.image_url ? <img src={service.image_url} alt={name} /> : <ShoppingBag size={64} />}<span>{platformLabel}</span></div>
        <div className="service-detail-main">
          <div className="service-detail-kicker"><Sparkles size={15} />TASKORA SERVICE</div>
          <h1>{name}</h1>
          <div className="service-detail-tags"><span>{platformLabel}</span><span>{service.service_type.replaceAll("-", " ")}</span><span>{service.quantity.toLocaleString(language === "bn" ? "bn-BD" : "en")} {service.service_type.replaceAll("-", " ")}</span></div>
          <div className="service-detail-price">{formatMoney(price, general.currency, language)}</div>
          {service.delivery_note && <div className="service-detail-delivery"><Clock3 size={16} />{service.delivery_note}</div>}
          <div className="service-detail-benefits"><div><PackageCheck size={19} /><span><strong>{language === "bn" ? "লাইভ অগ্রগতি" : "Live progress"}</strong><small>{language === "bn" ? "অ্যাডমিন আপডেট সাথে সাথে দেখুন" : "See admin updates instantly"}</small></span></div><div><ShieldCheck size={19} /><span><strong>{language === "bn" ? "অ্যাডমিন নিয়ন্ত্রিত" : "Admin controlled"}</strong><small>{language === "bn" ? "নিজে progress পরিবর্তন করা যায় না" : "Progress cannot be self-edited"}</small></span></div></div>
        </div>
      </section>

      <section className="service-detail-grid">
        <article className="service-detail-description"><div className="service-detail-section-title"><FileText size={20} /><div><small>DETAILS</small><h2>{language === "bn" ? "সার্ভিসের বিস্তারিত" : "Service details"}</h2></div></div><p>{description || (language === "bn" ? "এই সার্ভিসের বিস্তারিত অ্যাডমিন এখনো যোগ করেনি।" : "The admin has not added a description for this service yet.")}</p><div className="service-detail-facts"><div><span>{language === "bn" ? "পরিমাণ" : "Quantity"}</span><strong>{service.quantity.toLocaleString()}</strong></div><div><span>{language === "bn" ? "সার্ভিস" : "Type"}</span><strong>{service.service_type.replaceAll("-", " ")}</strong></div><div><span>{language === "bn" ? "প্ল্যাটফর্ম" : "Platform"}</span><strong>{platformLabel}</strong></div></div></article>

        <form className="service-order-card" onSubmit={placeOrder}><div className="service-detail-section-title"><ShoppingBag size={20} /><div><small>ORDER</small><h2>{language === "bn" ? "ক্যাম্পেইন শুরু করুন" : "Start a campaign"}</h2></div></div><label>{language === "bn" ? "Target profile / post / channel link" : "Target profile / post / channel URL"}</label><div className="input-wrap"><Link2 size={18} /><input className="input with-icon" type="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://…" required /></div><div className="service-order-summary"><span>{name}</span><strong>{formatMoney(price, general.currency, language)}</strong></div><button className="service-order-button" disabled={placing}><ShoppingBag size={19} />{placing ? (language === "bn" ? "অর্ডার হচ্ছে…" : "Placing order…") : (language === "bn" ? "এখনই অর্ডার করুন" : "Place Order")}</button><p><ShieldCheck size={14} />{language === "bn" ? "পেমেন্ট গেটওয়ে সংযুক্ত না থাকায় অর্ডার Pending হবে। অ্যাডমিন কনফার্ম/Start করলে ডেলিভারি শুরু হবে।" : "Until the payment gateway is connected, orders stay Pending. Delivery starts after admin confirmation."}</p>{message && <div className={`form-message ${message.type}`}>{message.text}</div>}</form>
      </section>

      <section className="service-campaign-section">
        <div className="service-campaign-head"><div><span>LIVE CAMPAIGNS</span><h2>{language === "bn" ? "আমার ক্যাম্পেইন" : "My campaigns"}</h2></div><strong>{campaigns.length} {language === "bn" ? "টি" : "total"}</strong></div>
        {latestCampaign && <article className={`service-campaign-feature ${latestCampaign.status}`}><div className="service-campaign-feature-top"><div><small>{latestCampaign.service_name}</small><strong>{statusLabel(latestCampaign.status, language)}</strong></div><span>{campaignPercent}%</span></div><div className="service-campaign-progress"><span style={{ width: `${campaignPercent}%` }} /></div><div className="service-campaign-count"><span>{latestCampaign.delivered_count.toLocaleString()} {language === "bn" ? "ডেলিভারড" : "delivered"}</span><strong>{latestCampaign.quantity.toLocaleString()} {language === "bn" ? "টার্গেট" : "target"}</strong></div>{latestCampaign.admin_note && <p>{latestCampaign.admin_note}</p>}</article>}
        <div className="service-campaign-list">{campaigns.map((campaign) => { const percent = Math.min(100, Math.round((campaign.delivered_count / campaign.quantity) * 100)); return <article key={campaign.id}><div className="service-campaign-row-top"><span className={`service-campaign-status ${campaign.status}`}>{statusLabel(campaign.status, language)}</span><small>{new Date(campaign.created_at).toLocaleDateString()}</small></div><strong>{campaign.service_name}</strong><a href={campaign.target_url} target="_blank" rel="noreferrer"><ExternalLink size={12} />{language === "bn" ? "Target খুলুন" : "Open target"}</a><div className="service-campaign-mini-progress"><span style={{ width: `${percent}%` }} /></div><div className="service-campaign-mini-meta"><span>{campaign.delivered_count}/{campaign.quantity}</span><b>{percent}%</b></div></article>; })}</div>
        {!campaigns.length && <div className="service-campaign-empty"><Gauge size={28} /><strong>{language === "bn" ? "এখনো কোনো ক্যাম্পেইন নেই" : "No campaigns yet"}</strong><span>{language === "bn" ? "উপরের Order form থেকে প্রথম ক্যাম্পেইন তৈরি করুন।" : "Create your first campaign from the order form above."}</span></div>}
      </section>
    </>}
  </div></main></AppShell>;
}

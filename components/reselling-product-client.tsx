"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Boxes, CheckCircle2, FileText, Layers3, LifeBuoy, PackageCheck, PackageOpen, ShieldCheck, ShoppingBag, Store, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface ProductDetail {
  id: string;
  category_id: string | null;
  vendor_id: string | null;
  name_en: string;
  name_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  image_url: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock_count: number | null;
  is_featured: boolean;
}

interface ProductCategory { id: string; name_en: string; name_bn: string | null; image_url: string | null; }
interface ProductVendor { id: string; name: string; description: string | null; logo_url: string | null; }

export function ResellingProductClient() {
  const params = useParams<{ id: string }>();
  const { language } = useI18n();
  const { general } = useSiteConfig();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [vendor, setVendor] = useState<ProductVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyMessage, setBuyMessage] = useState<string | null>(null);

  const localize = useCallback((english: string | null | undefined, bangla: string | null | undefined) => language === "bn" && bangla ? bangla : english ?? "", [language]);

  const load = useCallback(async () => {
    const id = params?.id;
    const supabase = getSupabaseBrowserClient();
    if (!id || !supabase) { setError(true); setLoading(false); return; }
    setLoading(true); setError(false);
    const { data, error: productError } = await supabase.from("reselling_products")
      .select("id,category_id,vendor_id,name_en,name_bn,description_en,description_bn,image_url,price,compare_at_price,stock_count,is_featured")
      .eq("id", id).eq("is_active", true).maybeSingle();
    if (productError || !data) { setProduct(null); setError(true); setLoading(false); return; }
    const nextProduct = data as ProductDetail;
    setProduct(nextProduct);
    const [categoryResult, vendorResult] = await Promise.all([
      nextProduct.category_id ? supabase.from("reselling_categories").select("id,name_en,name_bn,image_url").eq("id", nextProduct.category_id).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null }),
      nextProduct.vendor_id ? supabase.from("reselling_vendors").select("id,name,description,logo_url").eq("id", nextProduct.vendor_id).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setCategory((categoryResult.data as ProductCategory | null) ?? null);
    setVendor((vendorResult.data as ProductVendor | null) ?? null);
    setLoading(false);
  }, [params?.id]);

  useEffect(() => { void load(); }, [load]);

  const buy = async () => {
    if (!product || product.stock_count === 0 || buying) return;
    setBuyMessage(null);
    if (general.paymentGatewayStatus !== "configured") {
      setBuyMessage(general.paymentPendingMessage || (language === "bn" ? "পেমেন্ট গেটওয়ে এখনো চালু হয়নি।" : "The payment gateway is not configured yet."));
      return;
    }
    setBuying(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setBuyMessage(language === "bn" ? "পেমেন্টের আগে আবার লগইন করুন।" : "Sign in again before starting payment.");
        return;
      }
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ type: "reselling_product", productId: product.id }),
      });
      const result = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !result.checkoutUrl) {
        setBuyMessage(result.error || (language === "bn" ? "পেমেন্ট শুরু করা যায়নি।" : "Payment could not be started."));
        return;
      }
      window.location.assign(result.checkoutUrl);
    } catch {
      setBuyMessage(language === "bn" ? "পেমেন্ট সার্ভারের সাথে যোগাযোগ করা যায়নি।" : "Could not reach the payment server.");
    } finally {
      setBuying(false);
    }
  };

  const currentPrice = Number(product?.price ?? 0);
  const comparePrice = product?.compare_at_price == null ? null : Number(product.compare_at_price);
  const discount = comparePrice && comparePrice > currentPrice ? Math.round((1 - currentPrice / comparePrice) * 100) : 0;

  return <AppShell variant="hub"><main className="reselling-detail-page"><div className="reselling-detail-container">
    <Link href="/reselling" className="reselling-detail-back"><ArrowLeft size={18} />{language === "bn" ? "রিসেলিং-এ ফিরুন" : "Back to Reselling"}</Link>

    {loading ? <div className="reselling-detail-skeleton"><div className="skeleton" /><div className="skeleton" /></div> : error || !product ? <section className="reselling-empty-panel reselling-detail-error"><PackageOpen size={38} /><h2>{language === "bn" ? "প্রোডাক্ট পাওয়া যায়নি" : "Product not found"}</h2><p>{language === "bn" ? "প্রোডাক্টটি সরানো হয়েছে অথবা এখন আর বিক্রির জন্য নেই।" : "This product was removed or is no longer available."}</p></section> : <>
      <section className="reselling-detail-card">
        <div className="reselling-detail-media">{product.image_url ? <img src={product.image_url} alt={localize(product.name_en, product.name_bn)} /> : <PackageOpen size={72} />}<div className="reselling-detail-media-badges">{product.is_featured && <span>{language === "bn" ? "জনপ্রিয়" : "Featured"}</span>}{discount > 0 && <b>-{discount}%</b>}</div></div>
        <div className="reselling-detail-main">
          <div className="reselling-detail-eyebrow"><Boxes size={16} />{general.siteName} · {language === "bn" ? "রিসেলিং স্টোর" : "Reselling Store"}</div>
          <div className="reselling-detail-code">{language === "bn" ? "প্রোডাক্ট আইডি" : "Product ID"} · {product.id.slice(0, 8).toUpperCase()}</div>
          <h1>{localize(product.name_en, product.name_bn)}</h1>
          <div className="reselling-detail-tags">{category && <span><Layers3 size={14} />{localize(category.name_en, category.name_bn)}</span>}{vendor && <span><Store size={14} />{vendor.name}</span>}</div>
          <div className="reselling-detail-price"><strong>{formatMoney(currentPrice, general.currency, language)}</strong>{comparePrice && comparePrice > currentPrice && <del>{formatMoney(comparePrice, general.currency, language)}</del>}{discount > 0 && <span>{language === "bn" ? `${discount}% সাশ্রয়` : `Save ${discount}%`}</span>}</div>
          <div className={`reselling-detail-stock ${product.stock_count === 0 ? "sold-out" : ""}`}><CheckCircle2 size={16} />{product.stock_count === 0 ? (language === "bn" ? "স্টক শেষ" : "Sold out") : product.stock_count == null ? (language === "bn" ? "স্টকে আছে" : "Available") : (language === "bn" ? `${product.stock_count}টি স্টকে আছে` : `${product.stock_count} in stock`)}</div>
          <div className="reselling-detail-highlights"><div><PackageCheck size={18} /><span><strong>{language === "bn" ? "লাইভ স্টক" : "Live stock"}</strong><small>{language === "bn" ? "অ্যাডমিন পরিচালিত" : "Admin managed"}</small></span></div><div><Tag size={18} /><span><strong>{language === "bn" ? "বর্তমান মূল্য" : "Current price"}</strong><small>{language === "bn" ? "লিস্টিং অনুযায়ী" : "As listed"}</small></span></div><div><LifeBuoy size={18} /><span><strong>{language === "bn" ? "সাপোর্ট" : "Support"}</strong><small>{language === "bn" ? "অর্ডারের পর যোগাযোগ" : "After-order contact"}</small></span></div></div>
          <button type="button" className="reselling-buy-button" disabled={product.stock_count === 0 || buying} onClick={() => void buy()}><ShoppingBag size={20} />{buying ? (language === "bn" ? "পেমেন্ট প্রস্তুত হচ্ছে…" : "Preparing payment…") : (language === "bn" ? "এখনই কিনুন" : "Buy Now")}</button>
          {buyMessage && <div className="reselling-payment-message"><ShieldCheck size={17} /><span>{buyMessage}</span></div>}
          <p className="reselling-payment-note"><ShieldCheck size={15} />{language === "bn" ? "পেমেন্ট গেটওয়ে চালু হলে Buy Now থেকে সরাসরি নিরাপদ পেমেন্ট হবে। সফল পেমেন্টের পর ডেলিভারির জন্য অ্যাডমিন/সাপোর্টের সাথে যোগাযোগ করা যাবে।" : "When the payment gateway is enabled, Buy Now will open secure direct payment. After a successful payment, contact admin/support for delivery."}</p>
        </div>
      </section>

      <section className="reselling-detail-description"><div className="reselling-detail-section-title"><span><FileText size={20} /></span><div><small>{language === "bn" ? "জেনে নিন" : "GOOD TO KNOW"}</small><h2>{language === "bn" ? "প্রোডাক্টের বিস্তারিত" : "Product details"}</h2></div></div><p>{localize(product.description_en, product.description_bn) || (language === "bn" ? "এই প্রোডাক্টের বিস্তারিত এখনো যোগ করা হয়নি। কেনার আগে প্রয়োজন হলে সাপোর্টে যোগাযোগ করুন।" : "No product description has been added yet. Contact support before buying if you need more information.")}</p><div className="reselling-detail-facts"><div><span>{language === "bn" ? "ক্যাটাগরি" : "Category"}</span><strong>{category ? localize(category.name_en, category.name_bn) : (language === "bn" ? "সাধারণ" : "General")}</strong></div><div><span>{language === "bn" ? "ভেন্ডর" : "Vendor"}</span><strong>{vendor?.name || general.siteName}</strong></div><div><span>{language === "bn" ? "স্টক" : "Stock"}</span><strong>{product.stock_count == null ? (language === "bn" ? "উপলভ্য" : "Available") : String(product.stock_count)}</strong></div></div></section>
      {vendor && <section className="reselling-detail-vendor">{vendor.logo_url ? <img src={vendor.logo_url} alt="" /> : <span><Store size={25} /></span>}<div><small>{language === "bn" ? "ভেন্ডর" : "Vendor"}</small><strong>{vendor.name}</strong>{vendor.description && <p>{vendor.description}</p>}</div></section>}
    </>}
  </div></main></AppShell>;
}

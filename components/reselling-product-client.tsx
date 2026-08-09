"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BadgePercent, CheckCircle2, FileText, Heart, Layers3, Minus, PackageCheck, PackageOpen, Plus, ShieldCheck, ShoppingBag, ShoppingCart, Star, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
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
interface ProductReview { id: string; rating: number; body: string | null; created_at: string; reviewer?: { full_name: string; avatar_url: string | null } | null; }

export function ResellingProductClient() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { language } = useI18n();
  const { general } = useSiteConfig();
  const userId = user?.id ?? null;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [vendor, setVendor] = useState<ProductVendor | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyMessage, setBuyMessage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addingCart, setAddingCart] = useState(false);
  const [rating, setRating] = useState<{ average: number | string; count: number | string }>({ average: 0, count: 0 });
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

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
    const [categoryResult, vendorResult, ratingResult, reviewResult] = await Promise.all([
      nextProduct.category_id ? supabase.from("reselling_categories").select("id,name_en,name_bn,image_url").eq("id", nextProduct.category_id).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null }),
      nextProduct.vendor_id ? supabase.from("reselling_vendors").select("id,name,description,logo_url").eq("id", nextProduct.vendor_id).eq("is_active", true).maybeSingle() : Promise.resolve({ data: null }),
      supabase.rpc("get_reselling_product_rating", { p_product_id: nextProduct.id }),
      supabase.from("reselling_reviews").select("id,rating,body,created_at,reviewer:profiles!reselling_reviews_user_id_fkey(full_name,avatar_url)").eq("product_id", nextProduct.id).eq("is_hidden", false).order("created_at", { ascending: false }).limit(30),
    ]);
    setCategory((categoryResult.data as ProductCategory | null) ?? null);
    setVendor((vendorResult.data as ProductVendor | null) ?? null);
    setRating((ratingResult.data as { average: number | string; count: number | string } | null) ?? { average: 0, count: 0 });
    setReviews((reviewResult.data as unknown as ProductReview[]) ?? []);
    if (userId) {
      const favoriteResult = await supabase.from("reselling_favorites").select("product_id").eq("user_id", userId).eq("product_id", id).maybeSingle();
      setSaved(Boolean(favoriteResult.data));
    } else {
      setSaved(false);
    }
    setLoading(false);
  }, [params?.id, userId]);

  useEffect(() => { void load(); }, [load]);

  const toggleFavorite = async () => {
    if (!product || !userId || savingFavorite) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const wasSaved = saved;
    setSavingFavorite(true);
    setSaved(!wasSaved);
    const { error: favoriteError } = wasSaved
      ? await supabase.from("reselling_favorites").delete().eq("user_id", userId).eq("product_id", product.id)
      : await supabase.from("reselling_favorites").insert({ user_id: userId, product_id: product.id });
    if (favoriteError) setSaved(wasSaved);
    setSavingFavorite(false);
  };

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

  const addToCart = async () => {
    if (!product || addingCart) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setAddingCart(true); setBuyMessage(null);
    const { error: cartError } = await supabase.rpc("set_reselling_cart_item", { p_product_id: product.id, p_quantity: quantity });
    setBuyMessage(cartError ? cartError.message : (language === "bn" ? "প্রোডাক্ট কার্টে যোগ হয়েছে। এখন Cart থেকে অর্ডার করুন।" : "Added to cart. Open Cart to place the order."));
    setAddingCart(false);
  };

  const submitReview = async () => {
    if (!product) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setReviewMessage(null);
    const { error: reviewError } = await supabase.rpc("submit_reselling_review", { p_product_id: product.id, p_rating: reviewRating, p_body: reviewBody.trim() || null });
    if (reviewError) setReviewMessage(reviewError.message);
    else { setReviewMessage(language === "bn" ? "রিভিউ সেভ হয়েছে।" : "Your review was saved."); setReviewBody(""); await load(); }
  };

  const currentPrice = Number(product?.price ?? 0);
  const comparePrice = product?.compare_at_price == null ? null : Number(product.compare_at_price);
  const discount = comparePrice && comparePrice > currentPrice ? Math.round((1 - currentPrice / comparePrice) * 100) : 0;
  const productName = product ? localize(product.name_en, product.name_bn) : "";
  const categoryName = category ? localize(category.name_en, category.name_bn) : (language === "bn" ? "সাধারণ" : "General");
  const vendorName = vendor?.name || general.siteName;
  const stockValue = product?.stock_count == null ? (language === "bn" ? "উপলভ্য" : "Available") : product.stock_count.toLocaleString(language === "bn" ? "bn-BD" : "en");

  return <AppShell variant="hub"><main className="reselling-detail-page"><div className="reselling-detail-container">
    {loading ? <div className="reselling-detail-skeleton"><div className="skeleton" /><div className="skeleton" /></div> : error || !product ? <section className="reselling-empty-panel reselling-detail-error"><PackageOpen size={38} /><h2>{language === "bn" ? "প্রোডাক্ট পাওয়া যায়নি" : "Product not found"}</h2><p>{language === "bn" ? "প্রোডাক্টটি সরানো হয়েছে অথবা এখন আর বিক্রির জন্য নেই।" : "This product was removed or is no longer available."}</p></section> : <>
      <section className="reselling-detail-card">
        <div className="reselling-detail-media">
          {product.image_url ? <img src={product.image_url} alt={productName} /> : <PackageOpen size={72} />}
          <div className="reselling-detail-media-actions">
            <Link href="/reselling" aria-label={language === "bn" ? "রিসেলিং-এ ফিরুন" : "Back to Reselling"}><ArrowLeft size={19} /></Link>
            <button type="button" className={saved ? "saved" : ""} disabled={savingFavorite} aria-label={saved ? (language === "bn" ? "সেভ থেকে সরান" : "Remove from saved") : (language === "bn" ? "সেভ করুন" : "Save product")} aria-pressed={saved} onClick={() => void toggleFavorite()}><Heart size={19} fill={saved ? "currentColor" : "none"} /></button>
          </div>
          <div className="reselling-detail-media-badges">{product.is_featured && <span>{language === "bn" ? "জনপ্রিয়" : "Featured"}</span>}{discount > 0 && <b>-{discount}%</b>}</div>
        </div>
        <div className="reselling-detail-main">
          <div className="reselling-detail-eyebrow">{vendorName}</div>
          <div className="reselling-detail-code">{language === "bn" ? "প্রোডাক্ট আইডি" : "Product ID"} · {product.id.slice(0, 8).toUpperCase()}</div>
          <h1>{productName}</h1>
          <p className="reselling-detail-lead">{categoryName}{vendor ? ` · ${vendor.name}` : ""}</p>
          <div className="reselling-detail-rating"><span><Star size={16} fill="currentColor" />{Number(rating.average).toFixed(1)}</span><b>{Number(rating.count)} {language === "bn" ? "রিভিউ" : "reviews"}</b></div>
          <div className="reselling-detail-price"><strong>{formatMoney(currentPrice, general.currency, language)}</strong>{comparePrice && comparePrice > currentPrice && <del>{formatMoney(comparePrice, general.currency, language)}</del>}{discount > 0 && <span>{language === "bn" ? `${discount}% সাশ্রয়` : `Save ${discount}%`}</span>}</div>
          <div className={`reselling-detail-stock ${product.stock_count === 0 ? "sold-out" : ""}`}><CheckCircle2 size={16} />{product.stock_count === 0 ? (language === "bn" ? "স্টক শেষ" : "Sold out") : product.stock_count == null ? (language === "bn" ? "স্টকে আছে" : "Available") : (language === "bn" ? `${product.stock_count}টি স্টকে আছে` : `${product.stock_count} in stock`)}</div>
          <div className="reselling-detail-specs">
            <div><span><Layers3 size={17} /></span><div><small>{language === "bn" ? "ক্যাটাগরি" : "Category"}</small><strong>{categoryName}</strong></div></div>
            <div><span><Store size={17} /></span><div><small>{language === "bn" ? "ভেন্ডর" : "Vendor"}</small><strong>{vendorName}</strong></div></div>
            <div><span><PackageCheck size={17} /></span><div><small>{language === "bn" ? "স্টক" : "Stock"}</small><strong>{stockValue}</strong></div></div>
            <div><span><BadgePercent size={17} /></span><div><small>{language === "bn" ? "অফার" : "Offer"}</small><strong>{discount > 0 ? (language === "bn" ? `${discount}% ছাড়` : `${discount}% off`) : (language === "bn" ? "বর্তমান মূল্য" : "Current price")}</strong></div></div>
          </div>
          <div className="reselling-detail-cart-row"><div className="reselling-detail-quantity"><button type="button" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1,value-1))}><Minus size={16} /></button><strong>{quantity}</strong><button type="button" disabled={product.stock_count != null && quantity >= product.stock_count} onClick={() => setQuantity((value) => value+1)}><Plus size={16} /></button></div><button type="button" className="reselling-cart-button" disabled={product.stock_count === 0 || addingCart} onClick={() => void addToCart()}><ShoppingCart size={20} />{addingCart ? (language === "bn" ? "যোগ হচ্ছে…" : "Adding…") : (language === "bn" ? "কার্টে যোগ করুন" : "Add to Cart")}</button></div>
          <Link href="/reselling?view=cart" className="reselling-view-cart-link"><ShoppingCart size={17} />{language === "bn" ? "কার্ট দেখুন ও অর্ডার করুন" : "View cart and order"}</Link>
          <button type="button" className="reselling-buy-button secondary-payment" disabled={product.stock_count === 0 || buying} onClick={() => void buy()}><ShoppingBag size={20} />{buying ? (language === "bn" ? "পেমেন্ট প্রস্তুত হচ্ছে…" : "Preparing payment…") : (language === "bn" ? "সরাসরি পেমেন্ট" : "Direct payment")}</button>
          {buyMessage && <div className="reselling-payment-message"><ShieldCheck size={17} /><span>{buyMessage}</span></div>}
          <p className="reselling-payment-note"><ShieldCheck size={15} />{language === "bn" ? "পেমেন্ট গেটওয়ে চালু হলে Buy Now থেকে সরাসরি নিরাপদ পেমেন্ট হবে। সফল পেমেন্টের পর ডেলিভারির জন্য অ্যাডমিন/সাপোর্টের সাথে যোগাযোগ করা যাবে।" : "When the payment gateway is enabled, Buy Now will open secure direct payment. After a successful payment, contact admin/support for delivery."}</p>
        </div>
      </section>

      <section className="reselling-detail-description"><div className="reselling-detail-section-title"><span><FileText size={20} /></span><div><small>{language === "bn" ? "জেনে নিন" : "GOOD TO KNOW"}</small><h2>{language === "bn" ? "প্রোডাক্টের বিস্তারিত" : "Product details"}</h2></div></div><p>{localize(product.description_en, product.description_bn) || (language === "bn" ? "এই প্রোডাক্টের বিস্তারিত এখনো যোগ করা হয়নি। কেনার আগে প্রয়োজন হলে সাপোর্টে যোগাযোগ করুন।" : "No product description has been added yet. Contact support before buying if you need more information.")}</p><div className="reselling-detail-facts"><div><span>{language === "bn" ? "ক্যাটাগরি" : "Category"}</span><strong>{categoryName}</strong></div><div><span>{language === "bn" ? "ভেন্ডর" : "Vendor"}</span><strong>{vendorName}</strong></div><div><span>{language === "bn" ? "স্টক" : "Stock"}</span><strong>{stockValue}</strong></div></div></section>
      <section className="reselling-review-section"><div className="reselling-detail-section-title"><span><Star size={20} /></span><div><small>VERIFIED BUYERS</small><h2>{language === "bn" ? "রেটিং ও রিভিউ" : "Ratings & reviews"}</h2></div></div><div className="reselling-review-summary"><strong>{Number(rating.average).toFixed(1)}</strong><div><span>{Array.from({length:5},(_,index) => <Star size={18} fill={index<Math.round(Number(rating.average)) ? "currentColor" : "none"} key={index} />)}</span><small>{Number(rating.count)} {language === "bn" ? "টি রিভিউ" : "reviews"}</small></div></div><div className="reselling-review-form"><strong>{language === "bn" ? "কেনাকাটা সম্পন্ন হলে রিভিউ দিন" : "Review after a completed purchase"}</strong><div className="reselling-review-stars">{[1,2,3,4,5].map((value) => <button type="button" className={value<=reviewRating ? "active" : ""} onClick={() => setReviewRating(value)} key={value}><Star size={20} fill={value<=reviewRating ? "currentColor" : "none"} /></button>)}</div><textarea className="textarea" value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} maxLength={1000} placeholder={language === "bn" ? "আপনার অভিজ্ঞতা লিখুন…" : "Share your experience…"} /><button type="button" className="secondary-button" onClick={() => void submitReview()}>{language === "bn" ? "রিভিউ সেভ করুন" : "Save review"}</button>{reviewMessage && <div className="reselling-payment-message"><ShieldCheck size={16} />{reviewMessage}</div>}</div><div className="reselling-review-list">{reviews.length ? reviews.map((item) => <article key={item.id}><div>{item.reviewer?.avatar_url ? <img src={item.reviewer.avatar_url} alt="" /> : <span><Store size={17} /></span>}<p><strong>{item.reviewer?.full_name || (language === "bn" ? "ক্রেতা" : "Buyer")}</strong><small>{new Date(item.created_at).toLocaleDateString()}</small></p><b>{Array.from({length:5},(_,index) => <Star size={13} fill={index<item.rating ? "currentColor" : "none"} key={index} />)}</b></div>{item.body && <p>{item.body}</p>}</article>) : <p className="muted">{language === "bn" ? "এখনো কোনো রিভিউ নেই।" : "No reviews yet."}</p>}</div></section>
      {vendor && <section className="reselling-detail-vendor">{vendor.logo_url ? <img src={vendor.logo_url} alt="" /> : <span><Store size={25} /></span>}<div><small>{language === "bn" ? "ভেন্ডর" : "Vendor"}</small><strong>{vendor.name}</strong>{vendor.description && <p>{vendor.description}</p>}</div></section>}
    </>}
  </div></main></AppShell>;
}

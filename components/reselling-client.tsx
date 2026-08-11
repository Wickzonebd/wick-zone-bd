"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  Heart,
  LayoutGrid,
  PackageCheck,
  PackageOpen,
  Search,
  Minus,
  MessageSquareText,
  Plus,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Trash2,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface ResellingCategory {
  id: string;
  name_en: string;
  name_bn: string | null;
  image_url: string | null;
  sort_order: number;
}

interface ResellingVendor {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  sort_order: number;
}

interface ResellingBanner {
  id: string;
  title_en: string;
  title_bn: string | null;
  subtitle_en: string | null;
  subtitle_bn: string | null;
  image_url: string | null;
  destination_url: string | null;
  sort_order: number;
}

interface ResellingProduct {
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
  sort_order: number;
  created_at: string;
}

interface CartItem { product_id: string; name_en: string; name_bn: string | null; image_url: string | null; price: number | string; stock_count: number | null; quantity: number; line_total: number | string; }
interface CartSummary { items: CartItem[]; item_count: number | string; subtotal: number | string; }
interface CustomerOrder { id: string; order_code: string; status: string; payment_status: string; subtotal: number | string; discount: number | string; total: number | string; admin_note: string | null; created_at: string; items?: Array<{ id: string; product_name: string; quantity: number; line_total: number | string; image_url: string | null }>; }

type ResellingView = "shop" | "cart" | "orders" | "vendors" | "categories" | "favorites";

export function ResellingClient() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const [categories, setCategories] = useState<ResellingCategory[]>([]);
  const [vendors, setVendors] = useState<ResellingVendor[]>([]);
  const [banners, setBanners] = useState<ResellingBanner[]>([]);
  const [products, setProducts] = useState<ResellingProduct[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<ResellingView>("shop");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cart, setCart] = useState<CartSummary>({ items: [], item_count: 0, subtotal: 0 });
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [sort, setSort] = useState<"featured" | "newest" | "price_low" | "price_high">("featured");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [checkout, setCheckout] = useState({ name: profile?.full_name ?? "", mobile: "", address: "", note: "", coupon: "" });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [storeMessage, setStoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const localize = useCallback((english: string, bangla: string | null | undefined) => language === "bn" && bangla ? bangla : english, [language]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    setLoading(true); setError(false);
    const favoriteQuery = user
      ? supabase.from("reselling_favorites").select("product_id").eq("user_id", user.id)
      : Promise.resolve({ data: [], error: null });
    const cartQuery = user ? supabase.rpc("get_my_reselling_cart") : Promise.resolve({ data: { items: [], item_count: 0, subtotal: 0 }, error: null });
    const orderQuery = user ? supabase.from("reselling_orders").select("id,order_code,status,payment_status,subtotal,discount,total,admin_note,created_at,items:reselling_order_items(id,product_name,quantity,line_total,image_url)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null });
    const [categoryResult, vendorResult, bannerResult, productResult, favoriteResult, cartResult, orderResult] = await Promise.all([
      supabase.from("reselling_categories").select("id,name_en,name_bn,image_url,sort_order").eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("reselling_vendors").select("id,name,description,logo_url,website_url,sort_order").eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("reselling_banners").select("id,title_en,title_bn,subtitle_en,subtitle_bn,image_url,destination_url,sort_order").eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("reselling_products").select("id,category_id,vendor_id,name_en,name_bn,description_en,description_bn,image_url,price,compare_at_price,stock_count,is_featured,sort_order,created_at").eq("is_active", true).order("sort_order").order("created_at", { ascending: false }),
      favoriteQuery,
      cartQuery,
      orderQuery,
    ]);
    const hasError = Boolean(categoryResult.error || vendorResult.error || bannerResult.error || productResult.error || favoriteResult.error || cartResult.error || orderResult.error);
    setCategories((categoryResult.data as ResellingCategory[]) ?? []);
    setVendors((vendorResult.data as ResellingVendor[]) ?? []);
    setBanners((bannerResult.data as ResellingBanner[]) ?? []);
    setProducts((productResult.data as ResellingProduct[]) ?? []);
    setFavorites(new Set(((favoriteResult.data as Array<{ product_id: string }> | null) ?? []).map((item) => item.product_id)));
    setCart((cartResult.data as CartSummary | null) ?? { items: [], item_count: 0, subtotal: 0 });
    setOrders((orderResult.data as unknown as CustomerOrder[]) ?? []);
    setError(hasError); setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const requested = searchParams.get("view"); if (requested === "orders" || requested === "cart" || requested === "favorites") setView(requested); }, [searchParams]);

  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const vendorById = useMemo(() => new Map(vendors.map((item) => [item.id, item])), [vendors]);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (view === "favorites" && !favorites.has(product.id)) return false;
      if (selectedCategory !== "all" && product.category_id !== selectedCategory) return false;
      if (selectedVendor && product.vendor_id !== selectedVendor) return false;
      if (inStockOnly && product.stock_count === 0) return false;
      if (!needle) return true;
      const category = product.category_id ? categoryById.get(product.category_id) : null;
      const vendor = product.vendor_id ? vendorById.get(product.vendor_id) : null;
      return [product.name_en, product.name_bn, product.description_en, product.description_bn, category?.name_en, category?.name_bn, vendor?.name]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(needle);
    }).sort((left,right) => {
      if (sort === "price_low") return Number(left.price)-Number(right.price);
      if (sort === "price_high") return Number(right.price)-Number(left.price);
      if (sort === "featured") return Number(right.is_featured)-Number(left.is_featured) || left.sort_order-right.sort_order;
      return new Date(right.created_at).getTime()-new Date(left.created_at).getTime();
    });
  }, [products, view, favorites, selectedCategory, selectedVendor, query, categoryById, vendorById, inStockOnly, sort]);

  const setCartItem = async (productId: string, quantity: number) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error: cartError } = await supabase.rpc("set_reselling_cart_item", { p_product_id: productId, p_quantity: Math.max(0,quantity) });
    if (cartError) setStoreMessage({ type: "error", text: cartError.message });
    else { setStoreMessage({ type: "success", text: quantity > 0 ? (language === "bn" ? "কার্ট আপডেট হয়েছে।" : "Cart updated.") : (language === "bn" ? "প্রোডাক্ট সরানো হয়েছে।" : "Product removed.") }); await load(); }
  };

  const placeOrder = async () => {
    if (!checkout.name.trim() || !checkout.mobile.trim() || !checkout.address.trim()) { setStoreMessage({ type: "error", text: language === "bn" ? "নাম, মোবাইল ও ঠিকানা পূরণ করুন।" : "Complete your name, mobile and address." }); return; }
    if (!window.confirm(language === "bn" ? `মোট ${formatMoney(Number(cart.subtotal),general.currency,"bn")} টাকার নিরাপদ পেমেন্টে যাবেন?` : `Continue to secure payment for ${formatMoney(Number(cart.subtotal),general.currency,"en")}?`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setPlacingOrder(true); setStoreMessage(null);
    const { data, error: orderError } = await supabase.rpc("place_reselling_order", { p_contact_name: checkout.name.trim(), p_contact_mobile: checkout.mobile.trim(), p_delivery_address: checkout.address.trim(), p_customer_note: checkout.note.trim() || null, p_coupon_code: checkout.coupon.trim() || null });
    if (orderError) setStoreMessage({ type: "error", text: orderError.message });
    else {
      const result = data as { order_code?: string; payment_url?: string } | null;
      if (!result?.payment_url) {
        setStoreMessage({ type: "error", text: language === "bn" ? "অর্ডারটি পেমেন্টের জন্য প্রস্তুত করা যায়নি।" : "The order could not be prepared for payment." });
      } else {
        setStoreMessage({ type: "success", text: language === "bn" ? `অর্ডার ${result.order_code ?? ""} তৈরি হয়েছে। নিরাপদ পেমেন্টে নেওয়া হচ্ছে…` : `Order ${result.order_code ?? ""} is ready. Opening secure payment…` });
        setCheckout((value) => ({ ...value, note: "", coupon: "" }));
        window.location.assign(result.payment_url);
        return;
      }
    }
    setPlacingOrder(false);
  };

  const toggleFavorite = async (productId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const alreadySaved = favorites.has(productId);
    setFavorites((current) => { const next = new Set(current); if (alreadySaved) next.delete(productId); else next.add(productId); return next; });
    const result = alreadySaved
      ? await supabase.from("reselling_favorites").delete().eq("user_id", user.id).eq("product_id", productId)
      : await supabase.from("reselling_favorites").insert({ user_id: user.id, product_id: productId });
    if (result.error) {
      setFavorites((current) => { const next = new Set(current); if (alreadySaved) next.add(productId); else next.delete(productId); return next; });
    }
  };

  const openShop = (categoryId = "all", vendorId: string | null = null) => {
    setView("shop"); setSelectedCategory(categoryId); setSelectedVendor(vendorId);
  };

  const quickActions = [
    { id: "cart" as const, label: language === "bn" ? `কার্ট (${Number(cart.item_count)})` : `Cart (${Number(cart.item_count)})`, icon: ShoppingCart },
    { id: "orders" as const, label: t("reselling.orders"), icon: ClipboardList },
    { id: "vendors" as const, label: t("reselling.vendors"), icon: Store },
    { id: "categories" as const, label: t("reselling.categories"), icon: LayoutGrid },
    { id: "favorites" as const, label: t("reselling.favorites"), icon: Heart },
  ];

  return <AppShell variant="hub"><main className="reselling-page"><div className="reselling-container">
    <section className="reselling-top-card">
      <div className="reselling-hero-intro"><div className="reselling-hero-copy"><span className="reselling-store-kicker"><Sparkles size={13} />{language === "bn" ? "ডিজিটাল মার্কেটপ্লেস" : "DIGITAL MARKETPLACE"}</span><h1>{general.siteName} <b>{language === "bn" ? "স্টোর" : "Store"}</b></h1><p>{language === "bn" ? "বিশ্বস্ত ভেন্ডরের প্রোডাক্ট, পরিষ্কার দাম ও সহজ অর্ডার—সব এক জায়গায়।" : "Products from listed vendors, clear pricing and an easy path to order—all in one storefront."}</p></div><div className="reselling-hero-art"><ShoppingBag size={34} /><span><Boxes size={18} /></span></div></div>
      <div className="reselling-store-stats"><div><strong>{products.length}</strong><span>{language === "bn" ? "প্রোডাক্ট" : "Products"}</span></div><div><strong>{categories.length}</strong><span>{language === "bn" ? "ক্যাটাগরি" : "Categories"}</span></div><div><strong>{Number(cart.item_count)}</strong><span>{language === "bn" ? "কার্টে" : "In cart"}</span></div></div>
      <div className="reselling-search"><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("reselling.search")} aria-label={t("reselling.search")} /></div>
    </section>

    {loading ? <div className="reselling-banner-skeleton" /> : banners.length > 0 ? <div className="reselling-banner-strip">{banners.slice(0, 3).map((banner) => {
      const content = <><div className="reselling-banner-copy"><strong>{localize(banner.title_en, banner.title_bn)}</strong>{(banner.subtitle_en || banner.subtitle_bn) && <span>{localize(banner.subtitle_en ?? "", banner.subtitle_bn)}</span>}</div>{banner.image_url && <img src={banner.image_url} alt="" loading="lazy" />}</>;
      return banner.destination_url ? <a className="reselling-banner" href={banner.destination_url} target="_blank" rel="noreferrer" key={banner.id}>{content}</a> : <article className="reselling-banner" key={banner.id}>{content}</article>;
    })}</div> : <div className="reselling-banner reselling-brand-banner"><div className="reselling-banner-copy"><strong>Taskora {t("common.reselling")}</strong><span>{t("reselling.emptyBanner")}</span></div><Boxes size={54} /></div>}

    <section className="reselling-shortcuts" aria-label={t("reselling.quickLinks")}>
      {quickActions.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSelectedCategory("all"); setSelectedVendor(null); }}><span><Icon size={23} fill={id === "favorites" && view === "favorites" ? "currentColor" : "none"} /></span><strong>{label}</strong></button>)}
    </section>

    {error && <div className="form-message error">{t("common.error")}</div>}
    {storeMessage && <div className={`form-message ${storeMessage.type} reselling-store-message`}>{storeMessage.text}<button type="button" onClick={() => setStoreMessage(null)}>×</button></div>}

    {view === "cart" && <section className="reselling-cart-section">
      <div className="reselling-section-head"><div><h2>{language === "bn" ? "আপনার শপিং কার্ট" : "Your shopping cart"}</h2><small>{Number(cart.item_count)} {language === "bn" ? "টি আইটেম" : "items"}</small></div><button type="button" onClick={() => openShop()}>{t("reselling.browse")}</button></div>
      {cart.items.length ? <div className="reselling-cart-layout">
        <div className="reselling-cart-items">{cart.items.map((item) => <article className="reselling-cart-item" key={item.product_id}>{item.image_url ? <img src={item.image_url} alt="" /> : <span className="reselling-cart-placeholder"><PackageOpen size={24} /></span>}<div className="reselling-cart-copy"><strong>{localize(item.name_en,item.name_bn)}</strong><small>{formatMoney(Number(item.price),general.currency,language)} {language === "bn" ? "প্রতি ইউনিট" : "each"}</small><div className="reselling-cart-quantity"><button type="button" onClick={() => void setCartItem(item.product_id,item.quantity-1)}><Minus size={15} /></button><b>{item.quantity}</b><button type="button" disabled={item.stock_count != null && item.quantity >= item.stock_count} onClick={() => void setCartItem(item.product_id,item.quantity+1)}><Plus size={15} /></button><button type="button" className="remove" onClick={() => void setCartItem(item.product_id,0)}><Trash2 size={15} />{language === "bn" ? "সরান" : "Remove"}</button></div></div><strong className="reselling-cart-line-total">{formatMoney(Number(item.line_total),general.currency,language)}</strong></article>)}</div>
        <div className="reselling-checkout-card">
          <div className="reselling-checkout-title"><ShoppingCart size={21} /><div><strong>{language === "bn" ? "নিরাপদ চেকআউট" : "Secure checkout"}</strong><small>{language === "bn" ? "পেমেন্ট যাচাই না হওয়া পর্যন্ত অর্ডার প্রসেস হবে না" : "The order stays on hold until payment is verified"}</small></div></div>
          <div className="field"><label>{language === "bn" ? "আপনার নাম" : "Your name"}</label><input className="input" value={checkout.name} onChange={(event) => setCheckout((value) => ({ ...value,name:event.target.value }))} /></div>
          <div className="field"><label>{language === "bn" ? "মোবাইল নম্বর" : "Mobile number"}</label><input className="input" value={checkout.mobile} onChange={(event) => setCheckout((value) => ({ ...value,mobile:event.target.value }))} /></div>
          <div className="field"><label>{language === "bn" ? "ডেলিভারি/যোগাযোগের ঠিকানা" : "Delivery/contact address"}</label><textarea className="textarea" value={checkout.address} onChange={(event) => setCheckout((value) => ({ ...value,address:event.target.value }))} maxLength={500} /></div>
          <div className="field"><label>{language === "bn" ? "কুপন কোড" : "Coupon code"}</label><div className="input-wrap"><Tag size={18} /><input className="input with-icon" value={checkout.coupon} onChange={(event) => setCheckout((value) => ({ ...value,coupon:event.target.value.toUpperCase() }))} placeholder="TASKORA10" /></div></div>
          <div className="field"><label>{language === "bn" ? "নোট (ঐচ্ছিক)" : "Note (optional)"}</label><textarea className="textarea" value={checkout.note} onChange={(event) => setCheckout((value) => ({ ...value,note:event.target.value }))} maxLength={1000} /></div>
          <div className="reselling-checkout-total"><span>{language === "bn" ? "সাবটোটাল" : "Subtotal"}</span><strong>{formatMoney(Number(cart.subtotal),general.currency,language)}</strong></div>
          <button type="button" className="reselling-checkout-button" onClick={() => void placeOrder()} disabled={placingOrder}>{placingOrder ? (language === "bn" ? "চেকআউট প্রস্তুত হচ্ছে…" : "Preparing checkout…") : (language === "bn" ? "পেমেন্টে এগিয়ে যান" : "Continue to payment")}</button>
        </div>
      </div> : <div className="reselling-empty-panel"><ShoppingCart size={36} /><h2>{language === "bn" ? "কার্ট খালি" : "Your cart is empty"}</h2><p>{language === "bn" ? "প্রোডাক্টের নিচে Add to Cart চাপুন।" : "Use Add to Cart from any product card."}</p><button type="button" className="primary-button compact" onClick={() => openShop()}>{t("reselling.browse")}</button></div>}
    </section>}

    {view === "orders" && <section className="reselling-orders-section">
      <div className="reselling-section-head"><div><h2>{t("reselling.orders")}</h2><small>{language === "bn" ? "যাচাইকৃত পেমেন্ট ছাড়া কোনো অর্ডার প্রসেস হবে না" : "Orders are processed only after verified payment"}</small></div><button type="button" onClick={() => openShop()}>{t("reselling.browse")}</button></div>
      {orders.length ? <div className="reselling-order-list">{orders.map((order) => {
        const paid = order.payment_status === "paid";
        return <article className="reselling-order-card" key={order.id}>
          <div className="reselling-order-head"><div><span>{order.order_code}</span><strong>{new Date(order.created_at).toLocaleString(language === "bn" ? "bn-BD" : "en")}</strong></div><b className={`reselling-order-status ${paid ? order.status : "pending"}`}>{paid ? order.status : (language === "bn" ? "পেমেন্ট বাকি" : "Awaiting payment")}</b></div>
          <div className="reselling-order-items">{(order.items ?? []).map((line) => <div key={line.id}>{line.image_url ? <img src={line.image_url} alt="" /> : <span><PackageOpen size={17} /></span>}<p><strong>{line.product_name}</strong><small>{line.quantity} × {formatMoney(Number(line.line_total)/Math.max(1,line.quantity),general.currency,language)}</small></p><b>{formatMoney(Number(line.line_total),general.currency,language)}</b></div>)}</div>
          <div className="reselling-order-total"><span>{Number(order.discount)>0 ? `${language === "bn" ? "ডিসকাউন্ট" : "Discount"}: −${formatMoney(Number(order.discount),general.currency,language)}` : (language === "bn" ? "মোট" : "Total")}</span><strong>{formatMoney(Number(order.total),general.currency,language)}</strong></div>
          {!paid && order.status !== "cancelled" && <Link className="primary-button compact" href={`/payment/checkout?type=reselling&itemId=${encodeURIComponent(order.id)}`}>{language === "bn" ? "এখন পেমেন্ট করুন" : "Pay now"}</Link>}
          {order.admin_note && <div className="reselling-order-note"><MessageSquareText size={16} />{order.admin_note}</div>}
        </article>;
      })}</div> : <div className="reselling-empty-panel"><ClipboardList size={36} /><h2>{t("reselling.orders")}</h2><p>{t("reselling.noOrders")}</p><button type="button" className="primary-button compact" onClick={() => openShop()}>{t("reselling.browse")}</button></div>}
    </section>}

    {view === "vendors" && <section className="reselling-section"><div className="reselling-section-head"><h2>{t("reselling.vendors")}</h2><button type="button" onClick={() => openShop()}>{t("reselling.allProducts")}</button></div>{vendors.length ? <div className="reselling-directory-grid">{vendors.map((vendor) => <button type="button" className="reselling-directory-card" key={vendor.id} onClick={() => openShop("all", vendor.id)}>{vendor.logo_url ? <img src={vendor.logo_url} alt="" loading="lazy" /> : <span className="reselling-directory-icon"><Store size={25} /></span>}<div><strong>{vendor.name}</strong>{vendor.description && <small>{vendor.description}</small>}</div></button>)}</div> : <div className="reselling-empty-panel compact"><Store size={30} /><p>{t("reselling.noVendors")}</p></div>}</section>}

    {view === "categories" && <section className="reselling-section"><div className="reselling-section-head"><h2>{t("reselling.categories")}</h2><button type="button" onClick={() => openShop()}>{t("reselling.allProducts")}</button></div>{categories.length ? <div className="reselling-directory-grid">{categories.map((category) => <button type="button" className="reselling-directory-card category" key={category.id} onClick={() => openShop(category.id)}>{category.image_url ? <img src={category.image_url} alt="" loading="lazy" /> : <span className="reselling-directory-icon"><LayoutGrid size={25} /></span>}<div><strong>{localize(category.name_en, category.name_bn)}</strong></div></button>)}</div> : <div className="reselling-empty-panel compact"><LayoutGrid size={30} /><p>{t("reselling.noCategories")}</p></div>}</section>}

    {(view === "shop" || view === "favorites") && <>
      {view === "shop" && <section className="reselling-category-strip-wrap"><div className="reselling-section-head"><h2>{t("reselling.categories")}</h2>{categories.length > 0 && <button type="button" onClick={() => setView("categories")}>{t("reselling.viewAll")}</button>}</div><div className="reselling-category-strip"><button type="button" className={selectedCategory === "all" ? "active" : ""} onClick={() => { setSelectedCategory("all"); setSelectedVendor(null); }}><span><LayoutGrid size={22} /></span><strong>{t("reselling.all")}</strong></button>{categories.map((category) => <button type="button" className={selectedCategory === category.id ? "active" : ""} key={category.id} onClick={() => { setSelectedCategory(category.id); setSelectedVendor(null); }}>{category.image_url ? <img src={category.image_url} alt="" loading="lazy" /> : <span><PackageOpen size={22} /></span>}<strong>{localize(category.name_en, category.name_bn)}</strong></button>)}</div></section>}

      <section className="reselling-section reselling-products-section">
        <div className="reselling-section-head"><div><h2>{view === "favorites" ? t("reselling.favorites") : t("reselling.popular")}</h2>{selectedVendor && <small>{vendorById.get(selectedVendor)?.name}</small>}</div>{(selectedCategory !== "all" || selectedVendor) && <button type="button" onClick={() => openShop()}>{t("reselling.clearFilter")}</button>}</div>
        <div className="reselling-product-tools"><span><SlidersHorizontal size={17} />{language === "bn" ? "সাজান ও ফিল্টার" : "Sort & filter"}</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="featured">{language === "bn" ? "জনপ্রিয় আগে" : "Featured first"}</option><option value="newest">{language === "bn" ? "নতুন আগে" : "Newest"}</option><option value="price_low">{language === "bn" ? "কম দাম আগে" : "Price: low to high"}</option><option value="price_high">{language === "bn" ? "বেশি দাম আগে" : "Price: high to low"}</option></select><label><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />{language === "bn" ? "শুধু স্টকে" : "In stock only"}</label></div>
        {loading ? <div className="reselling-product-grid">{[0,1,2,3].map((item) => <div className="reselling-product-skeleton" key={item} />)}</div> : visibleProducts.length ? <div className="reselling-product-grid">{visibleProducts.map((product) => {
          const category = product.category_id ? categoryById.get(product.category_id) : null;
          const vendor = product.vendor_id ? vendorById.get(product.vendor_id) : null;
          const saved = favorites.has(product.id);
          const price = Number(product.price);
          const comparePrice = product.compare_at_price == null ? null : Number(product.compare_at_price);
          const discount = comparePrice && comparePrice > price ? Math.round((1 - price / comparePrice) * 100) : 0;
          const cartItem = cart.items.find((item) => item.product_id === product.id);
          return <article className="reselling-product-card" key={product.id}><Link href={`/reselling/${product.id}`} className="reselling-product-link"><div className="reselling-product-image">{product.image_url ? <img src={product.image_url} alt={localize(product.name_en, product.name_bn)} loading="lazy" /> : <PackageOpen size={40} />}{product.is_featured && <span className="reselling-featured">{t("reselling.featured")}</span>}{discount > 0 && <span className="reselling-discount">-{discount}%</span>}</div><div className="reselling-product-body"><small>{vendor?.name || (category ? localize(category.name_en, category.name_bn) : general.siteName)}</small><h3>{localize(product.name_en, product.name_bn)}</h3><div className="reselling-product-price"><strong>{formatMoney(price, general.currency, language)}</strong>{comparePrice && comparePrice > price && <del>{formatMoney(comparePrice, general.currency, language)}</del>}</div><div className={`reselling-product-availability ${product.stock_count === 0 ? "sold-out" : ""}`}><span><PackageCheck size={13} />{product.stock_count === 0 ? t("reselling.soldOut") : (language === "bn" ? "স্টকে আছে" : "In stock")}</span><b>{language === "bn" ? "বিস্তারিত" : "Details"} →</b></div></div></Link><button type="button" className={`reselling-favorite ${saved ? "saved" : ""}`} aria-label={t("reselling.favorites")} onClick={() => void toggleFavorite(product.id)}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button><button type="button" className={`reselling-add-cart ${cartItem ? "added" : ""}`} disabled={product.stock_count === 0} onClick={() => void setCartItem(product.id,(cartItem?.quantity ?? 0)+1)}><ShoppingCart size={16} />{cartItem ? `${language === "bn" ? "কার্টে" : "In cart"} · ${cartItem.quantity}` : (language === "bn" ? "কার্টে যোগ করুন" : "Add to cart")}</button></article>;
        })}</div> : <div className="reselling-empty-panel compact"><PackageOpen size={34} /><p>{view === "favorites" ? t("reselling.noFavorites") : t("reselling.noProducts")}</p>{view === "favorites" && <button type="button" className="primary-button compact" onClick={() => openShop()}>{t("reselling.browse")}</button>}</div>}
      </section>
    </>}
  </div></main></AppShell>;
}

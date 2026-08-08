"use client";

import {
  Boxes,
  ClipboardList,
  Heart,
  LayoutGrid,
  PackageOpen,
  Search,
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
}

type ResellingView = "shop" | "orders" | "vendors" | "categories" | "favorites";

export function ResellingClient() {
  const { user } = useAuth();
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

  const localize = useCallback((english: string, bangla: string | null | undefined) => language === "bn" && bangla ? bangla : english, [language]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    setLoading(true); setError(false);
    const favoriteQuery = user
      ? supabase.from("reselling_favorites").select("product_id").eq("user_id", user.id)
      : Promise.resolve({ data: [], error: null });
    const [categoryResult, vendorResult, bannerResult, productResult, favoriteResult] = await Promise.all([
      supabase.from("reselling_categories").select("id,name_en,name_bn,image_url,sort_order").eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("reselling_vendors").select("id,name,description,logo_url,website_url,sort_order").eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("reselling_banners").select("id,title_en,title_bn,subtitle_en,subtitle_bn,image_url,destination_url,sort_order").eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("reselling_products").select("id,category_id,vendor_id,name_en,name_bn,description_en,description_bn,image_url,price,compare_at_price,stock_count,is_featured,sort_order").eq("is_active", true).order("sort_order").order("created_at", { ascending: false }),
      favoriteQuery,
    ]);
    const hasError = Boolean(categoryResult.error || vendorResult.error || bannerResult.error || productResult.error || favoriteResult.error);
    setCategories((categoryResult.data as ResellingCategory[]) ?? []);
    setVendors((vendorResult.data as ResellingVendor[]) ?? []);
    setBanners((bannerResult.data as ResellingBanner[]) ?? []);
    setProducts((productResult.data as ResellingProduct[]) ?? []);
    setFavorites(new Set(((favoriteResult.data as Array<{ product_id: string }> | null) ?? []).map((item) => item.product_id)));
    setError(hasError); setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const vendorById = useMemo(() => new Map(vendors.map((item) => [item.id, item])), [vendors]);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      if (view === "favorites" && !favorites.has(product.id)) return false;
      if (selectedCategory !== "all" && product.category_id !== selectedCategory) return false;
      if (selectedVendor && product.vendor_id !== selectedVendor) return false;
      if (!needle) return true;
      const category = product.category_id ? categoryById.get(product.category_id) : null;
      const vendor = product.vendor_id ? vendorById.get(product.vendor_id) : null;
      return [product.name_en, product.name_bn, product.description_en, product.description_bn, category?.name_en, category?.name_bn, vendor?.name]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(needle);
    });
  }, [products, view, favorites, selectedCategory, selectedVendor, query, categoryById, vendorById]);

  const toggleFavorite = async (productId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const alreadySaved = favorites.has(productId);
    setFavorites((current) => { const next = new Set(current); alreadySaved ? next.delete(productId) : next.add(productId); return next; });
    const result = alreadySaved
      ? await supabase.from("reselling_favorites").delete().eq("user_id", user.id).eq("product_id", productId)
      : await supabase.from("reselling_favorites").insert({ user_id: user.id, product_id: productId });
    if (result.error) {
      setFavorites((current) => { const next = new Set(current); alreadySaved ? next.add(productId) : next.delete(productId); return next; });
    }
  };

  const openShop = (categoryId = "all", vendorId: string | null = null) => {
    setView("shop"); setSelectedCategory(categoryId); setSelectedVendor(vendorId);
  };

  const quickActions = [
    { id: "orders" as const, label: t("reselling.orders"), icon: ClipboardList },
    { id: "vendors" as const, label: t("reselling.vendors"), icon: Store },
    { id: "categories" as const, label: t("reselling.categories"), icon: LayoutGrid },
    { id: "favorites" as const, label: t("reselling.favorites"), icon: Heart },
  ];

  return <AppShell variant="hub"><main className="reselling-page"><div className="reselling-container">
    <section className="reselling-top-card">
      <div className="reselling-title-row"><div><span>Taskora</span><h1>{t("reselling.title")}</h1></div><Boxes size={30} /></div>
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

    {view === "orders" && <section className="reselling-empty-panel"><ClipboardList size={36} /><h2>{t("reselling.orders")}</h2><p>{t("reselling.noOrders")}</p><button type="button" className="primary-button compact" onClick={() => openShop()}>{t("reselling.browse")}</button></section>}

    {view === "vendors" && <section className="reselling-section"><div className="reselling-section-head"><h2>{t("reselling.vendors")}</h2><button type="button" onClick={() => openShop()}>{t("reselling.allProducts")}</button></div>{vendors.length ? <div className="reselling-directory-grid">{vendors.map((vendor) => <button type="button" className="reselling-directory-card" key={vendor.id} onClick={() => openShop("all", vendor.id)}>{vendor.logo_url ? <img src={vendor.logo_url} alt="" loading="lazy" /> : <span className="reselling-directory-icon"><Store size={25} /></span>}<div><strong>{vendor.name}</strong>{vendor.description && <small>{vendor.description}</small>}</div></button>)}</div> : <div className="reselling-empty-panel compact"><Store size={30} /><p>{t("reselling.noVendors")}</p></div>}</section>}

    {view === "categories" && <section className="reselling-section"><div className="reselling-section-head"><h2>{t("reselling.categories")}</h2><button type="button" onClick={() => openShop()}>{t("reselling.allProducts")}</button></div>{categories.length ? <div className="reselling-directory-grid">{categories.map((category) => <button type="button" className="reselling-directory-card category" key={category.id} onClick={() => openShop(category.id)}>{category.image_url ? <img src={category.image_url} alt="" loading="lazy" /> : <span className="reselling-directory-icon"><LayoutGrid size={25} /></span>}<div><strong>{localize(category.name_en, category.name_bn)}</strong></div></button>)}</div> : <div className="reselling-empty-panel compact"><LayoutGrid size={30} /><p>{t("reselling.noCategories")}</p></div>}</section>}

    {(view === "shop" || view === "favorites") && <>
      {view === "shop" && <section className="reselling-category-strip-wrap"><div className="reselling-section-head"><h2>{t("reselling.categories")}</h2>{categories.length > 0 && <button type="button" onClick={() => setView("categories")}>{t("reselling.viewAll")}</button>}</div><div className="reselling-category-strip"><button type="button" className={selectedCategory === "all" ? "active" : ""} onClick={() => { setSelectedCategory("all"); setSelectedVendor(null); }}><span><LayoutGrid size={22} /></span><strong>{t("reselling.all")}</strong></button>{categories.map((category) => <button type="button" className={selectedCategory === category.id ? "active" : ""} key={category.id} onClick={() => { setSelectedCategory(category.id); setSelectedVendor(null); }}>{category.image_url ? <img src={category.image_url} alt="" loading="lazy" /> : <span><PackageOpen size={22} /></span>}<strong>{localize(category.name_en, category.name_bn)}</strong></button>)}</div></section>}

      <section className="reselling-section reselling-products-section">
        <div className="reselling-section-head"><div><h2>{view === "favorites" ? t("reselling.favorites") : t("reselling.popular")}</h2>{selectedVendor && <small>{vendorById.get(selectedVendor)?.name}</small>}</div>{(selectedCategory !== "all" || selectedVendor) && <button type="button" onClick={() => openShop()}>{t("reselling.clearFilter")}</button>}</div>
        {loading ? <div className="reselling-product-grid">{[0,1,2,3].map((item) => <div className="reselling-product-skeleton" key={item} />)}</div> : visibleProducts.length ? <div className="reselling-product-grid">{visibleProducts.map((product) => {
          const category = product.category_id ? categoryById.get(product.category_id) : null;
          const vendor = product.vendor_id ? vendorById.get(product.vendor_id) : null;
          const saved = favorites.has(product.id);
          return <article className="reselling-product-card" key={product.id}><div className="reselling-product-image">{product.image_url ? <img src={product.image_url} alt={localize(product.name_en, product.name_bn)} loading="lazy" /> : <PackageOpen size={40} />}{product.is_featured && <span className="reselling-featured">{t("reselling.featured")}</span>}<button type="button" className={`reselling-favorite ${saved ? "saved" : ""}`} aria-label={t("reselling.favorites")} onClick={() => void toggleFavorite(product.id)}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button></div><div className="reselling-product-body"><small>{vendor?.name || (category ? localize(category.name_en, category.name_bn) : "Taskora")}</small><h3>{localize(product.name_en, product.name_bn)}</h3><div className="reselling-product-price"><strong>{formatMoney(Number(product.price), general.currency, language)}</strong>{product.compare_at_price && Number(product.compare_at_price) > Number(product.price) && <del>{formatMoney(Number(product.compare_at_price), general.currency, language)}</del>}</div>{product.stock_count === 0 && <span className="reselling-sold-out">{t("reselling.soldOut")}</span>}</div></article>;
        })}</div> : <div className="reselling-empty-panel compact"><PackageOpen size={34} /><p>{view === "favorites" ? t("reselling.noFavorites") : t("reselling.noProducts")}</p>{view === "favorites" && <button type="button" className="primary-button compact" onClick={() => openShop()}>{t("reselling.browse")}</button>}</div>}
      </section>
    </>}
  </div></main></AppShell>;
}

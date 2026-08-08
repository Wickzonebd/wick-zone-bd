"use client";

import { Edit3, ImageIcon, Layers3, PackageOpen, Plus, RefreshCw, Store, ToggleLeft, ToggleRight, Trash2, UploadCloud, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeFileName } from "@/lib/url";

type Section = "products" | "categories" | "vendors" | "banners";
type EntityTable = "reselling_products" | "reselling_categories" | "reselling_vendors" | "reselling_banners";

interface Category { id: string; name_en: string; name_bn: string | null; image_url: string | null; sort_order: number; is_active: boolean; }
interface Vendor { id: string; name: string; description: string | null; logo_url: string | null; website_url: string | null; sort_order: number; is_active: boolean; }
interface Banner { id: string; title_en: string; title_bn: string | null; subtitle_en: string | null; subtitle_bn: string | null; image_url: string | null; destination_url: string | null; sort_order: number; is_active: boolean; }
interface Product { id: string; category_id: string | null; vendor_id: string | null; name_en: string; name_bn: string | null; description_en: string | null; description_bn: string | null; image_url: string | null; price: number | string; compare_at_price: number | string | null; stock_count: number | null; is_featured: boolean; sort_order: number; is_active: boolean; }

const emptyProduct = { categoryId: "", vendorId: "", nameEn: "", nameBn: "", descriptionEn: "", descriptionBn: "", imageUrl: "", price: "", compareAtPrice: "", stockCount: "", sortOrder: "0", isFeatured: false, isActive: true };
const emptyCategory = { nameEn: "", nameBn: "", imageUrl: "", sortOrder: "0", isActive: true };
const emptyVendor = { name: "", description: "", logoUrl: "", websiteUrl: "", sortOrder: "0", isActive: true };
const emptyBanner = { titleEn: "", titleBn: "", subtitleEn: "", subtitleBn: "", imageUrl: "", destinationUrl: "", sortOrder: "0", isActive: true };

export function AdminResellingManager({ currency }: { currency: string }) {
  const [section, setSection] = useState<Section>("products");
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productDraft, setProductDraft] = useState(() => ({ ...emptyProduct }));
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [categoryDraft, setCategoryDraft] = useState(() => ({ ...emptyCategory }));
  const [vendorDraft, setVendorDraft] = useState(() => ({ ...emptyVendor }));
  const [bannerDraft, setBannerDraft] = useState(() => ({ ...emptyBanner }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setMessage({ type: "error", text: "Reselling catalog is temporarily unavailable." }); setLoading(false); return; }
    setLoading(true);
    const [productResult, categoryResult, vendorResult, bannerResult] = await Promise.all([
      supabase.from("reselling_products").select("id,category_id,vendor_id,name_en,name_bn,description_en,description_bn,image_url,price,compare_at_price,stock_count,is_featured,sort_order,is_active").order("sort_order").order("created_at", { ascending: false }),
      supabase.from("reselling_categories").select("id,name_en,name_bn,image_url,sort_order,is_active").order("sort_order").order("created_at"),
      supabase.from("reselling_vendors").select("id,name,description,logo_url,website_url,sort_order,is_active").order("sort_order").order("created_at"),
      supabase.from("reselling_banners").select("id,title_en,title_bn,subtitle_en,subtitle_bn,image_url,destination_url,sort_order,is_active").order("sort_order").order("created_at"),
    ]);
    const firstError = productResult.error || categoryResult.error || vendorResult.error || bannerResult.error;
    if (firstError) setMessage({ type: "error", text: firstError.message });
    setProducts((productResult.data as Product[]) ?? []);
    setCategories((categoryResult.data as Category[]) ?? []);
    setVendors((vendorResult.data as Vendor[]) ?? []);
    setBanners((bannerResult.data as Banner[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setProductDraft({ ...emptyProduct }); setProductImageFile(null); setCategoryDraft({ ...emptyCategory }); setVendorDraft({ ...emptyVendor }); setBannerDraft({ ...emptyBanner }); setEditingId(null);
  };

  const changeSection = (next: Section) => { setSection(next); reset(); setMessage(null); };

  const finishSave = async (error: { message: string } | null, successText: string) => {
    setSaving(false);
    if (error) { setMessage({ type: "error", text: error.message }); return; }
    setMessage({ type: "success", text: successText }); reset(); await load();
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    const price = Number(productDraft.price); const compareAt = productDraft.compareAtPrice ? Number(productDraft.compareAtPrice) : null; const stock = productDraft.stockCount === "" ? null : Number(productDraft.stockCount); const sort = Number(productDraft.sortOrder || 0);
    if (!productDraft.nameEn.trim() || !Number.isFinite(price) || price <= 0 || !Number.isInteger(sort) || (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < price)) || (stock !== null && (!Number.isInteger(stock) || stock < 0))) { setMessage({ type: "error", text: "Add a product name, valid price, stock and sort order. Compare price cannot be lower than the selling price." }); return; }
    if (productImageFile && (!["image/jpeg", "image/png", "image/webp"].includes(productImageFile.type) || productImageFile.size > 8 * 1024 * 1024)) { setMessage({ type: "error", text: "Product image must be JPG, PNG or WebP and no larger than 8 MB." }); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setSaving(true); setMessage(null);
    let imageUrl = productDraft.imageUrl.trim() || null;
    let uploadedPath: string | null = null;
    if (productImageFile) {
      uploadedPath = `reselling/products/${Date.now()}-${safeFileName(productImageFile.name)}`;
      const upload = await supabase.storage.from("job-media").upload(uploadedPath, productImageFile, { contentType: productImageFile.type, upsert: false });
      if (upload.error) { setSaving(false); setMessage({ type: "error", text: upload.error.message }); return; }
      imageUrl = supabase.storage.from("job-media").getPublicUrl(uploadedPath).data.publicUrl;
    }
    const payload = { category_id: productDraft.categoryId || null, vendor_id: productDraft.vendorId || null, name_en: productDraft.nameEn.trim(), name_bn: productDraft.nameBn.trim() || null, description_en: productDraft.descriptionEn.trim() || null, description_bn: productDraft.descriptionBn.trim() || null, image_url: imageUrl, price, compare_at_price: compareAt, stock_count: stock, is_featured: productDraft.isFeatured, sort_order: sort, is_active: productDraft.isActive };
    const result = editingId ? await supabase.from("reselling_products").update(payload).eq("id", editingId) : await supabase.from("reselling_products").insert(payload);
    if (result.error && uploadedPath) await supabase.storage.from("job-media").remove([uploadedPath]);
    await finishSave(result.error, editingId ? "Product updated." : "Product added to Reselling.");
  };

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault(); const sort = Number(categoryDraft.sortOrder || 0);
    if (!categoryDraft.nameEn.trim() || !Number.isInteger(sort)) { setMessage({ type: "error", text: "Category name and whole-number sort order are required." }); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setSaving(true); setMessage(null);
    const payload = { name_en: categoryDraft.nameEn.trim(), name_bn: categoryDraft.nameBn.trim() || null, image_url: categoryDraft.imageUrl.trim() || null, sort_order: sort, is_active: categoryDraft.isActive };
    const result = editingId ? await supabase.from("reselling_categories").update(payload).eq("id", editingId) : await supabase.from("reselling_categories").insert(payload);
    await finishSave(result.error, editingId ? "Category updated." : "Category added.");
  };

  const saveVendor = async (event: FormEvent) => {
    event.preventDefault(); const sort = Number(vendorDraft.sortOrder || 0);
    if (!vendorDraft.name.trim() || !Number.isInteger(sort)) { setMessage({ type: "error", text: "Vendor name and whole-number sort order are required." }); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setSaving(true); setMessage(null);
    const payload = { name: vendorDraft.name.trim(), description: vendorDraft.description.trim() || null, logo_url: vendorDraft.logoUrl.trim() || null, website_url: vendorDraft.websiteUrl.trim() || null, sort_order: sort, is_active: vendorDraft.isActive };
    const result = editingId ? await supabase.from("reselling_vendors").update(payload).eq("id", editingId) : await supabase.from("reselling_vendors").insert(payload);
    await finishSave(result.error, editingId ? "Vendor updated." : "Vendor added.");
  };

  const saveBanner = async (event: FormEvent) => {
    event.preventDefault(); const sort = Number(bannerDraft.sortOrder || 0);
    if (!bannerDraft.titleEn.trim() || !Number.isInteger(sort)) { setMessage({ type: "error", text: "Banner title and whole-number sort order are required." }); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return; setSaving(true); setMessage(null);
    const payload = { title_en: bannerDraft.titleEn.trim(), title_bn: bannerDraft.titleBn.trim() || null, subtitle_en: bannerDraft.subtitleEn.trim() || null, subtitle_bn: bannerDraft.subtitleBn.trim() || null, image_url: bannerDraft.imageUrl.trim() || null, destination_url: bannerDraft.destinationUrl.trim() || null, sort_order: sort, is_active: bannerDraft.isActive };
    const result = editingId ? await supabase.from("reselling_banners").update(payload).eq("id", editingId) : await supabase.from("reselling_banners").insert(payload);
    await finishSave(result.error, editingId ? "Banner updated." : "Banner added.");
  };

  const toggleActive = async (table: EntityTable, item: { id: string; is_active: boolean }) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from(table).update({ is_active: !item.is_active }).eq("id", item.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: item.is_active ? "Item hidden from customers." : "Item is now visible." });
    if (!error) await load();
  };

  const remove = async (table: EntityTable, item: { id: string }, label: string) => {
    if (!window.confirm(`Delete "${label}" permanently?`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from(table).delete().eq("id", item.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Item deleted." });
    if (!error) { if (editingId === item.id) reset(); await load(); }
  };

  const editProduct = (item: Product) => { setEditingId(item.id); setProductImageFile(null); setProductDraft({ categoryId: item.category_id ?? "", vendorId: item.vendor_id ?? "", nameEn: item.name_en, nameBn: item.name_bn ?? "", descriptionEn: item.description_en ?? "", descriptionBn: item.description_bn ?? "", imageUrl: item.image_url ?? "", price: String(item.price), compareAtPrice: item.compare_at_price == null ? "" : String(item.compare_at_price), stockCount: item.stock_count == null ? "" : String(item.stock_count), sortOrder: String(item.sort_order), isFeatured: item.is_featured, isActive: item.is_active }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const editCategory = (item: Category) => { setEditingId(item.id); setCategoryDraft({ nameEn: item.name_en, nameBn: item.name_bn ?? "", imageUrl: item.image_url ?? "", sortOrder: String(item.sort_order), isActive: item.is_active }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const editVendor = (item: Vendor) => { setEditingId(item.id); setVendorDraft({ name: item.name, description: item.description ?? "", logoUrl: item.logo_url ?? "", websiteUrl: item.website_url ?? "", sortOrder: String(item.sort_order), isActive: item.is_active }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const editBanner = (item: Banner) => { setEditingId(item.id); setBannerDraft({ titleEn: item.title_en, titleBn: item.title_bn ?? "", subtitleEn: item.subtitle_en ?? "", subtitleBn: item.subtitle_bn ?? "", imageUrl: item.image_url ?? "", destinationUrl: item.destination_url ?? "", sortOrder: String(item.sort_order), isActive: item.is_active }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const actions = (table: EntityTable, item: { id: string; is_active: boolean }, label: string, onEdit: () => void) => <div className="admin-service-card-actions"><button type="button" className="secondary-button compact" onClick={onEdit}><Edit3 size={15} />Edit</button><button type="button" className="secondary-button compact" onClick={() => void toggleActive(table, item)}>{item.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}{item.is_active ? "Hide" : "Show"}</button><button type="button" className="danger-button compact" onClick={() => void remove(table, item, label)}><Trash2 size={15} />Delete</button></div>;

  const sections: Array<{ id: Section; label: string; icon: typeof PackageOpen; count: number }> = [
    { id: "products", label: "Products", icon: PackageOpen, count: products.length },
    { id: "categories", label: "Categories", icon: Layers3, count: categories.length },
    { id: "vendors", label: "Vendors", icon: Store, count: vendors.length },
    { id: "banners", label: "Banners", icon: ImageIcon, count: banners.length },
  ];

  return <section className="admin-section admin-reselling">
    <div className="admin-section-head"><div><span className="admin-kicker">RESELLING STOREFRONT</span><h2>Reselling</h2><p>Manage the storefront shown to customers: products, categories, vendors and promotional banners.</p></div><button type="button" className="secondary-button compact" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>
    <div className="admin-reselling-tabs">{sections.map(({ id, label, icon: Icon, count }) => <button type="button" className={section === id ? "active" : ""} onClick={() => changeSection(id)} key={id}><Icon size={17} /><span>{label}</span><small>{count}</small></button>)}</div>
    {message && <div className={`form-message ${message.type}`} style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>{message.text}<button type="button" aria-label="Dismiss" onClick={() => setMessage(null)} style={{ border: 0, background: "transparent", color: "inherit" }}><X size={17} /></button></div>}

    <div className="admin-service-layout">
      {section === "products" && <form className="card admin-service-form" onSubmit={saveProduct}><div className="admin-service-form-title"><span className="admin-command-icon"><PackageOpen size={20} /></span><div><strong>{editingId ? "Edit product" : "Add product"}</strong><small>Customer-facing product details.</small></div></div><div className="admin-service-form-grid"><div className="field"><label>Category</label><select className="select" value={productDraft.categoryId} onChange={(e) => setProductDraft((v) => ({ ...v, categoryId: e.target.value }))}><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name_en}{item.is_active ? "" : " · Hidden"}</option>)}</select></div><div className="field"><label>Vendor</label><select className="select" value={productDraft.vendorId} onChange={(e) => setProductDraft((v) => ({ ...v, vendorId: e.target.value }))}><option value="">No vendor</option>{vendors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " · Hidden"}</option>)}</select></div></div><div className="field"><label>Product name</label><input className="input" value={productDraft.nameEn} onChange={(e) => setProductDraft((v) => ({ ...v, nameEn: e.target.value }))} maxLength={140} required /></div><div className="field"><label>Bangla name (optional)</label><input className="input" value={productDraft.nameBn} onChange={(e) => setProductDraft((v) => ({ ...v, nameBn: e.target.value }))} maxLength={140} /></div><div className="field"><label>Image URL (optional)</label><input className="input" type="url" value={productDraft.imageUrl} onChange={(e) => setProductDraft((v) => ({ ...v, imageUrl: e.target.value }))} placeholder="https://…" /></div><label className="admin-product-image-upload"><span className="admin-product-image-icon">{productDraft.imageUrl && !productImageFile ? <img src={productDraft.imageUrl} alt="" /> : <UploadCloud size={28} />}</span><span><strong>{productImageFile ? productImageFile.name : "Upload product image"}</strong><small>Tap to choose JPG, PNG or WebP · up to 8MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { setProductImageFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label><div className="admin-service-form-grid"><div className="field"><label>Price ({currency})</label><input className="input" type="number" min="0.01" step="0.01" value={productDraft.price} onChange={(e) => setProductDraft((v) => ({ ...v, price: e.target.value }))} required /></div><div className="field"><label>Old / compare price</label><input className="input" type="number" min="0.01" step="0.01" value={productDraft.compareAtPrice} onChange={(e) => setProductDraft((v) => ({ ...v, compareAtPrice: e.target.value }))} /></div></div><div className="admin-service-form-grid"><div className="field"><label>Stock (blank = not tracked)</label><input className="input" type="number" min="0" step="1" value={productDraft.stockCount} onChange={(e) => setProductDraft((v) => ({ ...v, stockCount: e.target.value }))} /></div><div className="field"><label>Sort order</label><input className="input" type="number" step="1" value={productDraft.sortOrder} onChange={(e) => setProductDraft((v) => ({ ...v, sortOrder: e.target.value }))} /></div></div><div className="field"><label>Description</label><textarea className="textarea" value={productDraft.descriptionEn} onChange={(e) => setProductDraft((v) => ({ ...v, descriptionEn: e.target.value }))} maxLength={2000} /></div><div className="field"><label>Bangla description</label><textarea className="textarea" value={productDraft.descriptionBn} onChange={(e) => setProductDraft((v) => ({ ...v, descriptionBn: e.target.value }))} maxLength={2000} /></div><div className="admin-reselling-checks"><label><input type="checkbox" checked={productDraft.isFeatured} onChange={(e) => setProductDraft((v) => ({ ...v, isFeatured: e.target.checked }))} />Featured product</label><label><input type="checkbox" checked={productDraft.isActive} onChange={(e) => setProductDraft((v) => ({ ...v, isActive: e.target.checked }))} />Visible to customers</label></div><div className="admin-service-form-actions"><button className="primary-button" disabled={saving}><Plus size={18} />{saving ? "Saving…" : editingId ? "Update product" : "Add product"}</button>{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={18} />Cancel</button>}</div></form>}

      {section === "categories" && <form className="card admin-service-form" onSubmit={saveCategory}><div className="admin-service-form-title"><span className="admin-command-icon"><Layers3 size={20} /></span><div><strong>{editingId ? "Edit category" : "Add category"}</strong><small>Organize the storefront.</small></div></div><div className="field"><label>Category name</label><input className="input" value={categoryDraft.nameEn} onChange={(e) => setCategoryDraft((v) => ({ ...v, nameEn: e.target.value }))} required /></div><div className="field"><label>Bangla name</label><input className="input" value={categoryDraft.nameBn} onChange={(e) => setCategoryDraft((v) => ({ ...v, nameBn: e.target.value }))} /></div><div className="field"><label>Image URL</label><input className="input" type="url" value={categoryDraft.imageUrl} onChange={(e) => setCategoryDraft((v) => ({ ...v, imageUrl: e.target.value }))} /></div><div className="field"><label>Sort order</label><input className="input" type="number" step="1" value={categoryDraft.sortOrder} onChange={(e) => setCategoryDraft((v) => ({ ...v, sortOrder: e.target.value }))} /></div><label className="admin-service-active"><input type="checkbox" checked={categoryDraft.isActive} onChange={(e) => setCategoryDraft((v) => ({ ...v, isActive: e.target.checked }))} />Visible to customers</label><div className="admin-service-form-actions"><button className="primary-button" disabled={saving}><Plus size={18} />{saving ? "Saving…" : editingId ? "Update category" : "Add category"}</button>{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={18} />Cancel</button>}</div></form>}

      {section === "vendors" && <form className="card admin-service-form" onSubmit={saveVendor}><div className="admin-service-form-title"><span className="admin-command-icon"><Store size={20} /></span><div><strong>{editingId ? "Edit vendor" : "Add vendor"}</strong><small>Vendor list details.</small></div></div><div className="field"><label>Vendor name</label><input className="input" value={vendorDraft.name} onChange={(e) => setVendorDraft((v) => ({ ...v, name: e.target.value }))} required /></div><div className="field"><label>Description</label><textarea className="textarea" value={vendorDraft.description} onChange={(e) => setVendorDraft((v) => ({ ...v, description: e.target.value }))} maxLength={1000} /></div><div className="field"><label>Logo URL</label><input className="input" type="url" value={vendorDraft.logoUrl} onChange={(e) => setVendorDraft((v) => ({ ...v, logoUrl: e.target.value }))} /></div><div className="field"><label>Website URL</label><input className="input" type="url" value={vendorDraft.websiteUrl} onChange={(e) => setVendorDraft((v) => ({ ...v, websiteUrl: e.target.value }))} /></div><div className="field"><label>Sort order</label><input className="input" type="number" step="1" value={vendorDraft.sortOrder} onChange={(e) => setVendorDraft((v) => ({ ...v, sortOrder: e.target.value }))} /></div><label className="admin-service-active"><input type="checkbox" checked={vendorDraft.isActive} onChange={(e) => setVendorDraft((v) => ({ ...v, isActive: e.target.checked }))} />Visible to customers</label><div className="admin-service-form-actions"><button className="primary-button" disabled={saving}><Plus size={18} />{saving ? "Saving…" : editingId ? "Update vendor" : "Add vendor"}</button>{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={18} />Cancel</button>}</div></form>}

      {section === "banners" && <form className="card admin-service-form" onSubmit={saveBanner}><div className="admin-service-form-title"><span className="admin-command-icon"><ImageIcon size={20} /></span><div><strong>{editingId ? "Edit banner" : "Add banner"}</strong><small>Promotions shown at the top of Reselling.</small></div></div><div className="field"><label>Banner title</label><input className="input" value={bannerDraft.titleEn} onChange={(e) => setBannerDraft((v) => ({ ...v, titleEn: e.target.value }))} required /></div><div className="field"><label>Bangla title</label><input className="input" value={bannerDraft.titleBn} onChange={(e) => setBannerDraft((v) => ({ ...v, titleBn: e.target.value }))} /></div><div className="field"><label>Subtitle</label><input className="input" value={bannerDraft.subtitleEn} onChange={(e) => setBannerDraft((v) => ({ ...v, subtitleEn: e.target.value }))} /></div><div className="field"><label>Bangla subtitle</label><input className="input" value={bannerDraft.subtitleBn} onChange={(e) => setBannerDraft((v) => ({ ...v, subtitleBn: e.target.value }))} /></div><div className="field"><label>Banner image URL</label><input className="input" type="url" value={bannerDraft.imageUrl} onChange={(e) => setBannerDraft((v) => ({ ...v, imageUrl: e.target.value }))} /></div><div className="field"><label>Destination URL</label><input className="input" type="url" value={bannerDraft.destinationUrl} onChange={(e) => setBannerDraft((v) => ({ ...v, destinationUrl: e.target.value }))} /></div><div className="field"><label>Sort order</label><input className="input" type="number" step="1" value={bannerDraft.sortOrder} onChange={(e) => setBannerDraft((v) => ({ ...v, sortOrder: e.target.value }))} /></div><label className="admin-service-active"><input type="checkbox" checked={bannerDraft.isActive} onChange={(e) => setBannerDraft((v) => ({ ...v, isActive: e.target.checked }))} />Visible to customers</label><div className="admin-service-form-actions"><button className="primary-button" disabled={saving}><Plus size={18} />{saving ? "Saving…" : editingId ? "Update banner" : "Add banner"}</button>{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={18} />Cancel</button>}</div></form>}

      <div className="admin-service-list admin-reselling-list">{loading ? <div className="card admin-service-empty">Loading {section}…</div> : section === "products" ? products.length ? products.map((item) => <article className={`card admin-reselling-card ${item.is_active ? "" : "is-inactive"}`} key={item.id}>{item.image_url ? <img className="admin-reselling-thumb" src={item.image_url} alt="" /> : <div className="admin-reselling-thumb placeholder"><PackageOpen size={24} /></div>}<div className="admin-reselling-card-body"><div className="admin-service-card-top"><div><span className="admin-service-chip">{item.is_featured ? "Featured · " : ""}{categories.find((c) => c.id === item.category_id)?.name_en || "Uncategorized"}</span><h3>{item.name_en}</h3></div><span className={`status ${item.is_active ? "active" : "pending"}`}>{item.is_active ? "Active" : "Hidden"}</span></div><div className="admin-service-price"><strong>{formatMoney(Number(item.price), currency, "en")}</strong><span>{item.stock_count == null ? "Stock not tracked" : `${item.stock_count} in stock`}</span></div>{actions("reselling_products", item, item.name_en, () => editProduct(item))}</div></article>) : <div className="card admin-service-empty"><PackageOpen size={28} /><strong>No products yet</strong><span>Add the first product from the form.</span></div> : section === "categories" ? categories.length ? categories.map((item) => <article className={`card admin-reselling-card ${item.is_active ? "" : "is-inactive"}`} key={item.id}>{item.image_url ? <img className="admin-reselling-thumb" src={item.image_url} alt="" /> : <div className="admin-reselling-thumb placeholder"><Layers3 size={24} /></div>}<div className="admin-reselling-card-body"><div className="admin-service-card-top"><h3>{item.name_en}</h3><span className={`status ${item.is_active ? "active" : "pending"}`}>{item.is_active ? "Active" : "Hidden"}</span></div>{item.name_bn && <p className="muted">{item.name_bn}</p>}{actions("reselling_categories", item, item.name_en, () => editCategory(item))}</div></article>) : <div className="card admin-service-empty"><Layers3 size={28} /><strong>No categories yet</strong></div> : section === "vendors" ? vendors.length ? vendors.map((item) => <article className={`card admin-reselling-card ${item.is_active ? "" : "is-inactive"}`} key={item.id}>{item.logo_url ? <img className="admin-reselling-thumb" src={item.logo_url} alt="" /> : <div className="admin-reselling-thumb placeholder"><Store size={24} /></div>}<div className="admin-reselling-card-body"><div className="admin-service-card-top"><h3>{item.name}</h3><span className={`status ${item.is_active ? "active" : "pending"}`}>{item.is_active ? "Active" : "Hidden"}</span></div>{item.description && <p className="muted">{item.description}</p>}{actions("reselling_vendors", item, item.name, () => editVendor(item))}</div></article>) : <div className="card admin-service-empty"><Store size={28} /><strong>No vendors yet</strong></div> : banners.length ? banners.map((item) => <article className={`card admin-reselling-card ${item.is_active ? "" : "is-inactive"}`} key={item.id}>{item.image_url ? <img className="admin-reselling-thumb wide" src={item.image_url} alt="" /> : <div className="admin-reselling-thumb placeholder"><ImageIcon size={24} /></div>}<div className="admin-reselling-card-body"><div className="admin-service-card-top"><h3>{item.title_en}</h3><span className={`status ${item.is_active ? "active" : "pending"}`}>{item.is_active ? "Active" : "Hidden"}</span></div>{item.subtitle_en && <p className="muted">{item.subtitle_en}</p>}{actions("reselling_banners", item, item.title_en, () => editBanner(item))}</div></article>) : <div className="card admin-service-empty"><ImageIcon size={28} /><strong>No banners yet</strong></div>}</div>
    </div>
  </section>;
}

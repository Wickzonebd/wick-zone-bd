"use client";

import { Ban, CheckCircle2, Edit3, ExternalLink, Play, Plus, RefreshCw, Save, ShoppingBag, ToggleLeft, ToggleRight, Trash2, UploadCloud, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeFileName } from "@/lib/url";

interface MarketplaceService {
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
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface ServiceCampaign {
  id: string;
  user_id: string;
  service_name: string;
  platform: string;
  service_type: string;
  target_url: string;
  quantity: number;
  delivered_count: number;
  amount: number | string;
  currency: string;
  payment_status: string;
  status: "pending" | "active" | "completed" | "cancelled";
  admin_note: string | null;
  created_at: string;
  profile?: { full_name: string } | null;
}

const platforms = ["facebook", "instagram", "youtube", "tiktok", "telegram", "other"] as const;
const platformServiceTypes: Record<string, readonly string[]> = {
  facebook: ["likes", "followers", "views", "comments", "shares"],
  instagram: ["likes", "followers", "views", "comments", "shares"],
  youtube: ["subscribers", "views", "likes", "comments", "watch-time"],
  tiktok: ["followers", "views", "likes", "comments", "shares"],
  telegram: ["members", "views", "reactions", "shares"],
  other: ["custom"],
};

const emptyDraft = {
  platform: "facebook",
  serviceType: "likes",
  nameEn: "",
  nameBn: "",
  imageUrl: "",
  descriptionEn: "",
  descriptionBn: "",
  quantity: "1000",
  price: "",
  deliveryNote: "",
  sortOrder: "0",
  isActive: true,
};

const titleCase = (value: string) => value.replace(/(^|[-_\s])\w/g, (match) => match.toUpperCase());

export function AdminServicesManager({ currency }: { currency: string }) {
  const [items, setItems] = useState<MarketplaceService[]>([]);
  const [campaigns, setCampaigns] = useState<ServiceCampaign[]>([]);
  const [campaignProgress, setCampaignProgress] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState(() => ({ ...emptyDraft }));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage({ type: "error", text: "Service catalog is temporarily unavailable." });
      setLoading(false);
      return;
    }
    setLoading(true);
    const [serviceResult, campaignResult] = await Promise.all([
      supabase.from("marketplace_services")
        .select("id,platform,service_type,name_en,name_bn,image_url,description_en,description_bn,quantity,price,delivery_note,sort_order,is_active,created_at")
        .order("sort_order").order("created_at", { ascending: false }),
      supabase.from("service_campaigns")
        .select("id,user_id,service_name,platform,service_type,target_url,quantity,delivered_count,amount,currency,payment_status,status,admin_note,created_at,profile:profiles!service_campaigns_user_id_fkey(full_name)")
        .order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = serviceResult.error || campaignResult.error;
    if (firstError) setMessage({ type: "error", text: firstError.message });
    setItems((serviceResult.data as MarketplaceService[]) ?? []);
    const nextCampaigns = (campaignResult.data as unknown as ServiceCampaign[]) ?? [];
    setCampaigns(nextCampaigns);
    setCampaignProgress(Object.fromEntries(nextCampaigns.map((campaign) => [campaign.id, String(campaign.delivered_count)])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setDraft({ ...emptyDraft });
    setImageFile(null);
    setEditingId(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    const price = Number(draft.price);
    const sortOrder = Number(draft.sortOrder || 0);
    if (!draft.nameEn.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(sortOrder)) {
      setMessage({ type: "error", text: "Add a service name, a valid quantity, price and whole-number sort order." });
      return;
    }
    if (imageFile && (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type) || imageFile.size > 8 * 1024 * 1024)) {
      setMessage({ type: "error", text: "Service image must be JPG, PNG or WebP and no larger than 8 MB." });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    setMessage(null);
    let imageUrl = draft.imageUrl.trim() || null;
    let uploadedPath: string | null = null;
    if (imageFile) {
      uploadedPath = `marketplace/services/${Date.now()}-${safeFileName(imageFile.name)}`;
      const upload = await supabase.storage.from("job-media").upload(uploadedPath, imageFile, { contentType: imageFile.type, upsert: false });
      if (upload.error) { setSaving(false); setMessage({ type: "error", text: upload.error.message }); return; }
      imageUrl = supabase.storage.from("job-media").getPublicUrl(uploadedPath).data.publicUrl;
    }
    const payload = {
      platform: draft.platform,
      service_type: draft.serviceType,
      name_en: draft.nameEn.trim(),
      name_bn: draft.nameBn.trim() || null,
      image_url: imageUrl,
      description_en: draft.descriptionEn.trim() || null,
      description_bn: draft.descriptionBn.trim() || null,
      quantity,
      price,
      delivery_note: draft.deliveryNote.trim() || null,
      sort_order: sortOrder,
      is_active: draft.isActive,
    };
    const result = editingId
      ? await supabase.from("marketplace_services").update(payload).eq("id", editingId)
      : await supabase.from("marketplace_services").insert(payload);
    setSaving(false);
    if (result.error) {
      if (uploadedPath) await supabase.storage.from("job-media").remove([uploadedPath]);
      setMessage({ type: "error", text: result.error.message });
      return;
    }
    setMessage({ type: "success", text: editingId ? "Service updated." : "Service added to the catalog." });
    reset();
    await load();
  };

  const edit = (item: MarketplaceService) => {
    setEditingId(item.id);
    setDraft({
      platform: item.platform,
      serviceType: item.service_type,
      nameEn: item.name_en,
      nameBn: item.name_bn ?? "",
      imageUrl: item.image_url ?? "",
      descriptionEn: item.description_en ?? "",
      descriptionBn: item.description_bn ?? "",
      quantity: String(item.quantity),
      price: String(item.price),
      deliveryNote: item.delivery_note ?? "",
      sortOrder: String(item.sort_order),
      isActive: item.is_active,
    });
    setImageFile(null);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleActive = async (item: MarketplaceService) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("marketplace_services").update({ is_active: !item.is_active }).eq("id", item.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: `${item.name_en} is now ${item.is_active ? "hidden" : "active"}.` });
    if (!error) await load();
  };

  const remove = async (item: MarketplaceService) => {
    if (!window.confirm(`Delete "${item.name_en}" permanently?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("marketplace_services").delete().eq("id", item.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Service deleted." });
    if (!error) {
      if (editingId === item.id) reset();
      await load();
    }
  };

  const updateCampaign = async (campaign: ServiceCampaign, status?: ServiceCampaign["status"], forceComplete = false) => {
    const delivered = forceComplete ? campaign.quantity : Number(campaignProgress[campaign.id] ?? campaign.delivered_count);
    if (!Number.isInteger(delivered) || delivered < 0 || delivered > campaign.quantity) {
      setMessage({ type: "error", text: `Delivered count must be between 0 and ${campaign.quantity}.` });
      return;
    }
    const nextStatus = status ?? (delivered >= campaign.quantity ? "completed" : delivered > 0 ? "active" : campaign.status);
    const note = window.prompt("Admin note (optional):", campaign.admin_note ?? "") ?? campaign.admin_note;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_update_service_campaign", {
      p_campaign_id: campaign.id,
      p_delivered_count: delivered,
      p_status: nextStatus,
      p_note: note || null,
    });
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Campaign updated. The member will see the new progress live." });
    if (!error) await load();
  };

  return (
    <section className="admin-section admin-services">
      <div className="admin-section-head">
        <div>
          <span className="admin-kicker">SOCIAL SERVICE CATALOG</span>
          <h2>Services</h2>
          <p>Create the packages you sell: Facebook likes, Instagram followers, YouTube subscribers, views and more.</p>
        </div>
        <button type="button" className="secondary-button compact" onClick={() => void load()}><RefreshCw size={16} />Refresh</button>
      </div>

      {message && <div className={`form-message ${message.type}`} style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>{message.text}<button type="button" aria-label="Dismiss" onClick={() => setMessage(null)} style={{ border: 0, background: "transparent", color: "inherit" }}><X size={17} /></button></div>}

      <div className="admin-service-layout">
        <form className="card admin-service-form" onSubmit={save}>
          <div className="admin-service-form-title"><span className="admin-command-icon"><ShoppingBag size={20} /></span><div><strong>{editingId ? "Edit service" : "Add a service"}</strong><small>All catalog details are controlled here.</small></div></div>

          <div className="admin-service-form-grid">
            <div className="field"><label>Platform</label><select className="select" value={draft.platform} onChange={(event) => { const platform = event.target.value; const choices = platformServiceTypes[platform] ?? platformServiceTypes.other; setDraft((value) => ({ ...value, platform, serviceType: choices.includes(value.serviceType) ? value.serviceType : choices[0] })); }}>{platforms.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div>
            <div className="field"><label>Service type</label><select className="select" value={draft.serviceType} onChange={(event) => setDraft((value) => ({ ...value, serviceType: event.target.value }))}>{(platformServiceTypes[draft.platform] ?? platformServiceTypes.other).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div>
          </div>

          <div className="field"><label>Service name</label><input className="input" value={draft.nameEn} onChange={(event) => setDraft((value) => ({ ...value, nameEn: event.target.value }))} placeholder="e.g. Facebook Likes — 1,000" maxLength={140} required /></div>
          <div className="field"><label>Bangla name (optional)</label><input className="input" value={draft.nameBn} onChange={(event) => setDraft((value) => ({ ...value, nameBn: event.target.value }))} maxLength={140} /></div>
          <div className="field"><label>Image URL (optional)</label><input className="input" type="url" value={draft.imageUrl} onChange={(event) => setDraft((value) => ({ ...value, imageUrl: event.target.value }))} placeholder="https://…" /></div>
          <label className="admin-product-image-upload"><span className="admin-product-image-icon">{draft.imageUrl && !imageFile ? <img src={draft.imageUrl} alt="" /> : <UploadCloud size={28} />}</span><span><strong>{imageFile ? imageFile.name : "Upload service image"}</strong><small>Tap to choose JPG, PNG or WebP · up to 8MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { setImageFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label>

          <div className="admin-service-form-grid">
            <div className="field"><label>Quantity</label><input className="input" type="number" min={1} step={1} value={draft.quantity} onChange={(event) => setDraft((value) => ({ ...value, quantity: event.target.value }))} required /></div>
            <div className="field"><label>Price ({currency})</label><input className="input" type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => setDraft((value) => ({ ...value, price: event.target.value }))} placeholder="0.00" required /></div>
          </div>

          <div className="field"><label>Delivery note (optional)</label><input className="input" value={draft.deliveryNote} onChange={(event) => setDraft((value) => ({ ...value, deliveryNote: event.target.value }))} placeholder="e.g. Starts within 1–6 hours" maxLength={240} /></div>
          <div className="field"><label>Description (optional)</label><textarea className="textarea" value={draft.descriptionEn} onChange={(event) => setDraft((value) => ({ ...value, descriptionEn: event.target.value }))} maxLength={1200} /></div>
          <div className="field"><label>Bangla description (optional)</label><textarea className="textarea" value={draft.descriptionBn} onChange={(event) => setDraft((value) => ({ ...value, descriptionBn: event.target.value }))} maxLength={1200} /></div>

          <div className="admin-service-form-grid align-end">
            <div className="field"><label>Sort order</label><input className="input" type="number" step={1} value={draft.sortOrder} onChange={(event) => setDraft((value) => ({ ...value, sortOrder: event.target.value }))} /></div>
            <label className="admin-service-active"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((value) => ({ ...value, isActive: event.target.checked }))} /><span>Active / visible</span></label>
          </div>

          <div className="admin-service-form-actions">
            <button className="primary-button" type="submit" disabled={saving}><Plus size={18} />{saving ? "Saving…" : editingId ? "Update service" : "Add service"}</button>
            {editingId && <button type="button" className="secondary-button" onClick={reset}><X size={18} />Cancel</button>}
          </div>
        </form>

        <div className="admin-service-list">
          {loading ? <div className="card admin-service-empty">Loading services…</div> : items.length === 0 ? <div className="card admin-service-empty"><ShoppingBag size={28} /><strong>No services yet</strong><span>Add your first Facebook, Instagram or YouTube package from the form.</span></div> : items.map((item) => (
            <article className={`card admin-service-card ${item.is_active ? "" : "is-inactive"}`} key={item.id}>
              <div className={`admin-service-platform ${item.platform.toLowerCase()}`}>{item.image_url ? <img src={item.image_url} alt="" /> : item.platform.slice(0, 1).toUpperCase()}</div>
              <div className="admin-service-card-body">
                <div className="admin-service-card-top"><div><span className="admin-service-chip">{titleCase(item.platform)} · {titleCase(item.service_type)}</span><h3>{item.name_en}</h3></div><span className={`status ${item.is_active ? "active" : "pending"}`}>{item.is_active ? "Active" : "Hidden"}</span></div>
                <div className="admin-service-price"><strong>{formatMoney(Number(item.price), currency, "en")}</strong><span>{item.quantity.toLocaleString()} {item.service_type}</span></div>
                {item.delivery_note && <p className="muted">{item.delivery_note}</p>}
                <div className="admin-service-card-actions">
                  <button type="button" className="secondary-button compact" onClick={() => edit(item)}><Edit3 size={15} />Edit</button>
                  <button type="button" className="secondary-button compact" onClick={() => void toggleActive(item)}>{item.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}{item.is_active ? "Hide" : "Activate"}</button>
                  <button type="button" className="danger-button compact" onClick={() => void remove(item)}><Trash2 size={15} />Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <section className="admin-campaign-panel">
        <div className="admin-section-head"><div><span className="admin-kicker">LIVE FULFILLMENT</span><h2>Customer campaigns</h2><p>Confirm/start an order, enter how many units are delivered, and the customer&apos;s progress updates live. Completing a campaign automatically fills the full quantity.</p></div><span className="status active">{campaigns.filter((item) => item.status === "active").length} active</span></div>
        {campaigns.length === 0 ? <div className="card admin-service-empty"><ShoppingBag size={28} /><strong>No campaigns yet</strong><span>Customer service orders will appear here.</span></div> : <div className="admin-campaign-list">{campaigns.map((campaign) => {
          const percent = Math.min(100, Math.round((campaign.delivered_count / campaign.quantity) * 100));
          const isFinal = campaign.status === "completed" || campaign.status === "cancelled";
          return <article className={`card admin-campaign-card ${campaign.status}`} key={campaign.id}>
            <div className="admin-campaign-card-top"><div><span className={`status ${campaign.status === "completed" ? "active" : campaign.status}`}>{campaign.status}</span><h3>{campaign.service_name}</h3><small>{campaign.profile?.full_name ?? campaign.user_id.slice(0, 8)} · {campaign.platform} {campaign.service_type}</small></div><strong>{formatMoney(Number(campaign.amount), campaign.currency || currency, "en")}</strong></div>
            <a className="admin-campaign-target" href={campaign.target_url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open target</a>
            <div className="admin-campaign-progress-head"><span>{campaign.delivered_count.toLocaleString()} / {campaign.quantity.toLocaleString()} delivered</span><strong>{percent}%</strong></div><div className="admin-campaign-progress"><span style={{ width: `${percent}%` }} /></div>
            <div className="admin-campaign-controls"><div className="field"><label>Delivered</label><input className="input" type="number" min={0} max={campaign.quantity} step={1} disabled={isFinal} value={campaignProgress[campaign.id] ?? String(campaign.delivered_count)} onChange={(event) => setCampaignProgress((value) => ({ ...value, [campaign.id]: event.target.value }))} /></div><div className="admin-campaign-actions">{!isFinal && <><button type="button" className="secondary-button compact" onClick={() => void updateCampaign(campaign, campaign.status === "pending" ? "active" : undefined)}><Save size={15} />Save progress</button>{campaign.status === "pending" && <button type="button" className="primary-button compact" onClick={() => void updateCampaign(campaign, "active")}><Play size={15} />Confirm & Start</button>}<button type="button" className="primary-button compact" onClick={() => void updateCampaign(campaign, "completed", true)}><CheckCircle2 size={15} />Complete</button><button type="button" className="danger-button compact" onClick={() => void updateCampaign(campaign, "cancelled")}><Ban size={15} />Cancel</button></>}</div></div>
          </article>;
        })}</div>}
      </section>
    </section>
  );
}

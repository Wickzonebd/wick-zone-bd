"use client";

import { Edit3, ExternalLink, Link2, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";

interface PortalLink {
  id: string;
  label_en: string;
  label_bn: string | null;
  icon_name: string | null;
  icon_url: string | null;
  destination_url: string;
  sort_order: number;
  is_active: boolean;
}

const portalTypes = [
  { id: "facebook", label: "Facebook Group" },
  { id: "telegram", label: "Telegram Group" },
  { id: "youtube", label: "YouTube Channel" },
  { id: "whatsapp", label: "WhatsApp Group" },
  { id: "messenger", label: "Messenger" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "link", label: "Custom Link" },
] as const;

const emptyDraft = {
  type: "facebook",
  labelEn: "Facebook Group",
  labelBn: "ফেসবুক গ্রুপ",
  destinationUrl: "",
  iconUrl: "",
  sortOrder: "0",
  isActive: true,
};

export function AdminAccessPortalManager() {
  const [items, setItems] = useState<PortalLink[]>([]);
  const [draft, setDraft] = useState(() => ({ ...emptyDraft }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from("service_links")
      .select("id,label_en,label_bn,icon_name,icon_url,destination_url,sort_order,is_active")
      .order("sort_order")
      .order("created_at");
    setItems((data as PortalLink[]) ?? []);
    if (error) setMessage({ type: "error", text: error.message });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setDraft({ ...emptyDraft });
    setEditingId(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.labelEn.trim() || !isSafeExternalUrl(draft.destinationUrl.trim())) {
      setMessage({ type: "error", text: "Add a label and a valid HTTPS/HTTP group or channel link." });
      return;
    }
    if (draft.iconUrl.trim() && !isSafeExternalUrl(draft.iconUrl.trim())) {
      setMessage({ type: "error", text: "Icon URL must use HTTP or HTTPS." });
      return;
    }
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      setMessage({ type: "error", text: "Sort order must be a whole number." });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    const payload = {
      label_en: draft.labelEn.trim(),
      label_bn: draft.labelBn.trim() || null,
      icon_name: draft.type,
      icon_url: draft.iconUrl.trim() || null,
      destination_url: draft.destinationUrl.trim(),
      sort_order: sortOrder,
      is_active: draft.isActive,
    };
    const result = editingId
      ? await supabase.from("service_links").update(payload).eq("id", editingId)
      : await supabase.from("service_links").insert(payload);
    setSaving(false);
    if (result.error) {
      setMessage({ type: "error", text: result.error.message });
      return;
    }
    setMessage({ type: "success", text: editingId ? "Portal link updated." : "Portal link added." });
    reset();
    await load();
  };

  const edit = (item: PortalLink) => {
    const type = portalTypes.some((entry) => entry.id === item.icon_name) ? item.icon_name! : "link";
    setEditingId(item.id);
    setDraft({
      type,
      labelEn: item.label_en,
      labelBn: item.label_bn ?? "",
      destinationUrl: item.destination_url,
      iconUrl: item.icon_url ?? "",
      sortOrder: String(item.sort_order),
      isActive: item.is_active,
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggle = async (item: PortalLink) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("service_links").update({ is_active: !item.is_active }).eq("id", item.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: item.is_active ? "Portal link hidden." : "Portal link activated." });
    if (!error) await load();
  };

  const remove = async (item: PortalLink) => {
    if (!window.confirm(`Delete “${item.label_en}”?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("service_links").delete().eq("id", item.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Portal link deleted." });
    if (!error) {
      if (editingId === item.id) reset();
      await load();
    }
  };

  return <section className="admin-section admin-access-portal">
    <div className="admin-section-head"><div><span className="admin-kicker">OFFICIAL GROUP LINKS</span><h2>Access Portal</h2><p>Control the Facebook, Telegram, YouTube, WhatsApp and other official links shown above Services on the member home page.</p></div><button type="button" className="secondary-button compact" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>
    {message && <div className={`form-message ${message.type}`} style={{ marginBottom: 14 }}>{message.text}</div>}

    <div className="admin-access-layout">
      <form className="card admin-access-form" onSubmit={save}>
        <div className="admin-service-form-title"><span className="admin-command-icon"><Link2 size={20} /></span><div><strong>{editingId ? "Edit portal link" : "Add portal link"}</strong><small>Members open this link in a new tab and join your official group/channel.</small></div></div>
        <div className="field"><label>Platform / link type</label><select className="select" value={draft.type} onChange={(event) => { const type = event.target.value; const preset = portalTypes.find((item) => item.id === type); setDraft((value) => ({ ...value, type, labelEn: value.labelEn ? value.labelEn : preset?.label ?? "" })); }}>{portalTypes.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
        <div className="field"><label>English label</label><input className="input" value={draft.labelEn} onChange={(event) => setDraft((value) => ({ ...value, labelEn: event.target.value }))} maxLength={100} required /></div>
        <div className="field"><label>বাংলা লেবেল (optional)</label><input className="input" value={draft.labelBn} onChange={(event) => setDraft((value) => ({ ...value, labelBn: event.target.value }))} maxLength={100} /></div>
        <div className="field"><label>Group / channel link</label><input className="input" type="url" value={draft.destinationUrl} onChange={(event) => setDraft((value) => ({ ...value, destinationUrl: event.target.value }))} placeholder="https://…" required /></div>
        <div className="field"><label>Custom icon URL (optional)</label><input className="input" type="url" value={draft.iconUrl} onChange={(event) => setDraft((value) => ({ ...value, iconUrl: event.target.value }))} placeholder="https://…" /></div>
        <div className="admin-service-form-grid align-end"><div className="field"><label>Sort order</label><input className="input" type="number" step={1} value={draft.sortOrder} onChange={(event) => setDraft((value) => ({ ...value, sortOrder: event.target.value }))} /></div><label className="admin-service-active"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((value) => ({ ...value, isActive: event.target.checked }))} /><span>Active / visible</span></label></div>
        <div className="admin-service-form-actions"><button className="primary-button" disabled={saving}><Plus size={18} />{saving ? "Saving…" : editingId ? "Update link" : "Add link"}</button>{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={17} />Cancel</button>}</div>
      </form>

      <div className="admin-access-list">
        {loading ? <div className="card admin-service-empty">Loading portal links…</div> : items.length === 0 ? <div className="card admin-service-empty"><Link2 size={28} /><strong>No official links yet</strong><span>Add a Facebook, Telegram, YouTube or WhatsApp link.</span></div> : items.map((item) => <article className={`card admin-access-item ${item.is_active ? "" : "is-inactive"}`} key={item.id}>
          <div className="admin-access-item-icon"><Link2 size={20} /></div><div className="admin-access-item-copy"><div><strong>{item.label_en}</strong><span className={`status ${item.is_active ? "active" : "pending"}`}>{item.is_active ? "Live" : "Hidden"}</span></div>{item.label_bn && <small>{item.label_bn}</small>}<a href={item.destination_url} target="_blank" rel="noreferrer"><ExternalLink size={13} />{item.destination_url}</a><div className="admin-service-card-actions"><button type="button" className="secondary-button compact" onClick={() => edit(item)}><Edit3 size={15} />Edit</button><button type="button" className="secondary-button compact" onClick={() => void toggle(item)}>{item.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}{item.is_active ? "Hide" : "Activate"}</button><button type="button" className="danger-button compact" onClick={() => void remove(item)}><Trash2 size={15} />Delete</button></div></div>
        </article>)}
      </div>
    </div>
  </section>;
}

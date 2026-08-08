"use client";

import {
  BellRing,
  ImagePlus,
  Layers3,
  Link2,
  Megaphone,
  PanelTopOpen,
  Plus,
  Power,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl, safeFileName } from "@/lib/url";

type ContentKind = "service" | "project" | "banner" | "ticker" | "notification";
type ManagedTable = "service_links" | "project_cards" | "banners" | "announcement_tickers";

interface ServiceRow {
  id: string;
  label_en: string;
  label_bn: string | null;
  icon_name: string | null;
  icon_url: string | null;
  destination_url: string;
  sort_order: number;
  is_active: boolean;
}

interface ProjectRow {
  id: string;
  title_en: string;
  title_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  image_url: string | null;
  icon_name: string | null;
  destination_url: string | null;
  sort_order: number;
  is_active: boolean;
}

interface BannerRow {
  id: string;
  title: string | null;
  image_url: string | null;
  destination_url: string | null;
  sort_order: number;
  is_active: boolean;
}

interface TickerRow {
  id: string;
  text_en: string;
  text_bn: string | null;
  destination_url: string | null;
  text_color: string;
  background_color: string;
  direction: "ltr" | "rtl";
  speed_seconds: number;
  sort_order: number;
  is_active: boolean;
}

interface DisplayRow {
  id: string;
  table: ManagedTable;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  destinationUrl: string | null;
  sortOrder: number;
  active: boolean;
}

const contentKinds: Array<{ id: ContentKind; label: string; helper: string; icon: typeof Link2 }> = [
  { id: "service", label: "Portal Links", helper: "Official social & community links", icon: Link2 },
  { id: "project", label: "Projects", helper: "Homepage project cards", icon: Layers3 },
  { id: "banner", label: "Banners", helper: "Home hero images", icon: PanelTopOpen },
  { id: "ticker", label: "Ticker", helper: "Scrolling announcements", icon: Megaphone },
  { id: "notification", label: "Broadcast", helper: "Notify all members", icon: BellRing },
];

const iconOptions = ["globe", "link", "mail", "message", "send", "play"];

export function AdminContentManager({ onChanged }: { onChanged?: () => Promise<void> }) {
  const [kind, setKind] = useState<ContentKind>("service");
  const [labelEn, setLabelEn] = useState("");
  const [labelBn, setLabelBn] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionBn, setDescriptionBn] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [iconName, setIconName] = useState("globe");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [direction, setDirection] = useState<"ltr" | "rtl">("rtl");
  const [speed, setSpeed] = useState(14);
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [backgroundColor, setBackgroundColor] = useState("#FF4D1F");
  const [sortOrder, setSortOrder] = useState(0);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadContent = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const [serviceResult, projectResult, bannerResult, tickerResult] = await Promise.all([
      supabase.from("service_links").select("id,label_en,label_bn,icon_name,icon_url,destination_url,sort_order,is_active").order("sort_order"),
      supabase.from("project_cards").select("id,title_en,title_bn,description_en,description_bn,image_url,icon_name,destination_url,sort_order,is_active").order("sort_order"),
      supabase.from("banners").select("id,title,image_url,destination_url,sort_order,is_active").order("sort_order"),
      supabase.from("announcement_tickers").select("id,text_en,text_bn,destination_url,text_color,background_color,direction,speed_seconds,sort_order,is_active").order("sort_order"),
    ]);
    setServices((serviceResult.data as ServiceRow[]) ?? []);
    setProjects((projectResult.data as ProjectRow[]) ?? []);
    setBanners((bannerResult.data as BannerRow[]) ?? []);
    setTickers((tickerResult.data as TickerRow[]) ?? []);
    const firstError = [serviceResult, projectResult, bannerResult, tickerResult].find((item) => item.error)?.error;
    if (firstError) setMessage({ type: "error", text: firstError.message });
    setLoading(false);
  }, []);

  useEffect(() => { void loadContent(); }, [loadContent]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (kind === "service") return services.map((item) => ({
      id: item.id, table: "service_links", title: item.label_en, subtitle: item.label_bn,
      imageUrl: item.icon_url, destinationUrl: item.destination_url, sortOrder: item.sort_order, active: item.is_active,
    }));
    if (kind === "project") return projects.map((item) => ({
      id: item.id, table: "project_cards", title: item.title_en, subtitle: item.title_bn,
      imageUrl: item.image_url, destinationUrl: item.destination_url, sortOrder: item.sort_order, active: item.is_active,
    }));
    if (kind === "banner") return banners.map((item) => ({
      id: item.id, table: "banners", title: item.title || "Untitled banner", subtitle: null,
      imageUrl: item.image_url, destinationUrl: item.destination_url, sortOrder: item.sort_order, active: item.is_active,
    }));
    if (kind === "ticker") return tickers.map((item) => ({
      id: item.id, table: "announcement_tickers", title: item.text_en, subtitle: item.text_bn,
      imageUrl: null, destinationUrl: item.destination_url, sortOrder: item.sort_order, active: item.is_active,
    }));
    return [];
  }, [banners, kind, projects, services, tickers]);

  const uploadImage = async () => {
    if (!mediaFile) return imageUrl.trim() || null;
    if (!mediaFile.type.startsWith("image/") || mediaFile.size > 5 * 1024 * 1024) {
      throw new Error("Choose a JPG, PNG or WebP image up to 5 MB.");
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Media upload is temporarily unavailable.");
    const path = `content/${kind}/${Date.now()}-${safeFileName(mediaFile.name)}`;
    const upload = await supabase.storage.from("branding").upload(path, mediaFile, { contentType: mediaFile.type, upsert: false });
    if (upload.error) throw upload.error;
    return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
  };

  const resetForm = () => {
    setLabelEn("");
    setLabelBn("");
    setDescriptionEn("");
    setDescriptionBn("");
    setDestinationUrl("");
    setImageUrl("");
    setMediaFile(null);
    setSortOrder(0);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setMessage(null);
    if (destinationUrl.trim() && !isSafeExternalUrl(destinationUrl.trim())) {
      setMessage({ type: "error", text: "Destination URL must use HTTP or HTTPS." });
      return;
    }
    if (imageUrl.trim() && !isSafeExternalUrl(imageUrl.trim())) {
      setMessage({ type: "error", text: "Image URL must use HTTP or HTTPS." });
      return;
    }
    if (kind === "service" && !destinationUrl.trim()) {
      setMessage({ type: "error", text: "A destination URL is required for a portal link." });
      return;
    }

    setSaving(true);
    try {
      let result;
      if (kind === "ticker") {
        result = await supabase.from("announcement_tickers").insert({
          text_en: labelEn.trim(), text_bn: labelBn.trim() || null, destination_url: destinationUrl.trim() || null,
          text_color: textColor, background_color: backgroundColor, direction, speed_seconds: speed,
          sort_order: sortOrder, is_active: true,
        });
      } else if (kind === "notification") {
        result = await supabase.rpc("admin_broadcast_notification", {
          p_title: labelEn.trim(), p_body: labelBn.trim() || null, p_destination_url: destinationUrl.trim() || null,
        });
      } else {
        const uploadedUrl = await uploadImage();
        if (kind === "service") {
          result = await supabase.from("service_links").insert({
            label_en: labelEn.trim(), label_bn: labelBn.trim() || null, icon_name: iconName,
            icon_url: uploadedUrl, destination_url: destinationUrl.trim(), sort_order: sortOrder, is_active: true,
          });
        } else if (kind === "project") {
          result = await supabase.from("project_cards").insert({
            title_en: labelEn.trim(), title_bn: labelBn.trim() || null,
            description_en: descriptionEn.trim() || null, description_bn: descriptionBn.trim() || null,
            image_url: uploadedUrl, icon_name: iconName, destination_url: destinationUrl.trim() || null,
            sort_order: sortOrder, is_active: true,
          });
        } else {
          result = await supabase.from("banners").insert({
            title: labelEn.trim() || null, image_url: uploadedUrl, destination_url: destinationUrl.trim() || null,
            sort_order: sortOrder, is_active: true,
          });
        }
      }

      if (result.error) throw result.error;
      setMessage({ type: "success", text: kind === "notification" ? "Broadcast sent to members." : "Content saved and is now available on the site." });
      resetForm();
      await loadContent();
      if (onChanged) await onChanged();
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "Content could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = async (row: DisplayRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from(row.table).update({ is_active: !row.active }).eq("id", row.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: row.active ? "Content hidden." : "Content activated." });
    await loadContent();
    if (!error && onChanged) await onChanged();
  };

  const removeRow = async (row: DisplayRow) => {
    if (!window.confirm(`Delete “${row.title}” permanently?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from(row.table).delete().eq("id", row.id);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Content removed." });
    await loadContent();
    if (!error && onChanged) await onChanged();
  };

  const current = contentKinds.find((item) => item.id === kind)!;
  const CurrentIcon = current.icon;
  const acceptsImage = kind === "service" || kind === "project" || kind === "banner";

  return (
    <section className="admin-content-manager">
      <div className="admin-section-head">
        <div>
          <span className="admin-kicker">SITE BUILDER</span>
          <h2>Site content</h2>
          <p>Add the links, project cards, images and announcements that appear on the member-facing site.</p>
        </div>
      </div>

      <div className="admin-content-kinds">
        {contentKinds.map(({ id, label, helper, icon: Icon }) => (
          <button key={id} type="button" className={`admin-content-kind ${kind === id ? "active" : ""}`} onClick={() => { setKind(id); setMessage(null); setMediaFile(null); }}>
            <span><Icon size={19} /></span><strong>{label}</strong><small>{helper}</small>
          </button>
        ))}
      </div>

      <div className="admin-content-layout">
        <form className="admin-editor-card" onSubmit={submit}>
          <div className="admin-editor-title"><CurrentIcon size={20} /><div><strong>Add {current.label}</strong><span>{current.helper}</span></div></div>

          <div className="field">
            <label>{kind === "ticker" ? "Announcement (English)" : kind === "notification" ? "Notification title" : "English title / label"}</label>
            <input className="input" value={labelEn} onChange={(event) => setLabelEn(event.target.value)} required={kind !== "banner"} placeholder="Type here…" />
          </div>
          <div className="field">
            <label>{kind === "notification" ? "Notification message" : "Bangla title / label (optional)"}</label>
            {kind === "notification"
              ? <textarea className="textarea" value={labelBn} onChange={(event) => setLabelBn(event.target.value)} placeholder="Message for all members" />
              : <input className="input" value={labelBn} onChange={(event) => setLabelBn(event.target.value)} placeholder="বাংলা লেখা" />}
          </div>

          {kind === "project" && <div className="admin-form-grid two">
            <div className="field"><label>English description</label><textarea className="textarea" value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} /></div>
            <div className="field"><label>Bangla description</label><textarea className="textarea" value={descriptionBn} onChange={(event) => setDescriptionBn(event.target.value)} /></div>
          </div>}

          <div className="field">
            <label>{kind === "service" ? "Portal destination URL" : "Destination URL (optional)"}</label>
            <input className="input" type="url" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required={kind === "service"} placeholder="https://…" />
          </div>

          {(kind === "service" || kind === "project") && <div className="field"><label>Fallback icon</label><select className="select" value={iconName} onChange={(event) => setIconName(event.target.value)}>{iconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></div>}

          {acceptsImage && <div className="admin-upload-grid">
            <label className="admin-upload-box">
              <span className="admin-upload-icon"><UploadCloud size={22} /></span>
              <strong>{kind === "service" ? "Upload portal icon" : kind === "project" ? "Upload project image" : "Upload banner image"}</strong>
              <small>JPG, PNG or WebP · max 5 MB</small>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} />
              {mediaFile && <em>{mediaFile.name}</em>}
            </label>
            <div className="field admin-url-fallback"><label>Or paste image URL</label><input className="input" type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" /><small>Uploaded image takes priority.</small></div>
          </div>}

          {kind === "ticker" && <div className="admin-form-grid ticker-options">
            <div className="field"><label>Direction</label><select className="select" value={direction} onChange={(event) => setDirection(event.target.value as "ltr" | "rtl")}><option value="rtl">Right to left</option><option value="ltr">Left to right</option></select></div>
            <div className="field"><label>Speed (seconds)</label><input className="input" type="number" min="4" max="120" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></div>
            <div className="field"><label>Text color</label><input className="input color-input" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></div>
            <div className="field"><label>Background</label><input className="input color-input" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /></div>
          </div>}

          {kind !== "notification" && <div className="field"><label>Sort order</label><input className="input" type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></div>}

          {message && <div className={`form-message ${message.type}`}>{message.text}</div>}
          <button className="primary-button admin-save-button" disabled={saving}><Plus size={18} />{saving ? "Saving…" : kind === "notification" ? "Send broadcast" : `Add ${current.label}`}</button>
        </form>

        <div className="admin-current-card">
          <div className="admin-current-head"><div><strong>Current {current.label}</strong><span>{kind === "notification" ? "Broadcasts are delivered immediately." : `${displayRows.length} item${displayRows.length === 1 ? "" : "s"}`}</span></div></div>
          {kind === "notification" ? <div className="admin-content-empty"><BellRing size={28} /><strong>Broadcast center</strong><span>Use the form to send a notification to every current member.</span></div> : loading ? <div className="admin-content-empty">Loading content…</div> : displayRows.length === 0 ? <div className="admin-content-empty"><ImagePlus size={28} /><strong>No items yet</strong><span>Add the first one from the form.</span></div> : <div className="admin-current-list">
            {displayRows.map((row) => <article className="admin-current-item" key={row.id}>
              <div className="admin-current-media">{row.imageUrl ? <img src={row.imageUrl} alt="" /> : <CurrentIcon size={20} />}</div>
              <div className="admin-current-copy"><strong>{row.title}</strong>{row.subtitle && <span>{row.subtitle}</span>}<small>Order {row.sortOrder}{row.destinationUrl ? " · linked" : ""}</small></div>
              <div className="admin-current-actions">
                <button type="button" className={`admin-icon-action ${row.active ? "active" : ""}`} onClick={() => void toggleRow(row)} aria-label={row.active ? "Hide item" : "Activate item"}><Power size={16} /></button>
                <button type="button" className="admin-icon-action danger" onClick={() => void removeRow(row)} aria-label="Delete item"><Trash2 size={16} /></button>
              </div>
            </article>)}
          </div>}
        </div>
      </div>
    </section>
  );
}

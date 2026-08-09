"use client";

import {
  Archive,
  ArchiveRestore,
  BellRing,
  CheckCheck,
  CircleAlert,
  Copy,
  Link2,
  MailCheck,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";

type Audience = "all" | "active" | "locked" | "verified" | "individual";
type Category = "general" | "wallet" | "job" | "order" | "social" | "security" | "promotion";
type Priority = "normal" | "important" | "urgent";

interface InboxUser {
  id: string;
  full_name: string;
  membership_status: string;
  is_social_verified: boolean;
}

interface BroadcastRow {
  id: string;
  title: string;
  body: string | null;
  audience: Audience;
  recipient_user_id: string | null;
  category: Category;
  priority: Priority;
  destination_url: string | null;
  recipient_count: number;
  read_count: number;
  unread_count: number;
  archived_at: string | null;
  created_at: string;
}

const EMPTY_DRAFT = {
  title: "",
  body: "",
  audience: "all" as Audience,
  userId: "",
  category: "general" as Category,
  priority: "normal" as Priority,
  destinationUrl: "",
};

const audienceLabels: Record<Audience, string> = {
  all: "All active accounts",
  active: "Activated members",
  locked: "Locked / basic accounts",
  verified: "Blue Badge members",
  individual: "One selected user",
};

const categoryLabels: Record<Category, string> = {
  general: "General",
  wallet: "Wallet",
  job: "Micro Job",
  order: "Store Order",
  social: "Social",
  security: "Security",
  promotion: "Promotion",
};

export function AdminInboxManager({ users }: { users: InboxUser[] }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY_DRAFT }));
  const [messages, setMessages] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [historyCategory, setHistoryCategory] = useState<"all" | Category>("all");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_inbox_messages", { p_limit: 100 });
    if (error) setNotice({ type: "error", text: error.message });
    else setMessages((data as BroadcastRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (!draft.title.trim()) { setNotice({ type: "error", text: "Message title is required." }); return; }
    if (draft.audience === "individual" && !draft.userId) { setNotice({ type: "error", text: "Choose one user first." }); return; }
    if (draft.destinationUrl && !draft.destinationUrl.startsWith("/") && !isSafeExternalUrl(draft.destinationUrl)) {
      setNotice({ type: "error", text: "Open link must be an internal path or a safe HTTP/HTTPS URL." }); return;
    }
    const confirmation = window.confirm(`Send this ${draft.priority} ${categoryLabels[draft.category]} message to ${audienceLabels[draft.audience]}?`);
    if (!confirmation) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setSending(true);
    const { data, error } = await supabase.rpc("admin_send_inbox_message", {
      p_title: draft.title.trim(),
      p_body: draft.body.trim() || null,
      p_audience: draft.audience,
      p_user_id: draft.audience === "individual" ? draft.userId : null,
      p_category: draft.category,
      p_priority: draft.priority,
      p_destination_url: draft.destinationUrl.trim() || null,
    });
    if (error) setNotice({ type: "error", text: error.message });
    else {
      const result = data as { recipients?: number } | null;
      setNotice({ type: "success", text: `Delivered to ${Number(result?.recipients ?? 0).toLocaleString()} Inbox${Number(result?.recipients ?? 0) === 1 ? "" : "es"}.` });
      setDraft({ ...EMPTY_DRAFT });
      await load();
    }
    setSending(false);
  };

  const archive = async (item: BroadcastRow, archived: boolean) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.rpc("admin_archive_inbox_message", { p_broadcast_id: item.id, p_archived: archived });
    setNotice(error ? { type: "error", text: error.message } : { type: "success", text: archived ? "Message archived." : "Message restored." });
    if (!error) await load();
  };

  const reuse = (item: BroadcastRow) => {
    setDraft({
      title: item.title,
      body: item.body ?? "",
      audience: item.audience,
      userId: item.recipient_user_id ?? "",
      category: item.category,
      priority: item.priority,
      destinationUrl: item.destination_url ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visibleMessages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((item) => {
      if (!showArchived && item.archived_at) return false;
      if (showArchived && !item.archived_at) return false;
      if (historyCategory !== "all" && item.category !== historyCategory) return false;
      return !needle || `${item.title} ${item.body ?? ""} ${item.audience}`.toLowerCase().includes(needle);
    });
  }, [messages, query, historyCategory, showArchived]);

  const totals = useMemo(() => messages.reduce((summary, item) => ({
    delivered: summary.delivered + Number(item.recipient_count),
    read: summary.read + Number(item.read_count),
    urgent: summary.urgent + (item.priority === "urgent" ? 1 : 0),
  }), { delivered: 0, read: 0, urgent: 0 }), [messages]);
  const readRate = totals.delivered > 0 ? Math.round((totals.read / totals.delivered) * 100) : 0;

  return <section className="admin-section admin-inbox-manager">
    <div className="admin-section-head"><div><span className="admin-kicker">ONE-WAY MEMBER INBOX</span><h2>Inbox & notification center</h2><p>Send clear, read-only messages to everyone, a member segment or one customer. Wallet, proof and order updates also appear in this same Inbox automatically.</p></div><button type="button" className="secondary-button compact" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>

    <div className="admin-inbox-stats">
      <div><span><MailCheck size={19} /></span><strong>{totals.delivered.toLocaleString()}</strong><small>Delivered</small></div>
      <div><span><CheckCheck size={19} /></span><strong>{readRate}%</strong><small>Read rate</small></div>
      <div><span><MessageSquareText size={19} /></span><strong>{messages.length}</strong><small>Campaigns</small></div>
      <div><span><CircleAlert size={19} /></span><strong>{totals.urgent}</strong><small>Urgent messages</small></div>
    </div>

    {notice && <div className={`form-message ${notice.type} admin-inbox-notice`}>{notice.text}<button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div>}

    <div className="admin-inbox-layout">
      <form className="card admin-inbox-composer" onSubmit={sendMessage}>
        <div className="admin-inbox-composer-head"><span><Send size={22} /></span><div><strong>Compose a message</strong><small>Members can read it but cannot reply.</small></div></div>
        <div className="admin-form-grid two"><div className="field"><label>Audience</label><select className="select" value={draft.audience} onChange={(event) => setDraft((value) => ({ ...value, audience: event.target.value as Audience, userId: event.target.value === "individual" ? value.userId : "" }))}>{(Object.keys(audienceLabels) as Audience[]).map((value) => <option value={value} key={value}>{audienceLabels[value]}</option>)}</select></div><div className="field"><label>Category</label><select className="select" value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value as Category }))}>{(Object.keys(categoryLabels) as Category[]).map((value) => <option value={value} key={value}>{categoryLabels[value]}</option>)}</select></div></div>
        {draft.audience === "individual" && <div className="field"><label>Recipient</label><select className="select" value={draft.userId} onChange={(event) => setDraft((value) => ({ ...value, userId: event.target.value }))} required><option value="">Select a member</option>{users.map((item) => <option value={item.id} key={item.id}>{item.full_name} · {item.membership_status}{item.is_social_verified ? " · Verified" : ""}</option>)}</select></div>}
        <div className="field"><label>Message title</label><input className="input" value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} maxLength={180} placeholder="Example: Your wallet credit was approved" required /></div>
        <div className="field"><label>Message</label><textarea className="textarea admin-inbox-textarea" value={draft.body} onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))} maxLength={2000} placeholder="Write the complete information here…" /><small>{draft.body.length}/2000</small></div>
        <div className="admin-form-grid two"><div className="field"><label>Priority</label><select className="select" value={draft.priority} onChange={(event) => setDraft((value) => ({ ...value, priority: event.target.value as Priority }))}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></div><div className="field"><label>Open link (optional)</label><div className="input-wrap"><Link2 size={18} /><input className="input with-icon" value={draft.destinationUrl} onChange={(event) => setDraft((value) => ({ ...value, destinationUrl: event.target.value }))} placeholder="/wallet or https://…" /></div></div></div>
        <div className={`admin-inbox-preview priority-${draft.priority}`}><div className="admin-inbox-preview-avatar"><ShieldCheck size={22} /></div><div><span>Taskora Admin · {categoryLabels[draft.category]}</span><strong>{draft.title || "Message preview"}</strong><p>{draft.body || "Your message will appear here in a Messenger-style, read-only conversation."}</p></div></div>
        <button className="primary-button admin-inbox-send" disabled={sending}><Send size={18} />{sending ? "Sending…" : `Send to ${audienceLabels[draft.audience]}`}</button>
      </form>

      <div className="card admin-inbox-history">
        <div className="admin-inbox-history-head"><div><strong>Delivery history</strong><small>Open, read, reuse or archive previous messages.</small></div><button type="button" className={showArchived ? "active" : ""} onClick={() => setShowArchived((value) => !value)}>{showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{showArchived ? "Active" : "Archived"}</button></div>
        <div className="admin-inbox-history-filters"><div className="input-wrap"><Search size={17} /><input className="input with-icon" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" /></div><select className="select" value={historyCategory} onChange={(event) => setHistoryCategory(event.target.value as "all" | Category)}><option value="all">All categories</option>{(Object.keys(categoryLabels) as Category[]).map((value) => <option value={value} key={value}>{categoryLabels[value]}</option>)}</select></div>
        <div className="admin-inbox-history-list">{loading ? <div className="admin-inbox-empty">Loading messages…</div> : visibleMessages.length ? visibleMessages.map((item) => {
          const rate = item.recipient_count > 0 ? Math.round((item.read_count / item.recipient_count) * 100) : 0;
          return <article className={`admin-inbox-history-item priority-${item.priority}`} key={item.id}><div className="admin-inbox-history-item-top"><div><span>{categoryLabels[item.category]} · {audienceLabels[item.audience]}</span><strong>{item.title}</strong></div><small>{new Date(item.created_at).toLocaleString()}</small></div>{item.body && <p>{item.body}</p>}<div className="admin-inbox-delivery"><span><UsersRound size={14} />{item.recipient_count} delivered</span><span><CheckCheck size={14} />{item.read_count} read</span><b>{rate}%</b></div><div className="admin-inbox-history-actions"><button type="button" onClick={() => reuse(item)}><Copy size={15} />Reuse</button><button type="button" onClick={() => void archive(item, !item.archived_at)}>{item.archived_at ? <ArchiveRestore size={15} /> : <Archive size={15} />}{item.archived_at ? "Restore" : "Archive"}</button></div></article>;
        }) : <div className="admin-inbox-empty"><BellRing size={28} /><strong>No matching messages</strong><span>Sent campaigns will appear here with read analytics.</span></div>}</div>
      </div>
    </div>
  </section>;
}

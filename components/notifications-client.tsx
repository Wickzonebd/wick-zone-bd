"use client";

import {
  BadgeCheck,
  BellRing,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl } from "@/lib/url";
import type { AppNotification } from "@/lib/types";

type InboxFilter = "all" | "unread" | "wallet" | "job" | "order" | "social" | "general";

const categoryIcon = {
  wallet: CircleDollarSign,
  job: BriefcaseBusiness,
  order: ShoppingBag,
  social: UsersRound,
  security: LockKeyhole,
  promotion: Sparkles,
  general: MessageSquareText,
  system: BellRing,
};

export function NotificationsClient() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async (quiet = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    if (!quiet) setLoading(true);
    const { data, error: queryError } = await supabase.from("notifications").select("id,type,title,body,destination_url,read_at,created_at,category,priority,sender_label,broadcast_id").order("created_at", { ascending: false }).limit(200);
    setItems((data as AppNotification[]) ?? []);
    setError(Boolean(queryError));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const channel = supabase.channel(`inbox-page-${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void load(true)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);

  const markRead = async (id?: string) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    await supabase.rpc("mark_notifications_read", { p_notification_id: id ?? null });
    setItems((current) => current.map((item) => !id || item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "unread" && item.read_at) return false;
      if (!(["all","unread"] as string[]).includes(filter) && item.category !== filter) return false;
      return !needle || `${item.title} ${item.body ?? ""} ${item.sender_label ?? ""}`.toLowerCase().includes(needle);
    });
  }, [items, filter, query]);

  const grouped = useMemo(() => visible.reduce<Array<{ label: string; items: AppNotification[] }>>((groups, item) => {
    const date = new Date(item.created_at);
    const now = new Date();
    const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
    const isSame = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
    const label = isSame(date,now) ? (language === "bn" ? "আজ" : "Today") : isSame(date,yesterday) ? (language === "bn" ? "গতকাল" : "Yesterday") : date.toLocaleDateString(language === "bn" ? "bn-BD" : "en", { day: "numeric", month: "long", year: "numeric" });
    const previous = groups.at(-1);
    if (previous?.label === label) previous.items.push(item); else groups.push({ label, items: [item] });
    return groups;
  }, []), [visible, language]);

  const unreadCount = items.filter((item) => !item.read_at).length;
  const copy = language === "bn" ? {
    title: "ইনবক্স", subtitle: "Taskora Admin ও সিস্টেম থেকে পাওয়া সব আপডেট", search: "মেসেজ খুঁজুন…", all: "সব", unread: "অপঠিত", wallet: "ওয়ালেট", jobs: "জব", orders: "অর্ডার", social: "সোশ্যাল", general: "অ্যাডমিন", noReply: "এটি একটি read-only Inbox। এখানে রিপ্লাই করা যাবে না।", open: "বিস্তারিত খুলুন", read: "পড়া হয়েছে", new: "নতুন",
  } : {
    title: "Inbox", subtitle: "Every update from Taskora Admin and the system", search: "Search messages…", all: "All", unread: "Unread", wallet: "Wallet", jobs: "Jobs", orders: "Orders", social: "Social", general: "Admin", noReply: "This is a read-only Inbox. Replies are not available.", open: "Open details", read: "Read", new: "New",
  };

  const filters: Array<{ id: InboxFilter; label: string }> = [
    { id: "all", label: copy.all }, { id: "unread", label: `${copy.unread}${unreadCount ? ` (${unreadCount})` : ""}` }, { id: "wallet", label: copy.wallet },
    { id: "job", label: copy.jobs }, { id: "order", label: copy.orders }, { id: "social", label: copy.social }, { id: "general", label: copy.general },
  ];

  return <AppShell variant="hub"><main className="inbox-page"><div className="inbox-container">
    <section className="inbox-header">
      <div className="inbox-admin-avatar"><ShieldCheck size={28} /></div>
      <div><span>TASKORA OFFICIAL</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
      <div className="inbox-header-status"><i /><span>{language === "bn" ? "অফিশিয়াল চ্যানেল" : "Official channel"}</span></div>
    </section>

    <section className="inbox-toolbar">
      <div className="inbox-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} /></div>
      <div className="inbox-filter-strip">{filters.map((item) => <button type="button" className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)} key={item.id}>{item.label}</button>)}</div>
      {unreadCount > 0 && <button className="inbox-read-all" type="button" onClick={() => void markRead()}><CheckCheck size={17} />{t("notifications.allRead")}</button>}
    </section>

    {loading ? <div className="inbox-loading"><LoadingCards count={5} /></div> : error ? <ErrorState message={t("common.error")} /> : !visible.length ? <div className="inbox-empty"><EmptyState message={filter === "unread" ? (language === "bn" ? "সব মেসেজ পড়া হয়েছে।" : "You're all caught up.") : t("notifications.empty")} /></div> : <section className="inbox-conversation" aria-live="polite">
      {grouped.map((group) => <div className="inbox-day" key={group.label}><div className="inbox-day-label"><span>{group.label}</span></div>{group.items.map((item) => {
        const category = item.category ?? "system";
        const Icon = categoryIcon[category as keyof typeof categoryIcon] ?? BellRing;
        const internal = item.destination_url?.startsWith("/");
        const external = Boolean(item.destination_url && isSafeExternalUrl(item.destination_url));
        const bubble = <>
          <div className={`inbox-message-avatar category-${category}`}><Icon size={20} /></div>
          <article className={`inbox-message-bubble priority-${item.priority ?? "normal"} ${item.read_at ? "read" : "unread"}`}>
            <div className="inbox-message-meta"><span>{item.sender_label || "Taskora"}<BadgeCheck size={15} /></span>{!item.read_at && <b>{copy.new}</b>}</div>
            {(item.priority === "urgent" || item.priority === "important") && <div className={`inbox-priority priority-${item.priority}`}><CircleAlert size={14} />{item.priority === "urgent" ? (language === "bn" ? "জরুরি" : "Urgent") : (language === "bn" ? "গুরুত্বপূর্ণ" : "Important")}</div>}
            <h2>{item.title}</h2>{item.body && <p>{item.body}</p>}
            {(internal || external) && <span className="inbox-message-cta">{copy.open}<ChevronRight size={16} /></span>}
            <footer><time>{new Date(item.created_at).toLocaleTimeString(language === "bn" ? "bn-BD" : "en", { hour: "numeric", minute: "2-digit" })}</time><span><Check size={13} />{item.read_at ? copy.read : copy.new}</span></footer>
          </article>
        </>;
        if (internal) return <Link href={item.destination_url!} className="inbox-message-row" key={item.id} onClick={() => void markRead(item.id)}>{bubble}</Link>;
        if (external) return <a href={item.destination_url!} target="_blank" rel="noreferrer" className="inbox-message-row" key={item.id} onClick={() => void markRead(item.id)}>{bubble}</a>;
        return <button type="button" className="inbox-message-row" key={item.id} onClick={() => void markRead(item.id)}>{bubble}</button>;
      })}</div>)}
    </section>}

    <div className="inbox-readonly-composer"><LockKeyhole size={18} /><span>{copy.noReply}</span></div>
  </div></main></AppShell>;
}

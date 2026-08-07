"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/types";

export function NotificationsClient() {
  const { t } = useI18n(); const [items, setItems] = useState<AppNotification[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const load = useCallback(async () => { const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; } const { data, error: queryError } = await supabase.from("notifications").select("id,type,title,body,destination_url,read_at,created_at").order("created_at", { ascending: false }).limit(100); setItems((data as AppNotification[]) ?? []); setError(Boolean(queryError)); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const markRead = async (id?: string) => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; await supabase.rpc("mark_notifications_read", { p_notification_id: id ?? null }); await load(); };
  return <AppShell><main className="page-shell"><div className="page-narrow" style={{ display: "grid", gap: 14 }}><header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><h1 className="section-title" style={{ fontSize: "2rem" }}>{t("notifications.title")}</h1><button className="secondary-button" onClick={() => void markRead()}><CheckCheck size={18} />{t("notifications.allRead")}</button></header>{loading ? <LoadingCards count={5} /> : error ? <ErrorState message={t("common.error")} /> : !items.length ? <EmptyState message={t("notifications.empty")} /> : <div className="card" style={{ overflow: "hidden" }}>{items.map((item) => <Link key={item.id} href={item.destination_url || "/notifications"} onClick={() => void markRead(item.id)} style={{ display: "grid", gridTemplateColumns: "46px 1fr", gap: 11, alignItems: "start", padding: 15, borderBottom: "1px solid var(--border)", color: "inherit", textDecoration: "none", background: item.read_at ? "white" : "#fff8f4" }}><div className="quick-icon" style={{ width: 46, height: 46 }}><Bell size={20} /></div><div><strong>{item.title}</strong>{item.body && <p className="muted" style={{ margin: "3px 0" }}>{item.body}</p>}<span className="muted" style={{ fontSize: ".75rem" }}>{new Date(item.created_at).toLocaleString()}</span></div></Link>)}</div>}</div></main></AppShell>;
}

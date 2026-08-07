"use client";

import { CheckCircle2, CircleUserRound, Network, UsersRound, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { ErrorState, LoadingCards } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NetworkLevel, PublicProfile } from "@/lib/types";

interface NetworkMember extends Pick<PublicProfile, "id" | "full_name" | "avatar_url"> { level: number; membership_status: string; }
interface NetworkData { total: number; active: number; inactive: number; levels: NetworkLevel[]; members: NetworkMember[]; }
interface PendingConnection { id: string; requester_id: string; requester?: Pick<PublicProfile, "id" | "full_name" | "avatar_url"> | null; }

export function NetworkClient() {
  const { t, language } = useI18n();
  const [data, setData] = useState<NetworkData | null>(null);
  const [requests, setRequests] = useState<PendingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { const load = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    const { data: authData } = await supabase.auth.getUser();
    const [networkResult, requestResult] = await Promise.all([
      supabase.rpc("get_referral_network", { p_max_depth: 10 }),
      authData.user
        ? supabase.from("connections").select("id,requester_id,requester:profiles!connections_requester_id_fkey(id,full_name,avatar_url)").eq("status", "pending").eq("addressee_id", authData.user.id).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    setData(networkResult.data as NetworkData | null);
    setRequests((requestResult.data as unknown as PendingConnection[]) ?? []);
    setError(Boolean(networkResult.error || requestResult.error));
    setLoading(false);
  }; void load(); }, [refreshKey]);

  const respond = async (connectionId: string, action: "accept" | "reject") => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error: actionError } = await supabase.rpc("respond_connection_request", { p_connection_id: connectionId, p_action: action });
    if (!actionError) setRefreshKey((value) => value + 1);
  };
  return <AppShell><main className="page-shell"><div className="page-narrow" style={{ display: "grid", gap: 16 }}>
    {loading ? <LoadingCards count={5} /> : error || !data ? <ErrorState message={t("common.error")} /> : <>
      {requests.length > 0 && <section className="card" style={{ padding: 16 }}><h2 className="section-title" style={{ marginBottom: 12 }}>{t("network.requests")}</h2><div style={{ display: "grid", gap: 9 }}>{requests.map((request) => <div key={request.id} className="soft-card" style={{ padding: 11, display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 9, alignItems: "center" }}><div className="avatar" style={{ width: 44, height: 44 }}>{request.requester?.avatar_url ? <img src={request.requester.avatar_url} alt="" className="avatar" style={{ width: 44, height: 44 }} /> : <CircleUserRound />}</div><strong>{request.requester?.full_name ?? request.requester_id.slice(0, 8)}</strong><div style={{ display: "flex", gap: 5 }}><button className="icon-button" aria-label={t("network.accept")} title={t("network.accept")} onClick={() => void respond(request.id, "accept")}><CheckCircle2 size={19} /></button><button className="icon-button" aria-label={t("network.reject")} title={t("network.reject")} onClick={() => void respond(request.id, "reject")}><XCircle size={19} /></button></div></div>)}</div></section>}
      <section className="network-hero"><div style={{ position: "relative", zIndex: 1 }}><span className="status" style={{ color: "white", background: "rgba(255,255,255,.12)" }}><Network size={15} />Network</span><h1 style={{ fontSize: "clamp(2rem,8vw,3rem)", margin: "12px 0 8px" }}>{t("network.title")}</h1><p style={{ color: "#c8cfdb", lineHeight: 1.65, margin: 0 }}>{t("network.body")}</p><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 22 }}><div className="soft-card" style={{ padding: 12, textAlign: "center", background: "rgba(255,255,255,.09)", borderColor: "rgba(255,255,255,.13)" }}><strong style={{ fontSize: "1.4rem" }}>{data.total}</strong><span style={{ display: "block", fontSize: ".7rem", color: "#cbd2df" }}>{t("network.total")}</span></div><div className="soft-card" style={{ padding: 12, textAlign: "center", background: "rgba(255,255,255,.09)", borderColor: "rgba(255,255,255,.13)" }}><strong style={{ fontSize: "1.4rem" }}>{data.active}</strong><span style={{ display: "block", fontSize: ".7rem", color: "#cbd2df" }}>{t("network.active")}</span></div><div className="soft-card" style={{ padding: 12, textAlign: "center", background: "rgba(255,255,255,.09)", borderColor: "rgba(255,255,255,.13)" }}><strong style={{ fontSize: "1.4rem" }}>{data.inactive}</strong><span style={{ display: "block", fontSize: ".7rem", color: "#cbd2df" }}>{t("network.inactive")}</span></div></div></div></section>
      <section className="network-grid">{data.levels.map((level) => { const percent = level.total ? Math.round((level.active / level.total) * 100) : 0; return <article className="level-card" key={level.level}><div className="level-top"><div className="level-badge">{level.level}</div><div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between" }}><strong>{t("network.level")} {new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en").format(level.level)}</strong><strong style={{ color: "var(--primary)" }}>{percent}%</strong></div><div className="progress" style={{ margin: "8px 0 10px" }}><span style={{ width: `${percent}%` }} /></div><div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}><span className="status"><UsersRound size={14} />{level.total}</span><span className="status active"><CheckCircle2 size={14} />{level.active}</span><span className="status"><XCircle size={14} />{level.inactive}</span></div></div></div></article>; })}</section>
      {data.members.length > 0 && <section><h2 className="section-title" style={{ marginBottom: 12 }}>{t("network.members")}</h2><div className="card" style={{ overflow: "hidden" }}>{data.members.map((member) => <div key={`${member.level}-${member.id}`} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, alignItems: "center", padding: 13, borderBottom: "1px solid var(--border)" }}><div className="avatar" style={{ width: 44, height: 44 }}>{member.avatar_url ? <img src={member.avatar_url} alt="" className="avatar" style={{ width: 44, height: 44 }} /> : <CircleUserRound />}</div><div><strong>{member.full_name}</strong><div className="muted">{t("network.level")} {member.level}</div></div><span className={`status ${member.membership_status === "active" ? "active" : ""}`}>{member.membership_status}</span></div>)}</div></section>}
    </>}
  </div></main></AppShell>;
}

"use client";

import { Camera, Check, CircleUserRound, Copy, KeyRound, Link2, Mail, Phone, UserCheck, UserPlus, UserRound, UsersRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { ErrorState, LoadingCards } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeBangladeshPhone, safeFileName } from "@/lib/url";
import type { PublicProfile } from "@/lib/types";

interface ProfileConnection { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked"; }
interface ProfilePost { id: string; body: string | null; created_at: string; }

export function ProfileClient({ requestedUserId }: { requestedUserId?: string }) {
  const { t } = useI18n();
  const { user, profile, membership, refresh } = useAuth();
  const isOwn = !requestedUserId || requestedUserId === user?.id;
  const [shownProfile, setShownProfile] = useState<PublicProfile | null>(profile);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<ProfileConnection | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; }
      if (requestedUserId && requestedUserId !== user?.id) {
        const [profileResult, connectionResult, postsResult] = await Promise.all([
          supabase.from("profiles").select("id,full_name,avatar_url,bio,badge_label,referral_code,created_at,is_suspended").eq("id", requestedUserId).single(),
          supabase.from("connections").select("id,requester_id,addressee_id,status").or(`requester_id.eq.${requestedUserId},addressee_id.eq.${requestedUserId}`).limit(1).maybeSingle(),
          supabase.from("posts").select("id,body,created_at").eq("author_id", requestedUserId).eq("is_hidden", false).order("created_at", { ascending: false }).limit(20),
        ]);
        setShownProfile(profileResult.data as PublicProfile | null);
        setConnection(connectionResult.data as ProfileConnection | null);
        setPosts((postsResult.data as ProfilePost[]) ?? []);
        setError(Boolean(profileResult.error || connectionResult.error || postsResult.error));
      } else {
        setShownProfile(profile); setName(profile?.full_name ?? ""); setBio(profile?.bio ?? ""); setEmail(user?.email ?? "");
        const { data } = await supabase.from("user_private_profiles").select("mobile").eq("user_id", user?.id ?? "").maybeSingle();
        setMobile(data?.mobile ?? "");
      }
      setLoading(false);
    }; void load();
  }, [requestedUserId, user?.id, user?.email, profile, refreshKey]);

  const changeConnection = async (action: "connect" | "accept" | "reject" | "remove") => {
    if (!requestedUserId) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    let actionError = null;
    if (action === "connect") ({ error: actionError } = await supabase.rpc("send_connection_request", { p_addressee: requestedUserId }));
    else if (action === "remove" && connection) ({ error: actionError } = await supabase.rpc("remove_connection", { p_connection_id: connection.id }));
    else if (connection) ({ error: actionError } = await supabase.rpc("respond_connection_request", { p_connection_id: connection.id, p_action: action }));
    setMessage(actionError ? actionError.message : "Connection updated.");
    if (!actionError) setRefreshKey((value) => value + 1);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; setMessage(null);
    const normalizedPhone = normalizeBangladeshPhone(mobile); if (mobile && !normalizedPhone) { setMessage("Enter a valid Bangladesh phone number."); return; }
    const profileResult = await supabase.from("profiles").update({ full_name: name.trim(), bio: bio.trim() || null }).eq("id", user.id);
    if (profileResult.error) { setMessage("Profile could not be updated."); return; }
    if (normalizedPhone) { const { error: phoneError } = await supabase.rpc("update_private_phone", { p_mobile: normalizedPhone }); if (phoneError) { setMessage("That mobile number is already in use."); return; } }
    if (email.trim().toLowerCase() !== user.email?.toLowerCase()) { const { error: emailError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() }); if (emailError) { setMessage("Email change could not be started."); return; } }
    await refresh(); setMessage("Profile updated.");
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !user || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const path = `${user.id}/${safeFileName(file.name)}`; const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
    if (uploadError) return; const { data } = supabase.storage.from("avatars").getPublicUrl(path); await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id); await refresh();
  };

  const referralLink = typeof window === "undefined" || !shownProfile ? "" : `${window.location.origin}/register?ref=${shownProfile.referral_code}`;
  if (loading) return <AppShell><main className="page-shell"><LoadingCards count={4} /></main></AppShell>;
  if (error || !shownProfile) return <AppShell><main className="page-shell"><ErrorState message={t("common.error")} /></main></AppShell>;
  return <AppShell><main className="page-shell"><div className="page-narrow" style={{ display: "grid", gap: 16 }}>
    <section className="card" style={{ padding: 24, textAlign: "center" }}><div style={{ position: "relative", width: 112, margin: "0 auto" }}>{shownProfile.avatar_url ? <img className="avatar" style={{ width: 112, height: 112 }} src={shownProfile.avatar_url} alt="" /> : <div className="avatar" style={{ width: 112, height: 112 }}><CircleUserRound size={52} /></div>}{isOwn && <label className="primary-button" style={{ position: "absolute", right: -3, bottom: 0, width: 45, minHeight: 45, borderRadius: "50%", padding: 0 }}><Camera size={18} /><input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(event) => void uploadAvatar(event.target.files?.[0])} /></label>}</div><h1 style={{ margin: "14px 0 4px", fontSize: "2rem" }}>{shownProfile.full_name}</h1><div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap" }}>{shownProfile.badge_label && <span className="status active"><Check size={14} />{shownProfile.badge_label}</span>}{isOwn && <span className={`status ${membership?.status === "active" ? "active" : "pending"}`}>{membership?.status ?? "locked"}</span>}</div>{shownProfile.bio && <p className="muted" style={{ maxWidth: 520, margin: "12px auto 0" }}>{shownProfile.bio}</p>}{!isOwn && <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8 }}>{!connection && <button className="primary-button" onClick={() => void changeConnection("connect")}><UserPlus size={18} />{t("feed.connect")}</button>}{connection?.status === "accepted" && <button className="secondary-button" onClick={() => void changeConnection("remove")}><UserCheck size={18} />{t("feed.connected")}</button>}{connection?.status === "pending" && connection.requester_id === user?.id && <span className="status pending">{t("feed.pending")}</span>}{connection?.status === "pending" && connection.addressee_id === user?.id && <><button className="primary-button" onClick={() => void changeConnection("accept")}><Check size={18} />{t("network.accept")}</button><button className="secondary-button" onClick={() => void changeConnection("reject")}><X size={18} />{t("network.reject")}</button></>}</div>}{message && <div className="form-message success" style={{ marginTop: 10 }}>{message}</div>}</section>
    {isOwn ? <form className="card" style={{ padding: 22, display: "grid", gap: 16 }} onSubmit={save}><h2 className="section-title">{t("profile.update")}</h2><div className="field"><label>{t("profile.name")}</label><div className="input-wrap"><UserRound size={19} /><input className="input with-icon" value={name} onChange={(event) => setName(event.target.value)} required /></div></div><div className="field"><label>{t("profile.email")}</label><div className="input-wrap"><Mail size={19} /><input className="input with-icon" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></div><div className="field"><label>{t("profile.mobile")}</label><div className="input-wrap"><Phone size={19} /><input className="input with-icon" value={mobile} onChange={(event) => setMobile(event.target.value)} /></div></div><div className="field"><label>{t("profile.bio")}</label><textarea className="textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} /></div>{message && <div className="form-message success">{message}</div>}<button className="primary-button">{t("profile.update")}</button></form> : null}
    <section className="card" style={{ padding: 22 }}><h2 className="section-title"><UsersRound size={22} style={{ display: "inline", marginRight: 8 }} />{t("profile.referral")}</h2><div className="soft-card" style={{ padding: 14, marginTop: 13 }}><strong>{shownProfile.referral_code}</strong></div>{isOwn && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(referralLink)}><Link2 size={18} />{t("profile.copyLink")}</button><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(shownProfile.referral_code)}><Copy size={18} />{t("profile.copyCode")}</button></div>}</section>
    {!isOwn && <section><h2 className="section-title" style={{ marginBottom: 10 }}>{t("profile.posts")}</h2><div style={{ display: "grid", gap: 9 }}>{posts.length ? posts.map((post) => <article key={post.id} className="card" style={{ padding: 16 }}><p className="post-body" style={{ margin: 0 }}>{post.body || t("profile.mediaPost")}</p><div className="muted" style={{ marginTop: 8, fontSize: ".78rem" }}>{new Date(post.created_at).toLocaleString()}</div></article>) : <div className="soft-card" style={{ padding: 16 }}>{t("feed.empty")}</div>}</div></section>}
    {isOwn && <a className="secondary-button" href="/reset-password" style={{ textDecoration: "none" }}><KeyRound size={18} />{t("profile.password")}</a>}
  </div></main></AppShell>;
}

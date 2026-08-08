"use client";

import { BadgeCheck, Camera, Check, CircleUserRound, Copy, KeyRound, Link2, LoaderCircle, Mail, Phone, UserCheck, UserPlus, UserRound, UsersRound, WalletCards, X } from "lucide-react";
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
  const { t, language } = useI18n();
  const { user, profile, refresh } = useAuth();
  const isOwn = !requestedUserId || requestedUserId === user?.id;
  const [shownProfile, setShownProfile] = useState<PublicProfile | null>(profile);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [connection, setConnection] = useState<ProfileConnection | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; }
      if (requestedUserId && requestedUserId !== user?.id) {
        const [profileResult, connectionResult, postsResult] = await Promise.all([
          supabase.from("profiles").select("id,full_name,avatar_url,bio,badge_label,is_social_verified,referral_code,created_at,is_suspended").eq("id", requestedUserId).single(),
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
    if (action === "connect") ({ error: actionError } = await supabase.rpc("send_connection_request", { p_addressee_id: requestedUserId }));
    else if (action === "remove" && connection) ({ error: actionError } = await supabase.rpc("remove_connection", { p_connection_id: connection.id }));
    else if (connection) ({ error: actionError } = await supabase.rpc("respond_connection_request", { p_connection_id: connection.id, p_action: action }));
    setMessageType(actionError ? "error" : "success");
    setMessage(actionError ? actionError.message : "Connection updated.");
    if (!actionError) setRefreshKey((value) => value + 1);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; setMessage(null);
    const normalizedPhone = normalizeBangladeshPhone(mobile); if (mobile && !normalizedPhone) { setMessageType("error"); setMessage("Enter a valid Bangladesh phone number."); return; }
    const profileResult = await supabase.from("profiles").update({ full_name: name.trim(), bio: bio.trim() || null }).eq("id", user.id);
    if (profileResult.error) { setMessageType("error"); setMessage("Profile could not be updated."); return; }
    if (normalizedPhone) { const { error: phoneError } = await supabase.rpc("update_private_phone", { p_mobile: normalizedPhone }); if (phoneError) { setMessageType("error"); setMessage("That mobile number is already in use."); return; } }
    if (email.trim().toLowerCase() !== user.email?.toLowerCase()) { const { error: emailError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() }); if (emailError) { setMessageType("error"); setMessage("Email change could not be started."); return; } }
    await refresh(); setMessageType("success"); setMessage("Profile updated.");
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setMessageType("error"); setMessage(language === "bn" ? "JPG, PNG বা WebP ছবি দিন (সর্বোচ্চ 5MB)।" : "Choose a JPG, PNG, or WebP image up to 5MB."); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setAvatarUploading(true); setMessage(null);
    const path = `${user.id}/avatar-${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setAvatarUploading(false); setMessageType("error"); setMessage(language === "bn" ? "ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।" : "Profile photo upload failed. Please try again."); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: profileError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    if (profileError) { setAvatarUploading(false); setMessageType("error"); setMessage(language === "bn" ? "প্রোফাইল ছবিটি সেভ করা যায়নি।" : "The profile photo could not be saved."); return; }
    await refresh(); setAvatarUploading(false); setMessageType("success"); setMessage(language === "bn" ? "প্রোফাইল ছবি আপডেট হয়েছে।" : "Profile photo updated.");
  };

  const referralLink = typeof window === "undefined" || !shownProfile ? "" : `${window.location.origin}/register?ref=${shownProfile.referral_code}`;
  const isVerified = Boolean(shownProfile?.is_social_verified);
  const customBadge = shownProfile?.badge_label && shownProfile.badge_label !== "Verified" ? shownProfile.badge_label : null;
  const verifiedText = language === "bn" ? "ভেরিফাইড" : "Verified";
  const unverifiedText = language === "bn" ? "ভেরিফাই করা হয়নি" : "Not verified";

  if (loading) return <AppShell><main className="profile-page"><div className="profile-container"><LoadingCards count={4} /></div></main></AppShell>;
  if (error || !shownProfile) return <AppShell><main className="profile-page"><div className="profile-container"><ErrorState message={t("common.error")} /></div></main></AppShell>;
  return <AppShell><main className="profile-page"><div className="profile-container">
    <section className="profile-hero-card">
      <div className="profile-cover-strip" />
      <div className="profile-hero-content">
        <div className="profile-avatar-wrap">
          {shownProfile.avatar_url ? <img className="profile-avatar-image" src={shownProfile.avatar_url} alt={`${shownProfile.full_name} profile`} /> : <div className="profile-avatar-image profile-avatar-fallback"><CircleUserRound size={55} /></div>}
          {isOwn && <label className={`profile-photo-button ${avatarUploading ? "is-uploading" : ""}`} title={language === "bn" ? "প্রোফাইল ছবি পরিবর্তন করুন" : "Change profile photo"}>{avatarUploading ? <LoaderCircle size={19} className="profile-spinner" /> : <Camera size={19} />}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarUploading} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void uploadAvatar(file); }} /></label>}
        </div>
        <div className="profile-identity">
          <div className="profile-name-row"><h1>{shownProfile.full_name}</h1>{isVerified && <BadgeCheck className="verified-check" size={24} aria-label={verifiedText} />}</div>
          <div className="profile-badge-row">
            {isVerified ? <span className="profile-verified-pill"><BadgeCheck size={16} />{verifiedText}</span> : isOwn ? <span className="profile-unverified-pill">{unverifiedText}</span> : null}
            {customBadge && <span className="profile-custom-badge">{customBadge}</span>}
          </div>
          {shownProfile.bio && <p className="profile-bio">{shownProfile.bio}</p>}
          {isOwn && <p className="profile-photo-hint">{language === "bn" ? "ক্যামেরা আইকনে চাপ দিয়ে নিজের ছবি দিন · সর্বোচ্চ 5MB" : "Tap the camera to upload your photo · up to 5MB"}</p>}
          {!isOwn && <div className="profile-connection-actions">{!connection && <button className="primary-button" onClick={() => void changeConnection("connect")}><UserPlus size={18} />{t("feed.connect")}</button>}{connection?.status === "accepted" && <button className="secondary-button" onClick={() => void changeConnection("remove")}><UserCheck size={18} />{t("feed.connected")}</button>}{connection?.status === "pending" && connection.requester_id === user?.id && <span className="status pending">{t("feed.pending")}</span>}{connection?.status === "pending" && connection.addressee_id === user?.id && <><button className="primary-button" onClick={() => void changeConnection("accept")}><Check size={18} />{t("network.accept")}</button><button className="secondary-button" onClick={() => void changeConnection("reject")}><X size={18} />{t("network.reject")}</button></>}</div>}
        </div>
      </div>
    </section>

    {message && <div className={`form-message ${messageType}`}>{message}</div>}

    {isOwn && <form className="profile-card profile-edit-card" onSubmit={save}>
      <div className="profile-section-heading"><div className="profile-section-icon"><UserRound size={20} /></div><div><h2>{t("profile.update")}</h2><p>{language === "bn" ? "আপনার ব্যক্তিগত তথ্য আপডেট করুন" : "Keep your personal information up to date"}</p></div></div>
      <div className="profile-form-grid">
        <div className="field profile-form-wide"><label>{t("profile.name")}</label><div className="input-wrap"><UserRound size={19} /><input className="input with-icon" value={name} onChange={(event) => setName(event.target.value)} required /></div></div>
        <div className="field"><label>{t("profile.email")}</label><div className="input-wrap"><Mail size={19} /><input className="input with-icon" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></div>
        <div className="field"><label>{t("profile.mobile")}</label><div className="input-wrap"><Phone size={19} /><input className="input with-icon" value={mobile} onChange={(event) => setMobile(event.target.value)} /></div></div>
        <div className="field profile-form-wide"><label>{t("profile.bio")}</label><textarea className="textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} /></div>
      </div>
      <button className="primary-button profile-save-button">{t("profile.update")}</button>
    </form>}

    <section className="profile-card profile-referral-card">
      <div className="profile-section-heading"><div className="profile-section-icon"><UsersRound size={20} /></div><div><h2>{t("profile.referral")}</h2><p>{language === "bn" ? "আপনার ইউনিক রেফারেল কোড" : "Your unique referral code"}</p></div></div>
      <div className="profile-referral-code"><strong>{shownProfile.referral_code}</strong></div>
      {isOwn && <div className="profile-referral-actions"><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(referralLink)}><Link2 size={18} />{t("profile.copyLink")}</button><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(shownProfile.referral_code)}><Copy size={18} />{t("profile.copyCode")}</button></div>}
    </section>

    {!isOwn && <section className="profile-posts-section"><h2 className="section-title">{t("profile.posts")}</h2><div className="profile-post-list">{posts.length ? posts.map((post) => <article key={post.id} className="profile-card profile-post-card"><p className="post-body">{post.body || t("profile.mediaPost")}</p><div className="muted profile-post-time">{new Date(post.created_at).toLocaleString()}</div></article>) : <div className="profile-card profile-empty-posts">{t("feed.empty")}</div>}</div></section>}
    {isOwn && <div className="profile-utility-actions"><a className="secondary-button" href="/wallet"><WalletCards size={18} />{t("common.wallet")}</a><a className="secondary-button profile-password-button" href="/reset-password"><KeyRound size={18} />{t("profile.password")}</a></div>}
  </div></main></AppShell>;
}

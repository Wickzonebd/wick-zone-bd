"use client";

import { Award, BadgeCheck, CalendarDays, Camera, Check, CircleUserRound, Coins, Copy, Gauge, Globe2, Heart, KeyRound, Link2, LoaderCircle, Mail, MapPin, Pencil, Phone, Share2, ShoppingBag, UserCheck, UserPlus, UserRound, UsersRound, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { ErrorState, LoadingCards } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl, normalizeBangladeshPhone, safeFileName } from "@/lib/url";
import type { PublicProfile } from "@/lib/types";

interface ProfileConnection { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked"; }
interface ProfilePost { id: string; body: string | null; created_at: string; }
interface ActivitySummary { approved_jobs: number | string; campaigns: number | string; completed_campaigns: number | string; activity_score: number | string; level: number; next_level_score: number | null; level_floor: number; }
interface ProfileCoinSummary { balance: number | string; referral_count: number; referral_reward: number; coins_per_currency_unit: number; minimum_exchange: number; }
interface PublicProfileSummary { post_count: number | string; connection_count: number | string; like_count: number | string; mutual_count: number | string; joined_at: string; }

export function ProfileClient({ requestedUserId }: { requestedUserId?: string }) {
  const { t, language } = useI18n();
  const { user, profile, refresh } = useAuth();
  const isOwn = !requestedUserId || requestedUserId === user?.id;
  const [shownProfile, setShownProfile] = useState<PublicProfile | null>(profile);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [website, setWebsite] = useState(profile?.website_url ?? "");
  const [coverUrl, setCoverUrl] = useState(profile?.cover_url ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [connection, setConnection] = useState<ProfileConnection | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [coins, setCoins] = useState<ProfileCoinSummary | null>(null);
  const [summary, setSummary] = useState<PublicProfileSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; }
      if (requestedUserId && requestedUserId !== user?.id) {
        const [profileResult, connectionResult, postsResult, summaryResult] = await Promise.all([
          supabase.from("profiles").select("id,full_name,avatar_url,bio,headline,location,website_url,cover_url,badge_label,is_social_verified,referral_code,created_at,is_suspended").eq("id", requestedUserId).single(),
          supabase.from("connections").select("id,requester_id,addressee_id,status").or(`requester_id.eq.${requestedUserId},addressee_id.eq.${requestedUserId}`).limit(1).maybeSingle(),
          supabase.from("posts").select("id,body,created_at").eq("author_id", requestedUserId).eq("is_hidden", false).order("created_at", { ascending: false }).limit(20),
          supabase.rpc("get_public_profile_summary", { p_profile_id: requestedUserId }),
        ]);
        setShownProfile(profileResult.data as PublicProfile | null);
        setConnection(connectionResult.data as ProfileConnection | null);
        setPosts((postsResult.data as ProfilePost[]) ?? []);
        setSummary((summaryResult.data as PublicProfileSummary | null) ?? null);
        setError(Boolean(profileResult.error || connectionResult.error || postsResult.error));
      } else {
        setShownProfile(profile); setName(profile?.full_name ?? ""); setBio(profile?.bio ?? ""); setHeadline(profile?.headline ?? ""); setLocation(profile?.location ?? ""); setWebsite(profile?.website_url ?? ""); setCoverUrl(profile?.cover_url ?? ""); setEmail(user?.email ?? "");
        const [privateResult, activityResult, coinResult, summaryResult, postsResult] = await Promise.all([
          supabase.from("user_private_profiles").select("mobile").eq("user_id", user?.id ?? "").maybeSingle(),
          supabase.rpc("get_my_activity_summary"),
          supabase.rpc("get_coin_summary"),
          supabase.rpc("get_public_profile_summary", { p_profile_id: user?.id ?? "" }),
          supabase.from("posts").select("id,body,created_at").eq("author_id", user?.id ?? "").eq("is_hidden", false).order("created_at", { ascending: false }).limit(20),
        ]);
        setMobile(privateResult.data?.mobile ?? "");
        setActivity((activityResult.data as ActivitySummary | null) ?? null);
        setCoins((coinResult.data as ProfileCoinSummary | null) ?? null);
        setSummary((summaryResult.data as PublicProfileSummary | null) ?? null);
        setPosts((postsResult.data as ProfilePost[]) ?? []);
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
    if (website.trim() && !isSafeExternalUrl(website.trim())) { setMessageType("error"); setMessage("Website URL must start with HTTP or HTTPS."); return; }
    if (coverUrl.trim() && !isSafeExternalUrl(coverUrl.trim())) { setMessageType("error"); setMessage("Cover image URL must start with HTTP or HTTPS."); return; }
    const profileResult = await supabase.from("profiles").update({ full_name: name.trim(), bio: bio.trim() || null, headline: headline.trim() || null, location: location.trim() || null, website_url: website.trim() || null, cover_url: coverUrl.trim() || null }).eq("id", user.id);
    if (profileResult.error) { setMessageType("error"); setMessage("Profile could not be updated."); return; }
    if (normalizedPhone) { const { error: phoneError } = await supabase.rpc("update_private_phone", { p_mobile: normalizedPhone }); if (phoneError) { setMessageType("error"); setMessage("That mobile number is already in use."); return; } }
    if (email.trim().toLowerCase() !== user.email?.toLowerCase()) { const { error: emailError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() }); if (emailError) { setMessageType("error"); setMessage("Email change could not be started."); return; } }
    await refresh(); setMessageType("success"); setMessage(language === "bn" ? "প্রোফাইল আপডেট হয়েছে।" : "Profile updated."); setEditing(false);
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
  const activityScore = Number(activity?.activity_score ?? 0);
  const levelFloor = Number(activity?.level_floor ?? 0);
  const nextLevelScore = activity?.next_level_score == null ? null : Number(activity.next_level_score);
  const levelProgress = nextLevelScore == null ? 100 : Math.max(0, Math.min(100, Math.round(((activityScore - levelFloor) / Math.max(1, nextLevelScore - levelFloor)) * 100)));

  if (loading) return <AppShell><main className="profile-page"><div className="profile-container"><LoadingCards count={4} /></div></main></AppShell>;
  if (error || !shownProfile) return <AppShell><main className="profile-page"><div className="profile-container"><ErrorState message={t("common.error")} /></div></main></AppShell>;
  return <AppShell><main className="profile-page"><div className="profile-container">
    <section className="profile-hero-card">
      {isOwn && !editing && <button type="button" className="profile-edit-trigger" aria-label={language === "bn" ? "প্রোফাইল এডিট করুন" : "Edit profile"} title={language === "bn" ? "প্রোফাইল এডিট করুন" : "Edit profile"} onClick={() => { setMessage(null); setEditing(true); }}><Pencil size={17} /><span>{language === "bn" ? "এডিট" : "Edit"}</span></button>}
      <div className="profile-cover-strip" style={shownProfile.cover_url ? { backgroundImage: `linear-gradient(120deg,rgba(37,61,90,.2),rgba(255,87,34,.28)),url(${shownProfile.cover_url})` } : undefined} />
      <div className="profile-hero-content">
        <div className="profile-avatar-wrap">
          {shownProfile.avatar_url ? <img className="profile-avatar-image" src={shownProfile.avatar_url} alt={`${shownProfile.full_name} profile`} /> : <div className="profile-avatar-image profile-avatar-fallback"><CircleUserRound size={55} /></div>}
          {isOwn && <label className={`profile-photo-button ${avatarUploading ? "is-uploading" : ""}`} title={language === "bn" ? "প্রোফাইল ছবি পরিবর্তন করুন" : "Change profile photo"}>{avatarUploading ? <LoaderCircle size={19} className="profile-spinner" /> : <Camera size={19} />}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarUploading} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void uploadAvatar(file); }} /></label>}
        </div>
        <div className="profile-identity">
          <div className="profile-name-row"><h1>{shownProfile.full_name}</h1>{isVerified && <BadgeCheck className="verified-check" size={24} aria-label={verifiedText} />}</div>
          {shownProfile.headline && <strong className="profile-headline">{shownProfile.headline}</strong>}
          <div className="profile-badge-row">
            {isVerified ? <span className="profile-verified-pill"><BadgeCheck size={16} />{verifiedText}</span> : isOwn ? <span className="profile-unverified-pill">{unverifiedText}</span> : null}
            {customBadge && <span className="profile-custom-badge">{customBadge}</span>}
          </div>
          {shownProfile.bio && <p className="profile-bio">{shownProfile.bio}</p>}
          <div className="profile-public-meta">{shownProfile.location && <span><MapPin size={15} />{shownProfile.location}</span>}{shownProfile.website_url && <a href={shownProfile.website_url} target="_blank" rel="noreferrer"><Globe2 size={15} />{shownProfile.website_url.replace(/^https?:\/\//,"").replace(/\/$/,"")}</a>}<span><CalendarDays size={15} />{language === "bn" ? "যোগ দিয়েছেন" : "Joined"} {new Date(shownProfile.created_at).toLocaleDateString(language === "bn" ? "bn-BD" : "en", { month: "short", year: "numeric" })}</span></div>
          {summary && <div className="profile-social-stats"><div><strong>{Number(summary.post_count).toLocaleString()}</strong><span>{language === "bn" ? "পোস্ট" : "Posts"}</span></div><div><strong>{Number(summary.connection_count).toLocaleString()}</strong><span>{language === "bn" ? "কানেকশন" : "Connections"}</span></div><div><strong>{Number(summary.like_count).toLocaleString()}</strong><span>{language === "bn" ? "লাইক" : "Likes"}</span></div>{!isOwn && <div><strong>{Number(summary.mutual_count).toLocaleString()}</strong><span>{language === "bn" ? "মিউচুয়াল" : "Mutual"}</span></div>}</div>}
          {isOwn && editing && <p className="profile-photo-hint">{language === "bn" ? "ক্যামেরা আইকনে চাপ দিয়ে নিজের ছবি দিন · সর্বোচ্চ 5MB" : "Tap the camera to upload your photo · up to 5MB"}</p>}
          {!isOwn && <div className="profile-connection-actions">{!connection && <button className="primary-button" onClick={() => void changeConnection("connect")}><UserPlus size={18} />{t("feed.connect")}</button>}{connection?.status === "accepted" && <button className="secondary-button" onClick={() => void changeConnection("remove")}><UserCheck size={18} />{t("feed.connected")}</button>}{connection?.status === "pending" && connection.requester_id === user?.id && <span className="status pending">{t("feed.pending")}</span>}{connection?.status === "pending" && connection.addressee_id === user?.id && <><button className="primary-button" onClick={() => void changeConnection("accept")}><Check size={18} />{t("network.accept")}</button><button className="secondary-button" onClick={() => void changeConnection("reject")}><X size={18} />{t("network.reject")}</button></>}<button className="secondary-button" onClick={() => void navigator.share?.({ title: shownProfile.full_name, url: window.location.href })}><Share2 size={18} />{language === "bn" ? "শেয়ার" : "Share"}</button></div>}
        </div>
      </div>
    </section>

    {message && <div className={`form-message ${messageType}`}>{message}</div>}

    {isOwn && !editing && <section className="profile-card profile-overview-card">
      <div className="profile-overview-head"><div><span>{language === "bn" ? "আপনার প্রোফাইল" : "Your profile"}</span><h2>{language === "bn" ? "অ্যাকাউন্ট তথ্য" : "Account details"}</h2></div><button type="button" onClick={() => { setMessage(null); setEditing(true); }}><Pencil size={16} />{language === "bn" ? "পরিবর্তন" : "Edit"}</button></div>
      <div className="profile-overview-grid">
        <div className="profile-overview-item"><span className="profile-overview-icon"><Mail size={18} /></span><div><small>{t("profile.email")}</small><strong>{email || (language === "bn" ? "যোগ করা হয়নি" : "Not added")}</strong></div></div>
        <div className="profile-overview-item"><span className="profile-overview-icon"><Phone size={18} /></span><div><small>{t("profile.mobile")}</small><strong>{mobile || (language === "bn" ? "যোগ করা হয়নি" : "Not added")}</strong></div></div>
      </div>
    </section>}

    {isOwn && editing && <form className="profile-card profile-edit-card" onSubmit={save}>
      <div className="profile-edit-head"><div className="profile-section-heading"><div className="profile-section-icon"><Pencil size={20} /></div><div><h2>{t("profile.update")}</h2><p>{language === "bn" ? "আপনার ব্যক্তিগত তথ্য আপডেট করুন" : "Keep your personal information up to date"}</p></div></div><button type="button" className="profile-edit-close" aria-label={language === "bn" ? "এডিট বন্ধ করুন" : "Close editing"} onClick={() => { setEditing(false); setMessage(null); setName(shownProfile.full_name ?? ""); setBio(shownProfile.bio ?? ""); setHeadline(shownProfile.headline ?? ""); setLocation(shownProfile.location ?? ""); setWebsite(shownProfile.website_url ?? ""); setCoverUrl(shownProfile.cover_url ?? ""); setEmail(user?.email ?? ""); setRefreshKey((value) => value + 1); }}><X size={18} /></button></div>
      <div className="profile-form-grid">
        <div className="field profile-form-wide"><label>{t("profile.name")}</label><div className="input-wrap"><UserRound size={19} /><input className="input with-icon" value={name} onChange={(event) => setName(event.target.value)} required /></div></div>
        <div className="field"><label>{t("profile.email")}</label><div className="input-wrap"><Mail size={19} /><input className="input with-icon" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></div>
        <div className="field"><label>{t("profile.mobile")}</label><div className="input-wrap"><Phone size={19} /><input className="input with-icon" value={mobile} onChange={(event) => setMobile(event.target.value)} /></div></div>
        <div className="field profile-form-wide"><label>{t("profile.bio")}</label><textarea className="textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} /></div>
        <div className="field profile-form-wide"><label>{language === "bn" ? "প্রোফাইল শিরোনাম" : "Profile headline"}</label><input className="input" value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={120} placeholder={language === "bn" ? "যেমন: ডিজিটাল মার্কেটার ও রিসেলার" : "Example: Digital marketer and reseller"} /></div>
        <div className="field"><label>{language === "bn" ? "লোকেশন" : "Location"}</label><div className="input-wrap"><MapPin size={19} /><input className="input with-icon" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={120} /></div></div>
        <div className="field"><label>{language === "bn" ? "ওয়েবসাইট" : "Website"}</label><div className="input-wrap"><Globe2 size={19} /><input className="input with-icon" type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" /></div></div>
        <div className="field profile-form-wide"><label>{language === "bn" ? "কভার ছবির URL" : "Cover image URL"}</label><div className="input-wrap"><Camera size={19} /><input className="input with-icon" type="url" value={coverUrl} onChange={(event) => setCoverUrl(event.target.value)} placeholder="https://" /></div></div>
      </div>
      <button className="primary-button profile-save-button">{t("profile.update")}</button>
    </form>}

    {isOwn && activity && <section className="profile-card profile-level-card">
      <div className="profile-level-top"><div className="profile-level-medal"><Award size={27} /><span>LV</span><strong>{activity.level}</strong></div><div className="profile-level-copy"><small>{language === "bn" ? "TASKORA ACTIVITY LEVEL" : "TASKORA ACTIVITY LEVEL"}</small><h2>{language === "bn" ? `লেভেল ${activity.level}` : `Level ${activity.level}`}</h2><p>{nextLevelScore == null ? (language === "bn" ? "আপনি সর্বোচ্চ লেভেলে পৌঁছেছেন।" : "You reached the highest level.") : (language === "bn" ? `পরের লেভেলের জন্য ${Math.max(0, nextLevelScore - activityScore).toLocaleString()} activity বাকি` : `${Math.max(0, nextLevelScore - activityScore).toLocaleString()} activity to the next level`)}</p></div><strong className="profile-level-percent">{levelProgress}%</strong></div>
      <div className="profile-level-progress"><span style={{ width: `${levelProgress}%` }} /></div>
      <div className="profile-level-stats"><div><Gauge size={18} /><span><small>{language === "bn" ? "কাজ সম্পন্ন" : "Jobs done"}</small><strong>{Number(activity.approved_jobs).toLocaleString()}</strong></span></div><div><ShoppingBag size={18} /><span><small>{language === "bn" ? "ক্যাম্পেইন" : "Campaigns"}</small><strong>{Number(activity.campaigns).toLocaleString()}</strong></span></div><div><Coins size={18} /><span><small>{language === "bn" ? "কয়েন" : "Coins"}</small><strong>{Number(coins?.balance ?? 0).toLocaleString()}</strong></span></div></div>
    </section>}

    <section className="profile-card profile-referral-card">
      <div className="profile-section-heading"><div className="profile-section-icon"><UsersRound size={20} /></div><div><h2>{t("profile.referral")}</h2><p>{language === "bn" ? "আপনার ইউনিক রেফারেল কোড" : "Your unique referral code"}</p></div></div>
      <div className="profile-referral-code"><strong>{shownProfile.referral_code}</strong></div>
      {isOwn && coins && <div className="profile-referral-reward"><Coins size={18} /><span>{language === "bn" ? `প্রতি সফল রেফারে ${coins.referral_reward} কয়েন · মোট ${coins.referral_count} রেফার` : `${coins.referral_reward} coins per successful referral · ${coins.referral_count} total referrals`}</span></div>}
      {isOwn && <div className="profile-referral-actions"><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(referralLink)}><Link2 size={18} />{t("profile.copyLink")}</button><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(shownProfile.referral_code)}><Copy size={18} />{t("profile.copyCode")}</button></div>}
    </section>

    <section className="profile-posts-section"><h2 className="section-title">{t("profile.posts")}</h2><div className="profile-post-list">{posts.length ? posts.map((post) => <article key={post.id} className="profile-card profile-post-card"><p className="post-body">{post.body || t("profile.mediaPost")}</p><div className="muted profile-post-time"><Heart size={14} />{new Date(post.created_at).toLocaleString()}</div></article>) : <div className="profile-card profile-empty-posts">{t("feed.empty")}</div>}</div></section>
    {isOwn && <div className="profile-utility-actions"><a className="secondary-button" href="/wallet"><WalletCards size={18} />{t("common.wallet")}</a><button className="secondary-button" onClick={() => void navigator.share?.({ title: shownProfile.full_name, url: window.location.href })}><Share2 size={18} />{language === "bn" ? "প্রোফাইল শেয়ার" : "Share profile"}</button><a className="secondary-button profile-password-button" href="/reset-password"><KeyRound size={18} />{t("profile.password")}</a></div>}
  </div></main></AppShell>;
}

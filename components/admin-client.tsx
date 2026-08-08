"use client";

import { Activity, BadgeCheck, BriefcaseBusiness, Check, CircleDollarSign, FileCheck2, LayoutDashboard, LockKeyhole, Megaphone, Newspaper, Palette, Plus, RefreshCw, Search, Settings, ShieldCheck, Trash2, UserRound, UsersRound, WalletCards, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { ErrorState, LoadingCards, Modal } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl, safeFileName } from "@/lib/url";

type AdminTab = "dashboard" | "users" | "jobs" | "proofs" | "withdrawals" | "posts" | "reports" | "content" | "settings" | "audit";
interface AdminStats { total_users: number; activated_users: number; locked_users: number; active_jobs: number; pending_proofs: number; proofs_approved_today: number; wallet_liabilities: number; pending_withdrawals: number; total_posts: number; }
interface AdminUser { id: string; full_name: string; mobile: string | null; badge_label: string | null; is_suspended: boolean; membership_status: string; created_at: string; }
interface AdminJob { id: string; job_code: string; title_en: string; reward: number; max_slots: number; completed_count: number; is_active: boolean; }
interface AdminProof { id: string; user_id: string; job_id: string; status: string; proof_text: string | null; proof_url: string | null; proof_media_paths: string[]; submitted_at: string | null; reviewer_note: string | null; profiles?: { full_name: string } | null; jobs?: { title_en: string; job_code: string; reward: number } | null; }
interface Withdrawal { id: string; user_id: string; amount: number; payment_method: string; destination: string; status: string; created_at: string; admin_note: string | null; }
interface AdminPost { id: string; author_id: string; body: string | null; is_pinned: boolean; is_hidden: boolean; created_at: string; }
interface AdminReport { id: string; reason: string; status: string; created_at: string; post_id: string | null; comment_id: string | null; reporter?: { full_name: string } | null; posts?: { body: string | null } | null; comments?: { body: string } | null; }
interface AuditRow { id: string; actor_id: string | null; action: string; target_type: string; target_id: string | null; reason: string | null; created_at: string; }

const tabs: Array<{ id: AdminTab; key: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", key: "admin.title", icon: LayoutDashboard },
  { id: "users", key: "admin.users", icon: UsersRound },
  { id: "jobs", key: "admin.jobs", icon: BriefcaseBusiness },
  { id: "proofs", key: "admin.proofs", icon: FileCheck2 },
  { id: "withdrawals", key: "admin.withdrawals", icon: WalletCards },
  { id: "posts", key: "admin.posts", icon: Newspaper },
  { id: "reports", key: "admin.reports", icon: ShieldCheck },
  { id: "content", key: "admin.content", icon: Megaphone },
  { id: "settings", key: "admin.settings", icon: Palette },
  { id: "audit", key: "admin.audit", icon: Activity },
];

const ADMIN_USERNAME = "admin";
const ADMIN_AUTH_EMAIL = "fahimprivateuser@gmail.com";
const ADMIN_LOGIN_ERROR = "Incorrect administrator credentials.";

export function AdminClient() {
  const { t } = useI18n(); const { isAdmin, loading: authLoading, refresh: refreshAuth } = useAuth(); const { general, support, refresh: refreshConfig } = useSiteConfig();
  const [tab, setTab] = useState<AdminTab>("dashboard"); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState(""); const [adminPassword, setAdminPassword] = useState(""); const [adminLoginError, setAdminLoginError] = useState<string | null>(null); const [adminSigningIn, setAdminSigningIn] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null); const [users, setUsers] = useState<AdminUser[]>([]); const [jobs, setJobs] = useState<AdminJob[]>([]); const [proofs, setProofs] = useState<AdminProof[]>([]); const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]); const [posts, setPosts] = useState<AdminPost[]>([]); const [reports, setReports] = useState<AdminReport[]>([]); const [audit, setAudit] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState(""); const [jobOpen, setJobOpen] = useState(false); const [jobDraft, setJobDraft] = useState({ code: "", titleEn: "", titleBn: "", shortEn: "", shortBn: "", instructionsEn: "", instructionsBn: "", category: "General", targetUrl: "", thumbnailUrl: "", instructionImageUrl: "", reward: "", maxSlots: "100", deadline: "", sortOrder: "0", allowResubmission: true, proofText: true, proofUrl: false, proofImages: true });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(() => ({ ...general, supportLabel: support.label, supportUrl: support.contactUrl ?? "", supportEnabled: support.enabled, supportPhone: support.phone ?? "", supportIconUrl: support.iconUrl ?? "", supportPosition: support.position }));

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; }
    setLoading(true); setError(false);
    const [statsResult, usersResult, jobsResult, proofsResult, withdrawalResult, postsResult, reportsResult, auditResult] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.rpc("admin_list_users", { p_search: search || null, p_limit: 50, p_offset: 0 }),
      supabase.from("jobs").select("id,job_code,title_en,reward,max_slots,completed_count,is_active").order("sort_order").limit(100),
      supabase.from("job_submissions").select("id,user_id,job_id,status,proof_text,proof_url,proof_media_paths,submitted_at,reviewer_note,profiles!job_submissions_user_profile_fkey(full_name),jobs!job_submissions_job_id_fkey(title_en,job_code,reward)").order("created_at", { ascending: false }).limit(100),
      supabase.from("withdrawal_requests").select("id,user_id,amount,payment_method,destination,status,created_at,admin_note").order("created_at", { ascending: false }).limit(100),
      supabase.from("posts").select("id,author_id,body,is_pinned,is_hidden,created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("content_reports").select("id,reason,status,created_at,post_id,comment_id,reporter:profiles!content_reports_reporter_id_fkey(full_name),posts!content_reports_post_id_fkey(body),comments!content_reports_comment_id_fkey(body)").order("created_at", { ascending: false }).limit(100),
      supabase.from("admin_audit_logs").select("id,actor_id,action,target_type,target_id,reason,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    setStats(statsResult.data as AdminStats | null); setUsers((usersResult.data as AdminUser[]) ?? []); setJobs((jobsResult.data as AdminJob[]) ?? []); setProofs((proofsResult.data as unknown as AdminProof[]) ?? []); setWithdrawals((withdrawalResult.data as Withdrawal[]) ?? []); setPosts((postsResult.data as AdminPost[]) ?? []); setReports((reportsResult.data as unknown as AdminReport[]) ?? []); setAudit((auditResult.data as AuditRow[]) ?? []);
    setError([statsResult, usersResult, jobsResult, proofsResult, withdrawalResult, postsResult, reportsResult, auditResult].some((result) => result.error)); setLoading(false);
  }, [isAdmin, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);
  useEffect(() => { setSettingsDraft({ ...general, supportLabel: support.label, supportUrl: support.contactUrl ?? "", supportEnabled: support.enabled, supportPhone: support.phone ?? "", supportIconUrl: support.iconUrl ?? "", supportPosition: support.position }); }, [general, support]);

  const adminSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setAdminLoginError(null);
    if (adminUsername.trim().toLowerCase() !== ADMIN_USERNAME) { setAdminLoginError(ADMIN_LOGIN_ERROR); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAdminLoginError("Administrator login is temporarily unavailable."); return; }
    setAdminSigningIn(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: ADMIN_AUTH_EMAIL, password: adminPassword });
      if (signInError || !data.user) throw new Error(ADMIN_LOGIN_ERROR);
      const { data: role, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      if (roleError || !role) {
        await supabase.auth.signOut();
        throw new Error(ADMIN_LOGIN_ERROR);
      }
      setAdminPassword("");
      await refreshAuth();
    } catch {
      setAdminLoginError(ADMIN_LOGIN_ERROR);
    } finally {
      setAdminSigningIn(false);
    }
  };

  const membershipAction = async (item: AdminUser) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const active = item.membership_status !== "active";
    const { error: membershipError } = await supabase.rpc("admin_set_membership", {
      p_user_id: item.id,
      p_active: active,
      p_reason: active ? "Manual admin activation" : "Manual admin deactivation",
    });
    if (membershipError) { setMessage(membershipError.message); await load(); return; }

    if (active) {
      const { error: badgeError } = await supabase.rpc("admin_set_user_badge", {
        p_user_id: item.id,
        p_badge: "Verified",
        p_reason: "Automatic verified badge for membership activation",
      });
      setMessage(badgeError ? `Membership updated, but badge failed: ${badgeError.message}` : "Membership activated and Verified badge added.");
    } else if (item.badge_label === "Verified") {
      const { error: badgeError } = await supabase.rpc("admin_set_user_badge", {
        p_user_id: item.id,
        p_badge: "",
        p_reason: "Automatic verified badge removal after deactivation",
      });
      setMessage(badgeError ? `Membership updated, but badge failed: ${badgeError.message}` : "Membership deactivated and Verified badge removed.");
    } else {
      setMessage("Membership updated.");
    }
    await load();
  };
  const suspensionAction = async (item: AdminUser) => { const reason = window.prompt("Reason (required):")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_set_user_suspension", { p_user_id: item.id, p_suspended: !item.is_suspended, p_reason: reason }); setMessage(actionError ? actionError.message : "User status updated."); await load(); };
  const badgeAction = async (item: AdminUser) => { const badge = window.prompt("Badge label (leave blank to remove):", item.badge_label ?? ""); if (badge == null) return; const reason = window.prompt("Reason (required):")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_set_user_badge", { p_user_id: item.id, p_badge: badge, p_reason: reason }); setMessage(actionError ? actionError.message : "Badge updated."); await load(); };
  const walletAdjustment = async (item: AdminUser) => { const amount = Number(window.prompt("Adjustment amount (positive or negative):")); if (!Number.isFinite(amount) || amount === 0) return; const reason = window.prompt("Reason (required):")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_adjust_wallet", { p_user_id: item.id, p_amount: amount, p_reason: reason }); setMessage(actionError ? actionError.message : "Wallet adjustment recorded."); await load(); };
  const reviewProof = async (proofId: string, action: "approve" | "reject" | "resubmit") => { const note = action === "approve" ? null : window.prompt("Review note (required):")?.trim(); if (action !== "approve" && !note) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const functionName = action === "approve" ? "admin_approve_job_submission" : "admin_review_job_submission"; const args = action === "approve" ? { p_submission_id: proofId } : { p_submission_id: proofId, p_action: action, p_note: note }; const { error: actionError } = await supabase.rpc(functionName, args); setMessage(actionError ? actionError.message : "Proof review saved."); await load(); };
  const updateWithdrawal = async (id: string, status: "approved" | "rejected" | "paid") => { const note = window.prompt("Admin note (optional):") ?? ""; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_update_withdrawal", { p_request_id: id, p_status: status, p_note: note || null }); setMessage(actionError ? actionError.message : "Withdrawal updated."); await load(); };
  const moderatePost = async (id: string, changes: Partial<Pick<AdminPost, "is_pinned" | "is_hidden">>) => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; await supabase.from("posts").update(changes).eq("id", id); await load(); };
  const deletePost = async (id: string) => { if (!window.confirm("Remove this post?")) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; await supabase.from("posts").delete().eq("id", id); await load(); };
  const updateReport = async (id: string, status: "reviewed" | "dismissed" | "actioned") => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.from("content_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id); setMessage(actionError ? actionError.message : "Report updated."); await load(); };

  const createJob = async (event: FormEvent) => { event.preventDefault(); const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: insertError } = await supabase.from("jobs").insert({ job_code: jobDraft.code.trim().toUpperCase(), title_en: jobDraft.titleEn.trim(), title_bn: jobDraft.titleBn.trim() || null, short_description_en: jobDraft.shortEn.trim() || null, short_description_bn: jobDraft.shortBn.trim() || null, full_instructions_en: jobDraft.instructionsEn.trim(), full_instructions_bn: jobDraft.instructionsBn.trim() || null, category: jobDraft.category.trim(), target_url: jobDraft.targetUrl.trim(), thumbnail_url: jobDraft.thumbnailUrl.trim() || null, instruction_image_url: jobDraft.instructionImageUrl.trim() || null, reward: Number(jobDraft.reward), max_slots: Number(jobDraft.maxSlots), deadline: jobDraft.deadline ? new Date(jobDraft.deadline).toISOString() : null, sort_order: Number(jobDraft.sortOrder), allow_resubmission: jobDraft.allowResubmission, proof_requirements: { text: jobDraft.proofText, url: jobDraft.proofUrl, images: jobDraft.proofImages, maxImages: jobDraft.proofImages ? 3 : 0 }, is_active: true }); if (insertError) setMessage(insertError.message); else { setJobOpen(false); setMessage("Job created."); await load(); } };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    if (settingsDraft.supportUrl && !isSafeExternalUrl(settingsDraft.supportUrl)) { setMessage("Support URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.supportIconUrl && !isSafeExternalUrl(settingsDraft.supportIconUrl)) { setMessage("Support icon URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.logoUrl && !isSafeExternalUrl(settingsDraft.logoUrl)) { setMessage("Logo URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.faviconUrl && !isSafeExternalUrl(settingsDraft.faviconUrl)) { setMessage("Favicon URL must use HTTP or HTTPS."); return; }
    const { supportLabel, supportUrl, supportEnabled, supportPhone, supportIconUrl, supportPosition, ...generalDraft } = settingsDraft;
    let logoUrl = generalDraft.logoUrl;
    if (logoFile) {
      if (!logoFile.type.startsWith("image/") || logoFile.size > 5 * 1024 * 1024) { setMessage("Logo must be an image smaller than 5 MB."); return; }
      const path = `logos/${safeFileName(logoFile.name)}`;
      const upload = await supabase.storage.from("branding").upload(path, logoFile, { contentType: logoFile.type });
      if (upload.error) { setMessage(upload.error.message); return; }
      logoUrl = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
    }
    const generalValue = { ...general, ...generalDraft, logoUrl };
    const supportValue = { ...support, label: supportLabel, contactUrl: supportUrl || null, enabled: supportEnabled, phone: supportPhone || null, iconUrl: supportIconUrl || null, position: supportPosition };
    const [g, s] = await Promise.all([supabase.from("site_settings").update({ value: generalValue }).eq("key", "general"), supabase.from("site_settings").update({ value: supportValue }).eq("key", "support")]);
    setMessage(g.error || s.error ? "Settings could not be saved." : "Settings saved."); if (!g.error && !s.error) setLogoFile(null); await refreshConfig();
  };

  if (authLoading) return <AppShell><main className="admin-shell"><LoadingCards count={5} /></main></AppShell>;
  if (!isAdmin) return <main className="auth-page auth-page-login"><section className="auth-card">
    <div className="auth-logo"><ShieldCheck size={36} /></div>
    <h1 className="auth-title">Admin Login</h1>
    <p className="auth-subtitle">Sign in to the {general.siteName} administration panel.</p>
    <form className="auth-form" onSubmit={adminSignIn}>
      <div className="field"><label>Admin username</label><div className="input-wrap"><UserRound size={20} /><input className="input with-icon" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></div></div>
      <div className="field"><label>Password</label><div className="input-wrap"><LockKeyhole size={20} /><input className="input with-icon" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" required /></div></div>
      {adminLoginError && <div className="form-message error" role="alert">{adminLoginError}</div>}
      <button className="primary-button" type="submit" disabled={adminSigningIn}>{adminSigningIn ? "Signing in…" : "Login to Admin Panel"}</button>
    </form>
  </section></main>;

  return <AppShell><main className="admin-shell"><section className="admin-hero"><div style={{ display: "flex", gap: 12, alignItems: "center" }}><div className="quick-icon" style={{ background: "rgba(255,255,255,.11)", color: "white" }}><ShieldCheck /></div><div><h1 style={{ margin: 0, fontSize: "2rem" }}>{t("admin.title")}</h1><p style={{ margin: "4px 0 0", color: "#cbd3df" }}>{t("admin.subtitle")}</p></div></div></section>
    <div className="admin-tabs">{tabs.map(({ id, key, icon: Icon }) => <button key={id} className={`admin-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}><Icon size={17} style={{ display: "inline", marginRight: 6 }} />{t(key)}</button>)}</div>
    {message && <div className="form-message success" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>{message}<button style={{ border: 0, background: "transparent" }} onClick={() => setMessage(null)}><X size={17} /></button></div>}
    {loading ? <LoadingCards count={5} /> : error ? <ErrorState message={t("common.error")} /> : <>
      {tab === "dashboard" && stats && <div style={{ display: "grid", gap: 18 }}><div className="admin-stats">{[["Users",stats.total_users,UsersRound],["Activated",stats.activated_users,BadgeCheck],["Active jobs",stats.active_jobs,BriefcaseBusiness],["Pending proofs",stats.pending_proofs,FileCheck2],["Wallet liability",formatMoney(Number(stats.wallet_liabilities), general.currency, "en"),CircleDollarSign],["Pending withdrawals",stats.pending_withdrawals,WalletCards],["Feed posts",stats.total_posts,Newspaper],["Approved today",stats.proofs_approved_today,Check]].map(([label,value,Icon]) => { const IconComponent = Icon as typeof UsersRound; return <div className="admin-stat" key={String(label)}><IconComponent size={21} color="var(--primary)" /><strong>{String(value)}</strong><span className="muted">{String(label)}</span></div>; })}</div></div>}
      {tab === "users" && <section style={{ display: "grid", gap: 12 }}><form onSubmit={(event) => { event.preventDefault(); void load(); }} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}><div className="input-wrap"><Search size={19} /><input className="input with-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /></div><button className="secondary-button"><Search size={18} /></button></form><div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Mobile</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><div className="muted">{item.badge_label || item.id.slice(0,8)}</div></td><td>{item.mobile || "—"}</td><td><span className={`status ${item.membership_status}`}>{item.membership_status}</span> {item.is_suspended && <span className="status rejected">Suspended</span>}</td><td>{new Date(item.created_at).toLocaleDateString()}</td><td><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}><button className="secondary-button" style={{ minHeight: 38 }} onClick={() => void membershipAction(item)}>{item.membership_status === "active" ? <LockKeyhole size={16} /> : <BadgeCheck size={16} />}{item.membership_status === "active" ? t("admin.deactivate") : t("admin.activate")}</button><button className="secondary-button" style={{ minHeight: 38 }} onClick={() => void badgeAction(item)}>{t("admin.badge")}</button><button className="secondary-button" style={{ minHeight: 38 }} onClick={() => void walletAdjustment(item)}>{t("admin.adjust")}</button><button className={item.is_suspended ? "secondary-button" : "danger-button"} style={{ minHeight: 38 }} onClick={() => void suspensionAction(item)}>{item.is_suspended ? t("admin.restore") : t("admin.suspend")}</button></div></td></tr>)}</tbody></table></div></section>}
      {tab === "jobs" && <section style={{ display: "grid", gap: 12 }}><div style={{ display: "flex", justifyContent: "flex-end" }}><button className="primary-button" onClick={() => setJobOpen(true)}><Plus size={18} />{t("admin.createJob")}</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Code</th><th>Title</th><th>Reward</th><th>Slots</th><th>Status</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.job_code}</td><td>{job.title_en}</td><td>{formatMoney(Number(job.reward), general.currency, "en")}</td><td>{job.completed_count}/{job.max_slots}</td><td><button className={`status ${job.is_active ? "active" : ""}`} onClick={async () => { const supabase = getSupabaseBrowserClient(); if (supabase) { await supabase.from("jobs").update({ is_active: !job.is_active }).eq("id", job.id); await load(); } }}>{job.is_active ? "Active" : "Inactive"}</button></td></tr>)}</tbody></table></div></section>}
      {tab === "proofs" && <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Job</th><th>Proof</th><th>Status</th><th>Actions</th></tr></thead><tbody>{proofs.map((proof) => <tr key={proof.id}><td>{proof.profiles?.full_name ?? proof.user_id.slice(0,8)}</td><td>{proof.jobs?.job_code} · {proof.jobs?.title_en}</td><td><div>{proof.proof_text || "—"}</div>{proof.proof_url && <a href={proof.proof_url} target="_blank" rel="noreferrer">Proof URL</a>}<ProofMediaLinks paths={proof.proof_media_paths ?? []} /></td><td><span className={`status ${proof.status}`}>{proof.status}</span></td><td><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{proof.status === "pending" && <><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void reviewProof(proof.id,"approve")}><Check size={15} />Approve</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void reviewProof(proof.id,"reject")}><X size={15} />Reject</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void reviewProof(proof.id,"resubmit")}><RefreshCw size={15} />Resubmit</button></>}</div></td></tr>)}</tbody></table></div>}
      {tab === "withdrawals" && <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Amount</th><th>Destination</th><th>Status</th><th>Actions</th></tr></thead><tbody>{withdrawals.map((item) => <tr key={item.id}><td>{item.user_id.slice(0,8)}</td><td>{formatMoney(Number(item.amount), general.currency, "en")}</td><td>{item.payment_method}<div className="muted">{item.destination}</div></td><td><span className={`status ${item.status}`}>{item.status}</span></td><td><div style={{ display: "flex", gap: 5 }}>{item.status === "pending" && <><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateWithdrawal(item.id,"approved")}>Approve</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateWithdrawal(item.id,"rejected")}>Reject</button></>}{item.status === "approved" && <button className="primary-button" style={{ minHeight: 36 }} onClick={() => void updateWithdrawal(item.id,"paid")}>Mark paid</button>}</div></td></tr>)}</tbody></table></div>}
      {tab === "posts" && <div className="table-wrap"><table className="data-table"><thead><tr><th>Post</th><th>Created</th><th>Flags</th><th>Actions</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td style={{ maxWidth: 420 }}>{post.body || "Media post"}</td><td>{new Date(post.created_at).toLocaleDateString()}</td><td>{post.is_pinned && <span className="status active">Pinned</span>} {post.is_hidden && <span className="status rejected">Hidden</span>}</td><td><div style={{ display: "flex", gap: 5 }}><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void moderatePost(post.id,{ is_pinned: !post.is_pinned })}>{post.is_pinned ? "Unpin" : "Pin"}</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void moderatePost(post.id,{ is_hidden: !post.is_hidden })}>{post.is_hidden ? "Unhide" : "Hide"}</button><button className="danger-button" style={{ minHeight: 36 }} onClick={() => void deletePost(post.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
      {tab === "reports" && <div className="table-wrap"><table className="data-table"><thead><tr><th>Reporter</th><th>Content</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.reporter?.full_name ?? "Member"}</td><td style={{ maxWidth: 320 }}>{report.posts?.body || report.comments?.body || (report.post_id ? "Media post" : "Comment")}</td><td>{report.reason}</td><td><span className={`status ${report.status}`}>{report.status}</span></td><td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{report.status === "open" && <><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateReport(report.id, "reviewed")}>Reviewed</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateReport(report.id, "dismissed")}>Dismiss</button><button className="danger-button" style={{ minHeight: 36 }} onClick={() => void updateReport(report.id, "actioned")}>Actioned</button></>}</div></td></tr>)}</tbody></table></div>}
      {tab === "content" && <ContentAdmin onChanged={load} />}
      {tab === "settings" && <form className="card" style={{ padding: 22, display: "grid", gap: 15, marginBottom: 14 }} onSubmit={saveSettings}><h2 className="section-title">Media, payout & support details</h2><div className="field"><label>Upload logo</label><input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} /></div><div className="field"><label>Favicon URL</label><input className="input" type="url" value={settingsDraft.faviconUrl ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, faviconUrl: event.target.value || null }))} /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div className="field"><label>Currency</label><input className="input" maxLength={3} value={settingsDraft.currency} onChange={(event) => setSettingsDraft((value) => ({ ...value, currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0,3) }))} /></div><div className="field"><label>Member badge wording</label><input className="input" value={settingsDraft.memberBadgeWording} onChange={(event) => setSettingsDraft((value) => ({ ...value, memberBadgeWording: event.target.value }))} /></div></div><div className="field"><label>Payout methods (comma separated)</label><input className="input" value={settingsDraft.payoutMethods.join(", ")} onChange={(event) => setSettingsDraft((value) => ({ ...value, payoutMethods: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /></div><div className="field"><label>Support phone</label><input className="input" value={settingsDraft.supportPhone} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportPhone: event.target.value }))} /></div><div className="field"><label>Support icon URL</label><input className="input" type="url" value={settingsDraft.supportIconUrl} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportIconUrl: event.target.value }))} /></div><div className="field"><label>Support position</label><select className="select" value={settingsDraft.supportPosition} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportPosition: event.target.value as "left" | "right" }))}><option value="right">Right</option><option value="left">Left</option></select></div><div className="field"><label>General notice</label><textarea className="textarea" value={settingsDraft.generalNotice} onChange={(event) => setSettingsDraft((value) => ({ ...value, generalNotice: event.target.value }))} /></div><div className="field"><label>Privacy content</label><textarea className="textarea" value={settingsDraft.privacyContent} onChange={(event) => setSettingsDraft((value) => ({ ...value, privacyContent: event.target.value }))} /></div><div className="soft-card" style={{ padding: 12 }}><strong>Payment gateway</strong><div className="muted">{settingsDraft.paymentGatewayStatus === "configured" ? "Configured" : "Not configured"}. Activation is never granted by a client-side click.</div></div><button className="primary-button"><Settings size={18} />{t("admin.save")}</button></form>}
      {tab === "settings" && <form className="card" style={{ padding: 22, display: "grid", gap: 15 }} onSubmit={saveSettings}><h2 className="section-title">Branding & general settings</h2><div className="field"><label>Site name</label><input className="input" value={settingsDraft.siteName} onChange={(event) => setSettingsDraft((value) => ({ ...value, siteName: event.target.value }))} /></div><div className="field"><label>Logo URL</label><input className="input" value={settingsDraft.logoUrl ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, logoUrl: event.target.value || null }))} /></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}><div className="field"><label>Primary</label><input className="input" type="color" value={settingsDraft.primaryColor} onChange={(event) => setSettingsDraft((value) => ({ ...value, primaryColor: event.target.value }))} /></div><div className="field"><label>Accent</label><input className="input" type="color" value={settingsDraft.accentColor} onChange={(event) => setSettingsDraft((value) => ({ ...value, accentColor: event.target.value }))} /></div><div className="field"><label>Background</label><input className="input" type="color" value={settingsDraft.backgroundColor} onChange={(event) => setSettingsDraft((value) => ({ ...value, backgroundColor: event.target.value }))} /></div></div><div className="field"><label>Activation price</label><input className="input" type="number" step="0.01" value={settingsDraft.activationPrice ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, activationPrice: Number(event.target.value) }))} /></div><div className="field"><label>Withdrawal minimum</label><input className="input" type="number" step="0.01" value={settingsDraft.withdrawalMinimum} onChange={(event) => setSettingsDraft((value) => ({ ...value, withdrawalMinimum: Number(event.target.value) }))} /></div><div className="field"><label>Support label</label><input className="input" value={settingsDraft.supportLabel} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportLabel: event.target.value }))} /></div><div className="field"><label>Support URL</label><input className="input" type="url" value={settingsDraft.supportUrl} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportUrl: event.target.value }))} /></div><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={settingsDraft.supportEnabled} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportEnabled: event.target.checked }))} />Enable floating support</label><button className="primary-button"><Settings size={18} />{t("admin.save")}</button></form>}
      {tab === "audit" && <div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Target</th><th>Reason</th><th>Time</th></tr></thead><tbody>{audit.map((row) => <tr key={row.id}><td><strong>{row.action}</strong></td><td>{row.target_type} · {row.target_id?.slice(0,8) ?? "—"}</td><td>{row.reason || "—"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </>}
    {jobOpen && <Modal title="Create micro job" onClose={() => setJobOpen(false)}><form className="auth-form" onSubmit={createJob}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input className="input" placeholder="Job code" value={jobDraft.code} onChange={(event) => setJobDraft((value) => ({ ...value, code: event.target.value }))} required /><input className="input" placeholder="Category" value={jobDraft.category} onChange={(event) => setJobDraft((value) => ({ ...value, category: event.target.value }))} required /></div>
      <input className="input" placeholder="English title" value={jobDraft.titleEn} onChange={(event) => setJobDraft((value) => ({ ...value, titleEn: event.target.value }))} required />
      <input className="input" placeholder="Bangla title" value={jobDraft.titleBn} onChange={(event) => setJobDraft((value) => ({ ...value, titleBn: event.target.value }))} />
      <textarea className="textarea" placeholder="English short description" value={jobDraft.shortEn} onChange={(event) => setJobDraft((value) => ({ ...value, shortEn: event.target.value }))} />
      <textarea className="textarea" placeholder="Bangla short description" value={jobDraft.shortBn} onChange={(event) => setJobDraft((value) => ({ ...value, shortBn: event.target.value }))} />
      <textarea className="textarea" placeholder="English instructions" value={jobDraft.instructionsEn} onChange={(event) => setJobDraft((value) => ({ ...value, instructionsEn: event.target.value }))} required />
      <textarea className="textarea" placeholder="Bangla instructions" value={jobDraft.instructionsBn} onChange={(event) => setJobDraft((value) => ({ ...value, instructionsBn: event.target.value }))} />
      <input className="input" type="url" placeholder="Target URL" value={jobDraft.targetUrl} onChange={(event) => setJobDraft((value) => ({ ...value, targetUrl: event.target.value }))} required />
      <input className="input" type="url" placeholder="Thumbnail URL (optional)" value={jobDraft.thumbnailUrl} onChange={(event) => setJobDraft((value) => ({ ...value, thumbnailUrl: event.target.value }))} />
      <input className="input" type="url" placeholder="Instruction image URL (optional)" value={jobDraft.instructionImageUrl} onChange={(event) => setJobDraft((value) => ({ ...value, instructionImageUrl: event.target.value }))} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input className="input" type="number" step="0.01" min="0.01" placeholder="Reward" value={jobDraft.reward} onChange={(event) => setJobDraft((value) => ({ ...value, reward: event.target.value }))} required /><input className="input" type="number" min="1" placeholder="Slots" value={jobDraft.maxSlots} onChange={(event) => setJobDraft((value) => ({ ...value, maxSlots: event.target.value }))} required /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input className="input" type="datetime-local" value={jobDraft.deadline} onChange={(event) => setJobDraft((value) => ({ ...value, deadline: event.target.value }))} aria-label="Job deadline" /><input className="input" type="number" value={jobDraft.sortOrder} onChange={(event) => setJobDraft((value) => ({ ...value, sortOrder: event.target.value }))} placeholder="Sort order" /></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}><label><input type="checkbox" checked={jobDraft.proofText} onChange={(event) => setJobDraft((value) => ({ ...value, proofText: event.target.checked }))} /> Text proof</label><label><input type="checkbox" checked={jobDraft.proofUrl} onChange={(event) => setJobDraft((value) => ({ ...value, proofUrl: event.target.checked }))} /> URL proof</label><label><input type="checkbox" checked={jobDraft.proofImages} onChange={(event) => setJobDraft((value) => ({ ...value, proofImages: event.target.checked }))} /> Image proof</label><label><input type="checkbox" checked={jobDraft.allowResubmission} onChange={(event) => setJobDraft((value) => ({ ...value, allowResubmission: event.target.checked }))} /> Allow resubmission</label></div>
      <button className="primary-button">Create job</button>
    </form></Modal>}
  </main></AppShell>;
}

function ProofMediaLinks({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (paths.length === 0) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase.storage.from("job-proofs").createSignedUrls(paths, 300);
      if (active) setUrls((data ?? []).flatMap((item) => item.signedUrl ? [item.signedUrl] : []));
    };
    void load();
    return () => { active = false; };
  }, [paths]);
  if (paths.length === 0) return <div className="muted">No proof files</div>;
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{urls.length === 0 ? <span className="muted">Loading {paths.length} file(s)…</span> : urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Open proof image ${index + 1}`}><img src={url} alt="Proof submission" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", border: "1px solid var(--border)" }} /></a>)}</div>;
}

function ContentAdmin({ onChanged }: { onChanged: () => Promise<void> }) {
  const [kind, setKind] = useState<"ticker" | "banner" | "link" | "project" | "notification">("ticker");
  const [labelEn, setLabelEn] = useState(""); const [labelBn, setLabelBn] = useState(""); const [url, setUrl] = useState(""); const [destination, setDestination] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null); const [direction, setDirection] = useState<"ltr" | "rtl">("rtl"); const [speed, setSpeed] = useState(14); const [textColor, setTextColor] = useState("#FFFFFF"); const [backgroundColor, setBackgroundColor] = useState("#FF4D1F"); const [sortOrder, setSortOrder] = useState(0); const [message, setMessage] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const supabase = getSupabaseBrowserClient(); if (!supabase) return; let result;
    const linkUrl = kind === "banner" ? destination : url;
    if (linkUrl && !isSafeExternalUrl(linkUrl)) { setMessage("Destination URL must use HTTP or HTTPS."); return; }
    if (kind === "ticker") result = await supabase.from("announcement_tickers").insert({ text_en: labelEn, text_bn: labelBn || null, destination_url: url || null, text_color: textColor, background_color: backgroundColor, direction, speed_seconds: speed, sort_order: sortOrder, is_active: true });
    else if (kind === "banner") {
      let imageUrl = url || null;
      if (mediaFile) {
        if (!mediaFile.type.startsWith("image/") || mediaFile.size > 5 * 1024 * 1024) { setMessage("Banner must be an image smaller than 5 MB."); return; }
        const path = `banners/${safeFileName(mediaFile.name)}`; const upload = await supabase.storage.from("branding").upload(path, mediaFile, { contentType: mediaFile.type });
        if (upload.error) { setMessage(upload.error.message); return; }
        imageUrl = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
      }
      result = await supabase.from("banners").insert({ title: labelEn, image_url: imageUrl, destination_url: destination || null, sort_order: sortOrder, is_active: true });
    }
    else if (kind === "link") result = await supabase.from("service_links").insert({ label_en: labelEn, label_bn: labelBn || null, destination_url: url, icon_name: "globe", sort_order: sortOrder, is_active: true });
    else if (kind === "project") result = await supabase.from("project_cards").insert({ title_en: labelEn, title_bn: labelBn || null, destination_url: url || null, sort_order: sortOrder, is_active: true });
    else { const rpcResult = await supabase.rpc("admin_broadcast_notification", { p_title: labelEn, p_body: labelBn || null, p_destination_url: url || null }); result = rpcResult; }
    setMessage(result.error ? result.error.message : "Content saved."); if (!result.error) { setLabelEn(""); setLabelBn(""); setUrl(""); setDestination(""); setMediaFile(null); await onChanged(); }
  };
  return <form className="card" style={{ padding: 22, display: "grid", gap: 13 }} onSubmit={submit}>
    <h2 className="section-title">Admin-controlled content</h2>
    <select className="select" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="ticker">Announcement ticker</option><option value="banner">Hero banner</option><option value="link">Official link</option><option value="project">Project card</option><option value="notification">Broadcast notification</option></select>
    <input className="input" placeholder={kind === "banner" ? "Banner title" : "English label/text"} value={labelEn} onChange={(event) => setLabelEn(event.target.value)} required />
    <input className="input" placeholder="Bangla label/text (optional)" value={labelBn} onChange={(event) => setLabelBn(event.target.value)} />
    <input className="input" type="url" placeholder={kind === "banner" ? "Image URL (optional when uploading)" : "Destination URL (optional)"} value={url} onChange={(event) => setUrl(event.target.value)} />
    {kind === "banner" && <><input className="input" type="url" placeholder="Destination URL (optional)" value={destination} onChange={(event) => setDestination(event.target.value)} /><label className="field"><span>Upload banner image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} /></label></>}
    {kind === "ticker" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}><select className="select" value={direction} onChange={(event) => setDirection(event.target.value as "ltr" | "rtl")}><option value="rtl">Right to left</option><option value="ltr">Left to right</option></select><input className="input" type="number" min="4" max="120" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Ticker speed in seconds" /><input className="input" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} aria-label="Ticker text color" /><input className="input" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} aria-label="Ticker background color" /></div>}
    {kind !== "notification" && <input className="input" type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} placeholder="Sort order" />}
    {message && <div className="form-message success">{message}</div>}<button className="primary-button"><Plus size={18} />Add content</button>
  </form>;
}

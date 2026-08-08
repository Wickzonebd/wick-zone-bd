"use client";

import { Activity, BadgeCheck, BriefcaseBusiness, Check, CircleDollarSign, FileCheck2, Gift, ImagePlus, LayoutDashboard, LockKeyhole, Megaphone, Newspaper, Palette, Plus, RefreshCw, Search, Settings, ShieldCheck, ShoppingBag, Sparkles, Store, Trash2, Trophy, UploadCloud, UserRound, UsersRound, WalletCards, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminContentManager } from "@/components/admin-content-manager";
import { AdminLudoManager } from "@/components/admin-ludo-manager";
import { AdminServicesManager } from "@/components/admin-services-manager";
import { AdminResellingManager } from "@/components/admin-reselling-manager";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { TaskoraLockup, TaskoraMark } from "@/components/taskora-brand";
import { ErrorState, LoadingCards, Modal } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl, safeFileName } from "@/lib/url";

type AdminTab = "dashboard" | "users" | "services" | "reselling" | "ludo" | "jobs" | "proofs" | "withdrawals" | "posts" | "reports" | "content" | "settings" | "audit";
interface AdminStats { total_users: number; activated_users: number; locked_users: number; active_jobs: number; pending_proofs: number; proofs_approved_today: number; wallet_liabilities: number; pending_withdrawals: number; total_posts: number; }
interface AdminUser { id: string; full_name: string; mobile: string | null; badge_label: string | null; is_social_verified: boolean; is_suspended: boolean; membership_status: string; created_at: string; }
interface AdminJob { id: string; job_code: string; title_en: string; category: string; thumbnail_url: string | null; instruction_image_url: string | null; reward: number; max_slots: number; completed_count: number; is_active: boolean; }
interface AdminProof { id: string; user_id: string; job_id: string; status: string; proof_text: string | null; proof_url: string | null; proof_media_paths: string[]; submitted_at: string | null; reviewer_note: string | null; profiles?: { full_name: string } | null; jobs?: { title_en: string; job_code: string; reward: number } | null; }
interface Withdrawal { id: string; user_id: string; amount: number; payment_method: string; destination: string; status: string; created_at: string; admin_note: string | null; }
interface AdminPost { id: string; author_id: string; body: string | null; is_pinned: boolean; is_hidden: boolean; created_at: string; }
interface AdminReport { id: string; reason: string; status: string; created_at: string; post_id: string | null; comment_id: string | null; reporter?: { full_name: string } | null; posts?: { body: string | null } | null; comments?: { body: string } | null; }
interface AuditRow { id: string; actor_id: string | null; action: string; target_type: string; target_id: string | null; reason: string | null; created_at: string; }

const tabs: Array<{ id: AdminTab; key: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", key: "admin.title", icon: LayoutDashboard },
  { id: "users", key: "admin.users", icon: UsersRound },
  { id: "services", key: "admin.services", icon: ShoppingBag },
  { id: "reselling", key: "admin.reselling", icon: Store },
  { id: "ludo", key: "admin.ludo", icon: Trophy },
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
const ADMIN_AUTH_EMAIL = "admin@wickzone.invalid";
const ADMIN_LOGIN_ERROR = "Incorrect administrator credentials.";
const EMPTY_JOB_DRAFT = { code: "", titleEn: "", titleBn: "", shortEn: "", shortBn: "", instructionsEn: "", instructionsBn: "", category: "General", targetUrl: "", thumbnailUrl: "", instructionImageUrl: "", reward: "", maxSlots: "100", deadline: "", sortOrder: "0", allowResubmission: true, proofText: true, proofUrl: false, proofImages: true };

export function AdminClient() {
  const { t } = useI18n(); const { user, isAdmin, loading: authLoading, refresh: refreshAuth } = useAuth(); const { general, support, refresh: refreshConfig } = useSiteConfig();
  const [tab, setTab] = useState<AdminTab>("dashboard"); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState(""); const [adminPassword, setAdminPassword] = useState(""); const [adminLoginError, setAdminLoginError] = useState<string | null>(null); const [adminSigningIn, setAdminSigningIn] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null); const [users, setUsers] = useState<AdminUser[]>([]); const [jobs, setJobs] = useState<AdminJob[]>([]); const [proofs, setProofs] = useState<AdminProof[]>([]); const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]); const [posts, setPosts] = useState<AdminPost[]>([]); const [reports, setReports] = useState<AdminReport[]>([]); const [audit, setAudit] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState(""); const [jobOpen, setJobOpen] = useState(false); const [jobDraft, setJobDraft] = useState(() => ({ ...EMPTY_JOB_DRAFT }));
  const [jobThumbnailFile, setJobThumbnailFile] = useState<File | null>(null); const [jobInstructionFile, setJobInstructionFile] = useState<File | null>(null); const [jobSaving, setJobSaving] = useState(false); const [jobError, setJobError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(() => ({ ...general, supportLabel: support.label, supportUrl: support.contactUrl ?? "", supportEnabled: support.enabled, supportPhone: support.phone ?? "", supportIconUrl: support.iconUrl ?? "", supportPosition: support.position }));

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; }
    setLoading(true); setError(false);
    const [statsResult, usersResult, jobsResult, proofsResult, withdrawalResult, postsResult, reportsResult, auditResult] = await Promise.all([
      supabase.rpc("admin_dashboard_stats"),
      supabase.rpc("admin_list_users", { p_search: search || null, p_limit: 50, p_offset: 0 }),
      supabase.from("jobs").select("id,job_code,title_en,category,thumbnail_url,instruction_image_url,reward,max_slots,completed_count,is_active").order("sort_order").limit(100),
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

  const setMembershipAccess = async (item: AdminUser, active: boolean) => {
    if (item.id === user?.id) { setMessage("The administrator account always has full system access."); return; }
    const confirmation = active
      ? window.confirm(`Gift ${item.full_name} full member access for free? No activation payment will be required.`)
      : window.confirm(`Revoke protected member access for ${item.full_name}?`);
    if (!confirmation) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error: membershipError } = await supabase.rpc("admin_set_membership", {
      p_user_id: item.id,
      p_active: active,
      p_reason: active ? "Complimentary full access gifted by administrator" : "Protected access revoked by administrator",
    });
    if (membershipError) { setMessage(membershipError.message); await load(); return; }
    setMessage(active ? `${item.full_name} now has free full access. Blue Badge remains separate.` : "Member access revoked. Blue Badge was not changed.");
    await load();
  };
  const giftBalance = async (item: AdminUser) => { if (item.id === user?.id) { setMessage("Use member gift controls for customer accounts."); return; } const amount = Number(window.prompt(`Gift amount (${general.currency}):`)); if (!Number.isFinite(amount) || amount <= 0) return; const reasonInput = window.prompt("Gift note:", "Admin gift"); if (reasonInput == null) return; const reason = reasonInput.trim() || "Admin gift"; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_adjust_wallet", { p_user_id: item.id, p_amount: amount, p_reason: reason }); setMessage(actionError ? actionError.message : `${formatMoney(amount, general.currency, "en")} gifted to ${item.full_name}.`); await load(); };
  const suspensionAction = async (item: AdminUser) => { if (item.id === user?.id) { setMessage("The active administrator account cannot be suspended here."); return; } const reason = window.prompt("Reason (required):")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_set_user_suspension", { p_user_id: item.id, p_suspended: !item.is_suspended, p_reason: reason }); setMessage(actionError ? actionError.message : "User status updated."); await load(); };
  const badgeAction = async (item: AdminUser) => { const badge = window.prompt("Custom badge label (Blue Badge is managed separately; leave blank to remove):", item.badge_label === "Verified" ? "" : item.badge_label ?? ""); if (badge == null) return; const reason = window.prompt("Reason (required):")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_set_user_badge", { p_user_id: item.id, p_badge: badge, p_reason: reason }); setMessage(actionError ? actionError.message : "Custom badge updated."); await load(); };
  const socialVerificationAction = async (item: AdminUser) => { if (item.id === user?.id) { setMessage("Use this control for customer accounts."); return; } const next = !item.is_social_verified; if (!window.confirm(`${next ? "Grant" : "Revoke"} Social Blue Badge ${next ? "to" : "from"} ${item.full_name}? ${next ? "This admin grant is free and does not change membership." : "Membership will not be changed."}`)) return; const reason = window.prompt("Reason (required):", next ? "Complimentary Social verification by administrator" : "Social verification revoked by administrator")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_set_social_verification", { p_user_id: item.id, p_verified: next, p_reason: reason }); setMessage(actionError ? actionError.message : next ? "Blue Badge granted for free." : "Blue Badge revoked."); await load(); };
  const walletAdjustment = async (item: AdminUser) => { const amount = Number(window.prompt("Adjustment amount (positive or negative):")); if (!Number.isFinite(amount) || amount === 0) return; const reason = window.prompt("Reason (required):")?.trim(); if (!reason) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_adjust_wallet", { p_user_id: item.id, p_amount: amount, p_reason: reason }); setMessage(actionError ? actionError.message : "Wallet adjustment recorded."); await load(); };
  const removeUser = async (item: AdminUser) => {
    if (item.id === user?.id) { setMessage("The active administrator account cannot remove itself."); return; }
    const confirmation = window.prompt(`Permanently remove ${item.full_name}? Type DELETE to confirm.`)?.trim().toUpperCase();
    if (confirmation !== "DELETE") return;
    const reason = window.prompt("Reason for permanent removal (required):")?.trim();
    if (!reason) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error: actionError } = await supabase.functions.invoke("admin-delete-user", { body: { userId: item.id, reason } });
    setMessage(actionError ? actionError.message : `${item.full_name} was permanently removed.`);
    await load();
  };
  const reviewProof = async (proof: AdminProof, action: "approve" | "reject" | "resubmit") => {
    const note = action === "approve" ? null : window.prompt("Review note (required):")?.trim();
    if (action !== "approve" && !note) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const functionName = action === "approve" ? "admin_approve_job_submission" : "admin_review_job_submission";
    const args = action === "approve" ? { p_submission_id: proof.id } : { p_submission_id: proof.id, p_action: action, p_note: note };
    const { error: actionError } = await supabase.rpc(functionName, args);
    if (actionError) setMessage(actionError.message);
    else if (action === "approve") setMessage(`Approved — ${formatMoney(Number(proof.jobs?.reward ?? 0), general.currency, "en")} was credited to the member wallet exactly once.`);
    else setMessage("Proof review saved.");
    await load();
  };
  const updateWithdrawal = async (id: string, status: "approved" | "rejected" | "paid") => { const note = window.prompt("Admin note (optional):") ?? ""; const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.rpc("admin_update_withdrawal", { p_request_id: id, p_status: status, p_note: note || null }); setMessage(actionError ? actionError.message : "Withdrawal updated."); await load(); };
  const moderatePost = async (id: string, changes: Partial<Pick<AdminPost, "is_pinned" | "is_hidden">>) => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; await supabase.from("posts").update(changes).eq("id", id); await load(); };
  const deletePost = async (id: string) => { if (!window.confirm("Remove this post?")) return; const supabase = getSupabaseBrowserClient(); if (!supabase) return; await supabase.from("posts").delete().eq("id", id); await load(); };
  const updateReport = async (id: string, status: "reviewed" | "dismissed" | "actioned") => { const supabase = getSupabaseBrowserClient(); if (!supabase) return; const { error: actionError } = await supabase.from("content_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id); setMessage(actionError ? actionError.message : "Report updated."); await load(); };

  const createJob = async (event: FormEvent) => {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setJobError(null);
    const reward = Number(jobDraft.reward); const maxSlots = Number(jobDraft.maxSlots);
    if (!Number.isFinite(reward) || reward <= 0) { setJobError("Reward must be greater than zero."); return; }
    if (!Number.isInteger(maxSlots) || maxSlots < 1) { setJobError("Available slots must be at least 1."); return; }
    if (!isSafeExternalUrl(jobDraft.targetUrl.trim())) { setJobError("Target URL must use HTTP or HTTPS."); return; }
    if (jobDraft.thumbnailUrl.trim() && !isSafeExternalUrl(jobDraft.thumbnailUrl.trim())) { setJobError("Feature image URL must use HTTP or HTTPS."); return; }
    if (jobDraft.instructionImageUrl.trim() && !isSafeExternalUrl(jobDraft.instructionImageUrl.trim())) { setJobError("Instruction image URL must use HTTP or HTTPS."); return; }

    const uploadJobImage = async (file: File, folder: "features" | "instructions") => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("Job images must be JPG, PNG or WebP and no larger than 8 MB.");
      const path = `jobs/${folder}/${Date.now()}-${safeFileName(file.name)}`;
      const upload = await supabase.storage.from("job-media").upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      return supabase.storage.from("job-media").getPublicUrl(path).data.publicUrl;
    };

    setJobSaving(true);
    try {
      const [uploadedThumbnail, uploadedInstruction] = await Promise.all([
        jobThumbnailFile ? uploadJobImage(jobThumbnailFile, "features") : Promise.resolve(null),
        jobInstructionFile ? uploadJobImage(jobInstructionFile, "instructions") : Promise.resolve(null),
      ]);
      const { error: insertError } = await supabase.from("jobs").insert({
        job_code: jobDraft.code.trim().toUpperCase(), title_en: jobDraft.titleEn.trim(), title_bn: jobDraft.titleBn.trim() || null,
        short_description_en: jobDraft.shortEn.trim() || null, short_description_bn: jobDraft.shortBn.trim() || null,
        full_instructions_en: jobDraft.instructionsEn.trim(), full_instructions_bn: jobDraft.instructionsBn.trim() || null,
        category: jobDraft.category.trim(), target_url: jobDraft.targetUrl.trim(),
        thumbnail_url: uploadedThumbnail || jobDraft.thumbnailUrl.trim() || null,
        instruction_image_url: uploadedInstruction || jobDraft.instructionImageUrl.trim() || null,
        reward, max_slots: maxSlots, deadline: jobDraft.deadline ? new Date(jobDraft.deadline).toISOString() : null,
        sort_order: Number(jobDraft.sortOrder), allow_resubmission: jobDraft.allowResubmission,
        proof_requirements: { text: jobDraft.proofText, url: jobDraft.proofUrl, images: jobDraft.proofImages, maxImages: jobDraft.proofImages ? 3 : 0 }, is_active: true,
      });
      if (insertError) throw insertError;
      setJobOpen(false); setJobDraft({ ...EMPTY_JOB_DRAFT }); setJobThumbnailFile(null); setJobInstructionFile(null);
      setMessage(`Job created. Every approved completion will automatically credit ${formatMoney(reward, general.currency, "en")}.`);
      await load();
    } catch (caught) {
      setJobError(caught instanceof Error ? caught.message : "Job could not be created.");
    } finally { setJobSaving(false); }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    if (settingsDraft.supportUrl && !isSafeExternalUrl(settingsDraft.supportUrl)) { setMessage("Support URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.supportIconUrl && !isSafeExternalUrl(settingsDraft.supportIconUrl)) { setMessage("Support icon URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.logoUrl && !isSafeExternalUrl(settingsDraft.logoUrl)) { setMessage("Logo URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.faviconUrl && !isSafeExternalUrl(settingsDraft.faviconUrl)) { setMessage("Favicon URL must use HTTP or HTTPS."); return; }
    if (settingsDraft.socialVerificationPrice != null && (!Number.isFinite(settingsDraft.socialVerificationPrice) || settingsDraft.socialVerificationPrice < 0)) { setMessage("Social Blue Badge price must be zero or greater."); return; }
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

  const adminNavigation = { activeId: tab, items: tabs.map(({ id, key, icon }) => ({ id, label: t(key), icon })), onSelect: (id: string) => setTab(id as AdminTab) };

  if (authLoading) return <AppShell hidePrimaryNav adminNavigation={adminNavigation}><main className="admin-shell"><LoadingCards count={5} /></main></AppShell>;
  if (!isAdmin) return <main className="auth-page auth-page-login"><section className="auth-card">
    <TaskoraLockup markSize={58} className="auth-taskora-brand" />
    <h1 className="auth-title">Admin Login</h1>
    <p className="auth-subtitle">Sign in to the {general.siteName} administration panel.</p>
    <form className="auth-form" onSubmit={adminSignIn}>
      <div className="field"><label>Admin username</label><div className="input-wrap"><UserRound size={20} /><input className="input with-icon" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></div></div>
      <div className="field"><label>Password</label><div className="input-wrap"><LockKeyhole size={20} /><input className="input with-icon" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" required /></div></div>
      {adminLoginError && <div className="form-message error" role="alert">{adminLoginError}</div>}
      <button className="primary-button" type="submit" disabled={adminSigningIn}>{adminSigningIn ? "Signing in…" : "Login to Admin Panel"}</button>
    </form>
  </section></main>;

  return <AppShell hidePrimaryNav adminNavigation={adminNavigation}><main className="admin-shell"><section className="admin-hero"><div className="admin-hero-main"><div className="admin-hero-icon"><TaskoraMark size={34} /></div><div><span className="admin-kicker light">TASKORA CONTROL CENTER</span><h1>{t("admin.title")}</h1><p>{t("admin.subtitle")}</p></div></div><div className="admin-hero-status"><span className="admin-live-dot" /><div><strong>Administrator · Full access</strong><small>No activation fee. Protected actions are checked by Supabase.</small></div></div></section>
    {message && <div className="form-message success" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>{message}<button style={{ border: 0, background: "transparent" }} onClick={() => setMessage(null)}><X size={17} /></button></div>}
    {loading ? <LoadingCards count={5} /> : error ? <ErrorState message={t("common.error")} /> : <>
      {tab === "dashboard" && stats && <div className="admin-dashboard"><div className="admin-access-note"><ShieldCheck size={22} /><div><strong>This Admin account never pays an activation fee.</strong><span>You have full protected access and can control customer access, money, jobs, proofs, services, content and site settings here.</span></div></div><div className="admin-command-grid">
        <button className="admin-command-card" onClick={() => { setJobError(null); setJobOpen(true); }}><span className="admin-command-icon"><BriefcaseBusiness size={21} /></span><strong>Create Micro Job</strong><small>Image, instructions, reward & auto payout</small></button>
        <button className="admin-command-card" onClick={() => setTab("proofs")}><span className="admin-command-icon"><FileCheck2 size={21} /></span><strong>Review Proofs</strong><small>Approve + pay, reject or request resubmit</small>{stats.pending_proofs > 0 && <span className="admin-command-count">{stats.pending_proofs}</span>}</button>
        <button className="admin-command-card" onClick={() => setTab("users")}><span className="admin-command-icon"><Gift size={21} /></span><strong>Gifts & Free Access</strong><small>Give a customer full access or wallet balance</small></button>
        <button className="admin-command-card" onClick={() => setTab("services")}><span className="admin-command-icon"><ShoppingBag size={21} /></span><strong>Social Services</strong><small>Facebook, Instagram, YouTube packages & pricing</small></button>
        <button className="admin-command-card" onClick={() => setTab("reselling")}><span className="admin-command-icon"><Store size={21} /></span><strong>Reselling Store</strong><small>Products, categories, vendors & banners</small></button>
        <button className="admin-command-card" onClick={() => setTab("ludo")}><span className="admin-command-icon"><Trophy size={21} /></span><strong>Ludo Tournaments</strong><small>Matches, rules, entry fees, prizes & win proofs</small></button>
        <button className="admin-command-card" onClick={() => setTab("withdrawals")}><span className="admin-command-icon"><WalletCards size={21} /></span><strong>Money Control</strong><small>Review withdrawals and member payouts</small></button>
        <button className="admin-command-card" onClick={() => setTab("settings")}><span className="admin-command-icon"><Settings size={21} /></span><strong>Site Settings</strong><small>Branding, fee, support and payout methods</small></button>
      </div><div className="admin-stats">{[["Users",stats.total_users,UsersRound],["Activated",stats.activated_users,BadgeCheck],["Active jobs",stats.active_jobs,BriefcaseBusiness],["Pending proofs",stats.pending_proofs,FileCheck2],["Wallet liability",formatMoney(Number(stats.wallet_liabilities), general.currency, "en"),CircleDollarSign],["Pending withdrawals",stats.pending_withdrawals,WalletCards],["Social posts",stats.total_posts,Newspaper],["Approved today",stats.proofs_approved_today,Check]].map(([label,value,Icon]) => { const IconComponent = Icon as typeof UsersRound; return <div className="admin-stat" key={String(label)}><IconComponent size={21} color="var(--primary)" /><strong>{String(value)}</strong><span className="muted">{String(label)}</span></div>; })}</div></div>}
      {tab === "users" && <section className="admin-section">
        <div className="admin-section-head"><div><span className="admin-kicker">MEMBER CONTROL + GIFTS</span><h2>Users, gifts & free access</h2><p>Give any customer full protected access for free, gift wallet balance, manage badges, suspend accounts or permanently remove a user.</p></div></div>
        <form className="admin-search" onSubmit={(event) => { event.preventDefault(); void load(); }}><div className="input-wrap"><Search size={19} /><input className="input with-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, mobile or referral code" /></div><button className="secondary-button"><Search size={18} />Search</button></form>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Mobile</th><th>Status</th><th>Joined</th><th>Admin controls</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><div className="muted">{item.badge_label && item.badge_label !== "Verified" ? item.badge_label : `ID ${item.id.slice(0,8)}`}</div></td><td>{item.mobile || "—"}</td><td><span className={`status ${item.membership_status}`}>{item.membership_status}</span> {item.is_social_verified && <span className="status admin-blue-badge"><BadgeCheck size={13} />Blue Badge</span>} {item.is_suspended && <span className="status rejected">Suspended</span>}</td><td>{new Date(item.created_at).toLocaleDateString()}</td><td>{item.id === user?.id ? <span className="status active"><ShieldCheck size={14} />System Admin · Free full access</span> : <div className="admin-row-actions">{item.membership_status === "active" ? <button className="secondary-button compact" onClick={() => void setMembershipAccess(item, false)}><LockKeyhole size={16} />Revoke access</button> : <button className="primary-button compact admin-gift-access" onClick={() => void setMembershipAccess(item, true)}><Gift size={16} />Gift full access</button>}<button className={item.is_social_verified ? "secondary-button compact admin-blue-badge-button" : "primary-button compact admin-blue-badge-button"} onClick={() => void socialVerificationAction(item)}><BadgeCheck size={16} />{item.is_social_verified ? "Revoke Blue Badge" : "Grant Blue Badge"}</button><button className="primary-button compact admin-gift-balance" onClick={() => void giftBalance(item)}><CircleDollarSign size={16} />Gift {general.currency}</button><button className="secondary-button compact" onClick={() => void badgeAction(item)}>Custom badge</button><button className="secondary-button compact" onClick={() => void walletAdjustment(item)}>{t("admin.adjust")}</button><button className={item.is_suspended ? "secondary-button compact" : "danger-button compact"} onClick={() => void suspensionAction(item)}>{item.is_suspended ? t("admin.restore") : t("admin.suspend")}</button><button className="danger-button compact admin-remove-user" onClick={() => void removeUser(item)}><Trash2 size={16} />Remove user</button></div>}</td></tr>)}</tbody></table></div>
        <p className="admin-footnote">Permanent removal requires typing DELETE and a reason. Admin accounts cannot remove themselves.</p>
      </section>}
      {tab === "jobs" && <section className="admin-section">
        <div className="admin-section-head"><div><span className="admin-kicker">EARNING ENGINE</span><h2>Micro Jobs</h2><p>Create jobs with feature/instruction images and define exactly how much one approved completion earns.</p></div><button className="primary-button" onClick={() => { setJobError(null); setJobOpen(true); }}><Plus size={18} />{t("admin.createJob")}</button></div>
        <div className="admin-reward-note"><Sparkles size={20} /><div><strong>Automatic reward is enabled</strong><span>When you approve a pending proof, the job reward is credited to that member wallet once. Duplicate approval cannot pay twice.</span></div></div>
        <div className="table-wrap"><table className="data-table admin-jobs-table"><thead><tr><th>Feature</th><th>Job</th><th>Reward / completion</th><th>Completed</th><th>Instruction image</th><th>Status</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><div className="admin-job-thumb-sm">{job.thumbnail_url ? <img src={job.thumbnail_url} alt="" /> : <ImagePlus size={20} />}</div></td><td><strong>{job.title_en}</strong><div className="muted">{job.job_code} · {job.category}</div></td><td><strong className="admin-reward-value">{formatMoney(Number(job.reward), general.currency, "en")}</strong><div className="muted">auto-credit on approval</div></td><td>{job.completed_count}/{job.max_slots}</td><td>{job.instruction_image_url ? <span className="status active"><Check size={13} />Added</span> : <span className="status">None</span>}</td><td><button className={`status ${job.is_active ? "active" : ""}`} onClick={async () => { const supabase = getSupabaseBrowserClient(); if (supabase) { await supabase.from("jobs").update({ is_active: !job.is_active }).eq("id", job.id); await load(); } }}>{job.is_active ? "Active" : "Inactive"}</button></td></tr>)}</tbody></table></div>
      </section>}
      {tab === "proofs" && <section className="admin-section"><div className="admin-section-head"><div><span className="admin-kicker">APPROVE / REJECT / RESUBMIT</span><h2>Proof review & automatic payout</h2><p>Open each member&apos;s submitted proof. Approval automatically adds the exact job reward to that member wallet; Reject and Resubmit never pay.</p></div></div><div className="admin-access-note proof"><FileCheck2 size={22} /><div><strong>{proofs.filter((proof) => proof.status === "pending").length} proof(s) waiting for your decision</strong><span>Use the action buttons below. An approved submission cannot be paid twice.</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Job & payout</th><th>Proof</th><th>Status</th><th>Actions</th></tr></thead><tbody>{proofs.length ? proofs.map((proof) => <tr key={proof.id}><td>{proof.profiles?.full_name ?? proof.user_id.slice(0,8)}</td><td><strong>{proof.jobs?.job_code} · {proof.jobs?.title_en}</strong><div className="admin-proof-payout">Pays {formatMoney(Number(proof.jobs?.reward ?? 0), general.currency, "en")}</div></td><td><div>{proof.proof_text || "—"}</div>{proof.proof_url && <a href={proof.proof_url} target="_blank" rel="noreferrer">Proof URL</a>}<ProofMediaLinks paths={proof.proof_media_paths ?? []} /></td><td><span className={`status ${proof.status}`}>{proof.status}</span></td><td><div className="admin-row-actions">{proof.status === "pending" && <><button className="admin-pay-button" onClick={() => void reviewProof(proof,"approve")}><Check size={15} />Approve + pay {formatMoney(Number(proof.jobs?.reward ?? 0), general.currency, "en")}</button><button className="danger-button compact" onClick={() => void reviewProof(proof,"reject")}><X size={15} />Reject</button><button className="secondary-button compact" onClick={() => void reviewProof(proof,"resubmit")}><RefreshCw size={15} />Request resubmit</button></>}</div></td></tr>) : <tr><td colSpan={5} className="empty-state">No proof submissions yet.</td></tr>}</tbody></table></div></section>}
      {tab === "withdrawals" && <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Amount</th><th>Destination</th><th>Status</th><th>Actions</th></tr></thead><tbody>{withdrawals.map((item) => <tr key={item.id}><td>{item.user_id.slice(0,8)}</td><td>{formatMoney(Number(item.amount), general.currency, "en")}</td><td>{item.payment_method}<div className="muted">{item.destination}</div></td><td><span className={`status ${item.status}`}>{item.status}</span></td><td><div style={{ display: "flex", gap: 5 }}>{item.status === "pending" && <><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateWithdrawal(item.id,"approved")}>Approve</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateWithdrawal(item.id,"rejected")}>Reject</button></>}{item.status === "approved" && <button className="primary-button" style={{ minHeight: 36 }} onClick={() => void updateWithdrawal(item.id,"paid")}>Mark paid</button>}</div></td></tr>)}</tbody></table></div>}
      {tab === "posts" && <div className="table-wrap"><table className="data-table"><thead><tr><th>Post</th><th>Created</th><th>Flags</th><th>Actions</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td style={{ maxWidth: 420 }}>{post.body || "Media post"}</td><td>{new Date(post.created_at).toLocaleDateString()}</td><td>{post.is_pinned && <span className="status active">Pinned</span>} {post.is_hidden && <span className="status rejected">Hidden</span>}</td><td><div style={{ display: "flex", gap: 5 }}><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void moderatePost(post.id,{ is_pinned: !post.is_pinned })}>{post.is_pinned ? "Unpin" : "Pin"}</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void moderatePost(post.id,{ is_hidden: !post.is_hidden })}>{post.is_hidden ? "Unhide" : "Hide"}</button><button className="danger-button" style={{ minHeight: 36 }} onClick={() => void deletePost(post.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
      {tab === "reports" && <div className="table-wrap"><table className="data-table"><thead><tr><th>Reporter</th><th>Content</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.reporter?.full_name ?? "Member"}</td><td style={{ maxWidth: 320 }}>{report.posts?.body || report.comments?.body || (report.post_id ? "Media post" : "Comment")}</td><td>{report.reason}</td><td><span className={`status ${report.status}`}>{report.status}</span></td><td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{report.status === "open" && <><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateReport(report.id, "reviewed")}>Reviewed</button><button className="secondary-button" style={{ minHeight: 36 }} onClick={() => void updateReport(report.id, "dismissed")}>Dismiss</button><button className="danger-button" style={{ minHeight: 36 }} onClick={() => void updateReport(report.id, "actioned")}>Actioned</button></>}</div></td></tr>)}</tbody></table></div>}
      {tab === "services" && <AdminServicesManager currency={general.currency} />}
      {tab === "reselling" && <AdminResellingManager currency={general.currency} />}
      {tab === "ludo" && <AdminLudoManager currency={general.currency} />}
      {tab === "content" && <AdminContentManager />}
      {tab === "settings" && <form className="card" style={{ padding: 22, display: "grid", gap: 15, marginBottom: 14 }} onSubmit={saveSettings}><h2 className="section-title">Media, payout & support details</h2><div className="field"><label>Upload logo</label><input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} /></div><div className="field"><label>Favicon URL</label><input className="input" type="url" value={settingsDraft.faviconUrl ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, faviconUrl: event.target.value || null }))} /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div className="field"><label>Currency</label><input className="input" maxLength={3} value={settingsDraft.currency} onChange={(event) => setSettingsDraft((value) => ({ ...value, currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0,3) }))} /></div><div className="field"><label>Member badge wording</label><input className="input" value={settingsDraft.memberBadgeWording} onChange={(event) => setSettingsDraft((value) => ({ ...value, memberBadgeWording: event.target.value }))} /></div></div><div className="field"><label>Payout methods (comma separated)</label><input className="input" value={settingsDraft.payoutMethods.join(", ")} onChange={(event) => setSettingsDraft((value) => ({ ...value, payoutMethods: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /></div><div className="field"><label>Support phone</label><input className="input" value={settingsDraft.supportPhone} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportPhone: event.target.value }))} /></div><div className="field"><label>Support icon URL</label><input className="input" type="url" value={settingsDraft.supportIconUrl} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportIconUrl: event.target.value }))} /></div><div className="field"><label>Support position</label><select className="select" value={settingsDraft.supportPosition} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportPosition: event.target.value as "left" | "right" }))}><option value="right">Right</option><option value="left">Left</option></select></div><div className="field"><label>General notice</label><textarea className="textarea" value={settingsDraft.generalNotice} onChange={(event) => setSettingsDraft((value) => ({ ...value, generalNotice: event.target.value }))} /></div><div className="field"><label>Privacy content</label><textarea className="textarea" value={settingsDraft.privacyContent} onChange={(event) => setSettingsDraft((value) => ({ ...value, privacyContent: event.target.value }))} /></div><div className="soft-card" style={{ padding: 12 }}><strong>Payment gateway</strong><div className="muted">{settingsDraft.paymentGatewayStatus === "configured" ? "Configured" : "Not configured"}. Activation is never granted by a client-side click.</div></div><button className="primary-button"><Settings size={18} />{t("admin.save")}</button></form>}
      {tab === "settings" && <form className="card" style={{ padding: 22, display: "grid", gap: 15 }} onSubmit={saveSettings}><h2 className="section-title">Branding & general settings</h2><div className="field"><label>Site name</label><input className="input" value={settingsDraft.siteName} onChange={(event) => setSettingsDraft((value) => ({ ...value, siteName: event.target.value }))} /></div><div className="field"><label>Logo URL</label><input className="input" value={settingsDraft.logoUrl ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, logoUrl: event.target.value || null }))} /></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}><div className="field"><label>Primary</label><input className="input" type="color" value={settingsDraft.primaryColor} onChange={(event) => setSettingsDraft((value) => ({ ...value, primaryColor: event.target.value }))} /></div><div className="field"><label>Accent</label><input className="input" type="color" value={settingsDraft.accentColor} onChange={(event) => setSettingsDraft((value) => ({ ...value, accentColor: event.target.value }))} /></div><div className="field"><label>Background</label><input className="input" type="color" value={settingsDraft.backgroundColor} onChange={(event) => setSettingsDraft((value) => ({ ...value, backgroundColor: event.target.value }))} /></div></div><div className="field"><label>Activation price</label><input className="input" type="number" step="0.01" value={settingsDraft.activationPrice ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, activationPrice: event.target.value === "" ? null : Number(event.target.value) }))} /></div><div className="field admin-blue-badge-price"><label>Social Blue Badge price ({settingsDraft.currency})</label><input className="input" type="number" min="0" step="0.01" placeholder="Set a price" value={settingsDraft.socialVerificationPrice ?? ""} onChange={(event) => setSettingsDraft((value) => ({ ...value, socialVerificationPrice: event.target.value === "" ? null : Number(event.target.value) }))} /><small>Separate from membership. Users buy it only from Social with Wallet balance; Admin can grant it free from Users.</small></div><div className="field"><label>Withdrawal minimum</label><input className="input" type="number" step="0.01" value={settingsDraft.withdrawalMinimum} onChange={(event) => setSettingsDraft((value) => ({ ...value, withdrawalMinimum: Number(event.target.value) }))} /></div><div className="field"><label>Support label</label><input className="input" value={settingsDraft.supportLabel} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportLabel: event.target.value }))} /></div><div className="field"><label>Support URL</label><input className="input" type="url" value={settingsDraft.supportUrl} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportUrl: event.target.value }))} /></div><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={settingsDraft.supportEnabled} onChange={(event) => setSettingsDraft((value) => ({ ...value, supportEnabled: event.target.checked }))} />Enable floating support</label><button className="primary-button"><Settings size={18} />{t("admin.save")}</button></form>}
      {tab === "audit" && <div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Target</th><th>Reason</th><th>Time</th></tr></thead><tbody>{audit.map((row) => <tr key={row.id}><td><strong>{row.action}</strong></td><td>{row.target_type} · {row.target_id?.slice(0,8) ?? "—"}</td><td>{row.reason || "—"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </>}
    {jobOpen && <Modal title="Create micro job" wide onClose={() => setJobOpen(false)}><form className="admin-job-form" onSubmit={createJob}>
      <div className="admin-auto-pay"><CircleDollarSign size={22} /><div><strong>Auto-credit after approval</strong><span>The amount you set below is paid exactly once when an admin approves the member&apos;s proof.</span></div><span className="status active">Always on</span></div>

      <section className="admin-form-section"><h3>Job basics</h3><div className="admin-form-grid two">
        <div className="field"><label>Job code</label><input className="input" placeholder="e.g. JOB101" value={jobDraft.code} onChange={(event) => setJobDraft((value) => ({ ...value, code: event.target.value }))} required /></div>
        <div className="field"><label>Category</label><input className="input" placeholder="e.g. Social Media" value={jobDraft.category} onChange={(event) => setJobDraft((value) => ({ ...value, category: event.target.value }))} required /></div>
        <div className="field"><label>English title</label><input className="input" value={jobDraft.titleEn} onChange={(event) => setJobDraft((value) => ({ ...value, titleEn: event.target.value }))} required /></div>
        <div className="field"><label>Bangla title</label><input className="input" value={jobDraft.titleBn} onChange={(event) => setJobDraft((value) => ({ ...value, titleBn: event.target.value }))} /></div>
      </div><div className="admin-form-grid two">
        <div className="field"><label>English short description</label><textarea className="textarea" value={jobDraft.shortEn} onChange={(event) => setJobDraft((value) => ({ ...value, shortEn: event.target.value }))} /></div>
        <div className="field"><label>Bangla short description</label><textarea className="textarea" value={jobDraft.shortBn} onChange={(event) => setJobDraft((value) => ({ ...value, shortBn: event.target.value }))} /></div>
      </div></section>

      <section className="admin-form-section accent"><h3>Reward & capacity</h3><div className="admin-form-grid two">
        <div className="field"><label>Reward per approved completion ({general.currency})</label><div className="admin-money-input"><span>{general.currency}</span><input className="input" type="number" step="0.01" min="0.01" placeholder="0.50" value={jobDraft.reward} onChange={(event) => setJobDraft((value) => ({ ...value, reward: event.target.value }))} required /></div><small>This exact amount goes to the wallet after proof approval.</small></div>
        <div className="field"><label>Maximum paid completions</label><input className="input" type="number" min="1" value={jobDraft.maxSlots} onChange={(event) => setJobDraft((value) => ({ ...value, maxSlots: event.target.value }))} required /><small>The job closes when all paid slots are used.</small></div>
      </div></section>

      <section className="admin-form-section"><h3>Images</h3><div className="admin-upload-grid job-media">
        <label className="admin-upload-box"><span className="admin-upload-icon"><ImagePlus size={22} /></span><strong>Feature image</strong><small>Shown on the Micro Jobs card · JPG/PNG/WebP · max 8 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setJobThumbnailFile(event.target.files?.[0] ?? null)} />{jobThumbnailFile && <em>{jobThumbnailFile.name}</em>}</label>
        <label className="admin-upload-box"><span className="admin-upload-icon"><UploadCloud size={22} /></span><strong>Instruction image</strong><small>Shown inside the job instructions · JPG/PNG/WebP · max 8 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setJobInstructionFile(event.target.files?.[0] ?? null)} />{jobInstructionFile && <em>{jobInstructionFile.name}</em>}</label>
      </div><div className="admin-form-grid two">
        <div className="field"><label>Or feature image URL</label><input className="input" type="url" placeholder="https://…" value={jobDraft.thumbnailUrl} onChange={(event) => setJobDraft((value) => ({ ...value, thumbnailUrl: event.target.value }))} /></div>
        <div className="field"><label>Or instruction image URL</label><input className="input" type="url" placeholder="https://…" value={jobDraft.instructionImageUrl} onChange={(event) => setJobDraft((value) => ({ ...value, instructionImageUrl: event.target.value }))} /></div>
      </div></section>

      <section className="admin-form-section"><h3>Instructions & destination</h3><div className="admin-form-grid two">
        <div className="field"><label>English instructions</label><textarea className="textarea admin-instructions" value={jobDraft.instructionsEn} onChange={(event) => setJobDraft((value) => ({ ...value, instructionsEn: event.target.value }))} required /></div>
        <div className="field"><label>Bangla instructions</label><textarea className="textarea admin-instructions" value={jobDraft.instructionsBn} onChange={(event) => setJobDraft((value) => ({ ...value, instructionsBn: event.target.value }))} /></div>
      </div><div className="field"><label>Target URL</label><input className="input" type="url" placeholder="https://…" value={jobDraft.targetUrl} onChange={(event) => setJobDraft((value) => ({ ...value, targetUrl: event.target.value }))} required /></div></section>

      <section className="admin-form-section"><h3>Proof & schedule</h3><div className="admin-form-grid two"><div className="field"><label>Deadline (optional)</label><input className="input" type="datetime-local" value={jobDraft.deadline} onChange={(event) => setJobDraft((value) => ({ ...value, deadline: event.target.value }))} /></div><div className="field"><label>Sort order</label><input className="input" type="number" value={jobDraft.sortOrder} onChange={(event) => setJobDraft((value) => ({ ...value, sortOrder: event.target.value }))} /></div></div>
        <div className="admin-checkbox-grid"><label><input type="checkbox" checked={jobDraft.proofText} onChange={(event) => setJobDraft((value) => ({ ...value, proofText: event.target.checked }))} />Text proof</label><label><input type="checkbox" checked={jobDraft.proofUrl} onChange={(event) => setJobDraft((value) => ({ ...value, proofUrl: event.target.checked }))} />URL proof</label><label><input type="checkbox" checked={jobDraft.proofImages} onChange={(event) => setJobDraft((value) => ({ ...value, proofImages: event.target.checked }))} />Screenshot proof</label><label><input type="checkbox" checked={jobDraft.allowResubmission} onChange={(event) => setJobDraft((value) => ({ ...value, allowResubmission: event.target.checked }))} />Allow resubmission</label></div>
      </section>

      {jobError && <div className="form-message error">{jobError}</div>}
      <button className="primary-button admin-create-job" disabled={jobSaving}><BriefcaseBusiness size={18} />{jobSaving ? "Creating job…" : "Create job & enable earnings"}</button>
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

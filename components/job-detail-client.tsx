"use client";

import { ArrowLeft, ExternalLink, FileImage, ImageIcon, Send, UploadCloud } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActivationModal } from "@/components/activation-modal";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { ErrorState, LoadingCards, Modal } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSafeExternalUrl, safeFileName } from "@/lib/url";
import type { JobDetail } from "@/lib/types";

export function JobDetailClient({ jobId }: { jobId: string }) {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const { user, membership, isAdmin } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [proofMessage, setProofMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isAdmin && membership?.status !== "active") { setLockedOpen(true); setLoading(false); return; }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError(t("common.error")); setLoading(false); return; }
      const { data, error: queryError } = await supabase.rpc("get_job_details", { p_job_id: jobId });
      if (queryError) setError(t("common.error"));
      else setJob(data as JobDetail);
      setLoading(false);
    };
    void load();
  }, [isAdmin, jobId, membership?.status, t]);

  const title = useMemo(() => !job ? "" : language === "bn" && job.title_bn ? job.title_bn : job.title_en, [job, language]);
  const instructions = useMemo(() => !job ? "" : language === "bn" && job.full_instructions_bn ? job.full_instructions_bn : job.full_instructions_en, [job, language]);

  const openProof = async () => {
    if (!job) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setProofMessage(null);
    const { data, error: startError } = await supabase.rpc("start_job_submission", { p_job_id: job.id });
    if (startError) { setProofMessage(startError.message.includes("slots") ? "No submission slots remain." : "You already have a submission for this job."); return; }
    setSubmissionId(data as string);
    setProofOpen(true);
  };

  const submitProof = async (event: FormEvent) => {
    event.preventDefault();
    if (!job || !user || !submissionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSubmitting(true);
    setProofMessage(null);
    try {
      const requirements = job.proof_requirements ?? {};
      if (requirements.text && !proofText.trim()) throw new Error("Proof text is required.");
      if (requirements.url && !isSafeExternalUrl(proofUrl)) throw new Error("Enter a valid HTTP or HTTPS proof URL.");
      if (requirements.images && !proofFiles.length) throw new Error("At least one screenshot is required.");
      const maxImages = Math.max(1, Math.min(Number(requirements.maxImages ?? 1), 5));
      if (proofFiles.length > maxImages) throw new Error(`You can upload up to ${maxImages} screenshots.`);
      const paths: string[] = [];
      for (const file of proofFiles) {
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Screenshots must be images smaller than 5 MB.");
        const path = `${user.id}/${job.id}/${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from("job-proofs").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("A screenshot could not be uploaded.");
        paths.push(path);
      }
      const { error: submitError } = await supabase.rpc("submit_job_proof", { p_submission_id: submissionId, p_proof_text: proofText.trim() || null, p_proof_url: proofUrl.trim() || null, p_media_paths: paths });
      if (submitError) throw submitError;
      setProofMessage(t("jobs.pending"));
      setProofText(""); setProofUrl(""); setProofFiles([]);
      window.setTimeout(() => setProofOpen(false), 1200);
    } catch (caught) {
      setProofMessage(caught instanceof Error ? caught.message : t("common.error"));
    } finally { setSubmitting(false); }
  };

  return (
    <AppShell>
      <main className="page-shell"><div className="page-narrow">
        <Link href="/jobs" className="secondary-button" style={{ textDecoration: "none", marginBottom: 14 }}><ArrowLeft size={18} />{t("jobs.title")}</Link>
        {loading ? <LoadingCards count={3} /> : error ? <ErrorState message={error} /> : job ? <article className="card" style={{ padding: "clamp(14px,4vw,24px)" }}>
          <div className="stats-row"><div className="stat-cell">{formatMoney(Number(job.reward), general.currency, language)}<span className="stat-label">{t("jobs.reward")}</span></div><div className="stat-cell">{job.job_code}<span className="stat-label">Job ID</span></div><div className="stat-cell">{job.completed_count}/{job.max_slots}<span className="stat-label">{t("jobs.slots")}</span></div></div>
          <div style={{ marginTop: 14 }}>{job.instruction_image_url || job.thumbnail_url ? <img src={job.instruction_image_url || job.thumbnail_url || ""} alt="" style={{ width: "100%", maxHeight: 520, objectFit: "cover", borderRadius: 22 }} /> : <div className="job-thumb" style={{ aspectRatio: "16/9" }}><ImageIcon size={44} /></div>}</div>
          <h1 style={{ fontSize: "clamp(1.65rem,6vw,2.35rem)", margin: "18px 0" }}>{title}</h1>
          <div style={{ display: "grid", gap: 10 }}><a className="primary-button" style={{ textDecoration: "none" }} href={isSafeExternalUrl(job.target_url) ? job.target_url : "#"} target="_blank" rel="noreferrer">{t("jobs.go")}<ExternalLink size={18} /></a><button className="primary-button" onClick={openProof}><Send size={18} />{t("jobs.proof")}</button></div>
          {proofMessage && !proofOpen && <div className="form-message error" style={{ marginTop: 12 }}>{proofMessage}</div>}
          <section style={{ marginTop: 24 }}><h2 className="section-title">{t("jobs.instructions")}</h2><div className="post-body" style={{ marginTop: 10 }}>{instructions}</div></section>
        </article> : null}
      </div></main>
      <ActivationModal open={lockedOpen} onClose={() => setLockedOpen(false)} />
      {proofOpen && job && <Modal title={t("jobs.submitTitle")} onClose={() => setProofOpen(false)}><form className="auth-form" onSubmit={submitProof}>
        {job.proof_requirements?.text && <div className="field"><label>{t("jobs.proofText")}</label><textarea className="textarea" value={proofText} onChange={(event) => setProofText(event.target.value)} maxLength={3000} /></div>}
        {job.proof_requirements?.url && <div className="field"><label>{t("jobs.proofUrl")}</label><input className="input" type="url" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} /></div>}
        {job.proof_requirements?.images && <div className="field"><label>{t("jobs.proofFiles")}</label><label className="soft-card" style={{ minHeight: 95, display: "grid", placeItems: "center", cursor: "pointer" }}><span style={{ textAlign: "center" }}><UploadCloud size={26} /><br />{proofFiles.length ? `${proofFiles.length} selected` : "Choose screenshots"}</span><input style={{ display: "none" }} type="file" accept="image/jpeg,image/png,image/webp" multiple={(job.proof_requirements.maxImages ?? 1) > 1} onChange={(event) => setProofFiles(Array.from(event.target.files ?? []))} /></label></div>}
        {proofMessage && <div className="form-message error"><FileImage size={16} style={{ display: "inline", marginRight: 6 }} />{proofMessage}</div>}
        <button className="primary-button" disabled={submitting}>{submitting ? t("common.loading") : t("jobs.submit")}</button>
      </form></Modal>}
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { BriefcaseBusiness, Clock3, ImageIcon, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivationModal } from "@/components/activation-modal";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { JobPreview } from "@/lib/types";

export function JobsClient() {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const { membership, isAdmin } = useAuth();
  const [jobs, setJobs] = useState<JobPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError(true); setLoading(false); return; }
      const { data, error: queryError } = await supabase.rpc("list_job_previews");
      setJobs((data as JobPreview[]) ?? []);
      setError(Boolean(queryError));
      setLoading(false);
    };
    void load();
  }, []);

  const money = (value: number) => formatMoney(value, general.currency, language);
  const hasJobAccess = isAdmin || membership?.status === "active";
  const highestReward = Math.max(0, ...jobs.map((job) => Number(job.reward)));

  return (
    <AppShell variant="hub">
      <main className="micro-jobs-page">
        <div className="micro-jobs-container">
          <header className="micro-jobs-page-header">
            <div>
              <div className="micro-jobs-available">{jobs.length} available</div>
              <h1>{t("jobs.title")}</h1>
            </div>
            <div className="micro-jobs-briefcase" aria-hidden="true"><BriefcaseBusiness size={22} /></div>
          </header>

          {!hasJobAccess && <section className="micro-jobs-locked-card">
            <div className="micro-jobs-lock-icon"><LockKeyhole size={26} /></div>
            <div className="micro-jobs-locked-content">
              <h2>{t("dashboard.lockedTitle")}</h2>
              <p>{t("dashboard.lockedBody")}</p>
            </div>
            <button className="micro-jobs-activate" onClick={() => setLockedOpen(true)}>{t("dashboard.activate")}</button>
          </section>}

          {loading ? <LoadingCards count={6} /> : error ? <ErrorState message={t("common.error")} /> : !jobs.length ? <EmptyState message={t("jobs.empty")} /> : (
            <div className="micro-jobs-grid">
              {jobs.map((job) => {
                const completion = job.max_slots > 0 ? Math.min(100, Math.max(0, Math.round((job.completed_count / job.max_slots) * 100))) : 0;
                const remaining = Math.max(0, job.max_slots - job.completed_count);
                const status = completion >= 70
                  ? { key: "urgent", label: language === "bn" ? "দ্রুত পূর্ণ হচ্ছে" : "Filling Fast" }
                  : highestReward > 0 && Number(job.reward) >= highestReward * .75
                    ? { key: "high", label: language === "bn" ? "হাই পেইং" : "High Paying" }
                    : job.completed_count === 0
                      ? { key: "new", label: language === "bn" ? "নতুন" : "New" }
                      : { key: "open", label: language === "bn" ? "চলমান" : "Open" };
                return <Link key={job.id} href={`/jobs/${job.id}`} className="micro-job-card" onClick={(event) => { if (!hasJobAccess) { event.preventDefault(); setLockedOpen(true); } }}>
                  <div className="micro-job-thumb">
                    <span className="micro-job-code">{job.job_code}</span>
                    {job.thumbnail_url ? <img src={job.thumbnail_url} alt="" loading="lazy" /> : <div className="micro-job-placeholder"><ImageIcon size={20} /></div>}
                  </div>
                  <div className="micro-job-body">
                    <div className="micro-job-meta-row"><span>{job.category}</span><b className={`micro-job-status ${status.key}`}>{status.label}</b></div>
                    <h2>{language === "bn" && job.title_bn ? job.title_bn : job.title_en}</h2>
                    {(language === "bn" ? job.short_description_bn : job.short_description_en) && <p>{language === "bn" && job.short_description_bn ? job.short_description_bn : job.short_description_en}</p>}
                    <div className="micro-job-value-row"><div><small>{language === "bn" ? "রিওয়ার্ড" : "Reward"}</small><strong className="micro-job-reward">{money(Number(job.reward))}</strong></div><span>{remaining} {language === "bn" ? "স্লট বাকি" : "slots left"}</span></div>
                    <div className="micro-job-progress-head"><span>{language === "bn" ? "টাস্ক পূর্ণতা" : "Task Completion"}</span><strong>{completion}%</strong></div>
                    <div className="micro-job-progress" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${completion}%` }} /></div>
                    {job.deadline && <div className="micro-job-deadline"><Clock3 size={13} />{language === "bn" ? "শেষ সময়" : "Deadline"}: {new Date(job.deadline).toLocaleDateString(language === "bn" ? "bn-BD" : "en")}</div>}
                  </div>
                </Link>;
              })}
            </div>
          )}
        </div>
      </main>
      <ActivationModal open={lockedOpen} onClose={() => setLockedOpen(false)} />
    </AppShell>
  );
}

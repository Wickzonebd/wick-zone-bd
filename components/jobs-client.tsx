"use client";

import Link from "next/link";
import { BriefcaseBusiness, ImageIcon, LockKeyhole } from "lucide-react";
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
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="micro-job-card" onClick={(event) => { if (!hasJobAccess) { event.preventDefault(); setLockedOpen(true); } }}>
                  <div className="micro-job-thumb">
                    <span className="micro-job-code">{job.job_code}</span>
                    {job.thumbnail_url ? <img src={job.thumbnail_url} alt="" loading="lazy" /> : <div className="micro-job-placeholder"><ImageIcon size={20} /></div>}
                  </div>
                  <div className="micro-job-body">
                    <h2>{language === "bn" && job.title_bn ? job.title_bn : job.title_en}</h2>
                    <div className="micro-job-reward">{money(Number(job.reward))}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <ActivationModal open={lockedOpen} onClose={() => setLockedOpen(false)} />
    </AppShell>
  );
}

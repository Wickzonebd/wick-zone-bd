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
  const { membership } = useAuth();
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

  return (
    <AppShell>
      <main className="page-shell">
        <div className="page-narrow" style={{ display: "grid", gap: 18 }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div><p className="muted" style={{ margin: 0 }}>{jobs.length} available</p><h1 className="section-title" style={{ fontSize: "2rem" }}>{t("jobs.title")}</h1></div>
            <div className="quick-icon"><BriefcaseBusiness size={26} /></div>
          </header>
          {membership?.status !== "active" && <div className="activation-card"><div className="activation-row"><div className="activation-icon"><LockKeyhole /></div><div><strong>{t("dashboard.lockedTitle")}</strong><p className="muted" style={{ margin: "4px 0 10px" }}>{t("dashboard.lockedBody")}</p><button className="primary-button" onClick={() => setLockedOpen(true)}>{t("dashboard.activate")}</button></div></div></div>}
          {loading ? <LoadingCards count={6} /> : error ? <ErrorState message={t("common.error")} /> : !jobs.length ? <EmptyState message={t("jobs.empty")} /> : (
            <div className="job-grid">
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="job-card" onClick={(event) => { if (membership?.status !== "active") { event.preventDefault(); setLockedOpen(true); } }}>
                  <span className="job-code">{job.job_code}</span>
                  {job.thumbnail_url ? <img className="job-thumb" src={job.thumbnail_url} alt="" loading="lazy" /> : <div className="job-thumb"><ImageIcon size={38} /></div>}
                  <h2 className="job-title">{language === "bn" && job.title_bn ? job.title_bn : job.title_en}</h2>
                  <div className="job-reward">{money(Number(job.reward))}</div>
                  {job.deadline && <div className="muted" style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 5, fontSize: ".76rem" }}><Clock3 size={13} />{new Date(job.deadline).toLocaleDateString()}</div>}
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

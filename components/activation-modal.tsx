"use client";

import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CheckoutConfig = { enabled?: boolean; currency?: string; price?: number | string | null };

export function ActivationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      setLoadingPayment(true);
      const { data } = await supabase.rpc("get_payment_checkout_config", { p_type: "micro_jobs" });
      setConfig((data as CheckoutConfig | null) ?? null);
      setLoadingPayment(false);
    };
    void load();
  }, [open]);

  if (!open) return null;
  const amount = Number(config?.price ?? 0);
  const price = Number.isFinite(amount) && amount > 0 ? formatMoney(amount, config?.currency || general.currency, language) : "—";
  const paymentsConfigured = Boolean(config?.enabled && amount > 0);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="activation-title">
        <div className="modal-icon"><LockKeyhole size={35} /></div>
        <h2 id="activation-title" className="modal-title">{t("activation.title")}</h2>
        <p className="modal-copy">{t("activation.body")}</p>
        <div className="soft-card" style={{ padding: 16, marginBottom: 16, textAlign: "center" }}>
          <span className="muted" style={{ display: "block", fontSize: ".85rem" }}>{t("activation.price")}</span>
          <strong style={{ fontSize: "1.9rem" }}>{loadingPayment ? "…" : price}</strong>
        </div>
        <div className="soft-card" style={{ marginBottom: 16, padding: 12, display: "flex", alignItems: "center", gap: 9 }}>
          <ShieldCheck size={18} />
          <span style={{ fontSize: ".78rem" }}>{language === "bn" ? "পেমেন্ট সার্ভারে যাচাই হওয়ার পরেই Micro Jobs চালু হবে।" : "Micro Jobs activates only after server-side payment verification."}</span>
        </div>
        {!loadingPayment && !paymentsConfigured && <div className="form-message error" style={{ marginBottom: 16 }}>{general.paymentPendingMessage || t("activation.pending")}</div>}
        <div className="modal-actions">
          {paymentsConfigured ? <Link className="primary-button" href="/payment/checkout?type=micro_jobs" onClick={onClose}>{t("activation.unlock")}</Link> : <button className="primary-button" disabled>{t("activation.unlock")}</button>}
          <button className="secondary-button" onClick={onClose}>{t("common.close")}</button>
        </div>
      </section>
    </div>
  );
}

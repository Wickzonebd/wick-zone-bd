"use client";

import { LockKeyhole } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { formatMoney } from "@/lib/money";

export function ActivationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  if (!open) return null;
  const price = general.activationPrice == null ? "—" : formatMoney(general.activationPrice, general.currency, language);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="activation-title">
        <div className="modal-icon"><LockKeyhole size={35} /></div>
        <h2 id="activation-title" className="modal-title">{t("activation.title")}</h2>
        <p className="modal-copy">{t("activation.body")}</p>
        <div className="soft-card" style={{ padding: 16, marginBottom: 16, textAlign: "center" }}>
          <span className="muted" style={{ display: "block", fontSize: ".85rem" }}>{t("activation.price")}</span>
          <strong style={{ fontSize: "1.9rem" }}>{price}</strong>
        </div>
        <div className="form-message error" style={{ marginBottom: 16 }}>{general.paymentPendingMessage || t("activation.pending")}</div>
        <div className="modal-actions">
          <button className="primary-button" disabled>{t("activation.unlock")}</button>
          <button className="secondary-button" onClick={onClose}>{t("common.close")}</button>
        </div>
      </section>
    </div>
  );
}

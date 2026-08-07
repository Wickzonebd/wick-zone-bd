"use client";

import { ArrowDownToLine, Clock3, History, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { EmptyState, ErrorState, LoadingCards, Modal } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WalletSummary } from "@/lib/types";

interface WalletTransaction { id: string; amount: number; transaction_type: string; description: string | null; created_at: string; }

export function WalletClient() {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) { setError(true); setLoading(false); return; }
    const [summaryResult, txResult] = await Promise.all([
      supabase.rpc("get_wallet_summary"),
      supabase.from("wallet_transactions").select("id,amount,transaction_type,description,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setSummary(summaryResult.data as WalletSummary | null);
    setTransactions((txResult.data as WalletTransaction[]) ?? []);
    setError(Boolean(summaryResult.error || txResult.error)); setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (general.payoutMethods.length && !method) setMethod(general.payoutMethods[0] ?? ""); }, [general.payoutMethods, method]);

  const format = (value: number) => formatMoney(value, general.currency, language);
  const submitWithdrawal = async (event: FormEvent) => {
    event.preventDefault(); const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setMessage(null);
    const numericAmount = Number(amount);
    const { error: requestError } = await supabase.rpc("request_withdrawal", { p_amount: numericAmount, p_payment_method: method, p_destination: destination.trim() });
    if (requestError) setMessage(requestError.message);
    else { setMessage("Withdrawal request submitted for manual review."); setAmount(""); setDestination(""); await load(); }
  };

  const periods = summary ? [["wallet.today", summary.today], ["wallet.yesterday", summary.yesterday], ["wallet.seven", summary.last_7_days], ["wallet.thirty", summary.last_30_days]] as const : [];
  return <AppShell><main className="page-shell"><div className="page-narrow" style={{ display: "grid", gap: 16 }}>
    <header><h1 className="section-title" style={{ fontSize: "2rem" }}>{t("wallet.title")}</h1></header>
    {loading ? <LoadingCards count={3} /> : error || !summary ? <ErrorState message={t("common.error")} /> : <>
      <section className="card wallet-hero"><div className="balance-box"><div><div style={{ opacity: .82 }}>{t("wallet.balance")}</div><div className="balance-value">{format(summary.balance)}</div></div></div><div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}><button className="primary-button" onClick={() => setWithdrawOpen(true)}><ArrowDownToLine size={19} />{t("wallet.withdraw")}</button><a href="#history" className="secondary-button" style={{ textDecoration: "none" }}><History size={19} />{t("wallet.history")}</a></div></section>
      <section><div className="income-grid">{periods.map(([label, value]) => <div className="income-card" key={label}><ReceiptText size={22} color="var(--primary)" /><span className="income-value">{format(value)}</span><span className="muted">{t(label)}</span></div>)}</div></section>
      <section id="history"><h2 className="section-title" style={{ marginBottom: 12 }}>{t("wallet.history")}</h2>{transactions.length ? <div className="card" style={{ overflow: "hidden" }}>{transactions.map((tx) => <div key={tx.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 11, alignItems: "center", padding: 14, borderBottom: "1px solid var(--border)" }}><div className="quick-icon" style={{ width: 44, height: 44 }}><WalletCards size={20} /></div><div><strong>{tx.description || tx.transaction_type.replaceAll("_", " ")}</strong><div className="muted" style={{ fontSize: ".76rem" }}><Clock3 size={12} style={{ display: "inline" }} /> {new Date(tx.created_at).toLocaleString()}</div></div><strong style={{ color: tx.amount >= 0 ? "#087a50" : "#c32943" }}>{tx.amount >= 0 ? "+" : ""}{format(tx.amount)}</strong></div>)}</div> : <EmptyState message={t("wallet.empty")} />}</section>
    </>}
  </div></main>
  {withdrawOpen && <Modal title={t("wallet.withdraw")} onClose={() => setWithdrawOpen(false)}><form className="auth-form" onSubmit={submitWithdrawal}><div className="field"><label>{t("wallet.amount")} · minimum {format(general.withdrawalMinimum)}</label><input className="input" type="number" min={general.withdrawalMinimum} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div><div className="field"><label>{t("wallet.method")}</label><select className="select" value={method} onChange={(event) => setMethod(event.target.value)} required>{general.payoutMethods.map((value) => <option key={value}>{value}</option>)}</select></div><div className="field"><label>{t("wallet.destination")}</label><div className="input-wrap"><Landmark size={19} /><input className="input with-icon" value={destination} onChange={(event) => setDestination(event.target.value)} required maxLength={120} /></div></div>{message && <div className="form-message success">{message}</div>}<button className="primary-button">{t("wallet.request")}</button></form></Modal>}
  </AppShell>;
}

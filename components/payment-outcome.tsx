"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleX, LoaderCircle, ReceiptText, RotateCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { TaskoraLockup } from "@/components/taskora-brand";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PaymentRow = {
  id: string;
  invoice_id: string;
  transaction_id: string | null;
  provider_transaction_id: string | null;
  amount: number | string;
  currency: string;
  payment_method: string | null;
  status: string;
  payment_type: string;
  item_id: string | null;
  item_name: string;
  created_at: string;
  paid_at: string | null;
};

export function PaymentOutcomeClient({ mode }: { mode: "success" | "failed" | "cancelled" }) {
  const search = useSearchParams();
  const { language } = useI18n();
  const invoice = search.get("invoice");
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(Boolean(invoice));
  const [attempts, setAttempts] = useState(0);

  const load = useCallback(async () => {
    if (!invoice) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("payments").select("id,invoice_id,transaction_id,provider_transaction_id,amount,currency,payment_method,status,payment_type,item_id,item_name,created_at,paid_at").eq("invoice_id", invoice).maybeSingle();
    setPayment((data as PaymentRow | null) ?? null);
    setLoading(false);
  }, [invoice]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!invoice) { setLoading(false); return; }
      const supabase = getSupabaseBrowserClient();
      if (mode === "success" && supabase) {
        await supabase.functions.invoke("payment-verify", { body: { invoiceId: invoice } });
      }
      if (active) await load();
    };
    void initialize();
    return () => { active = false; };
  }, [mode, invoice, load]);

  useEffect(() => {
    if (mode !== "success" || !invoice || payment?.status === "paid" || attempts >= 6) return;
    const timer = window.setTimeout(() => { setAttempts((value) => value + 1); void load(); }, 1800);
    return () => window.clearTimeout(timer);
  }, [mode, invoice, payment?.status, attempts, load]);

  const verified = payment?.status === "paid";
  const stillProcessing = mode === "success" && !verified && attempts < 6 && (!payment || ["pending", "processing"].includes(payment.status));
  const retryHref = useMemo(() => {
    if (!payment) return "/profile/payments";
    if (payment.payment_type === "verification") return "/payment/checkout?type=verification";
    if (payment.payment_type === "reselling" && payment.item_id) return `/payment/checkout?type=reselling&itemId=${encodeURIComponent(payment.item_id)}`;
    return "/payment/checkout?type=micro_jobs";
  }, [payment]);
  const destinationHref = payment?.payment_type === "micro_jobs" ? "/jobs" : payment?.payment_type === "verification" ? "/profile" : payment?.payment_type === "reselling" ? "/reselling?view=orders" : "/dashboard";

  const title = verified
    ? (language === "bn" ? "পেমেন্ট সফল" : "Payment Successful")
    : stillProcessing
      ? (language === "bn" ? "পেমেন্ট যাচাই হচ্ছে" : "Verifying Payment")
      : mode === "cancelled"
        ? (language === "bn" ? "পেমেন্ট বাতিল হয়েছে" : "Payment Cancelled")
        : (language === "bn" ? "পেমেন্ট সম্পন্ন হয়নি" : "Payment Not Completed");
  const text = verified
    ? (language === "bn" ? "গেটওয়ে verification সম্পন্ন হয়েছে এবং ক্রয়টি সক্রিয় করা হয়েছে।" : "Gateway verification is complete and the purchase has been activated.")
    : stillProcessing
      ? (language === "bn" ? "Provider verification/webhook শেষ হওয়ার জন্য অপেক্ষা করা হচ্ছে। এই পেজটি নিজে থেকেই আবার চেক করছে।" : "Waiting for provider verification/webhook. This page is checking again automatically.")
      : (language === "bn" ? "Server-verified Paid record পাওয়া যায়নি। কোনো entitlement Paid হিসেবে চালু করা হয়নি।" : "No server-verified Paid record was found. No paid entitlement was activated.");

  const Icon = verified ? CheckCircle2 : stillProcessing ? LoaderCircle : CircleX;

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container"><section className="payment-result-card">
    <div className={`payment-result-icon ${verified ? "success" : stillProcessing ? "processing" : mode}`}><Icon size={42} className={stillProcessing ? "profile-spinner" : undefined} /></div>
    <TaskoraLockup markSize={36} />
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" />{language === "bn" ? "পেমেন্ট তথ্য লোড হচ্ছে..." : "Loading payment..."}</div> : <>
      <h1>{title}</h1><p>{text}</p>
      {payment && <div className="payment-details result">
        <div><span>{language === "bn" ? "অ্যামাউন্ট" : "Amount"}</span><strong>{formatMoney(Number(payment.amount), payment.currency, language)}</strong></div>
        <div><span>{language === "bn" ? "ইনভয়েস" : "Invoice"}</span><strong>{payment.invoice_id}</strong></div>
        <div><span>{language === "bn" ? "স্ট্যাটাস" : "Status"}</span><strong>{payment.status}</strong></div>
        <div><span>{language === "bn" ? "ট্রানজ্যাকশন" : "Transaction ID"}</span><strong>{payment.transaction_id || payment.provider_transaction_id || "—"}</strong></div>
        <div><span>{language === "bn" ? "আইটেম" : "Item"}</span><strong>{payment.item_name}</strong></div>
      </div>}
      <div className="payment-result-actions">
        {verified && payment && <Link className="primary-button" href={`/invoice/${encodeURIComponent(payment.invoice_id)}`}><ReceiptText size={18} />{language === "bn" ? "ইনভয়েস দেখুন" : "View Invoice"}</Link>}
        {verified && <Link className="secondary-button" href={destinationHref}>{language === "bn" ? "চালিয়ে যান" : "Continue"}</Link>}
        {!verified && stillProcessing && <button className="secondary-button" type="button" onClick={() => { setAttempts(0); setLoading(true); void load(); }}><RotateCw size={17} />{language === "bn" ? "এখনই আবার চেক করুন" : "Check Again"}</button>}
        {!verified && !stillProcessing && payment && <Link className="primary-button" href={retryHref}>{language === "bn" ? "আবার চেষ্টা করুন" : "Retry Payment"}</Link>}
        <Link className="secondary-button" href="/profile/payments">{language === "bn" ? "পেমেন্ট হিস্ট্রি" : "Payment History"}</Link>
        <Link className="secondary-button" href="/dashboard">{language === "bn" ? "ড্যাশবোর্ড" : "Dashboard"}</Link>
      </div>
    </>}
  </section></div></main></AppShell>;
}

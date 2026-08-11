"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleX, FileText, LoaderCircle, LockKeyhole, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { TaskoraLockup } from "@/components/taskora-brand";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CheckoutConfig = {
  enabled: boolean;
  reason?: string;
  providerName?: string | null;
  currency?: string;
  merchantName?: string;
  merchantLogo?: string | null;
  supportPhone?: string | null;
  supportEmail?: string | null;
  termsText?: string | null;
  price?: number | string | null;
};

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
  item_name: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  created_at: string;
  paid_at: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  payment_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  item_name: string;
  item_description: string | null;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  currency: string;
  status: string;
  transaction_id: string | null;
  payment_method: string | null;
  issued_at: string;
  paid_at: string | null;
};

const labels: Record<string, { en: string; bn: string; descriptionEn: string; descriptionBn: string }> = {
  micro_jobs: { en: "Micro Jobs Activation", bn: "Micro Jobs অ্যাক্টিভেশন", descriptionEn: "One-time activation for protected Micro Jobs access.", descriptionBn: "Micro Jobs ব্যবহারের জন্য এককালীন অ্যাক্টিভেশন।" },
  verification: { en: "Blue Verification Badge", bn: "ব্লু ভেরিফিকেশন ব্যাজ", descriptionEn: "Purchase Social profile verification.", descriptionBn: "Social প্রোফাইলের ভেরিফিকেশন কিনুন।" },
};

export function PaymentCheckoutClient() {
  const search = useSearchParams();
  const { user, profile } = useAuth();
  const { language } = useI18n();
  const type = search.get("type") || "micro_jobs";
  const item = labels[type] || labels.micro_jobs;
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError("Payment service is unavailable."); setLoading(false); return; }
      const { data, error: configError } = await supabase.rpc("get_payment_checkout_config", { p_type: type });
      if (configError) setError(configError.message);
      setConfig((data as CheckoutConfig | null) ?? null);
      setLoading(false);
    };
    void load();
  }, [type]);

  const price = Number(config?.price ?? 0);
  const currency = config?.currency || "BDT";
  const canPay = Boolean(config?.enabled && Number.isFinite(price) && price > 0 && user && !processing);

  const startPayment = async () => {
    if (!canPay) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setProcessing(true); setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("payment-create", { body: { paymentType: type } });
      if (invokeError) throw invokeError;
      const result = data as { checkoutUrl?: string; error?: string } | null;
      if (!result?.checkoutUrl) throw new Error(result?.error || "Payment provider is not configured yet.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be prepared.");
      setProcessing(false);
    }
  };

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container">
    <section className="payment-checkout-card">
      <div className="payment-brand"><TaskoraLockup markSize={40} /></div>
      {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" /><span>{language === "bn" ? "পেমেন্ট তথ্য লোড হচ্ছে..." : "Loading payment details..."}</span></div> : <>
        <div className="payment-title-block"><span>{config?.merchantName || "Taskora"}</span><h1>{language === "bn" ? item.bn : item.en}</h1><p>{language === "bn" ? item.descriptionBn : item.descriptionEn}</p></div>
        <div className="payment-secure"><ShieldCheck size={19} /><div><strong>{language === "bn" ? "নিরাপদ পেমেন্ট" : "Secure payment"}</strong><small>{language === "bn" ? "সার্ভার যাচাই ছাড়া কোনো অ্যাক্সেস চালু হবে না" : "No access is activated without server verification"}</small></div></div>
        <div className="payment-details">
          <div><span>{language === "bn" ? "অ্যাকাউন্ট" : "Account"}</span><strong>{profile?.full_name || user?.email || "—"}</strong></div>
          <div><span>Email</span><strong>{user?.email || "—"}</strong></div>
          <div><span>{language === "bn" ? "পেমেন্ট গেটওয়ে" : "Payment provider"}</span><strong>{config?.providerName || "—"}</strong></div>
        </div>
        <div className="payment-total"><span>{language === "bn" ? "মোট পরিশোধযোগ্য" : "Total payable"}</span><strong>{price > 0 ? formatMoney(price, currency, language) : "—"}</strong></div>
        {!config?.enabled && <div className="form-message error">{language === "bn" ? "এই মুহূর্তে অনলাইন পেমেন্ট চালু নেই।" : "Online payments are not enabled right now."}</div>}
        {error && <div className="form-message error">{error}</div>}
        <button className="primary-button payment-pay-button" onClick={() => void startPayment()} disabled={!canPay}>
          {processing ? <><LoaderCircle className="profile-spinner" size={19} />{language === "bn" ? "পেমেন্ট প্রস্তুত করা হচ্ছে..." : "Preparing payment..."}</> : <><LockKeyhole size={18} />{language === "bn" ? "Pay Now" : "Pay Now"}</>}
        </button>
        <Link className="secondary-button payment-cancel-button" href="/dashboard">{language === "bn" ? "বাতিল" : "Cancel"}</Link>
        {config?.termsText && <p className="payment-terms">{config.termsText}</p>}
      </>}
    </section>
  </div></main></AppShell>;
}

export function PaymentResultClient({ mode }: { mode: "success" | "failed" | "cancelled" }) {
  const search = useSearchParams();
  const { language } = useI18n();
  const invoice = search.get("invoice");
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(mode === "success");

  useEffect(() => {
    if (mode !== "success" || !invoice) { setLoading(false); return; }
    const load = async () => {
      const supabase = getSupabaseBrowserClient(); if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.from("payments").select("id,invoice_id,transaction_id,provider_transaction_id,amount,currency,payment_method,status,payment_type,item_name,customer_name,customer_email,customer_phone,created_at,paid_at").eq("invoice_id", invoice).maybeSingle();
      setPayment((data as PaymentRow | null) ?? null); setLoading(false);
    };
    void load();
  }, [invoice, mode]);

  const verified = payment?.status === "paid";
  const effectiveMode = mode === "success" && !loading && !verified ? "failed" : mode;
  const copy = effectiveMode === "success"
    ? { title: language === "bn" ? "পেমেন্ট সফল" : "Payment Successful", text: language === "bn" ? "পেমেন্টটি সার্ভারে যাচাই করা হয়েছে।" : "This payment was verified by the server." }
    : effectiveMode === "cancelled"
      ? { title: language === "bn" ? "পেমেন্ট সম্পন্ন হয়নি" : "Payment Cancelled", text: language === "bn" ? "কোনো টাকা Paid হিসেবে রেকর্ড করা হয়নি।" : "No purchase was marked as paid." }
      : { title: language === "bn" ? "পেমেন্ট ব্যর্থ" : "Payment Failed", text: language === "bn" ? "পেমেন্টটি verified Paid অবস্থায় পাওয়া যায়নি।" : "The payment was not found in a verified Paid state." };
  const Icon = effectiveMode === "success" ? CheckCircle2 : CircleX;

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container"><section className="payment-result-card">
    <div className={`payment-result-icon ${effectiveMode}`}><Icon size={42} /></div>
    <TaskoraLockup markSize={36} />
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" />{language === "bn" ? "পেমেন্ট যাচাই হচ্ছে..." : "Verifying payment..."}</div> : <>
      <h1>{copy.title}</h1><p>{copy.text}</p>
      {verified && payment && <div className="payment-details result">
        <div><span>{language === "bn" ? "পরিশোধ" : "Amount Paid"}</span><strong>{formatMoney(Number(payment.amount), payment.currency, language)}</strong></div>
        <div><span>{language === "bn" ? "ইনভয়েস" : "Invoice"}</span><strong>{payment.invoice_id}</strong></div>
        <div><span>{language === "bn" ? "ট্রানজ্যাকশন" : "Transaction ID"}</span><strong>{payment.transaction_id || payment.provider_transaction_id || "—"}</strong></div>
        <div><span>{language === "bn" ? "আইটেম" : "Purchased Item"}</span><strong>{payment.item_name}</strong></div>
        <div><span>{language === "bn" ? "তারিখ" : "Payment Date"}</span><strong>{new Date(payment.paid_at || payment.created_at).toLocaleString(language === "bn" ? "bn-BD" : "en")}</strong></div>
      </div>}
      <div className="payment-result-actions">
        {verified && payment && <Link className="primary-button" href={`/invoice/${encodeURIComponent(payment.invoice_id)}`}><ReceiptText size={18} />{language === "bn" ? "ইনভয়েস দেখুন" : "View Invoice"}</Link>}
        {verified && payment?.payment_type === "micro_jobs" && <Link className="secondary-button" href="/jobs">{language === "bn" ? "Micro Jobs-এ যান" : "Go to Micro Jobs"}</Link>}
        {verified && payment?.payment_type === "verification" && <Link className="secondary-button" href="/profile">{language === "bn" ? "প্রোফাইল দেখুন" : "View Profile"}</Link>}
        {!verified && invoice && <Link className="primary-button" href={`/payment/checkout?type=micro_jobs`}>{language === "bn" ? "আবার চেষ্টা করুন" : "Retry Payment"}</Link>}
        <Link className="secondary-button" href="/dashboard">{language === "bn" ? "ড্যাশবোর্ড" : "Go to Dashboard"}</Link>
      </div>
    </>}
  </section></div></main></AppShell>;
}

export function InvoiceClient({ invoiceNumber }: { invoiceNumber: string }) {
  const { language } = useI18n();
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient(); if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.from("invoices").select("id,invoice_number,payment_id,customer_name,customer_email,customer_phone,item_name,item_description,subtotal,discount,total,currency,status,transaction_id,payment_method,issued_at,paid_at").eq("invoice_number", invoiceNumber).maybeSingle();
      setInvoice((data as InvoiceRow | null) ?? null); setLoading(false);
    };
    void load();
  }, [invoiceNumber]);

  const paid = invoice?.status === "paid";
  const formatted = useMemo(() => invoice ? formatMoney(Number(invoice.total), invoice.currency, language) : "", [invoice, language]);
  return <AppShell hidePrimaryNav><main className="payment-page invoice-page"><div className="payment-container">
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" /></div> : invoice ? <section className="invoice-sheet">
      <header><TaskoraLockup markSize={42} /><div><span>PAYMENT RECEIPT / INVOICE</span><h1>{invoice.invoice_number}</h1></div></header>
      <div className="invoice-meta"><div><span>{language === "bn" ? "ইনভয়েস তারিখ" : "Invoice Date"}</span><strong>{new Date(invoice.issued_at).toLocaleDateString(language === "bn" ? "bn-BD" : "en")}</strong></div><div><span>Status</span><strong className={`status ${paid ? "active" : "pending"}`}>{invoice.status}</strong></div></div>
      <div className="invoice-customer"><span>{language === "bn" ? "গ্রাহক" : "Bill To"}</span><strong>{invoice.customer_name || "Taskora Member"}</strong><small>{invoice.customer_email}</small>{invoice.customer_phone && <small>{invoice.customer_phone}</small>}</div>
      <div className="invoice-table"><div className="invoice-row head"><span>{language === "bn" ? "আইটেম" : "Item"}</span><span>{language === "bn" ? "মূল্য" : "Amount"}</span></div><div className="invoice-row"><div><strong>{invoice.item_name}</strong>{invoice.item_description && <small>{invoice.item_description}</small>}</div><strong>{formatMoney(Number(invoice.subtotal), invoice.currency, language)}</strong></div><div className="invoice-row summary"><span>{language === "bn" ? "ডিসকাউন্ট" : "Discount"}</span><span>{formatMoney(Number(invoice.discount), invoice.currency, language)}</span></div><div className="invoice-row total"><span>Total</span><strong>{formatted}</strong></div></div>
      <div className="invoice-transaction"><FileText size={18} /><div><span>Transaction ID</span><strong>{invoice.transaction_id || "—"}</strong><small>{invoice.payment_method || "—"}{invoice.paid_at ? ` · ${new Date(invoice.paid_at).toLocaleString(language === "bn" ? "bn-BD" : "en")}` : ""}</small></div></div>
      <div className="invoice-actions"><button className="primary-button" onClick={() => window.print()}><ReceiptText size={18} />{language === "bn" ? "Print / Save Invoice" : "Print / Save Invoice"}</button><Link className="secondary-button" href="/profile">{language === "bn" ? "প্রোফাইলে ফিরুন" : "Back to Profile"}</Link></div>
    </section> : <section className="payment-result-card"><CircleX size={38} /><h1>{language === "bn" ? "ইনভয়েস পাওয়া যায়নি" : "Invoice not found"}</h1><Link className="secondary-button" href="/dashboard">Dashboard</Link></section>}
  </div></main></AppShell>;
}

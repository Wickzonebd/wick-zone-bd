"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleX, FileText, LoaderCircle, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { TaskoraLockup } from "@/components/taskora-brand";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CheckoutConfig = { enabled: boolean; reason?: string; currency?: string; merchantName?: string; termsText?: string | null; price?: number | string | null; };
type PaymentRow = { id: string; invoice_id: string; transaction_id: string | null; provider_transaction_id: string | null; amount: number | string; currency: string; payment_method: string | null; status: string; payment_type: string; item_name: string; customer_name: string | null; customer_email: string | null; customer_phone: string | null; created_at: string; paid_at: string | null; };
type InvoiceRow = { id: string; invoice_number: string; payment_id: string; customer_name: string | null; customer_email: string | null; customer_phone: string | null; item_name: string; item_description: string | null; subtotal: number | string; discount: number | string; total: number | string; currency: string; status: string; transaction_id: string | null; payment_method: string | null; issued_at: string; paid_at: string | null; };

const labels: Record<string, { en: string; bn: string; descriptionEn: string; descriptionBn: string }> = {
  micro_jobs: { en: "Micro Jobs Activation", bn: "Micro Jobs অ্যাক্টিভেশন", descriptionEn: "Pay once from your main wallet to activate protected Micro Jobs access.", descriptionBn: "মূল Wallet Balance থেকে একবার পেমেন্ট করে Micro Jobs অ্যাক্টিভ করুন।" },
  verification: { en: "Blue Verification Badge", bn: "ব্লু ভেরিফিকেশন ব্যাজ", descriptionEn: "Purchase Social profile verification from your main wallet.", descriptionBn: "মূল Wallet Balance ব্যবহার করে Social প্রোফাইল ভেরিফিকেশন কিনুন।" },
};

function walletError(message: string, language: "bn" | "en") {
  if (/insufficient_wallet_balance/i.test(message)) return language === "bn" ? "আপনার Wallet Balance পর্যাপ্ত নয়। আগে Deposit করুন।" : "Your wallet balance is insufficient. Deposit first.";
  if (/already_active/i.test(message)) return language === "bn" ? "Micro Jobs ইতিমধ্যে অ্যাক্টিভ আছে।" : "Micro Jobs is already active.";
  if (/already_verified/i.test(message)) return language === "bn" ? "আপনার প্রোফাইল ইতিমধ্যে Verified।" : "Your profile is already verified.";
  if (/verification_disabled/i.test(message)) return language === "bn" ? "Verification এখন বন্ধ আছে।" : "Verification is currently disabled.";
  return message;
}

export function PaymentCheckoutClient() {
  const search = useSearchParams();
  const { user, profile } = useAuth();
  const { language } = useI18n();
  const type = search.get("type") === "verification" ? "verification" : "micro_jobs";
  const item = labels[type];
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError(language === "bn" ? "Wallet সেবা পাওয়া যাচ্ছে না।" : "Wallet service is unavailable."); setLoading(false); return; }
      const [configResult, walletResult] = await Promise.all([
        supabase.rpc("get_payment_checkout_config", { p_type: type }),
        supabase.rpc("get_wallet_summary"),
      ]);
      if (configResult.error) setError(language === "bn" ? "পেমেন্ট তথ্য লোড করা যায়নি।" : "Payment details could not be loaded.");
      setConfig((configResult.data as CheckoutConfig | null) ?? null);
      setBalance(Number((walletResult.data as { balance?: number | string } | null)?.balance ?? 0));
      setLoading(false);
    };
    void load();
  }, [type, language]);

  const price = Number(config?.price ?? 0);
  const currency = config?.currency || "BDT";
  const enough = balance >= price && price > 0;
  const canPay = Boolean(user && Number.isFinite(price) && price > 0 && enough && !processing);

  const payFromWallet = async () => {
    if (!canPay) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setProcessing(true); setError(null);
    const { data, error: payError } = await supabase.rpc("purchase_with_wallet", { p_payment_type: type, p_item_id: null });
    if (payError) { setError(walletError(payError.message, language)); setProcessing(false); return; }
    const result = data as { invoiceId?: string } | null;
    if (!result?.invoiceId) { setError(language === "bn" ? "পেমেন্ট সম্পন্ন করা যায়নি।" : "Payment could not be completed."); setProcessing(false); return; }
    window.location.assign(`/payment/success?invoice=${encodeURIComponent(result.invoiceId)}&type=${type}`);
  };

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container"><section className="payment-checkout-card">
    <div className="payment-brand"><TaskoraLockup markSize={40} /></div>
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" /><span>{language === "bn" ? "Wallet তথ্য লোড হচ্ছে..." : "Loading wallet..."}</span></div> : <>
      <div className="payment-title-block"><span>{config?.merchantName || "Taskora"}</span><h1>{language === "bn" ? item.bn : item.en}</h1><p>{language === "bn" ? item.descriptionBn : item.descriptionEn}</p></div>
      <div className="payment-secure"><WalletCards size={19} /><div><strong>{language === "bn" ? "মূল Wallet System" : "Main Wallet System"}</strong><small>{language === "bn" ? "এই পেমেন্ট সরাসরি আপনার Wallet Balance থেকে কাটা হবে।" : "This payment is deducted directly from your wallet balance."}</small></div></div>
      <div className="payment-details">
        <div><span>{language === "bn" ? "অ্যাকাউন্ট" : "Account"}</span><strong>{profile?.full_name || user?.email || "—"}</strong></div>
        <div><span>{language === "bn" ? "Wallet Balance" : "Wallet Balance"}</span><strong>{formatMoney(balance, currency, language)}</strong></div>
        <div><span>{language === "bn" ? "সেবা" : "Service"}</span><strong>{language === "bn" ? item.bn : item.en}</strong></div>
      </div>
      <div className="payment-total"><span>{language === "bn" ? "Wallet থেকে কাটা হবে" : "Wallet debit"}</span><strong>{price > 0 ? formatMoney(price, currency, language) : "—"}</strong></div>
      {!enough && price > 0 && <div className="form-message error">{language === "bn" ? `আরও ${formatMoney(Math.max(0, price - balance), currency, language)} প্রয়োজন। আগে Wallet-এ Deposit করুন।` : `You need ${formatMoney(Math.max(0, price - balance), currency, language)} more. Deposit to your wallet first.`}</div>}
      {error && <div className="form-message error">{error}</div>}
      <button className="primary-button payment-pay-button" onClick={() => void payFromWallet()} disabled={!canPay}>{processing ? <><LoaderCircle className="profile-spinner" size={19} />{language === "bn" ? "Wallet Payment হচ্ছে..." : "Paying from wallet..."}</> : <><WalletCards size={18} />{language === "bn" ? "Wallet থেকে পেমেন্ট করুন" : "Pay from Wallet"}</>}</button>
      {!enough && <Link className="primary-button" href="/wallet?deposit=1">{language === "bn" ? "Wallet-এ Deposit করুন" : "Deposit to Wallet"}</Link>}
      <Link className="secondary-button payment-cancel-button" href="/dashboard">{language === "bn" ? "বাতিল" : "Cancel"}</Link>
      {config?.termsText && <p className="payment-terms">{config.termsText}</p>}
    </>}
  </section></div></main></AppShell>;
}

export function PaymentResultClient({ mode }: { mode: "success" | "failed" | "cancelled" }) {
  const search = useSearchParams();
  const { language } = useI18n();
  const invoice = search.get("invoice");
  const providerInvoice = search.get("invoice_id");
  const requestedType = search.get("type") || "micro_jobs";
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(mode === "success");
  const [verificationError, setVerificationError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "success") { setLoading(false); return; }
    const load = async () => {
      const supabase = getSupabaseBrowserClient(); if (!supabase) { setLoading(false); return; }
      let resolvedInvoice = invoice;
      if (providerInvoice) {
        const { data: verificationData, error: verifyError } = await supabase.functions.invoke("payment-verify", { body: { invoiceId: invoice || undefined, providerInvoiceId: providerInvoice } });
        if (verifyError) setVerificationError(language === "bn" ? "পেমেন্ট যাচাই করা যায়নি।" : "Payment verification failed.");
        const result = verificationData as { invoiceId?: string } | null;
        resolvedInvoice = result?.invoiceId || resolvedInvoice;
      }
      if (!resolvedInvoice) { setVerificationError(language === "bn" ? "পেমেন্ট রেফারেন্স পাওয়া যায়নি।" : "Payment reference was not found."); setLoading(false); return; }
      const { data } = await supabase.from("payments").select("id,invoice_id,transaction_id,provider_transaction_id,amount,currency,payment_method,status,payment_type,item_name,customer_name,customer_email,customer_phone,created_at,paid_at").eq("invoice_id", resolvedInvoice).maybeSingle();
      setPayment((data as PaymentRow | null) ?? null); setLoading(false);
    };
    void load();
  }, [invoice, providerInvoice, mode, language]);

  const verified = payment?.status === "paid";
  const isDeposit = payment?.payment_type === "deposit" || requestedType === "deposit";
  const effectiveMode = mode === "success" && !loading && !verified ? "failed" : mode;
  const copy = effectiveMode === "success"
    ? { title: isDeposit ? (language === "bn" ? "ডিপোজিট সফল" : "Deposit Successful") : (language === "bn" ? "পেমেন্ট সফল" : "Payment Successful"), text: isDeposit ? (language === "bn" ? "টাকা সফলভাবে আপনার মূল Wallet Balance-এ যোগ হয়েছে।" : "The money was added to your main wallet balance.") : (language === "bn" ? "Wallet থেকে পেমেন্ট সফলভাবে সম্পন্ন হয়েছে।" : "Wallet payment completed successfully.") }
    : effectiveMode === "cancelled"
      ? { title: language === "bn" ? "পেমেন্ট সম্পন্ন হয়নি" : "Payment Cancelled", text: language === "bn" ? "কোনো টাকা যোগ বা কাটা হয়নি।" : "No money was added or deducted." }
      : { title: language === "bn" ? "পেমেন্ট সম্পন্ন হয়নি" : "Payment Not Completed", text: verificationError || (language === "bn" ? "পেমেন্টটি সফল হিসেবে যাচাই করা যায়নি।" : "The payment could not be verified as successful.") };
  const Icon = effectiveMode === "success" ? CheckCircle2 : CircleX;

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container"><section className="payment-result-card">
    <div className={`payment-result-icon ${effectiveMode}`}><Icon size={42} /></div><TaskoraLockup markSize={36} />
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" />{language === "bn" ? "পেমেন্ট যাচাই হচ্ছে..." : "Verifying payment..."}</div> : <>
      <h1>{copy.title}</h1><p>{copy.text}</p>
      {verified && payment && <div className="payment-details result">
        <div><span>{isDeposit ? (language === "bn" ? "Wallet-এ যোগ হয়েছে" : "Wallet credit") : (language === "bn" ? "পরিশোধ" : "Amount Paid")}</span><strong>{formatMoney(Number(payment.amount), payment.currency, language)}</strong></div>
        <div><span>{language === "bn" ? "ইনভয়েস" : "Invoice"}</span><strong>{payment.invoice_id}</strong></div>
        <div><span>{language === "bn" ? "ট্রানজ্যাকশন" : "Transaction ID"}</span><strong>{payment.transaction_id || payment.provider_transaction_id || "—"}</strong></div>
        <div><span>{language === "bn" ? "পদ্ধতি" : "Method"}</span><strong>{payment.payment_method || "wallet"}</strong></div>
        <div><span>{language === "bn" ? "তারিখ" : "Date"}</span><strong>{new Date(payment.paid_at || payment.created_at).toLocaleString(language === "bn" ? "bn-BD" : "en")}</strong></div>
      </div>}
      <div className="payment-result-actions">
        {verified && payment && <Link className="primary-button" href={`/invoice/${encodeURIComponent(payment.invoice_id)}`}><ReceiptText size={18} />{language === "bn" ? "ইনভয়েস দেখুন" : "View Invoice"}</Link>}
        {isDeposit && <Link className="secondary-button" href="/wallet">{language === "bn" ? "Wallet দেখুন" : "View Wallet"}</Link>}
        {verified && payment?.payment_type === "micro_jobs" && <Link className="secondary-button" href="/jobs">{language === "bn" ? "Micro Jobs-এ যান" : "Go to Micro Jobs"}</Link>}
        {verified && payment?.payment_type === "verification" && <Link className="secondary-button" href="/profile">{language === "bn" ? "প্রোফাইল দেখুন" : "View Profile"}</Link>}
        {!verified && isDeposit && <Link className="primary-button" href="/wallet?deposit=1">{language === "bn" ? "আবার Deposit করুন" : "Retry Deposit"}</Link>}
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
      <div className="invoice-actions"><button className="primary-button" onClick={() => window.print()}><ReceiptText size={18} />Print / Save Invoice</button><Link className="secondary-button" href="/profile">{language === "bn" ? "প্রোফাইলে ফিরুন" : "Back to Profile"}</Link></div>
    </section> : <section className="payment-result-card"><CircleX size={38} /><h1>{language === "bn" ? "ইনভয়েস পাওয়া যায়নি" : "Invoice not found"}</h1><Link className="secondary-button" href="/dashboard">Dashboard</Link></section>}
  </div></main></AppShell>;
}

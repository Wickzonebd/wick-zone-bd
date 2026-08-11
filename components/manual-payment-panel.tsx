"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardCopy, LoaderCircle, Send, Smartphone } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ManualPaymentMethod = {
  id: "bkash" | "nagad" | "rocket";
  label: string;
  number: string;
  accountType: "Personal" | "Merchant" | "Agent" | string;
};

type ManualPaymentResult = {
  status?: string;
  paymentId?: string;
  invoiceId?: string;
};

function manualError(message: string, language: "bn" | "en") {
  const code = message.toLowerCase();
  if (code.includes("duplicate_transaction")) return language === "bn" ? "এই Transaction ID আগে ব্যবহার করা হয়েছে। সঠিক Transaction ID দিন।" : "This transaction ID has already been used.";
  if (code.includes("invalid_sender_mobile")) return language === "bn" ? "যে নম্বর থেকে টাকা পাঠিয়েছেন, সেই সঠিক ১১ সংখ্যার নম্বর দিন।" : "Enter the valid 11-digit number used to send the payment.";
  if (code.includes("invalid_transaction_id")) return language === "bn" ? "সঠিক Transaction ID দিন (৬–৩২ অক্ষর)।" : "Enter a valid transaction ID (6–32 characters).";
  if (code.includes("manual_payment_already_submitted")) return language === "bn" ? "এই পেমেন্টটি ইতিমধ্যে যাচাইয়ের জন্য জমা হয়েছে।" : "This payment is already awaiting verification.";
  if (code.includes("already_active")) return language === "bn" ? "আপনার Micro Jobs ইতিমধ্যে সক্রিয়।" : "Your Micro Jobs access is already active.";
  if (code.includes("already_verified")) return language === "bn" ? "আপনার প্রোফাইল ইতিমধ্যে verified।" : "Your profile is already verified.";
  if (code.includes("order_already_paid")) return language === "bn" ? "এই অর্ডারটি ইতিমধ্যে paid।" : "This order has already been paid.";
  return language === "bn" ? "পেমেন্ট তথ্য জমা দেওয়া যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।" : "The payment details could not be submitted. Check the information and try again.";
}

export function ManualPaymentPanel({
  methods,
  amount,
  currency,
  paymentType,
  itemId,
  disabled = false,
}: {
  methods: ManualPaymentMethod[];
  amount: number;
  currency: string;
  paymentType: string;
  itemId?: string | null;
  disabled?: boolean;
}) {
  const { language } = useI18n();
  const [selectedId, setSelectedId] = useState(methods[0]?.id || "bkash");
  const [senderMobile, setSenderMobile] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ManualPaymentResult | null>(null);
  const selected = useMemo(() => methods.find((method) => method.id === selectedId) || methods[0], [methods, selectedId]);

  useEffect(() => {
    if (!methods.some((method) => method.id === selectedId) && methods[0]) setSelectedId(methods[0].id);
  }, [methods, selectedId]);

  if (!methods.length) return null;

  const copyNumber = async () => {
    if (!selected?.number) return;
    try { await navigator.clipboard.writeText(selected.number); }
    catch { setError(language === "bn" ? "নম্বরটি কপি করা যায়নি—চেপে ধরে কপি করুন।" : "Could not copy the number; press and hold to copy it."); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || disabled || submitting) return;
    const normalizedMobile = senderMobile.replace(/\D/g, "");
    const normalizedTransaction = transactionId.trim().toUpperCase();
    if (!/^01[3-9]\d{8}$/.test(normalizedMobile)) {
      setError(language === "bn" ? "যে নম্বর থেকে টাকা পাঠিয়েছেন, সেই ১১ সংখ্যার নম্বর দিন।" : "Enter the 11-digit number used to send the payment.");
      return;
    }
    if (!/^[A-Z0-9]{6,32}$/.test(normalizedTransaction)) {
      setError(language === "bn" ? "সঠিক Transaction ID দিন (৬–৩২ অক্ষর)।" : "Enter a valid transaction ID (6–32 characters).");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSubmitting(true); setError(null);
    const { data, error: submitError } = await supabase.rpc("submit_manual_payment", {
      p_payment_type: paymentType,
      p_item_id: itemId || null,
      p_method: selected.id,
      p_sender_mobile: normalizedMobile,
      p_transaction_id: normalizedTransaction,
    });
    setSubmitting(false);
    if (submitError) {
      setError(manualError(submitError.message, language));
      return;
    }
    setSubmitted((data as ManualPaymentResult | null) || { status: "under_review" });
  };

  if (submitted) return <section className="manual-payment-success" aria-live="polite">
    <CheckCircle2 size={31} />
    <div>
      <h2>{language === "bn" ? "পেমেন্ট তথ্য জমা হয়েছে" : "Payment submitted"}</h2>
      <p>{language === "bn" ? "Admin Transaction ID যাচাই করার পর সেবা বা অর্ডার চালু হবে। সাধারণত অল্প সময়ের মধ্যেই আপডেট Inbox-এ পাবেন।" : "Your service or order will be activated after an administrator verifies the transaction ID. You will receive the update in Inbox."}</p>
      {submitted.invoiceId && <small>{language === "bn" ? "রেফারেন্স" : "Reference"}: {submitted.invoiceId}</small>}
      <Link href="/profile/payments" className="secondary-button">{language === "bn" ? "পেমেন্ট স্ট্যাটাস দেখুন" : "View payment status"}</Link>
    </div>
  </section>;

  return <section className="manual-payment-panel">
    <div className="manual-payment-heading">
      <Smartphone size={24} />
      <div><h2>{language === "bn" ? "মোবাইল ব্যাংকিং পেমেন্ট" : "Mobile banking payment"}</h2><p>{language === "bn" ? "নিচের নম্বরে সঠিক পরিমাণ পাঠিয়ে Transaction ID জমা দিন।" : "Send the exact amount to the number below, then submit the transaction ID."}</p></div>
    </div>

    <div className="manual-method-tabs" role="tablist" aria-label={language === "bn" ? "পেমেন্ট মাধ্যম" : "Payment method"}>
      {methods.map((method) => <button key={method.id} type="button" className={method.id === selected?.id ? `active ${method.id}` : method.id} onClick={() => { setSelectedId(method.id); setError(null); }}>
        <span>{method.label}</span><small>{method.accountType}</small>
      </button>)}
    </div>

    {selected && <div className={`manual-payment-instruction ${selected.id}`}>
      <div><span>{language === "bn" ? `${selected.label} ${selected.accountType} নম্বর` : `${selected.label} ${selected.accountType} number`}</span><strong>{selected.number}</strong></div>
      <button type="button" onClick={() => void copyNumber()}><ClipboardCopy size={17} />{language === "bn" ? "কপি" : "Copy"}</button>
      <ol>
        <li>{language === "bn" ? `${selected.label} অ্যাপ/USSD থেকে ${selected.accountType === "Merchant" ? "Payment" : "Send Money"} নির্বাচন করুন।` : `Open ${selected.label} and choose ${selected.accountType === "Merchant" ? "Payment" : "Send Money"}.`}</li>
        <li>{language === "bn" ? `${selected.number} নম্বরে ঠিক ${formatMoney(amount, currency, language)} পাঠান।` : `Send exactly ${formatMoney(amount, currency, language)} to ${selected.number}.`}</li>
        <li>{language === "bn" ? "পেমেন্টের পর পাওয়া Transaction ID নিচে দিন।" : "Enter the transaction ID received after payment below."}</li>
      </ol>
    </div>}

    <form className="manual-payment-form" onSubmit={submit}>
      <label><span>{language === "bn" ? "যে নম্বর থেকে টাকা পাঠিয়েছেন" : "Sender mobile number"}</span><input value={senderMobile} onChange={(event) => setSenderMobile(event.target.value)} inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" maxLength={14} disabled={disabled || submitting} /></label>
      <label><span>Transaction ID</span><input value={transactionId} onChange={(event) => setTransactionId(event.target.value.toUpperCase())} autoCapitalize="characters" placeholder="Example: BCG7A1XXXX" maxLength={32} disabled={disabled || submitting} /></label>
      {error && <div className="form-message error">{error}</div>}
      <button className="primary-button manual-submit-button" disabled={disabled || submitting}>
        {submitting ? <><LoaderCircle className="profile-spinner" size={18} />{language === "bn" ? "জমা হচ্ছে…" : "Submitting…"}</> : <><Send size={18} />{language === "bn" ? "পেমেন্ট যাচাইয়ের জন্য জমা দিন" : "Submit for verification"}</>}
      </button>
      <small className="manual-payment-warning">{language === "bn" ? "শুধু টাকা পাঠানোর পর তথ্য জমা দিন। ভুল বা ভুয়া Transaction ID অনুমোদিত হবে না।" : "Submit only after sending the payment. Incorrect or fake transaction IDs will be rejected."}</small>
    </form>
  </section>;
}

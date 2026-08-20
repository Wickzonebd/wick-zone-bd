"use client";

import Link from "next/link";
import { LoaderCircle, PackageCheck, ShoppingBag, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { TaskoraLockup } from "@/components/taskora-brand";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type OrderRow = { id: string; order_code: string; total: number | string; status: string; payment_status: string; contact_name: string; contact_mobile: string; delivery_address: string; };
type PaymentSettings = { currency: string; merchant_name: string; terms_text: string | null; };

export function ResellingPaymentCheckoutClient({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user || !orderId) { setLoading(false); return; }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError(language === "bn" ? "Wallet সেবা পাওয়া যাচ্ছে না।" : "Wallet service is unavailable."); setLoading(false); return; }
      const [orderResult, settingsResult, walletResult] = await Promise.all([
        supabase.from("reselling_orders").select("id,order_code,total,status,payment_status,contact_name,contact_mobile,delivery_address").eq("id", orderId).eq("user_id", user.id).maybeSingle(),
        supabase.from("payment_settings").select("currency,merchant_name,terms_text").eq("id", true).maybeSingle(),
        supabase.rpc("get_wallet_summary"),
      ]);
      if (orderResult.error || !orderResult.data) setError(language === "bn" ? "অর্ডারটি পাওয়া যায়নি।" : "Order not found.");
      setOrder((orderResult.data as OrderRow | null) ?? null);
      setSettings((settingsResult.data as PaymentSettings | null) ?? null);
      setBalance(Number((walletResult.data as { balance?: number | string } | null)?.balance ?? 0));
      setLoading(false);
    };
    void load();
  }, [user, orderId, language]);

  const amount = Number(order?.total ?? 0);
  const currency = settings?.currency || "BDT";
  const alreadyPaid = order?.payment_status === "paid";
  const cancelled = order?.status === "cancelled";
  const enough = balance >= amount && amount > 0;
  const canPay = Boolean(user && order && !alreadyPaid && !cancelled && enough && Number.isFinite(amount) && amount > 0 && !processing);

  const pay = async () => {
    if (!canPay || !order) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setProcessing(true); setError(null);
    const { data, error: payError } = await supabase.rpc("purchase_with_wallet", { p_payment_type: "reselling", p_item_id: order.id });
    if (payError) {
      setError(/insufficient_wallet_balance/i.test(payError.message)
        ? (language === "bn" ? "আপনার Wallet Balance পর্যাপ্ত নয়। আগে Deposit করুন।" : "Your wallet balance is insufficient. Deposit first.")
        : payError.message);
      setProcessing(false);
      return;
    }
    const result = data as { invoiceId?: string } | null;
    if (!result?.invoiceId) { setError(language === "bn" ? "পেমেন্ট সম্পন্ন করা যায়নি।" : "Payment could not be completed."); setProcessing(false); return; }
    window.location.assign(`/payment/success?invoice=${encodeURIComponent(result.invoiceId)}&type=reselling`);
  };

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container"><section className="payment-checkout-card">
    <div className="payment-brand"><TaskoraLockup markSize={40} /></div>
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" /><span>{language === "bn" ? "অর্ডার লোড হচ্ছে..." : "Loading order..."}</span></div> : order ? <>
      <div className="payment-title-block"><span>{settings?.merchant_name || "Taskora"}</span><h1>{language === "bn" ? "অর্ডার পেমেন্ট" : "Order Payment"}</h1><p>{language === "bn" ? "এই অর্ডারের পেমেন্ট আপনার মূল Wallet Balance থেকে হবে।" : "This order is paid from your main wallet balance."}</p></div>
      <div className="payment-secure"><WalletCards size={19} /><div><strong>{language === "bn" ? "মূল Wallet System" : "Main Wallet System"}</strong><small>{language === "bn" ? "External payment gateway দিয়ে সরাসরি অর্ডার কেনা হবে না।" : "Orders are not purchased directly through the external gateway."}</small></div></div>
      <div className="payment-details">
        <div><span>{language === "bn" ? "অর্ডার" : "Order"}</span><strong>{order.order_code}</strong></div>
        <div><span>{language === "bn" ? "গ্রাহক" : "Customer"}</span><strong>{order.contact_name}</strong></div>
        <div><span>Wallet Balance</span><strong>{formatMoney(balance, currency, language)}</strong></div>
        <div><span>{language === "bn" ? "Wallet থেকে কাটা হবে" : "Wallet debit"}</span><strong>{formatMoney(amount, currency, language)}</strong></div>
      </div>
      <div className="payment-total"><span>{language === "bn" ? "মোট পরিশোধযোগ্য" : "Total payable"}</span><strong>{amount > 0 ? formatMoney(amount, currency, language) : "—"}</strong></div>
      {alreadyPaid && <div className="form-message success"><PackageCheck size={17} /> {language === "bn" ? "এই অর্ডারটি ইতিমধ্যে Paid।" : "This order is already paid."}</div>}
      {cancelled && <div className="form-message error">{language === "bn" ? "Cancelled অর্ডারে পেমেন্ট করা যাবে না।" : "A cancelled order cannot be paid."}</div>}
      {!enough && !alreadyPaid && !cancelled && <div className="form-message error">{language === "bn" ? `Wallet-এ আরও ${formatMoney(Math.max(0, amount - balance), currency, language)} প্রয়োজন।` : `You need ${formatMoney(Math.max(0, amount - balance), currency, language)} more in your wallet.`}</div>}
      {error && <div className="form-message error">{error}</div>}
      {!alreadyPaid && <button className="primary-button payment-pay-button" disabled={!canPay} onClick={() => void pay()}>{processing ? <><LoaderCircle className="profile-spinner" size={19} />{language === "bn" ? "Wallet Payment হচ্ছে..." : "Paying from wallet..."}</> : <><WalletCards size={18} />{language === "bn" ? "Wallet থেকে পেমেন্ট করুন" : "Pay from Wallet"}</>}</button>}
      {!enough && !alreadyPaid && !cancelled && <Link className="primary-button" href="/wallet?deposit=1">{language === "bn" ? "Wallet-এ Deposit করুন" : "Deposit to Wallet"}</Link>}
      <Link className="secondary-button payment-cancel-button" href="/reselling?view=orders"><ShoppingBag size={17} />{language === "bn" ? "অর্ডারে ফিরে যান" : "Back to Orders"}</Link>
      {settings?.terms_text && <p className="payment-terms">{settings.terms_text}</p>}
    </> : <div className="payment-result-card"><h1>{language === "bn" ? "অর্ডার পাওয়া যায়নি" : "Order not found"}</h1>{error && <p>{error}</p>}<Link className="primary-button" href="/reselling?view=orders">{language === "bn" ? "অর্ডার দেখুন" : "View Orders"}</Link></div>}
  </section></div></main></AppShell>;
}

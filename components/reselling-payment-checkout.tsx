"use client";

import Link from "next/link";
import { LoaderCircle, LockKeyhole, PackageCheck, ShieldCheck, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { ManualPaymentPanel, type ManualPaymentMethod } from "@/components/manual-payment-panel";
import { TaskoraLockup } from "@/components/taskora-brand";
import { formatMoney } from "@/lib/money";
import { friendlyPaymentError } from "@/lib/payment-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type OrderRow = {
  id: string;
  order_code: string;
  total: number | string;
  status: string;
  payment_status: string;
  contact_name: string;
  contact_mobile: string;
  delivery_address: string;
};

type PaymentSettings = {
  payment_enabled: boolean;
  currency: string;
  merchant_name: string;
  terms_text: string | null;
  manual_payment_enabled: boolean;
  bkash_enabled: boolean;
  bkash_number: string | null;
  bkash_account_type: string;
  nagad_enabled: boolean;
  nagad_number: string | null;
  nagad_account_type: string;
  rocket_enabled: boolean;
  rocket_number: string | null;
  rocket_account_type: string;
};

export function ResellingPaymentCheckoutClient({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user || !orderId) { setLoading(false); return; }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) { setError("Payment service is unavailable."); setLoading(false); return; }
      const [orderResult, settingsResult] = await Promise.all([
        supabase.from("reselling_orders").select("id,order_code,total,status,payment_status,contact_name,contact_mobile,delivery_address").eq("id", orderId).eq("user_id", user.id).maybeSingle(),
        supabase.from("payment_settings").select("payment_enabled,currency,merchant_name,terms_text,manual_payment_enabled,bkash_enabled,bkash_number,bkash_account_type,nagad_enabled,nagad_number,nagad_account_type,rocket_enabled,rocket_number,rocket_account_type").eq("id", true).maybeSingle(),
      ]);
      if (orderResult.error || !orderResult.data) setError(language === "bn" ? "অর্ডারটি পাওয়া যায়নি।" : "Order not found.");
      if (settingsResult.error || !settingsResult.data) setError(language === "bn" ? "পেমেন্ট সেটিংস পাওয়া যায়নি।" : "Payment settings are unavailable.");
      setOrder((orderResult.data as OrderRow | null) ?? null);
      setSettings((settingsResult.data as PaymentSettings | null) ?? null);
      setLoading(false);
    };
    void load();
  }, [user, orderId, language]);

  const amount = Number(order?.total ?? 0);
  const alreadyPaid = order?.payment_status === "paid";
  const cancelled = order?.status === "cancelled";
  const canPay = Boolean(user && order && settings?.payment_enabled && !alreadyPaid && !cancelled && Number.isFinite(amount) && amount > 0 && !processing);
  const manualMethods: ManualPaymentMethod[] = settings?.manual_payment_enabled ? [
    settings.bkash_enabled && settings.bkash_number ? { id: "bkash" as const, label: "bKash", number: settings.bkash_number, accountType: settings.bkash_account_type } : null,
    settings.nagad_enabled && settings.nagad_number ? { id: "nagad" as const, label: "Nagad", number: settings.nagad_number, accountType: settings.nagad_account_type } : null,
    settings.rocket_enabled && settings.rocket_number ? { id: "rocket" as const, label: "Rocket", number: settings.rocket_number, accountType: settings.rocket_account_type } : null,
  ].filter((method): method is ManualPaymentMethod => method !== null) : [];

  const pay = async () => {
    if (!canPay || !order) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setProcessing(true); setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("payment-create", { body: { paymentType: "reselling", itemId: order.id } });
      if (invokeError) throw invokeError;
      const result = data as { checkoutUrl?: string; error?: string } | null;
      if (!result?.checkoutUrl) throw new Error(result?.error || "Payment provider is not configured yet.");
      const url = new URL(result.checkoutUrl);
      if (url.protocol !== "https:") throw new Error("Payment provider returned an insecure checkout URL.");
      window.location.assign(url.toString());
    } catch (cause) {
      setError(await friendlyPaymentError(cause, language));
      setProcessing(false);
    }
  };

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-container"><section className="payment-checkout-card">
    <div className="payment-brand"><TaskoraLockup markSize={40} /></div>
    {loading ? <div className="payment-loading"><LoaderCircle className="profile-spinner" /><span>{language === "bn" ? "অর্ডার লোড হচ্ছে..." : "Loading order..."}</span></div> : order ? <>
      <div className="payment-title-block"><span>{settings?.merchant_name || "Taskora"}</span><h1>{language === "bn" ? "অর্ডার পেমেন্ট" : "Order Payment"}</h1><p>{language === "bn" ? "Taskora Store অর্ডারের নিরাপদ অনলাইন পেমেন্ট।" : "Secure online payment for your Taskora Store order."}</p></div>
      <div className="payment-secure"><ShieldCheck size={19} /><div><strong>{language === "bn" ? "নিরাপদ অনলাইন পেমেন্ট" : "Secure online payment"}</strong><small>{language === "bn" ? "পেমেন্ট সফল হলে অর্ডারটি স্বয়ংক্রিয়ভাবে আপডেট হবে" : "Your order updates automatically after a successful payment"}</small></div></div>
      <div className="payment-details">
        <div><span>{language === "bn" ? "অর্ডার" : "Order"}</span><strong>{order.order_code}</strong></div>
        <div><span>{language === "bn" ? "গ্রাহক" : "Customer"}</span><strong>{order.contact_name}</strong></div>
        <div><span>{language === "bn" ? "মোবাইল" : "Mobile"}</span><strong>{order.contact_mobile}</strong></div>
        <div><span>{language === "bn" ? "ডেলিভারি" : "Delivery"}</span><strong>{order.delivery_address}</strong></div>
        <div><span>{language === "bn" ? "পেমেন্ট" : "Payment"}</span><strong>{language === "bn" ? "নিরাপদ অনলাইন চেকআউট" : "Secure online checkout"}</strong></div>
      </div>
      <div className="payment-total"><span>{language === "bn" ? "মোট পরিশোধযোগ্য" : "Total payable"}</span><strong>{amount > 0 ? formatMoney(amount, settings?.currency || "BDT", language) : "—"}</strong></div>
      {alreadyPaid && <div className="form-message success"><PackageCheck size={17} /> {language === "bn" ? "এই অর্ডারটি ইতিমধ্যে Paid।" : "This order is already paid."}</div>}
      {cancelled && <div className="form-message error">{language === "bn" ? "Cancelled অর্ডারে পেমেন্ট করা যাবে না।" : "A cancelled order cannot be paid."}</div>}
      {!settings?.payment_enabled && !alreadyPaid && <div className="form-message error">{language === "bn" ? "অনলাইন পেমেন্ট এখন বন্ধ আছে।" : "Online payments are currently disabled."}</div>}
      {!alreadyPaid && !cancelled && settings?.payment_enabled && manualMethods.length > 0 && <ManualPaymentPanel methods={manualMethods} amount={amount} currency={settings.currency || "BDT"} paymentType="reselling" itemId={order.id} />}
      {!alreadyPaid && !cancelled && settings?.payment_enabled && settings.manual_payment_enabled && manualMethods.length === 0 && <div className="form-message error">{language === "bn" ? "মোবাইল ব্যাংকিং নম্বর এখনো সেট করা হয়নি। Admin panel থেকে bKash/Nagad নম্বর সেট করুন।" : "No mobile banking number is configured yet. Add bKash/Nagad details from the admin panel."}</div>}
      {error && <div className="form-message error">{error}</div>}
      {!alreadyPaid && <button className="primary-button payment-pay-button" disabled={!canPay} onClick={() => void pay()}>{processing ? <><LoaderCircle className="profile-spinner" size={19} />{language === "bn" ? "গেটওয়ে প্রস্তুত হচ্ছে..." : "Preparing gateway..."}</> : <><LockKeyhole size={18} />{language === "bn" ? "অটোমেটিক গেটওয়ে দিয়ে পেমেন্ট" : "Pay with automatic gateway"}</>}</button>}
      <Link className="secondary-button payment-cancel-button" href="/reselling?view=orders"><ShoppingBag size={17} />{language === "bn" ? "অর্ডারে ফিরে যান" : "Back to Orders"}</Link>
      {settings?.terms_text && <p className="payment-terms">{settings.terms_text}</p>}
    </> : <><div className="payment-result-card"><h1>{language === "bn" ? "অর্ডার পাওয়া যায়নি" : "Order not found"}</h1>{error && <p>{error}</p>}<Link className="primary-button" href="/reselling?view=orders">{language === "bn" ? "অর্ডার দেখুন" : "View Orders"}</Link></div></>}
  </section></div></main></AppShell>;
}

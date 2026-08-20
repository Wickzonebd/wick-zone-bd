import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.2/cors";
import { createProviderCheckout } from "../_shared/payment-provider.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

type DepositReservation = {
  state: "created";
  paymentId: string;
  invoiceId: string;
  amount: number | string;
  currency: string;
  itemName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return reply({ error: "unauthorized" }, 401);

  let body: { paymentType?: string; amount?: number | string };
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }

  if (body.paymentType !== "deposit") return reply({ error: "wallet_payment_required" }, 400);
  const requestedAmount = Number(body.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount < 10 || requestedAmount > 100000) {
    return reply({ error: "invalid_deposit_amount" }, 400);
  }

  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  if (!appUrl) return reply({ error: "missing_app_url" }, 503);

  const { data: reservationData, error: reservationError } = await admin.rpc("reserve_deposit_attempt", {
    p_user_id: user.id,
    p_amount: requestedAmount,
  });
  if (reservationError || !reservationData) {
    const code = reservationError?.message || "deposit_record_failed";
    const status = code === "invalid_deposit_amount" || code === "user_not_found" ? 400 : code === "payments_disabled" ? 503 : 500;
    return reply({ error: code }, status);
  }

  const reservation = reservationData as DepositReservation;
  const amount = Number(reservation.amount);
  if (!reservation.paymentId || !reservation.invoiceId || !Number.isFinite(amount) || amount <= 0) {
    return reply({ error: "deposit_record_failed" }, 500);
  }

  let provider;
  try {
    provider = await createProviderCheckout({
      invoiceId: reservation.invoiceId,
      amount,
      currency: reservation.currency || "BDT",
      customerName: reservation.customerName || user.email || "Taskora Member",
      customerEmail: reservation.customerEmail || user.email || "",
      customerPhone: reservation.customerPhone || null,
      itemName: reservation.itemName || "Wallet Deposit",
      successUrl: `${appUrl}/payment/success?invoice=${encodeURIComponent(reservation.invoiceId)}&type=deposit`,
      failedUrl: `${appUrl}/payment/failed?invoice=${encodeURIComponent(reservation.invoiceId)}&type=deposit`,
      cancelledUrl: `${appUrl}/payment/cancelled?invoice=${encodeURIComponent(reservation.invoiceId)}&type=deposit`,
      webhookUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_error";
    await admin.rpc("mark_payment_failed", { p_payment_id: reservation.paymentId, p_event: "failed", p_provider_response: { error: message } });
    return reply({ error: message }, 502);
  }

  let checkoutUrl: URL;
  try { checkoutUrl = new URL(provider.checkoutUrl); }
  catch {
    await admin.rpc("mark_payment_failed", { p_payment_id: reservation.paymentId, p_event: "failed", p_provider_response: { error: "invalid_provider_checkout_url" } });
    return reply({ error: "invalid_provider_checkout_url" }, 502);
  }
  if (checkoutUrl.protocol !== "https:") {
    await admin.rpc("mark_payment_failed", { p_payment_id: reservation.paymentId, p_event: "failed", p_provider_response: { error: "insecure_provider_checkout_url" } });
    return reply({ error: "insecure_provider_checkout_url" }, 502);
  }

  const { error: providerUpdateError } = await admin.rpc("set_payment_provider_state", {
    p_payment_id: reservation.paymentId,
    p_checkout_url: checkoutUrl.toString(),
    p_provider_session_id: provider.providerSessionId || null,
    p_provider_response: provider.raw,
  });
  if (providerUpdateError) {
    await admin.rpc("mark_payment_failed", { p_payment_id: reservation.paymentId, p_event: "failed", p_provider_response: { error: "provider_state_save_failed" } });
    return reply({ error: "provider_state_save_failed" }, 500);
  }

  return reply({ checkoutUrl: checkoutUrl.toString(), invoiceId: reservation.invoiceId });
});

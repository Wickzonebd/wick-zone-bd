import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.2/cors";
import { createProviderCheckout } from "../_shared/payment-provider.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type PaymentReservation = {
  state: "created" | "reused" | "initializing";
  paymentId: string;
  invoiceId: string;
  checkoutUrl?: string | null;
  amount?: number | string;
  currency?: string;
  itemName?: string;
  customerName?: string;
  customerEmail?: string;
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

  let body: { paymentType?: string; itemId?: string };
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const paymentType = body.paymentType;
  if (!paymentType || !["micro_jobs", "verification", "reselling"].includes(paymentType)) {
    return reply({ error: "invalid_payment_type" }, 400);
  }

  let itemId: string | null = body.itemId?.trim() || null;
  if (paymentType !== "reselling") itemId = null;
  if (paymentType === "reselling" && (!itemId || !isUuid(itemId))) {
    return reply({ error: "invalid_reselling_order" }, 400);
  }

  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  if (!appUrl) return reply({ error: "missing_app_url" }, 503);

  const { data: reservationData, error: reservationError } = await admin.rpc("reserve_payment_attempt", {
    p_user_id: user.id,
    p_payment_type: paymentType,
    p_item_id: itemId,
  });
  if (reservationError || !reservationData) {
    const known = new Set([
      "payment_settings_unavailable", "payments_disabled", "verification_disabled",
      "already_active", "already_verified", "invalid_reselling_order",
      "reselling_order_not_found", "order_already_paid", "order_cancelled",
      "invalid_admin_price", "user_not_found",
    ]);
    const code = known.has(reservationError?.message || "") ? reservationError!.message : "payment_record_failed";
    const status = ["already_active", "already_verified", "verification_disabled", "order_already_paid", "order_cancelled"].includes(code)
      ? 409
      : code === "reselling_order_not_found" ? 404
      : ["invalid_reselling_order", "user_not_found"].includes(code) ? 400
      : ["payment_settings_unavailable", "payments_disabled", "invalid_admin_price"].includes(code) ? 503
      : 500;
    return reply({ error: code }, status);
  }

  const reservation = reservationData as PaymentReservation;
  if (reservation.state === "reused" && reservation.checkoutUrl) {
    return reply({ checkoutUrl: reservation.checkoutUrl, invoiceId: reservation.invoiceId, reused: true });
  }
  if (reservation.state === "initializing") {
    return reply({ error: "payment_initializing", invoiceId: reservation.invoiceId }, 409);
  }
  const amount = Number(reservation.amount);
  const currency = reservation.currency || "BDT";
  const itemName = reservation.itemName || "Taskora Payment";
  const customerName = reservation.customerName || user.email || "Taskora Member";
  const customerEmail = reservation.customerEmail || user.email || "";
  const customerPhone = reservation.customerPhone || null;
  const paymentId = reservation.paymentId;
  const invoiceNumber = reservation.invoiceId;
  if (!paymentId || !invoiceNumber || !Number.isFinite(amount) || amount <= 0) {
    return reply({ error: "payment_record_failed" }, 500);
  }

  let provider;
  try {
    provider = await createProviderCheckout({
      invoiceId: invoiceNumber,
      amount,
      currency,
      customerName,
      customerEmail,
      customerPhone,
      itemName,
      // UddoktaPay returns its own invoice_id to this URL. The internal Taskora
      // invoice remains in provider metadata and is recovered during verification.
      successUrl: `${appUrl}/payment/success?invoice=${encodeURIComponent(invoiceNumber)}&type=${encodeURIComponent(paymentType)}`,
      failedUrl: `${appUrl}/payment/failed?invoice=${encodeURIComponent(invoiceNumber)}&type=${encodeURIComponent(paymentType)}`,
      cancelledUrl: `${appUrl}/payment/cancelled?invoice=${encodeURIComponent(invoiceNumber)}&type=${encodeURIComponent(paymentType)}`,
      webhookUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_error";
    await admin.rpc("mark_payment_failed", { p_payment_id: paymentId, p_event: "failed", p_provider_response: { error: message } });
    return reply({ error: message }, 502);
  }

  let checkoutUrl: URL;
  try { checkoutUrl = new URL(provider.checkoutUrl); }
  catch {
    await admin.rpc("mark_payment_failed", { p_payment_id: paymentId, p_event: "failed", p_provider_response: { error: "invalid_provider_checkout_url" } });
    return reply({ error: "invalid_provider_checkout_url" }, 502);
  }
  if (checkoutUrl.protocol !== "https:") {
    await admin.rpc("mark_payment_failed", { p_payment_id: paymentId, p_event: "failed", p_provider_response: { error: "insecure_provider_checkout_url" } });
    return reply({ error: "insecure_provider_checkout_url" }, 502);
  }

  const { error: providerUpdateError } = await admin.rpc("set_payment_provider_state", {
    p_payment_id: paymentId,
    p_checkout_url: checkoutUrl.toString(),
    p_provider_session_id: provider.providerSessionId || null,
    p_provider_response: provider.raw,
  });
  if (providerUpdateError) {
    await admin.rpc("mark_payment_failed", { p_payment_id: paymentId, p_event: "failed", p_provider_response: { error: "provider_state_save_failed" } });
    return reply({ error: "provider_state_save_failed" }, 500);
  }

  return reply({ checkoutUrl: checkoutUrl.toString(), invoiceId: invoiceNumber });
});

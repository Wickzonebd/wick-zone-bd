import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { createProviderCheckout } from "../_shared/payment-provider.ts";

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (req: Request) => {
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
  if (!paymentType || !["micro_jobs", "verification"].includes(paymentType)) return reply({ error: "invalid_payment_type" }, 400);

  const [{ data: settings, error: settingsError }, { data: profile }, { data: privateProfile }] = await Promise.all([
    admin.from("payment_settings").select("payment_enabled,provider_name,currency,merchant_name,micro_job_activation_price,verification_price,verification_enabled").eq("id", true).single(),
    admin.from("profiles").select("full_name,is_social_verified").eq("id", user.id).maybeSingle(),
    admin.from("user_private_profiles").select("mobile").eq("user_id", user.id).maybeSingle(),
  ]);
  if (settingsError || !settings) return reply({ error: "payment_settings_unavailable" }, 503);
  if (!settings.payment_enabled) return reply({ error: "payments_disabled" }, 503);
  if (paymentType === "verification" && !settings.verification_enabled) return reply({ error: "verification_disabled" }, 409);

  const amount = Number(paymentType === "micro_jobs" ? settings.micro_job_activation_price : settings.verification_price);
  if (!Number.isFinite(amount) || amount <= 0) return reply({ error: "invalid_admin_price" }, 503);

  if (paymentType === "micro_jobs") {
    const { data: membership } = await admin.from("memberships").select("status").eq("user_id", user.id).maybeSingle();
    if (membership?.status === "active") return reply({ error: "already_active" }, 409);
  }
  if (paymentType === "verification" && profile?.is_social_verified) return reply({ error: "already_verified" }, 409);

  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  if (!appUrl) return reply({ error: "missing_app_url" }, 503);

  // Allocate the invoice only after all user, price and eligibility checks pass.
  const { data: invoiceNumber, error: invoiceError } = await admin.rpc("next_taskora_invoice_number");
  if (invoiceError || !invoiceNumber) return reply({ error: "invoice_generation_failed" }, 500);

  const itemName = paymentType === "micro_jobs" ? "Micro Jobs Activation" : "Blue Verification Badge";
  let provider;
  try {
    provider = await createProviderCheckout({
      invoiceId: invoiceNumber,
      amount,
      currency: settings.currency,
      customerName: profile?.full_name || user.email || "Taskora Member",
      customerEmail: user.email || "",
      customerPhone: privateProfile?.mobile || null,
      itemName,
      successUrl: `${appUrl}/payment/success?invoice=${encodeURIComponent(invoiceNumber)}`,
      failedUrl: `${appUrl}/payment/failed?invoice=${encodeURIComponent(invoiceNumber)}`,
      cancelledUrl: `${appUrl}/payment/cancelled?invoice=${encodeURIComponent(invoiceNumber)}`,
      webhookUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_error";
    return reply({ error: message }, message === "provider_adapter_required" ? 503 : 502);
  }

  const { data: payment, error: paymentError } = await admin.from("payments").insert({
    user_id: user.id,
    invoice_id: invoiceNumber,
    amount,
    currency: settings.currency,
    status: "pending",
    payment_type: paymentType,
    item_id: body.itemId || null,
    item_name: itemName,
    customer_name: profile?.full_name || null,
    customer_email: user.email || null,
    customer_phone: privateProfile?.mobile || null,
    provider_checkout_url: provider.checkoutUrl,
    provider_session_id: provider.providerSessionId || null,
    provider_response: provider.raw,
  }).select("id,invoice_id").single();
  if (paymentError || !payment) return reply({ error: "payment_record_failed" }, 500);

  const { error: receiptError } = await admin.from("invoices").insert({
    invoice_number: invoiceNumber,
    user_id: user.id,
    payment_id: payment.id,
    customer_name: profile?.full_name || null,
    customer_email: user.email || null,
    customer_phone: privateProfile?.mobile || null,
    item_name: itemName,
    item_description: paymentType === "micro_jobs" ? "One-time Taskora Micro Jobs activation" : "Taskora Social profile verification",
    subtotal: amount,
    discount: 0,
    total: amount,
    currency: settings.currency,
    status: "pending",
  });
  if (receiptError) {
    await admin.from("payments").delete().eq("id", payment.id);
    return reply({ error: "invoice_record_failed" }, 500);
  }

  await admin.from("payment_audit_logs").insert({ payment_id: payment.id, invoice_id: invoiceNumber, event: "payment_created" });
  return reply({ checkoutUrl: provider.checkoutUrl, invoiceId: invoiceNumber });
});

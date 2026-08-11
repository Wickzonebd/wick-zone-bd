import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { createProviderCheckout } from "../_shared/payment-provider.ts";

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  if (!paymentType || !["micro_jobs", "verification", "reselling"].includes(paymentType)) {
    return reply({ error: "invalid_payment_type" }, 400);
  }

  const [{ data: settings, error: settingsError }, { data: profile }, { data: privateProfile }] = await Promise.all([
    admin.from("payment_settings").select("payment_enabled,provider_name,currency,merchant_name,micro_job_activation_price,verification_price,verification_enabled").eq("id", true).single(),
    admin.from("profiles").select("full_name,is_social_verified").eq("id", user.id).maybeSingle(),
    admin.from("user_private_profiles").select("mobile").eq("user_id", user.id).maybeSingle(),
  ]);
  if (settingsError || !settings) return reply({ error: "payment_settings_unavailable" }, 503);
  if (!settings.payment_enabled) return reply({ error: "payments_disabled" }, 503);
  if (paymentType === "verification" && !settings.verification_enabled) return reply({ error: "verification_disabled" }, 409);

  let amount = 0;
  let itemId: string | null = body.itemId?.trim() || null;
  let itemName = "";
  let itemDescription = "";
  let customerName = profile?.full_name || user.email || "Taskora Member";
  let customerPhone = privateProfile?.mobile || null;

  if (paymentType === "micro_jobs") {
    amount = Number(settings.micro_job_activation_price);
    itemName = "Micro Jobs Activation";
    itemDescription = "One-time Taskora Micro Jobs activation";
    const { data: membership } = await admin.from("memberships").select("status").eq("user_id", user.id).maybeSingle();
    if (membership?.status === "active") return reply({ error: "already_active" }, 409);
    itemId = null;
  } else if (paymentType === "verification") {
    amount = Number(settings.verification_price);
    itemName = "Blue Verification Badge";
    itemDescription = "Taskora Social profile verification";
    if (profile?.is_social_verified) return reply({ error: "already_verified" }, 409);
    itemId = null;
  } else {
    if (!itemId || !isUuid(itemId)) return reply({ error: "invalid_reselling_order" }, 400);
    const { data: order, error: orderError } = await admin
      .from("reselling_orders")
      .select("id,order_code,total,status,payment_status,contact_name,contact_mobile")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (orderError) return reply({ error: "reselling_order_unavailable" }, 500);
    if (!order) return reply({ error: "reselling_order_not_found" }, 404);
    if (order.payment_status === "paid") return reply({ error: "order_already_paid" }, 409);
    if (order.status === "cancelled") return reply({ error: "order_cancelled" }, 409);
    amount = Number(order.total);
    itemName = `Reselling Order ${order.order_code}`;
    itemDescription = `Payment for Taskora Store order ${order.order_code}`;
    customerName = order.contact_name || customerName;
    customerPhone = order.contact_mobile || customerPhone;
  }

  if (!Number.isFinite(amount) || amount <= 0) return reply({ error: paymentType === "reselling" ? "invalid_order_total" : "invalid_admin_price" }, 503);

  let duplicateQuery = admin
    .from("payments")
    .select("id,invoice_id,provider_checkout_url,status")
    .eq("user_id", user.id)
    .eq("payment_type", paymentType)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1);
  duplicateQuery = itemId ? duplicateQuery.eq("item_id", itemId) : duplicateQuery.is("item_id", null);
  const { data: existingPending } = await duplicateQuery.maybeSingle();
  if (existingPending?.provider_checkout_url) {
    return reply({ checkoutUrl: existingPending.provider_checkout_url, invoiceId: existingPending.invoice_id, reused: true });
  }
  if (existingPending) return reply({ error: "payment_initializing", invoiceId: existingPending.invoice_id }, 409);

  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  if (!appUrl) return reply({ error: "missing_app_url" }, 503);

  const { data: invoiceNumber, error: invoiceError } = await admin.rpc("next_taskora_invoice_number");
  if (invoiceError || !invoiceNumber) return reply({ error: "invoice_generation_failed" }, 500);

  const { data: payment, error: reservationError } = await admin.from("payments").insert({
    user_id: user.id,
    invoice_id: invoiceNumber,
    amount,
    currency: settings.currency,
    status: "pending",
    payment_type: paymentType,
    item_id: itemId,
    item_name: itemName,
    customer_name: customerName || null,
    customer_email: user.email || null,
    customer_phone: customerPhone,
    metadata: paymentType === "reselling" ? { reselling_order_id: itemId } : {},
  }).select("id,invoice_id").single();

  if (reservationError || !payment) {
    if (reservationError?.code === "23505") {
      let raceQuery = admin
        .from("payments")
        .select("invoice_id,provider_checkout_url")
        .eq("user_id", user.id)
        .eq("payment_type", paymentType)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(1);
      raceQuery = itemId ? raceQuery.eq("item_id", itemId) : raceQuery.is("item_id", null);
      const { data: raced } = await raceQuery.maybeSingle();
      if (raced?.provider_checkout_url) return reply({ checkoutUrl: raced.provider_checkout_url, invoiceId: raced.invoice_id, reused: true });
      return reply({ error: "payment_initializing", invoiceId: raced?.invoice_id || null }, 409);
    }
    return reply({ error: "payment_record_failed" }, 500);
  }

  const { error: receiptError } = await admin.from("invoices").insert({
    invoice_number: invoiceNumber,
    user_id: user.id,
    payment_id: payment.id,
    customer_name: customerName || null,
    customer_email: user.email || null,
    customer_phone: customerPhone,
    item_name: itemName,
    item_description: itemDescription,
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

  let provider;
  try {
    provider = await createProviderCheckout({
      invoiceId: invoiceNumber,
      amount,
      currency: settings.currency,
      customerName,
      customerEmail: user.email || "",
      customerPhone,
      itemName,
      // UddoktaPay returns its own invoice_id to this URL. The internal Taskora
      // invoice remains in provider metadata and is recovered during verification.
      successUrl: `${appUrl}/payment/success`,
      failedUrl: `${appUrl}/payment/failed?invoice=${encodeURIComponent(invoiceNumber)}`,
      cancelledUrl: `${appUrl}/payment/cancelled?invoice=${encodeURIComponent(invoiceNumber)}`,
      webhookUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_error";
    await admin.rpc("mark_payment_failed", { p_payment_id: payment.id, p_event: "failed", p_provider_response: { error: message } });
    return reply({ error: message }, 502);
  }

  let checkoutUrl: URL;
  try { checkoutUrl = new URL(provider.checkoutUrl); }
  catch {
    await admin.rpc("mark_payment_failed", { p_payment_id: payment.id, p_event: "failed", p_provider_response: { error: "invalid_provider_checkout_url" } });
    return reply({ error: "invalid_provider_checkout_url" }, 502);
  }
  if (checkoutUrl.protocol !== "https:") {
    await admin.rpc("mark_payment_failed", { p_payment_id: payment.id, p_event: "failed", p_provider_response: { error: "insecure_provider_checkout_url" } });
    return reply({ error: "insecure_provider_checkout_url" }, 502);
  }

  const { error: providerUpdateError } = await admin.from("payments").update({
    provider_checkout_url: checkoutUrl.toString(),
    provider_session_id: provider.providerSessionId || null,
    provider_response: provider.raw,
    updated_at: new Date().toISOString(),
  }).eq("id", payment.id);
  if (providerUpdateError) {
    await admin.rpc("mark_payment_failed", { p_payment_id: payment.id, p_event: "failed", p_provider_response: { error: "provider_state_save_failed" } });
    return reply({ error: "provider_state_save_failed" }, 500);
  }

  await admin.from("payment_audit_logs").insert({
    payment_id: payment.id,
    invoice_id: invoiceNumber,
    event: "payment_created",
    details: { payment_type: paymentType, item_id: itemId, amount, currency: settings.currency, provider: "UddoktaPay" },
  });

  return reply({ checkoutUrl: checkoutUrl.toString(), invoiceId: invoiceNumber });
});

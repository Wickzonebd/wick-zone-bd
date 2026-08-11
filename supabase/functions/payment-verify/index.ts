import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.2/cors";
import { verifyProviderPayment } from "../_shared/payment-provider.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

type PaymentRow = {
  id: string;
  user_id: string;
  invoice_id: string;
  amount: number | string;
  currency: string;
  status: string;
  provider_session_id: string | null;
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

  let body: { invoiceId?: string; providerInvoiceId?: string };
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const requestedInvoice = body.invoiceId?.trim() || null;
  const requestedProviderInvoice = body.providerInvoiceId?.trim() || null;
  if (requestedInvoice && requestedInvoice.length > 80) return reply({ error: "invalid_invoice" }, 400);
  if (requestedProviderInvoice && requestedProviderInvoice.length > 160) return reply({ error: "invalid_provider_invoice" }, 400);
  if (!requestedInvoice && !requestedProviderInvoice) return reply({ error: "invoice_required" }, 400);

  let payment: PaymentRow | null = null;
  if (requestedInvoice) {
    const { data, error } = await userClient
      .from("payments")
      .select("id,user_id,invoice_id,amount,currency,status,provider_session_id")
      .eq("invoice_id", requestedInvoice)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return reply({ error: "payment_lookup_failed" }, 500);
    payment = (data as PaymentRow | null) ?? null;
    if (!payment) return reply({ error: "payment_not_found" }, 404);
    if (payment.status === "paid") return reply({ ok: true, paid: true, status: "paid", invoiceId: payment.invoice_id });
    if (["cancelled", "refunded"].includes(payment.status)) return reply({ ok: true, paid: false, status: payment.status, invoiceId: payment.invoice_id });
  }

  const providerInvoiceId = requestedProviderInvoice || payment?.provider_session_id || null;
  if (!providerInvoiceId) return reply({ error: "provider_invoice_required", invoiceId: payment?.invoice_id ?? null }, 409);

  let verified;
  try { verified = await verifyProviderPayment(providerInvoiceId); }
  catch (error) {
    const message = error instanceof Error ? error.message : "provider_verification_failed";
    if (payment) {
      await admin.rpc("record_payment_provider_event", {
        p_payment_id: payment.id,
        p_provider_invoice_id: providerInvoiceId,
        p_event: "manual_verification_error",
        p_details: { message, provider_invoice: providerInvoiceId },
      });
    }
    return reply({ error: message }, 502);
  }

  if (!payment) {
    const { data, error } = await userClient
      .from("payments")
      .select("id,user_id,invoice_id,amount,currency,status,provider_session_id")
      .eq("invoice_id", verified.invoiceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return reply({ error: "payment_lookup_failed" }, 500);
    payment = (data as PaymentRow | null) ?? null;
    if (!payment) return reply({ error: "payment_not_found" }, 404);
  }

  if (verified.invoiceId !== payment.invoice_id) return reply({ error: "invoice_mismatch" }, 409);

  const { error: eventError } = await admin.rpc("record_payment_provider_event", {
    p_payment_id: payment.id,
    p_provider_invoice_id: verified.providerInvoiceId,
    p_event: "manual_verification_checked",
    p_details: { paid: verified.paid, provider_status: verified.providerStatus, provider_invoice: verified.providerInvoiceId },
  });
  if (eventError) return reply({ error: "payment_state_save_failed" }, 500);

  if (!verified.paid) {
    return reply({ ok: true, paid: false, status: verified.providerStatus === "pending" ? "processing" : payment.status, invoiceId: payment.invoice_id });
  }
  if (Math.abs(Number(payment.amount) - Number(verified.amount)) > 0.009) return reply({ error: "amount_mismatch" }, 409);
  if (verified.currency && payment.currency !== verified.currency) return reply({ error: "currency_mismatch" }, 409);
  if (!verified.transactionId?.trim()) return reply({ error: "missing_transaction_id" }, 409);

  const { data, error } = await admin.rpc("finalize_verified_payment", {
    p_payment_id: payment.id,
    p_transaction_id: verified.transactionId,
    p_provider_transaction_id: verified.providerTransactionId || null,
    p_payment_method: verified.paymentMethod || null,
    p_provider_response: verified.raw,
  });
  if (error) return reply({ error: error.message }, 500);

  return reply({ ok: true, paid: true, status: "paid", paymentId: data?.id, invoiceId: data?.invoice_id, providerInvoiceId: verified.providerInvoiceId });
});

import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { verifyProviderWebhook } from "../_shared/payment-provider.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const raw = await req.text();

  let verified;
  try { verified = await verifyProviderWebhook(req, raw); }
  catch (error) {
    const message = error instanceof Error ? error.message : "verification_failed";
    return reply({ error: message }, message === "invalid_webhook_auth" ? 401 : 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: paymentRows, error: lookupError } = await admin.rpc("get_payment_for_provider", {
    p_invoice_id: verified.invoiceId,
  });
  if (lookupError) return reply({ error: "payment_lookup_failed" }, 500);
  const payment = Array.isArray(paymentRows) ? paymentRows[0] : null;
  if (!payment) return reply({ error: "payment_not_found" }, 404);

  const { error: eventError } = await admin.rpc("record_payment_provider_event", {
    p_payment_id: payment.id,
    p_provider_invoice_id: verified.providerInvoiceId,
    p_event: "webhook_received",
    p_details: { provider: "UddoktaPay", provider_status: verified.providerStatus, provider_invoice: verified.providerInvoiceId },
  });
  if (eventError) return reply({ error: "payment_state_save_failed" }, 500);

  if (payment.status === "paid") return reply({ ok: true, duplicate: true });
  if (verified.providerStatus === "pending") return reply({ ok: true, paid: false, pending: true });
  if (!verified.paid) return reply({ ok: true, paid: false, status: verified.providerStatus });
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
  return reply({ ok: true, paymentId: data?.id, invoiceId: data?.invoice_id, providerInvoiceId: verified.providerInvoiceId });
});

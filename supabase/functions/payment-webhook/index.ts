import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { verifyProviderPayment, verifyWebhookAuthenticity } from "../_shared/payment-provider.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const raw = await req.text();
  if (!verifyWebhookAuthenticity(req, raw)) return reply({ error: "invalid_webhook_signature" }, 401);

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return reply({ error: "invalid_json" }, 400); }

  // The real provider docs must define how to extract the provider reference.
  const providerReference = typeof payload.reference === "string" ? payload.reference : null;
  if (!providerReference) return reply({ error: "provider_reference_mapping_required" }, 400);

  let verified;
  try { verified = await verifyProviderPayment(providerReference); }
  catch (error) {
    const message = error instanceof Error ? error.message : "verification_failed";
    return reply({ error: message }, message === "provider_adapter_required" ? 503 : 502);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: payment } = await admin.from("payments").select("id,invoice_id,amount,currency,status").eq("invoice_id", verified.invoiceId).maybeSingle();
  if (!payment) return reply({ error: "payment_not_found" }, 404);

  await admin.from("payment_audit_logs").insert({ payment_id: payment.id, invoice_id: payment.invoice_id, event: "webhook_received", details: { provider_reference: providerReference } });

  if (payment.status === "paid") return reply({ ok: true, duplicate: true });
  if (!verified.paid) {
    await admin.rpc("mark_payment_failed", { p_payment_id: payment.id, p_event: "failed", p_provider_response: verified.raw });
    return reply({ ok: true, paid: false });
  }
  if (Number(payment.amount) !== Number(verified.amount)) return reply({ error: "amount_mismatch" }, 409);
  if (verified.currency && payment.currency !== verified.currency) return reply({ error: "currency_mismatch" }, 409);

  const { data, error } = await admin.rpc("finalize_verified_payment", {
    p_payment_id: payment.id,
    p_transaction_id: verified.transactionId,
    p_provider_transaction_id: verified.providerTransactionId || null,
    p_payment_method: verified.paymentMethod || null,
    p_provider_response: verified.raw,
  });
  if (error) return reply({ error: error.message }, 500);
  return reply({ ok: true, paymentId: data?.id, invoiceId: data?.invoice_id });
});

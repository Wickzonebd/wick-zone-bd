import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { verifyProviderPayment } from "../_shared/payment-provider.ts";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

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

  let body: { invoiceId?: string };
  try { body = await req.json(); } catch { return reply({ error: "invalid_json" }, 400); }
  const invoiceId = body.invoiceId?.trim();
  if (!invoiceId || invoiceId.length > 80) return reply({ error: "invalid_invoice" }, 400);

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id,user_id,invoice_id,amount,currency,status")
    .eq("invoice_id", invoiceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (paymentError) return reply({ error: "payment_lookup_failed" }, 500);
  if (!payment) return reply({ error: "payment_not_found" }, 404);
  if (payment.status === "paid") return reply({ ok: true, paid: true, status: "paid", invoiceId });
  if (["cancelled", "refunded"].includes(payment.status)) return reply({ ok: true, paid: false, status: payment.status, invoiceId });

  let verified;
  try { verified = await verifyProviderPayment(payment.invoice_id); }
  catch (error) {
    const message = error instanceof Error ? error.message : "provider_verification_failed";
    await admin.from("payment_audit_logs").insert({ payment_id: payment.id, invoice_id: payment.invoice_id, event: "manual_verification_error", details: { message } });
    return reply({ error: message }, message === "provider_adapter_required" ? 503 : 502);
  }

  await admin.from("payment_audit_logs").insert({
    payment_id: payment.id,
    invoice_id: payment.invoice_id,
    event: "manual_verification_checked",
    details: { paid: verified.paid, provider_invoice: verified.invoiceId },
  });

  if (verified.invoiceId !== payment.invoice_id) return reply({ error: "invoice_mismatch" }, 409);
  if (!verified.paid) return reply({ ok: true, paid: false, status: payment.status, invoiceId });
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

  return reply({ ok: true, paid: true, status: "paid", paymentId: data?.id, invoiceId: data?.invoice_id });
});

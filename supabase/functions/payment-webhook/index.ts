import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface VerifiedPayment {
  orderId: string;
  providerReference: string;
  amount: number;
  currency: string;
}

async function verifyProviderWebhook(_request: Request): Promise<VerifiedPayment | null> {
  void _request;
  // Intentionally unimplemented until the real merchant API and signature specification are provided.
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const verified = await verifyProviderWebhook(request);
  if (!verified) {
    return Response.json({ error: "Payment gateway is not configured or the signature is invalid." }, { status: 503 });
  }

  // Future implementation must perform the verified order transition and membership activation
  // in one idempotent database transaction. It must never trust browser-supplied payment status.
  return Response.json({ received: true }, { status: 202 });
});

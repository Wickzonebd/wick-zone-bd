export type ProviderCheckoutInput = {
  invoiceId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  itemName: string;
  successUrl: string;
  failedUrl: string;
  cancelledUrl: string;
  webhookUrl: string;
};

export type ProviderCheckout = {
  checkoutUrl: string;
  providerSessionId?: string | null;
  raw: unknown;
};

export type ProviderVerification = {
  paid: boolean;
  amount: number;
  currency?: string | null;
  invoiceId: string;
  transactionId: string;
  providerTransactionId?: string | null;
  paymentMethod?: string | null;
  raw: unknown;
};

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

export function assertProviderEnvironment() {
  required("PAYMENT_API_KEY");
  required("PAYMENT_BASE_URL");
  required("APP_URL");
}

/**
 * Intentionally not guessing provider endpoints or payloads.
 * Implement this adapter only from the payment provider's official API docs.
 * PAYMENT_API_KEY must remain server-side and must never be returned to clients.
 */
export async function createProviderCheckout(_input: ProviderCheckoutInput): Promise<ProviderCheckout> {
  assertProviderEnvironment();
  throw new Error("provider_adapter_required");
}

/**
 * Must independently query the provider's official verification/status API.
 * Never infer paid state from callback query parameters or browser redirects.
 */
export async function verifyProviderPayment(_transactionOrInvoiceId: string): Promise<ProviderVerification> {
  assertProviderEnvironment();
  throw new Error("provider_adapter_required");
}

/**
 * Provider-specific webhook signature validation AND payload-field mapping belong
 * here. The webhook handler must not guess field names from an undocumented body.
 * After authenticity is established, this adapter must independently verify the
 * transaction against the provider status/verification API before returning.
 */
export async function verifyProviderWebhook(_request: Request, _rawBody: string): Promise<ProviderVerification> {
  assertProviderEnvironment();
  required("PAYMENT_WEBHOOK_SECRET");
  throw new Error("provider_adapter_required");
}

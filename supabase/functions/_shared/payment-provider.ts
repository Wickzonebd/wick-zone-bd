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

export function verifyWebhookAuthenticity(_request: Request, _rawBody: string): boolean {
  const secret = Deno.env.get("PAYMENT_WEBHOOK_SECRET")?.trim();
  if (!secret) return false;
  // Provider-specific signature validation must follow official documentation.
  return false;
}

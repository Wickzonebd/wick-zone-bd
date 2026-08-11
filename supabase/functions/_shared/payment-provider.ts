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
  providerStatus: "completed" | "pending" | "error";
  amount: number;
  currency?: string | null;
  invoiceId: string;
  providerInvoiceId: string;
  transactionId: string;
  providerTransactionId?: string | null;
  paymentMethod?: string | null;
  raw: unknown;
};

type UddoktaPayCheckoutResponse = {
  status?: boolean;
  message?: string;
  payment_url?: string;
};

type UddoktaPayVerificationResponse = {
  full_name?: string;
  email?: string;
  amount?: string | number;
  fee?: string | number;
  charged_amount?: string | number;
  invoice_id?: string;
  metadata?: Record<string, unknown> | null;
  payment_method?: string;
  sender_number?: string;
  transaction_id?: string;
  date?: string;
  status?: string;
  message?: string;
};

function required(name: string) {
  let value = Deno.env.get(name)?.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
  // Normalize harmless formatting artifacts sometimes pasted into a secret
  // value without ever logging or exposing the secret itself.
  if (value) value = value.replace(new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*`, "i"), "").trim();
  if (value && value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === "`" && last === "`")) {
      value = value.slice(1, -1).trim();
    }
  }
  // UddoktaPay keys are normally copied as a single token. Removing accidental
  // whitespace within a 40-character hexadecimal key is safe and prevents a
  // pasted line break from changing the credential sent to the provider.
  if (name === "PAYMENT_API_KEY") {
    const compact = value?.replace(/\s+/g, "") ?? "";
    if (/^[0-9a-f]{40}$/i.test(compact)) value = compact;
  }
  // Accept an accidentally pasted Markdown link while still using only the
  // configured HTTPS origin/path. This never changes a valid plain URL.
  if (name === "PAYMENT_BASE_URL" && value?.startsWith("[")) {
    const match = value.match(/https:\/\/[^\s\])]+/i);
    if (match) value = match[0];
  }
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function apiUrl(path: string) {
  const configured = required("PAYMENT_BASE_URL").replace(/\/+$/, "");
  const root = configured.endsWith("/api") ? configured : `${configured}/api`;
  return `${root}/${path.replace(/^\/+/, "")}`;
}

function providerHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "RT-UDDOKTAPAY-API-KEY": required("PAYMENT_API_KEY"),
  };
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function readJson<T>(response: Response, failureCode: string): Promise<T> {
  const body = await response.text();
  if (response.status === 401 || response.status === 403) throw new Error("provider_auth_failed");
  if (!response.ok) throw new Error(`${failureCode}_http_${response.status}`);
  let data: unknown;
  try { data = JSON.parse(body); }
  catch { throw new Error(`${failureCode}_invalid_json`); }
  return data as T;
}

function normalizeProviderStatus(value: unknown): ProviderVerification["providerStatus"] {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "COMPLETED") return "completed";
  if (status === "PENDING") return "pending";
  if (status === "ERROR") return "error";
  throw new Error("provider_invalid_status");
}

function taskoraInvoiceFromMetadata(metadata: UddoktaPayVerificationResponse["metadata"]) {
  const value = metadata && typeof metadata === "object" ? metadata.taskora_invoice_id : null;
  if (typeof value !== "string" || !value.trim()) throw new Error("provider_metadata_missing_taskora_invoice");
  return value.trim();
}

export function assertProviderEnvironment() {
  required("PAYMENT_API_KEY");
  required("PAYMENT_BASE_URL");
  required("APP_URL");
}

/** UddoktaPay Create Charge V2. Secrets stay server-side. */
export async function createProviderCheckout(input: ProviderCheckoutInput): Promise<ProviderCheckout> {
  assertProviderEnvironment();
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("provider_invalid_amount");

  let response: Response;
  try {
    response = await fetch(apiUrl("checkout-v2"), {
      method: "POST",
      headers: providerHeaders(),
      body: JSON.stringify({
        full_name: input.customerName,
        email: input.customerEmail,
        amount: amount.toFixed(2),
        metadata: {
          taskora_invoice_id: input.invoiceId,
          item_name: input.itemName,
          currency: input.currency,
        },
        redirect_url: input.successUrl,
        return_type: "GET",
        cancel_url: input.cancelledUrl,
        webhook_url: input.webhookUrl,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("provider_timeout");
    throw new Error("provider_connection_failed");
  }

  const data = await readJson<UddoktaPayCheckoutResponse>(response, "provider_checkout_failed");
  if (data.status !== true || typeof data.payment_url !== "string" || !data.payment_url.trim()) {
    throw new Error("provider_checkout_rejected");
  }

  let checkoutUrl: URL;
  try { checkoutUrl = new URL(data.payment_url); }
  catch { throw new Error("provider_invalid_checkout_url"); }
  if (checkoutUrl.protocol !== "https:") throw new Error("provider_insecure_checkout_url");

  return { checkoutUrl: checkoutUrl.toString(), providerSessionId: null, raw: data };
}

/** Independently verifies a UddoktaPay-generated provider invoice ID. */
export async function verifyProviderPayment(providerInvoiceId: string): Promise<ProviderVerification> {
  assertProviderEnvironment();
  const providerInvoice = providerInvoiceId.trim();
  if (!providerInvoice || providerInvoice.length > 160) throw new Error("provider_invalid_invoice");

  let response: Response;
  try {
    response = await fetch(apiUrl("verify-payment"), {
      method: "POST",
      headers: providerHeaders(),
      body: JSON.stringify({ invoice_id: providerInvoice }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("provider_timeout");
    throw new Error("provider_connection_failed");
  }

  const data = await readJson<UddoktaPayVerificationResponse>(response, "provider_verify_failed");
  const providerStatus = normalizeProviderStatus(data.status);
  const returnedProviderInvoice = typeof data.invoice_id === "string" ? data.invoice_id.trim() : "";
  if (!returnedProviderInvoice || returnedProviderInvoice !== providerInvoice) throw new Error("provider_invoice_mismatch");

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("provider_invalid_verified_amount");
  const taskoraInvoice = taskoraInvoiceFromMetadata(data.metadata);
  const transactionId = typeof data.transaction_id === "string" ? data.transaction_id.trim() : "";

  return {
    paid: providerStatus === "completed",
    providerStatus,
    amount,
    currency: null,
    invoiceId: taskoraInvoice,
    providerInvoiceId: returnedProviderInvoice,
    transactionId,
    providerTransactionId: transactionId || null,
    paymentMethod: typeof data.payment_method === "string" ? data.payment_method.trim() || null : null,
    raw: data,
  };
}

/**
 * UddoktaPay authenticates webhook delivery with RT-UDDOKTAPAY-API-KEY.
 * The webhook payload is never trusted as payment proof: its provider invoice is
 * independently re-verified through /api/verify-payment before returning.
 */
export async function verifyProviderWebhook(request: Request, rawBody: string): Promise<ProviderVerification> {
  assertProviderEnvironment();
  const headerKey = request.headers.get("RT-UDDOKTAPAY-API-KEY")?.trim() ?? "";
  if (!headerKey || !safeEqual(headerKey, required("PAYMENT_API_KEY"))) throw new Error("invalid_webhook_auth");

  let payload: UddoktaPayVerificationResponse;
  try { payload = JSON.parse(rawBody) as UddoktaPayVerificationResponse; }
  catch { throw new Error("invalid_webhook_json"); }
  const providerInvoiceId = typeof payload.invoice_id === "string" ? payload.invoice_id.trim() : "";
  if (!providerInvoiceId) throw new Error("missing_webhook_invoice");

  const verified = await verifyProviderPayment(providerInvoiceId);
  const webhookTaskoraInvoice = payload.metadata && typeof payload.metadata === "object" && typeof payload.metadata.taskora_invoice_id === "string"
    ? payload.metadata.taskora_invoice_id.trim()
    : null;
  if (webhookTaskoraInvoice && webhookTaskoraInvoice !== verified.invoiceId) throw new Error("webhook_metadata_mismatch");
  return verified;
}

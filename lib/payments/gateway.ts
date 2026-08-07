export interface PaymentOrderRequest {
  orderId: string;
  amount: number;
  currency: string;
  customerId: string;
  returnUrl: string;
}

export interface PaymentOrderResult {
  status: "not_configured" | "created";
  checkoutUrl?: string;
  providerReference?: string;
}

export interface VerifiedPaymentEvent {
  orderId: string;
  providerReference: string;
  amount: number;
  currency: string;
}

export interface PaymentGateway {
  createOrder(request: PaymentOrderRequest): Promise<PaymentOrderResult>;
  verifyWebhook(request: Request): Promise<VerifiedPaymentEvent | null>;
}

export class NotConfiguredPaymentGateway implements PaymentGateway {
  async createOrder(): Promise<PaymentOrderResult> {
    return { status: "not_configured" };
  }

  async verifyWebhook(): Promise<VerifiedPaymentEvent | null> {
    return null;
  }
}

export function getPaymentGateway(): PaymentGateway {
  return new NotConfiguredPaymentGateway();
}

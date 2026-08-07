import { NextResponse } from "next/server";
import { getPaymentGateway } from "@/lib/payments/gateway";

export async function POST() {
  const gateway = getPaymentGateway();
  const result = await gateway.createOrder({
    orderId: crypto.randomUUID(),
    amount: 0,
    currency: "BDT",
    customerId: "unresolved",
    returnUrl: "/dashboard",
  });

  if (result.status === "not_configured") {
    return NextResponse.json(
      { error: "Payment gateway is not configured. No transaction has been created." },
      { status: 503 },
    );
  }
  return NextResponse.json(result);
}

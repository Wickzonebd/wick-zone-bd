import { Suspense } from "react";
import { PaymentCheckoutClient } from "@/components/payment-system";
import { ResellingPaymentCheckoutClient } from "@/components/reselling-payment-checkout";

export default async function PaymentCheckoutPage({ searchParams }: { searchParams: Promise<{ type?: string; itemId?: string }> }) {
  const params = await searchParams;
  return <Suspense>{params.type === "reselling" ? <ResellingPaymentCheckoutClient orderId={params.itemId || ""} /> : <PaymentCheckoutClient />}</Suspense>;
}

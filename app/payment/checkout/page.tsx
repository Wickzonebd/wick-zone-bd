import { Suspense } from "react";
import { PaymentCheckoutClient } from "@/components/payment-system";

export default function PaymentCheckoutPage() {
  return <Suspense><PaymentCheckoutClient /></Suspense>;
}

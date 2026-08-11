import { Suspense } from "react";
import { PaymentOutcomeClient } from "@/components/payment-outcome";
export default function PaymentCancelledPage() { return <Suspense><PaymentOutcomeClient mode="cancelled" /></Suspense>; }

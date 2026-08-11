import { Suspense } from "react";
import { PaymentOutcomeClient } from "@/components/payment-outcome";
export default function PaymentFailedPage() { return <Suspense><PaymentOutcomeClient mode="failed" /></Suspense>; }

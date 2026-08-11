import { Suspense } from "react";
import { PaymentOutcomeClient } from "@/components/payment-outcome";
export default function PaymentSuccessPage() { return <Suspense><PaymentOutcomeClient mode="success" /></Suspense>; }

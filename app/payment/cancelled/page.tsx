import { Suspense } from "react";
import { PaymentResultClient } from "@/components/payment-system";
export default function PaymentCancelledPage() { return <Suspense><PaymentResultClient mode="cancelled" /></Suspense>; }

import { Suspense } from "react";
import { PaymentResultClient } from "@/components/payment-system";
export default function PaymentFailedPage() { return <Suspense><PaymentResultClient mode="failed" /></Suspense>; }

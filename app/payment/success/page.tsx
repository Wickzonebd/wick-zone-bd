import { Suspense } from "react";
import { PaymentResultClient } from "@/components/payment-system";
export default function PaymentSuccessPage() { return <Suspense><PaymentResultClient mode="success" /></Suspense>; }

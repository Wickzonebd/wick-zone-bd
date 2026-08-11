import { AdminPaymentDetailClient } from "@/components/admin-payment-detail-client";

export default async function AdminPaymentDetailPage({params}:{params:Promise<{paymentId:string}>}){
  const {paymentId}=await params;
  return <AdminPaymentDetailClient paymentId={paymentId}/>;
}

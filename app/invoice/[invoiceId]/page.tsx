import { InvoiceClient } from "@/components/payment-system";

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceClient invoiceNumber={decodeURIComponent(invoiceId)} />;
}

import { ProfileClient } from "@/components/profile-client";
import { ProfilePaymentActions } from "@/components/profile-payment-actions";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const params = await searchParams;
  return <><ProfileClient requestedUserId={params.user} />{!params.user && <ProfilePaymentActions />}</>;
}

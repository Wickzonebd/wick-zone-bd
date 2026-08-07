import { ProfileClient } from "@/components/profile-client";
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ user?: string }> }) { const params = await searchParams; return <ProfileClient requestedUserId={params.user} />; }

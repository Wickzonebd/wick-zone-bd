import type { Metadata } from "next";
import { AdminClient } from "@/components/admin-client";

export const metadata: Metadata = {
  title: "Admin Login | Taskora",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminClient />;
}

"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

export function AdminPaymentShortcut() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return <Link href="/admin/payments" className="primary-button" style={{ position: "fixed", right: 18, bottom: 22, zIndex: 40, textDecoration: "none", boxShadow: "0 12px 32px rgba(0,0,0,.16)" }}><CreditCard size={18} />Payments</Link>;
}

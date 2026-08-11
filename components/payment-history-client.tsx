"use client";

import Link from "next/link";
import { CreditCard, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Payment = { id:string; invoice_id:string; transaction_id:string|null; amount:number|string; currency:string; payment_method:string|null; status:string; item_name:string; created_at:string; };

export function PaymentHistoryClient(){
  const { language }=useI18n();
  const [rows,setRows]=useState<Payment[]>([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{ const load=async()=>{ const supabase=getSupabaseBrowserClient(); if(!supabase){setLoading(false);return;} const {data}=await supabase.from("payments").select("id,invoice_id,transaction_id,amount,currency,payment_method,status,item_name,created_at").order("created_at",{ascending:false}).limit(100); setRows((data as Payment[])??[]); setLoading(false);}; void load();},[]);
  return <AppShell><main className="payment-page"><div className="payment-container"><section className="payment-history-head"><div><span>{language==="bn"?"প্রোফাইল":"PROFILE"}</span><h1>{language==="bn"?"পেমেন্ট হিস্ট্রি":"Payment History"}</h1><p>{language==="bn"?"আপনার নিজের পেমেন্ট ও ইনভয়েসগুলো এখানে দেখা যাবে।":"Your payment and invoice history is available here."}</p></div><CreditCard size={32}/></section>{loading?<div className="payment-loading">Loading…</div>:rows.length?<div className="payment-history-list">{rows.map(p=><article className="payment-history-card" key={p.id}><div><strong>{p.item_name}</strong><span>{new Date(p.created_at).toLocaleString(language==="bn"?"bn-BD":"en")}</span></div><div className="payment-history-amount"><strong>{formatMoney(Number(p.amount),p.currency,language)}</strong><span className={`status ${p.status==="paid"?"active":"pending"}`}>{p.status}</span></div><dl><div><dt>Invoice ID</dt><dd>{p.invoice_id}</dd></div><div><dt>Transaction ID</dt><dd>{p.transaction_id||"—"}</dd></div><div><dt>{language==="bn"?"মেথড":"Method"}</dt><dd>{p.payment_method||"—"}</dd></div></dl><Link className="secondary-button" href={`/invoice/${encodeURIComponent(p.invoice_id)}`}><ReceiptText size={17}/>{language==="bn"?"ইনভয়েস দেখুন":"View Invoice"}</Link></article>)}</div>:<div className="payment-result-card"><CreditCard size={36}/><h1>{language==="bn"?"এখনও কোনো পেমেন্ট নেই":"No payments yet"}</h1></div>}</div></main></AppShell>;
}

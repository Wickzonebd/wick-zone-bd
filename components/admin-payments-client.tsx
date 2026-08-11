"use client";

import Link from "next/link";
import { CalendarDays, CreditCard, Eye, ReceiptText, Search, Settings, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Payment={id:string;user_id:string;invoice_id:string;transaction_id:string|null;amount:number|string;currency:string;payment_method:string|null;status:string;payment_type:string;item_name:string;customer_name:string|null;customer_email:string|null;created_at:string;paid_at:string|null};
type SettingsRow={payment_enabled:boolean;provider_name:string|null;currency:string;merchant_name:string;merchant_logo:string|null;support_phone:string|null;support_email:string|null;payment_success_message:string;payment_failed_message:string;invoice_footer:string|null;terms_text:string|null;micro_job_activation_price:number|string|null;verification_price:number|string|null;verification_enabled:boolean;verification_duration_days:number|null;manual_payment_enabled:boolean;bkash_enabled:boolean;bkash_number:string|null;bkash_account_type:string;nagad_enabled:boolean;nagad_number:string|null;nagad_account_type:string;rocket_enabled:boolean;rocket_number:string|null;rocket_account_type:string};

const dayKey=(value:string)=>new Date(value).toISOString().slice(0,10);

export function AdminPaymentsClient(){
  const {isAdmin,loading:authLoading}=useAuth();
  const [rows,setRows]=useState<Payment[]>([]); const [settings,setSettings]=useState<SettingsRow|null>(null);
  const [query,setQuery]=useState(""); const [status,setStatus]=useState("all"); const [type,setType]=useState("all");
  const [dateFrom,setDateFrom]=useState(""); const [dateTo,setDateTo]=useState("");
  const [loading,setLoading]=useState(true); const [message,setMessage]=useState<string|null>(null);

  const load=useCallback(async()=>{if(!isAdmin){setLoading(false);return;}const supabase=getSupabaseBrowserClient();if(!supabase){setLoading(false);return;}setLoading(true);const [p,s]=await Promise.all([
    supabase.from("payments").select("id,user_id,invoice_id,transaction_id,amount,currency,payment_method,status,payment_type,item_name,customer_name,customer_email,created_at,paid_at").order("created_at",{ascending:false}).limit(500),
    supabase.from("payment_settings").select("payment_enabled,provider_name,currency,merchant_name,merchant_logo,support_phone,support_email,payment_success_message,payment_failed_message,invoice_footer,terms_text,micro_job_activation_price,verification_price,verification_enabled,verification_duration_days,manual_payment_enabled,bkash_enabled,bkash_number,bkash_account_type,nagad_enabled,nagad_number,nagad_account_type,rocket_enabled,rocket_number,rocket_account_type").eq("id",true).maybeSingle()
  ]);setRows((p.data as Payment[])??[]);setSettings((s.data as SettingsRow|null)??null);setLoading(false);},[isAdmin]);
  useEffect(()=>{void load();},[load]);

  const filtered=useMemo(()=>rows.filter(r=>{const n=query.trim().toLowerCase();const d=dayKey(r.paid_at||r.created_at);return(status==="all"||r.status===status)&&(type==="all"||r.payment_type===type)&&(!dateFrom||d>=dateFrom)&&(!dateTo||d<=dateTo)&&(!n||[r.customer_name,r.customer_email,r.invoice_id,r.transaction_id,r.item_name].filter(Boolean).join(" ").toLowerCase().includes(n));}),[rows,query,status,type,dateFrom,dateTo]);
  const totals=useMemo(()=>{const now=new Date();const month=now.getFullYear()*12+now.getMonth();const paid=rows.filter(r=>r.status==="paid");return{revenue:paid.reduce((n,r)=>n+Number(r.amount),0),paid:paid.length,pending:rows.filter(r=>["pending","processing"].includes(r.status)).length,failed:rows.filter(r=>r.status==="failed").length,today:paid.filter(r=>new Date(r.paid_at||r.created_at).toDateString()===now.toDateString()).reduce((n,r)=>n+Number(r.amount),0),month:paid.filter(r=>{const d=new Date(r.paid_at||r.created_at);return d.getFullYear()*12+d.getMonth()===month;}).reduce((n,r)=>n+Number(r.amount),0)};},[rows]);

  const save=async(e:FormEvent)=>{
    e.preventDefault();
    if(!settings)return;
    const microJobPrice=Number(settings.micro_job_activation_price);
    const verificationPrice=Number(settings.verification_price);
    if(settings.payment_enabled&&(!Number.isFinite(microJobPrice)||microJobPrice<=0)){setMessage("Enter a valid Micro Jobs access price before enabling payments.");return;}
    if(settings.payment_enabled&&settings.verification_enabled&&(!Number.isFinite(verificationPrice)||verificationPrice<=0)){setMessage("Enter a valid Social Verification Badge price before enabling payments.");return;}
    const validMobile=(value:string|null)=>/^01[3-9]\d{8}$/.test((value||"").replace(/\D/g,""));
    const enabledManualMethods=[settings.bkash_enabled,settings.nagad_enabled,settings.rocket_enabled].filter(Boolean).length;
    if(settings.payment_enabled&&settings.manual_payment_enabled&&!enabledManualMethods){setMessage("Enable and configure at least one mobile banking method.");return;}
    if(settings.bkash_enabled&&!validMobile(settings.bkash_number)){setMessage("Enter a valid 11-digit bKash receiving number.");return;}
    if(settings.nagad_enabled&&!validMobile(settings.nagad_number)){setMessage("Enter a valid 11-digit Nagad receiving number.");return;}
    if(settings.rocket_enabled&&!validMobile(settings.rocket_number)){setMessage("Enter a valid 11-digit Rocket receiving number.");return;}
    const supabase=getSupabaseBrowserClient();
    if(!supabase)return;
    const {error}=await supabase.from("payment_settings").update({...settings,micro_job_activation_price:settings.micro_job_activation_price==null?null:microJobPrice,verification_price:settings.verification_price==null?null:verificationPrice,verification_duration_days:settings.verification_duration_days==null?null:Number(settings.verification_duration_days),updated_at:new Date().toISOString()}).eq("id",true);
    setMessage(error?error.message:"Payment settings saved.");
    if(!error)await load();
  };

  if(authLoading||loading)return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-loading">Loading payments…</div></main></AppShell>;
  if(!isAdmin)return <AppShell><main className="payment-page"><div className="payment-result-card"><ShieldCheck size={38}/><h1>Administrator access required</h1></div></main></AppShell>;
  const currency=settings?.currency||rows[0]?.currency||"BDT";

  return <AppShell hidePrimaryNav><main className="payment-page"><div className="payment-admin-container">
    <section className="payment-history-head"><div><span>ADMIN · PAYMENTS</span><h1>Payment Control Center</h1><p>Transactions, revenue, provider status and customer pricing.</p></div><CreditCard size={34}/></section>
    <div className="payment-admin-stats"><div><span>Total Revenue</span><strong>{formatMoney(totals.revenue,currency,"en")}</strong></div><div><span>Successful</span><strong>{totals.paid}</strong></div><div><span>Pending</span><strong>{totals.pending}</strong></div><div><span>Failed</span><strong>{totals.failed}</strong></div><div><span>Today</span><strong>{formatMoney(totals.today,currency,"en")}</strong></div><div><span>This Month</span><strong>{formatMoney(totals.month,currency,"en")}</strong></div></div>
    {settings&&<form id="payment-settings" className="payment-admin-panel payment-settings-form" onSubmit={save}>
      <div className="payment-settings-title"><Settings size={20}/><div><h2>Service Pricing & Payment Settings</h2><p>Set prices, mobile banking receiving numbers and payment availability. Provider secrets always remain server-side.</p></div></div>
      <div className="payment-api-status"><CreditCard size={18}/><strong>Customer checkout · bKash, Nagad and Rocket can be managed here without changing code.</strong></div>
      <div className="payment-settings-grid">
        <label><span>Payments</span><select value={settings.payment_enabled?"enabled":"disabled"} onChange={e=>setSettings({...settings,payment_enabled:e.target.value==="enabled"})}><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></label>
        <label><span>Automatic provider</span><input value={settings.provider_name||""} onChange={e=>setSettings({...settings,provider_name:e.target.value||null})}/></label>
        <label><span>Merchant name</span><input value={settings.merchant_name} onChange={e=>setSettings({...settings,merchant_name:e.target.value})}/></label>
        <label><span>Currency</span><input value={settings.currency} onChange={e=>setSettings({...settings,currency:e.target.value.toUpperCase()})}/></label>
        <label><span>Micro Jobs access price ({currency})</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={settings.micro_job_activation_price??""} onChange={e=>setSettings({...settings,micro_job_activation_price:e.target.value})}/></label>
        <label><span>Social Verification Badge price ({currency})</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={settings.verification_price??""} onChange={e=>setSettings({...settings,verification_price:e.target.value})}/></label>
        <label><span>Social verification badge</span><select value={settings.verification_enabled?"enabled":"disabled"} onChange={e=>setSettings({...settings,verification_enabled:e.target.value==="enabled"})}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
        <label><span>Manual mobile banking</span><select value={settings.manual_payment_enabled?"enabled":"disabled"} onChange={e=>setSettings({...settings,manual_payment_enabled:e.target.value==="enabled"})}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>

        <div className="payment-method-settings wide">
          <div className="payment-method-setting bkash"><label className="method-toggle"><input type="checkbox" checked={settings.bkash_enabled} onChange={e=>setSettings({...settings,bkash_enabled:e.target.checked})}/><span>bKash</span></label><label><span>Receiving number</span><input inputMode="numeric" placeholder="01XXXXXXXXX" value={settings.bkash_number||""} onChange={e=>setSettings({...settings,bkash_number:e.target.value||null})}/></label><label><span>Account type</span><select value={settings.bkash_account_type} onChange={e=>setSettings({...settings,bkash_account_type:e.target.value})}><option>Personal</option><option>Merchant</option><option>Agent</option></select></label></div>
          <div className="payment-method-setting nagad"><label className="method-toggle"><input type="checkbox" checked={settings.nagad_enabled} onChange={e=>setSettings({...settings,nagad_enabled:e.target.checked})}/><span>Nagad</span></label><label><span>Receiving number</span><input inputMode="numeric" placeholder="01XXXXXXXXX" value={settings.nagad_number||""} onChange={e=>setSettings({...settings,nagad_number:e.target.value||null})}/></label><label><span>Account type</span><select value={settings.nagad_account_type} onChange={e=>setSettings({...settings,nagad_account_type:e.target.value})}><option>Personal</option><option>Merchant</option><option>Agent</option></select></label></div>
          <div className="payment-method-setting rocket"><label className="method-toggle"><input type="checkbox" checked={settings.rocket_enabled} onChange={e=>setSettings({...settings,rocket_enabled:e.target.checked})}/><span>Rocket</span></label><label><span>Receiving number</span><input inputMode="numeric" placeholder="01XXXXXXXXX" value={settings.rocket_number||""} onChange={e=>setSettings({...settings,rocket_number:e.target.value||null})}/></label><label><span>Account type</span><select value={settings.rocket_account_type} onChange={e=>setSettings({...settings,rocket_account_type:e.target.value})}><option>Personal</option><option>Merchant</option><option>Agent</option></select></label></div>
        </div>

        <label><span>Support email</span><input value={settings.support_email||""} onChange={e=>setSettings({...settings,support_email:e.target.value||null})}/></label>
        <label><span>Support phone</span><input value={settings.support_phone||""} onChange={e=>setSettings({...settings,support_phone:e.target.value||null})}/></label>
        <label className="wide"><span>Success message</span><textarea value={settings.payment_success_message} onChange={e=>setSettings({...settings,payment_success_message:e.target.value})}/></label>
        <label className="wide"><span>Failed message</span><textarea value={settings.payment_failed_message} onChange={e=>setSettings({...settings,payment_failed_message:e.target.value})}/></label>
        <label className="wide"><span>Invoice footer</span><textarea value={settings.invoice_footer||""} onChange={e=>setSettings({...settings,invoice_footer:e.target.value||null})}/></label>
        <label className="wide"><span>Terms</span><textarea value={settings.terms_text||""} onChange={e=>setSettings({...settings,terms_text:e.target.value||null})}/></label>
      </div>
      <div className="payment-api-status"><ShieldCheck size={18}/><strong>Automatic API: {settings.provider_name?"Configured · secret hidden":"Not configured"} · Manual methods: {[settings.bkash_enabled&&"bKash",settings.nagad_enabled&&"Nagad",settings.rocket_enabled&&"Rocket"].filter(Boolean).join(", ")||"None enabled"}</strong></div>
      {message&&<div className="form-message">{message}</div>}<button className="primary-button">Save Prices & Payment Settings</button>
    </form>}
    <section className="payment-admin-panel"><div className="payment-admin-toolbar"><label><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="User, invoice, transaction…"/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option>paid</option><option>pending</option><option>processing</option><option>failed</option><option>cancelled</option><option>refunded</option></select><select value={type} onChange={e=>setType(e.target.value)}><option value="all">All types</option><option value="micro_jobs">Micro Jobs</option><option value="verification">Verification</option><option value="reselling">Reselling</option></select><label><CalendarDays size={16}/><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} aria-label="From date"/></label><label><CalendarDays size={16}/><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} aria-label="To date"/></label>{(query||status!=="all"||type!=="all"||dateFrom||dateTo)&&<button type="button" className="secondary-button" onClick={()=>{setQuery("");setStatus("all");setType("all");setDateFrom("");setDateTo("");}}>Clear</button>}</div><div className="payment-admin-list">{filtered.map(r=><article key={r.id}><div><strong>{r.customer_name||r.customer_email||"Member"}</strong><span>{r.item_name} · {r.payment_type}</span></div><div><strong>{formatMoney(Number(r.amount),r.currency,"en")}</strong><span className={`status ${r.status==="paid"?"active":"pending"}`}>{r.status}</span></div><div><small>{r.invoice_id}</small><small>{r.transaction_id||"No transaction ID"}</small></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href={`/admin/payments/${encodeURIComponent(r.id)}`} className="primary-button"><Eye size={16}/>Details</Link><Link href={`/invoice/${encodeURIComponent(r.invoice_id)}`} className="secondary-button"><ReceiptText size={16}/>Invoice</Link></div></article>)}</div></section>

  </div></main></AppShell>;
}

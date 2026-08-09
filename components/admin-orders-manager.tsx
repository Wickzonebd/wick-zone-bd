"use client";

import {
  BadgePercent,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Star,
  TicketPercent,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type StoreSection = "orders" | "coupons" | "inventory" | "reviews";
type OrderStatus = "pending" | "confirmed" | "processing" | "completed" | "cancelled";

interface StoreStats { orders: number; pending: number; processing: number; completed: number; revenue: number | string; low_stock: number; active_coupons: number; reviews: number; }
interface OrderItem { id: string; product_name: string; image_url: string | null; quantity: number; unit_price: number | string; line_total: number | string; }
interface StoreOrder {
  id: string; order_code: string; user_id: string; status: OrderStatus; subtotal: number | string; discount: number | string; total: number | string;
  coupon_code: string | null; contact_name: string; contact_mobile: string; delivery_address: string; customer_note: string | null; admin_note: string | null;
  payment_status: string; created_at: string; customer?: { full_name: string; avatar_url: string | null } | null; items?: OrderItem[];
}
interface Coupon { id: string; code: string; discount_type: "percent" | "fixed"; discount_value: number | string; minimum_order: number | string; maximum_discount: number | string | null; usage_limit: number | null; used_count: number; expires_at: string | null; is_active: boolean; created_at: string; }
interface InventoryProduct { id: string; name_en: string; image_url: string | null; stock_count: number | null; price: number | string; is_active: boolean; is_featured: boolean; }
interface StoreReview { id: string; product_id: string; user_id: string; rating: number; body: string | null; is_hidden: boolean; created_at: string; product?: { name_en: string } | null; reviewer?: { full_name: string } | null; }

const EMPTY_COUPON = { code: "", discountType: "percent" as "percent" | "fixed", value: "", minimum: "0", maximum: "", usageLimit: "", expiresAt: "" };

export function AdminOrdersManager({ currency }: { currency: string }) {
  const [section, setSection] = useState<StoreSection>("orders");
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [couponDraft, setCouponDraft] = useState(() => ({ ...EMPTY_COUPON }));
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [statsResult, orderResult, couponResult, inventoryResult, reviewResult] = await Promise.all([
      supabase.rpc("admin_store_dashboard"),
      supabase.from("reselling_orders").select("id,order_code,user_id,status,subtotal,discount,total,coupon_code,contact_name,contact_mobile,delivery_address,customer_note,admin_note,payment_status,created_at,customer:profiles!reselling_orders_user_id_fkey(full_name,avatar_url),items:reselling_order_items(id,product_name,image_url,quantity,unit_price,line_total)").order("created_at", { ascending: false }).limit(150),
      supabase.from("reselling_coupons").select("id,code,discount_type,discount_value,minimum_order,maximum_discount,usage_limit,used_count,expires_at,is_active,created_at").order("created_at", { ascending: false }),
      supabase.from("reselling_products").select("id,name_en,image_url,stock_count,price,is_active,is_featured").order("stock_count", { ascending: true, nullsFirst: false }).limit(200),
      supabase.from("reselling_reviews").select("id,product_id,user_id,rating,body,is_hidden,created_at,product:reselling_products!reselling_reviews_product_id_fkey(name_en),reviewer:profiles!reselling_reviews_user_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = [statsResult, orderResult, couponResult, inventoryResult, reviewResult].find((result) => result.error)?.error;
    if (firstError) setNotice({ type: "error", text: firstError.message });
    setStats((statsResult.data as StoreStats | null) ?? null);
    setOrders((orderResult.data as unknown as StoreOrder[]) ?? []);
    setCoupons((couponResult.data as Coupon[]) ?? []);
    setInventory((inventoryResult.data as InventoryProduct[]) ?? []);
    setReviews((reviewResult.data as unknown as StoreReview[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateOrder = async (item: StoreOrder, next: Exclude<OrderStatus,"pending">) => {
    const note = window.prompt(`Admin note for ${item.order_code} (${next}):`, next === "completed" ? "Order completed successfully." : "") ?? "";
    if (!window.confirm(`Change ${item.order_code} from ${item.status} to ${next}? The customer will receive an Inbox message.`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.rpc("admin_update_reselling_order", { p_order_id: item.id, p_status: next, p_note: note.trim() || null });
    setNotice(error ? { type: "error", text: error.message } : { type: "success", text: `${item.order_code} updated to ${next}; customer Inbox notified.` });
    if (!error) await load();
  };

  const createCoupon = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(couponDraft.value); const minimum = Number(couponDraft.minimum || 0); const maximum = couponDraft.maximum ? Number(couponDraft.maximum) : null; const usageLimit = couponDraft.usageLimit ? Number(couponDraft.usageLimit) : null;
    if (!couponDraft.code.trim() || !Number.isFinite(value) || value <= 0 || (couponDraft.discountType === "percent" && value > 100)) { setNotice({ type: "error", text: "Enter a valid coupon code and discount." }); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from("reselling_coupons").insert({
      code: couponDraft.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,""), discount_type: couponDraft.discountType, discount_value: value,
      minimum_order: minimum, maximum_discount: maximum, usage_limit: usageLimit, expires_at: couponDraft.expiresAt ? new Date(couponDraft.expiresAt).toISOString() : null,
    });
    setNotice(error ? { type: "error", text: error.message } : { type: "success", text: "Coupon created and ready for checkout." });
    if (!error) { setCouponDraft({ ...EMPTY_COUPON }); await load(); }
  };

  const toggleCoupon = async (item: Coupon) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from("reselling_coupons").update({ is_active: !item.is_active }).eq("id", item.id);
    setNotice(error ? { type: "error", text: error.message } : { type: "success", text: item.is_active ? "Coupon paused." : "Coupon activated." });
    if (!error) await load();
  };

  const deleteCoupon = async (item: Coupon) => {
    if (!window.confirm(`Delete coupon ${item.code}? Existing orders keep their coupon snapshot.`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from("reselling_coupons").delete().eq("id", item.id);
    setNotice(error ? { type: "error", text: error.message } : { type: "success", text: "Coupon deleted." });
    if (!error) await load();
  };

  const setReviewVisibility = async (item: StoreReview) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { error } = await supabase.from("reselling_reviews").update({ is_hidden: !item.is_hidden }).eq("id", item.id);
    setNotice(error ? { type: "error", text: error.message } : { type: "success", text: item.is_hidden ? "Review is visible again." : "Review hidden from customers." });
    if (!error) await load();
  };

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((item) => (status === "all" || item.status === status) && (!needle || `${item.order_code} ${item.contact_name} ${item.contact_mobile} ${item.customer?.full_name ?? ""}`.toLowerCase().includes(needle)));
  }, [orders, status, query]);
  const lowStock = useMemo(() => inventory.filter((item) => item.stock_count != null && item.stock_count <= 5), [inventory]);

  const sections: Array<{ id: StoreSection; label: string; icon: typeof ShoppingCart; count: number }> = [
    { id: "orders", label: "Orders", icon: ShoppingCart, count: orders.length },
    { id: "coupons", label: "Coupons", icon: TicketPercent, count: coupons.length },
    { id: "inventory", label: "Low stock", icon: PackageOpen, count: lowStock.length },
    { id: "reviews", label: "Reviews", icon: Star, count: reviews.length },
  ];

  return <section className="admin-section admin-orders-manager">
    <div className="admin-section-head"><div><span className="admin-kicker">STORE OPERATIONS</span><h2>Orders, coupons & customer reviews</h2><p>Confirm and track orders, notify customers, create discount codes, watch low stock and moderate verified-buyer reviews.</p></div><button type="button" className="secondary-button compact" onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div>
    <div className="admin-store-stats">
      <div><span><ShoppingCart size={18} /></span><strong>{Number(stats?.orders ?? 0)}</strong><small>Total orders</small></div>
      <div><span><Clock3 size={18} /></span><strong>{Number(stats?.pending ?? 0)}</strong><small>Waiting</small></div>
      <div><span><Truck size={18} /></span><strong>{Number(stats?.processing ?? 0)}</strong><small>In progress</small></div>
      <div><span><CircleDollarSign size={18} /></span><strong>{formatMoney(Number(stats?.revenue ?? 0),currency,"en")}</strong><small>Completed revenue</small></div>
    </div>
    {notice && <div className={`form-message ${notice.type} admin-inbox-notice`}>{notice.text}<button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    <div className="admin-reselling-tabs admin-store-tabs">{sections.map(({ id,label,icon:Icon,count }) => <button type="button" className={section === id ? "active" : ""} onClick={() => setSection(id)} key={id}><Icon size={17} /><span>{label}</span><small>{count}</small></button>)}</div>

    {section === "orders" && <div className="admin-store-orders">
      <div className="admin-store-order-filters"><div className="input-wrap"><Search size={18} /><input className="input with-icon" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, name or phone" /></div><select className="select" value={status} onChange={(event) => setStatus(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
      {loading ? <div className="card admin-service-empty">Loading orders…</div> : visibleOrders.length ? <div className="admin-store-order-list">{visibleOrders.map((item) => <article className="card admin-store-order" key={item.id}><div className="admin-store-order-head"><div><span>{item.order_code}</span><h3>{item.customer?.full_name || item.contact_name}</h3><small>{new Date(item.created_at).toLocaleString()}</small></div><span className={`status ${item.status}`}>{item.status}</span></div><div className="admin-store-order-contact"><span>{item.contact_mobile}</span><span>{item.delivery_address}</span>{item.customer_note && <em>Customer: {item.customer_note}</em>}</div><div className="admin-store-order-items">{(item.items ?? []).map((line) => <div key={line.id}>{line.image_url ? <img src={line.image_url} alt="" /> : <span><PackageOpen size={18} /></span>}<div><strong>{line.product_name}</strong><small>{line.quantity} × {formatMoney(Number(line.unit_price),currency,"en")}</small></div><b>{formatMoney(Number(line.line_total),currency,"en")}</b></div>)}</div><div className="admin-store-order-total"><span>Subtotal {formatMoney(Number(item.subtotal),currency,"en")}{Number(item.discount)>0 && ` · Discount −${formatMoney(Number(item.discount),currency,"en")}`}</span><strong>{formatMoney(Number(item.total),currency,"en")}</strong></div>{item.admin_note && <div className="admin-store-order-note">Last admin note: {item.admin_note}</div>}<div className="admin-store-order-actions">{item.status === "pending" && <><button type="button" className="primary-button compact" onClick={() => void updateOrder(item,"confirmed")}><CheckCircle2 size={15} />Confirm</button><button type="button" className="danger-button compact" onClick={() => void updateOrder(item,"cancelled")}>Cancel</button></>}{item.status === "confirmed" && <><button type="button" className="primary-button compact" onClick={() => void updateOrder(item,"processing")}><Truck size={15} />Start processing</button><button type="button" className="danger-button compact" onClick={() => void updateOrder(item,"cancelled")}>Cancel</button></>}{item.status === "processing" && <button type="button" className="primary-button compact" onClick={() => void updateOrder(item,"completed")}><PackageCheck size={15} />Complete order</button>}</div></article>)}</div> : <div className="card admin-service-empty"><ShoppingCart size={28} /><strong>No matching orders</strong><span>Customer checkout requests will appear here.</span></div>}
    </div>}

    {section === "coupons" && <div className="admin-store-coupon-layout"><form className="card admin-store-coupon-form" onSubmit={createCoupon}><div className="admin-service-form-title"><span className="admin-command-icon"><BadgePercent size={20} /></span><div><strong>Create coupon</strong><small>Percent or fixed discount with limits and expiry.</small></div></div><div className="field"><label>Coupon code</label><input className="input" value={couponDraft.code} onChange={(event) => setCouponDraft((value) => ({ ...value, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"") }))} minLength={3} maxLength={30} placeholder="TASKORA10" required /></div><div className="admin-form-grid two"><div className="field"><label>Discount type</label><select className="select" value={couponDraft.discountType} onChange={(event) => setCouponDraft((value) => ({ ...value, discountType: event.target.value as "percent" | "fixed" }))}><option value="percent">Percent (%)</option><option value="fixed">Fixed ({currency})</option></select></div><div className="field"><label>Discount value</label><input className="input" type="number" min="0.01" step="0.01" value={couponDraft.value} onChange={(event) => setCouponDraft((value) => ({ ...value, value: event.target.value }))} required /></div></div><div className="admin-form-grid two"><div className="field"><label>Minimum order</label><input className="input" type="number" min="0" step="0.01" value={couponDraft.minimum} onChange={(event) => setCouponDraft((value) => ({ ...value, minimum: event.target.value }))} /></div><div className="field"><label>Maximum discount</label><input className="input" type="number" min="0.01" step="0.01" value={couponDraft.maximum} onChange={(event) => setCouponDraft((value) => ({ ...value, maximum: event.target.value }))} placeholder="Optional" /></div></div><div className="admin-form-grid two"><div className="field"><label>Usage limit</label><input className="input" type="number" min="1" step="1" value={couponDraft.usageLimit} onChange={(event) => setCouponDraft((value) => ({ ...value, usageLimit: event.target.value }))} placeholder="Unlimited" /></div><div className="field"><label>Expires at</label><input className="input" type="datetime-local" value={couponDraft.expiresAt} onChange={(event) => setCouponDraft((value) => ({ ...value, expiresAt: event.target.value }))} /></div></div><button className="primary-button"><Plus size={17} />Create coupon</button></form><div className="admin-store-coupon-list">{coupons.length ? coupons.map((item) => <article className={`card admin-store-coupon ${item.is_active ? "" : "inactive"}`} key={item.id}><div><span><TicketPercent size={18} /></span><div><strong>{item.code}</strong><small>{item.discount_type === "percent" ? `${item.discount_value}% off` : `${formatMoney(Number(item.discount_value),currency,"en")} off`} · used {item.used_count}{item.usage_limit ? `/${item.usage_limit}` : ""}</small></div></div><p>Minimum {formatMoney(Number(item.minimum_order),currency,"en")}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : " · no expiry"}</p><div><button type="button" className="secondary-button compact" onClick={() => void toggleCoupon(item)}>{item.is_active ? <EyeOff size={15} /> : <Eye size={15} />}{item.is_active ? "Pause" : "Activate"}</button><button type="button" className="danger-button compact" onClick={() => void deleteCoupon(item)}><Trash2 size={15} />Delete</button></div></article>) : <div className="card admin-service-empty"><TicketPercent size={28} /><strong>No coupons yet</strong></div>}</div></div>}

    {section === "inventory" && <div className="admin-store-inventory-grid">{lowStock.length ? lowStock.map((item) => <article className="card admin-store-inventory-item" key={item.id}>{item.image_url ? <img src={item.image_url} alt="" /> : <span><PackageOpen size={24} /></span>}<div><strong>{item.name_en}</strong><small>{formatMoney(Number(item.price),currency,"en")}</small></div><b className={item.stock_count === 0 ? "sold-out" : ""}>{item.stock_count === 0 ? "Sold out" : `${item.stock_count} left`}</b></article>) : <div className="card admin-service-empty"><PackageCheck size={28} /><strong>No low-stock products</strong><span>Products with 5 or fewer units appear here.</span></div>}</div>}

    {section === "reviews" && <div className="admin-store-review-list">{reviews.length ? reviews.map((item) => <article className={`card admin-store-review ${item.is_hidden ? "hidden" : ""}`} key={item.id}><div className="admin-store-review-head"><div><strong>{item.reviewer?.full_name || "Member"}</strong><small>{item.product?.name_en || "Product"} · {new Date(item.created_at).toLocaleDateString()}</small></div><span>{Array.from({length:5},(_,index) => <Star size={14} fill={index<item.rating ? "currentColor" : "none"} key={index} />)}</span></div><p>{item.body || "Rating only"}</p><button type="button" className="secondary-button compact" onClick={() => void setReviewVisibility(item)}>{item.is_hidden ? <Eye size={15} /> : <EyeOff size={15} />}{item.is_hidden ? "Show review" : "Hide review"}</button></article>) : <div className="card admin-service-empty"><Star size={28} /><strong>No reviews yet</strong></div>}</div>}
  </section>;
}

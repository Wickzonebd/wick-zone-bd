import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { supabasePublicKey, supabaseUrl } from "@/lib/supabase/config";

const requestSchema = z.object({
  type: z.literal("reselling_product"),
  productId: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid product checkout request." }, { status: 400 });

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Sign in before starting payment." }, { status: 401 });

  const supabase = createClient(supabaseUrl, supabasePublicKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });

  const { data: product, error: productError } = await supabase
    .from("reselling_products")
    .select("id,price,stock_count,is_active")
    .eq("id", parsed.data.productId)
    .eq("is_active", true)
    .maybeSingle();
  const amount = Number(product?.price);
  if (productError || !product || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "This product is not available for purchase." }, { status: 404 });
  }
  if (product.stock_count === 0) return NextResponse.json({ error: "This product is sold out." }, { status: 409 });

  const { data: generalRow } = await supabase.from("site_settings").select("value").eq("key", "general").maybeSingle();
  const configuredCurrency = typeof generalRow?.value === "object" && generalRow.value !== null && "currency" in generalRow.value
    ? String((generalRow.value as Record<string, unknown>).currency ?? "")
    : "";
  const currency = /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : "BDT";

  const gateway = getPaymentGateway();
  const result = await gateway.createOrder({
    orderId: crypto.randomUUID(),
    amount,
    currency,
    customerId: authData.user.id,
    returnUrl: new URL(`/reselling/${product.id}?payment=return`, request.url).toString(),
  });

  if (result.status === "not_configured") {
    return NextResponse.json(
      { error: "Payment gateway is not configured. No transaction has been created." },
      { status: 503 },
    );
  }
  return NextResponse.json(result);
}

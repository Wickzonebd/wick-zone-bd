type PaymentLanguage = "bn" | "en";

const messages: Record<string, { bn: string; en: string }> = {
  unauthorized: {
    bn: "আপনার লগইন সেশন শেষ হয়েছে। আবার লগইন করে চেষ্টা করুন।",
    en: "Your login session has expired. Please sign in again.",
  },
  payments_disabled: {
    bn: "অনলাইন পেমেন্ট এই মুহূর্তে বন্ধ আছে।",
    en: "Online payments are currently unavailable.",
  },
  verification_disabled: {
    bn: "ভেরিফিকেশন ব্যাজ কেনা এই মুহূর্তে বন্ধ আছে।",
    en: "Verification Badge purchases are currently unavailable.",
  },
  already_active: {
    bn: "আপনার Micro Jobs অ্যাক্সেস ইতিমধ্যে চালু আছে।",
    en: "Your Micro Jobs access is already active.",
  },
  already_verified: {
    bn: "আপনার Social Verification Badge ইতিমধ্যে চালু আছে।",
    en: "Your Social Verification Badge is already active.",
  },
  payment_initializing: {
    bn: "পেমেন্ট প্রস্তুত হচ্ছে। কয়েক সেকেন্ড পর আবার চেষ্টা করুন।",
    en: "Your payment is being prepared. Please try again in a few seconds.",
  },
  provider_auth_failed: {
    bn: "পেমেন্ট প্রদানকারী বর্তমান নিরাপদ কনফিগারেশনটি গ্রহণ করেনি। কোনো টাকা কাটা হয়নি। অ্যাডমিন সেটিং যাচাই করছে।",
    en: "The payment provider rejected the current secure configuration. No charge was made; the administrator is checking the setup.",
  },
  order_already_paid: {
    bn: "এই অর্ডারের পেমেন্ট ইতিমধ্যে সম্পন্ন হয়েছে।",
    en: "This order has already been paid.",
  },
  order_cancelled: {
    bn: "বাতিল করা অর্ডারে পেমেন্ট করা যাবে না।",
    en: "A cancelled order cannot be paid.",
  },
};

async function readFunctionErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;

  try {
    const payload = await context.clone().json() as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : null;
  } catch {
    return null;
  }
}

export async function friendlyPaymentError(error: unknown, language: PaymentLanguage) {
  const code = await readFunctionErrorCode(error);
  const known = code ? messages[code] : null;
  if (known) return known[language];

  if (code?.startsWith("provider_") || code?.startsWith("missing_payment_")) {
    return language === "bn"
      ? "পেমেন্ট সেবাটি সাময়িকভাবে ব্যস্ত। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।"
      : "The payment service is temporarily busy. Please try again shortly.";
  }

  return language === "bn"
    ? "এই মুহূর্তে পেমেন্ট শুরু করা যাচ্ছে না। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
    : "We could not start the payment. Check your connection and try again.";
}

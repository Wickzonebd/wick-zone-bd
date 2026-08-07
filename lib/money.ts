import type { Language } from "@/lib/types";

export function formatMoney(value: number, currency: string, language: Language) {
  try {
    return new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-BD", {
      style: "currency",
      currency: currency || "BDT",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "BDT"} ${value.toFixed(2)}`;
  }
}

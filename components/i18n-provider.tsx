"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Language } from "@/lib/types";
import english from "@/locales/en.json";
import bengali from "@/locales/bn.json";

type Dictionary = Record<string, unknown>;

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const dictionaries: Record<Language, Dictionary> = { en: english, bn: bengali };
const I18nContext = createContext<I18nContextValue | null>(null);

function resolveTranslation(dictionary: Dictionary, path: string): string {
  const result = path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, dictionary);
  return typeof result === "string" ? result : path;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("bn");

  useEffect(() => {
    const saved = window.localStorage.getItem("app-language");
    if (saved === "en" || saved === "bn") setLanguageState(saved);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem("app-language", next);
    document.documentElement.lang = next;
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "bn" ? "en" : "bn");
  }, [language, setLanguage]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t: (key: string) => resolveTranslation(dictionaries[language], key) }),
    [language, setLanguage, toggleLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

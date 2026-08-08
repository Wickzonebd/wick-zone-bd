import type { Metadata } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const bengaliFont = Hind_Siliguri({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
});

const latinFont = Inter({
  variable: "--font-latin",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WICK ZONE BD",
  description: "A bilingual community and micro-job platform.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body className={`${bengaliFont.variable} ${latinFont.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

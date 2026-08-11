import type { Metadata } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import { AppProviders } from "@/components/providers";
import "./globals.css";
import "./payment.css";

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
  title: "Taskora",
  description: "Taskora is a bilingual micro-job and social services platform.",
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

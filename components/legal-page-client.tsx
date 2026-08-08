"use client";

import { FileText, Info, ScrollText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { legalContentDefaults, type LegalPageKind } from "@/lib/legal-content";

const pageMeta = {
  about: { icon: Info, titleEn: "About Us", titleBn: "আমাদের সম্পর্কে", eyebrowEn: "OUR PLATFORM", eyebrowBn: "আমাদের প্ল্যাটফর্ম" },
  privacy: { icon: ShieldCheck, titleEn: "Privacy Policy", titleBn: "গোপনীয়তা নীতি", eyebrowEn: "YOUR PRIVACY", eyebrowBn: "আপনার গোপনীয়তা" },
  terms: { icon: ScrollText, titleEn: "Terms & Conditions", titleBn: "শর্তাবলি", eyebrowEn: "PLATFORM TERMS", eyebrowBn: "প্ল্যাটফর্মের শর্ত" },
} as const;

function contentBlocks(content: string) {
  return content.trim().split(/\n\s*\n/).map((block) => {
    const [heading, ...body] = block.split("\n").map((line) => line.trim()).filter(Boolean);
    return { heading, body: body.join(" ") };
  }).filter((block) => block.heading);
}

export function LegalPageClient({ kind }: { kind: LegalPageKind }) {
  const { language } = useI18n();
  const { general } = useSiteConfig();
  const meta = pageMeta[kind];
  const Icon = meta.icon;
  const configured = kind === "about"
    ? (language === "bn" ? general.aboutContentBn : general.aboutContent)
    : kind === "privacy"
      ? (language === "bn" ? general.privacyContentBn : general.privacyContent)
      : (language === "bn" ? general.termsContentBn : general.termsContent);
  const content = configured?.trim() || legalContentDefaults[kind][language];
  const blocks = contentBlocks(content);

  return <AppShell variant="hub"><main className="legal-page"><div className="legal-container">
    <section className="legal-hero">
      <div className="legal-hero-icon"><Icon size={27} /></div>
      <div><span>{language === "bn" ? meta.eyebrowBn : meta.eyebrowEn}</span><h1>{language === "bn" ? meta.titleBn : meta.titleEn}</h1><p>{language === "bn" ? `${general.siteName}-এর তথ্য, নীতি ও ব্যবহারবিধি সহজ ভাষায় জানুন।` : `Clear information about ${general.siteName}, its policies and how the platform works.`}</p></div>
      <FileText className="legal-hero-watermark" size={108} />
    </section>
    <section className="legal-content-card">
      {blocks.map((block, index) => <article className="legal-content-block" key={`${block.heading}-${index}`}>
        <span className="legal-block-number">{String(index + 1).padStart(2, "0")}</span>
        <div><h2>{block.heading}</h2>{block.body && <p>{block.body}</p>}</div>
      </article>)}
    </section>
    <div className="legal-footer-note"><ShieldCheck size={16} /><span>{language === "bn" ? "এই পেজের লেখা অ্যাডমিন প্যানেলের Settings থেকে পরিবর্তন করা যাবে।" : "This page can be updated anytime from Admin → Settings."}</span></div>
  </div></main></AppShell>;
}

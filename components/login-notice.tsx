"use client";

import Link from "next/link";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type LoginNoticeData = {
  id: string;
  title: string;
  body: string | null;
  destinationUrl: string | null;
  priority: string;
  createdAt: string;
};

export function LoginNotice() {
  const { user, loading } = useAuth();
  const { language } = useI18n();
  const [notice, setNotice] = useState<LoginNoticeData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      setOpen(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const sessionKey = `taskora-login-notice:${user.id}:${token.slice(-16)}`;
      if (window.sessionStorage.getItem(sessionKey) === "seen") return;

      const { data, error } = await supabase.rpc("get_login_notice");
      if (cancelled || error || !data) return;
      const next = data as LoginNoticeData;
      if (!next.id) return;
      setNotice(next);
      setOpen(true);
      window.sessionStorage.setItem(sessionKey, "seen");
    };
    void load();
    return () => { cancelled = true; };
  }, [loading, user]);

  if (!open || !notice) return null;

  return (
    <Modal title={language === "bn" ? "গুরুত্বপূর্ণ নোটিশ" : "Important Notice"} onClose={() => setOpen(false)}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span className="empty-icon" style={{ flex: "0 0 auto" }}><BellRing size={24} /></span>
          <div style={{ display: "grid", gap: 7 }}>
            <strong style={{ fontSize: 18 }}>{notice.title}</strong>
            {notice.body && <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{notice.body}</p>}
            <small className="muted">{new Date(notice.createdAt).toLocaleString(language === "bn" ? "bn-BD" : "en")}</small>
          </div>
        </div>
        {notice.destinationUrl && <Link className="secondary-button" href={notice.destinationUrl} onClick={() => setOpen(false)}>{language === "bn" ? "বিস্তারিত দেখুন" : "View details"}</Link>}
        <button className="primary-button" type="button" onClick={() => setOpen(false)}>{language === "bn" ? "চালিয়ে যান" : "Continue"}</button>
      </div>
    </Modal>
  );
}

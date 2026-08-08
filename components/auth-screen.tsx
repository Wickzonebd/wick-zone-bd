"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Languages, LockKeyhole, Mail, Phone, UserRound, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { TaskoraLockup } from "@/components/taskora-brand";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { normalizeBangladeshPhone } from "@/lib/url";

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { t, toggleLanguage, language } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== "register") return;
    const referral = new URLSearchParams(window.location.search).get("ref");
    if (referral) setReferralCode(referral.toUpperCase().slice(0, 20));
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !isSupabaseConfigured) {
      setMessage({ type: "error", text: "Supabase public configuration is missing." });
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw new Error(error.message);
        router.replace("/dashboard");
        return;
      }
      if (mode === "register") {
        if (fullName.trim().length < 2) throw new Error("Please enter your full name.");
        if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const normalizedPhone = normalizeBangladeshPhone(mobile);
        if (!normalizedPhone) throw new Error("Enter a valid Bangladesh mobile number.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName.trim(), mobile: normalizedPhone, referral_code: referralCode.trim().toUpperCase() || null },
          },
        });
        if (error) throw new Error(error.message);
        if (data.session) router.replace("/dashboard");
        else setMessage({ type: "success", text: "Account created. Check your email if email confirmation is enabled." });
        return;
      }
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw new Error(error.message);
        setMessage({ type: "success", text: "If the account exists, a password reset link has been sent." });
        return;
      }
      if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
      if (password !== confirmPassword) throw new Error("Passwords do not match.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setMessage({ type: "success", text: "Password updated successfully." });
      window.setTimeout(() => router.replace("/dashboard"), 900);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Request failed.";
      const friendly = mode === "register" && /database error saving new user/i.test(raw)
        ? language === "bn"
          ? "এই মোবাইল নম্বরটি আগে থেকেই একটি অ্যাকাউন্টে ব্যবহার করা হয়েছে। আগের অ্যাকাউন্টে লগইন করুন অথবা অন্য মোবাইল নম্বর ব্যবহার করুন।"
          : "This mobile number is already linked to an account. Sign in to the existing account or use another mobile number."
        : /invalid login credentials/i.test(raw)
          ? language === "bn" ? "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।" : "The email or password is incorrect."
          : /email not confirmed/i.test(raw)
            ? language === "bn" ? "ইমেইল এখনো নিশ্চিত করা হয়নি। ইমেইলের confirmation link দেখুন।" : "Your email is not confirmed yet. Check your email for the confirmation link."
            : /already registered|duplicate|unique/i.test(raw)
              ? language === "bn" ? "এই তথ্য দিয়ে আগে থেকেই একটি অ্যাকাউন্ট আছে।" : "An account already exists with these details."
              : raw;
      setMessage({ type: "error", text: friendly });
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "login" ? t("auth.loginTitle") : mode === "register" ? t("auth.registerTitle") : t("auth.resetTitle");
  const subtitle = mode === "login" ? t("auth.loginSubtitle") : mode === "register" ? t("auth.registerSubtitle") : t("auth.loginSubtitle");

  return (
    <main className={`auth-page auth-page-${mode}`}>
      <section className="auth-card">
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="secondary-button auth-language-toggle" onClick={toggleLanguage}><Languages size={17} />{t("common.language")}</button></div>
        <TaskoraLockup markSize={58} className="auth-taskora-brand" />
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <div className="field"><label>{t("auth.fullName")}</label><div className="input-wrap"><UserRound size={20} /><input className="input with-icon" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="John Doe" autoComplete="name" required /></div></div>}
          {mode !== "reset" && <div className="field"><label>{t("auth.email")}</label><div className="input-wrap"><Mail size={20} /><input className="input with-icon" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="example@email.com" autoComplete="email" required /></div></div>}
          {mode === "register" && <div className="field"><label>{t("auth.mobile")}</label><div className="input-wrap"><Phone size={20} /><input className="input with-icon" inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="01XXXXXXXXX" autoComplete="tel" required /></div></div>}
          {(mode === "login" || mode === "register" || mode === "reset") && <div className="field"><label>{mode === "reset" ? t("auth.newPassword") : t("auth.password")}</label><div className="input-wrap"><LockKeyhole size={20} /><input className="input with-icon" style={{ paddingRight: 56 }} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Enter your password" : "Minimum 8 characters"} autoComplete={mode === "login" ? "current-password" : "new-password"} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password visibility" style={{ position: "absolute", right: 10, top: 7, width: 43, height: 43, border: 0, background: "transparent", color: "#8490a0" }}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>{mode === "login" && <div style={{ textAlign: "right" }}><Link className="text-link" href="/forgot-password">{t("auth.forgot")}</Link></div>}</div>}
          {(mode === "register" || mode === "reset") && <div className="field"><label>{t("auth.confirmPassword")}</label><div className="input-wrap"><LockKeyhole size={20} /><input className="input with-icon" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" required /></div></div>}
          {mode === "register" && <div className="field"><label>{t("auth.referral")}</label><div className="input-wrap"><UsersRound size={20} /><input className="input with-icon" value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} placeholder="A1B2C3D4E5" maxLength={20} /></div></div>}
          {message && <div className={`form-message ${message.type}`} role="status">{message.text}</div>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? t("common.loading") : mode === "login" ? t("auth.login") : mode === "register" ? t("auth.register") : mode === "forgot" ? t("auth.sendReset") : t("auth.updatePassword")}</button>
        </form>
        {mode === "login" && <p className="auth-footer">{t("auth.noAccount")} <Link className="text-link" href="/register">{t("auth.register")}</Link></p>}
        {mode === "register" && <p className="auth-footer">{t("auth.hasAccount")} <Link className="text-link" href="/login">{t("auth.login")}</Link></p>}
        {(mode === "forgot" || mode === "reset") && <p className="auth-footer"><Link className="text-link" href="/login">{t("auth.login")}</Link></p>}
      </section>
    </main>
  );
}

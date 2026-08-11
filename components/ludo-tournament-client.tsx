"use client";

import { CheckCircle2, Clock3, Coins, Crown, ImageUp, Info, LoaderCircle, Trophy, UploadCloud, UserRound, UsersRound, WalletCards, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeFileName } from "@/lib/url";

interface LudoTournament {
  id: string;
  title_en: string;
  title_bn: string | null;
  description_en: string | null;
  description_bn: string | null;
  rules_en: string;
  rules_bn: string | null;
  max_players: number;
  participant_count: number;
  entry_fee: number | string;
  prize_amount: number | string;
  status: "draft" | "open" | "full" | "ongoing" | "completed" | "cancelled";
  starts_at: string | null;
  sort_order: number;
  is_active: boolean;
}

interface LudoEntry {
  id: string;
  tournament_id: string;
  entry_fee_paid: number | string;
  status: "joined" | "winner" | "lost" | "refunded";
  joined_at: string;
}

interface LudoProof {
  id: string;
  tournament_id: string;
  entry_id: string;
  ludo_username: string;
  screenshot_path: string;
  status: "pending" | "approved" | "rejected" | "resubmit";
  admin_note: string | null;
  created_at: string;
}

type TournamentTab = "all" | "mine" | "history";

export function LudoTournamentClient() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const [tournaments, setTournaments] = useState<LudoTournament[]>([]);
  const [entries, setEntries] = useState<LudoEntry[]>([]);
  const [proofs, setProofs] = useState<LudoProof[]>([]);
  const [balance, setBalance] = useState(0);
  const [tab, setTab] = useState<TournamentTab>("all");
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [rulesTournament, setRulesTournament] = useState<LudoTournament | null>(null);
  const [proofTarget, setProofTarget] = useState<{ tournament: LudoTournament; entry: LudoEntry } | null>(null);
  const [ludoUsername, setLudoUsername] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setMessage({ type: "error", text: "Ludo tournaments are temporarily unavailable." }); setLoading(false); return; }
    setLoading(true);
    const [tournamentResult, entryResult, proofResult, walletResult] = await Promise.all([
      supabase.from("ludo_tournaments").select("id,title_en,title_bn,description_en,description_bn,rules_en,rules_bn,max_players,participant_count,entry_fee,prize_amount,status,starts_at,sort_order,is_active").order("sort_order").order("created_at", { ascending: false }),
      supabase.from("ludo_entries").select("id,tournament_id,entry_fee_paid,status,joined_at").eq("user_id", user.id).order("joined_at", { ascending: false }),
      supabase.from("ludo_proofs").select("id,tournament_id,entry_id,ludo_username,screenshot_path,status,admin_note,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.rpc("get_wallet_summary"),
    ]);
    const firstError = tournamentResult.error || entryResult.error || proofResult.error || walletResult.error;
    if (firstError) setMessage({ type: "error", text: firstError.message });
    setTournaments((tournamentResult.data as LudoTournament[]) ?? []);
    setEntries((entryResult.data as LudoEntry[]) ?? []);
    setProofs((proofResult.data as LudoProof[]) ?? []);
    setBalance(Number((walletResult.data as { balance?: number } | null)?.balance ?? 0));
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const entryByTournament = useMemo(() => new Map(entries.map((entry) => [entry.tournament_id, entry])), [entries]);
  const proofByEntry = useMemo(() => new Map(proofs.map((proof) => [proof.entry_id, proof])), [proofs]);
  const money = (value: number | string) => formatMoney(Number(value), general.currency, language);
  const localize = (en: string | null, bn: string | null) => language === "bn" && bn ? bn : en ?? "";

  const shownTournaments = useMemo(() => {
    if (tab === "all") return tournaments.filter((item) => item.is_active && ["open", "full", "ongoing"].includes(item.status));
    if (tab === "mine") return tournaments.filter((item) => {
      const entry = entryByTournament.get(item.id);
      return Boolean(entry && entry.status === "joined" && ["open", "full", "ongoing"].includes(item.status));
    });
    return tournaments.filter((item) => {
      const entry = entryByTournament.get(item.id);
      return Boolean(entry && (item.status === "completed" || item.status === "cancelled" || entry.status !== "joined"));
    });
  }, [tab, tournaments, entryByTournament]);

  const joinTournament = async (tournament: LudoTournament) => {
    if (!user || tournament.status !== "open") return;
    if (Number(tournament.entry_fee) > 0 && !window.confirm(`${t("ludo.joinConfirm")} ${money(tournament.entry_fee)}?`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setJoiningId(tournament.id); setMessage(null);
    const { error } = await supabase.rpc("ludo_join_tournament", { p_tournament_id: tournament.id });
    setJoiningId(null);
    if (error) {
      const text = error.message.includes("Insufficient balance")
        ? (language === "bn" ? "এই টুর্নামেন্টে যোগ দেওয়ার জন্য ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।" : "Your wallet balance is not enough for this tournament entry fee.")
        : error.message.includes("permission denied")
          ? (language === "bn" ? "টুর্নামেন্ট সেবার অনুমতি আপডেট হচ্ছে। আবার চেষ্টা করুন।" : "Tournament access is being updated. Please try again.")
          : error.message;
      setMessage({ type: "error", text }); return;
    }
    setMessage({ type: "success", text: t("ludo.joinSuccess") });
    await load();
  };

  const openProof = (tournament: LudoTournament, entry: LudoEntry) => {
    const existing = proofByEntry.get(entry.id);
    setLudoUsername(existing?.ludo_username ?? "");
    setProofFile(null); setMessage(null); setProofTarget({ tournament, entry });
  };

  const submitProof = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !proofTarget) return;
    const username = ludoUsername.trim();
    if (username.length < 2) { setMessage({ type: "error", text: t("ludo.usernameRequired") }); return; }
    if (!proofFile || !proofFile.type.startsWith("image/") || proofFile.size > 5 * 1024 * 1024) { setMessage({ type: "error", text: t("ludo.screenshotRequired") }); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const existing = proofByEntry.get(proofTarget.entry.id);
    if (existing && existing.status !== "resubmit") { setMessage({ type: "error", text: t("ludo.proofAlreadySubmitted") }); return; }
    setSubmitting(true); setMessage(null);
    const path = `${user.id}/ludo/${proofTarget.tournament.id}/${Date.now()}-${safeFileName(proofFile.name)}`;
    const upload = await supabase.storage.from("job-proofs").upload(path, proofFile, { contentType: proofFile.type, upsert: false });
    if (upload.error) { setSubmitting(false); setMessage({ type: "error", text: t("ludo.uploadFailed") }); return; }
    const result = existing
      ? await supabase.from("ludo_proofs").update({ ludo_username: username, screenshot_path: path, status: "pending" }).eq("id", existing.id).eq("user_id", user.id)
      : await supabase.from("ludo_proofs").insert({ tournament_id: proofTarget.tournament.id, entry_id: proofTarget.entry.id, user_id: user.id, ludo_username: username, screenshot_path: path });
    if (result.error) {
      await supabase.storage.from("job-proofs").remove([path]);
      setSubmitting(false); setMessage({ type: "error", text: result.error.message }); return;
    }
    if (existing?.screenshot_path && existing.screenshot_path !== path) await supabase.storage.from("job-proofs").remove([existing.screenshot_path]);
    setSubmitting(false); setProofTarget(null); setProofFile(null); setLudoUsername("");
    setMessage({ type: "success", text: t("ludo.proofSubmitted") });
    await load();
  };

  const tabs: Array<{ id: TournamentTab; label: string }> = [
    { id: "all", label: t("ludo.allMatches") }, { id: "mine", label: t("ludo.myMatches") }, { id: "history", label: t("ludo.history") },
  ];

  return <AppShell variant="hub"><main className="ludo-page"><div className="ludo-container">
    <header className="ludo-hero">
      <div className="ludo-hero-top"><div><span className="ludo-kicker">TASKORA GAMING ZONE</span><h1>{t("ludo.title")}</h1><p>{t("ludo.subtitle")}</p></div><div className="ludo-trophy"><Trophy size={34} /></div></div>
      <div className="ludo-wallet-chip"><WalletCards size={17} /><span>{t("ludo.balance")}</span><strong>{money(balance)}</strong></div>
      <div className="ludo-tabs">{tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    </header>

    {message && <div className={`form-message ${message.type} ludo-message`}><button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X size={16} /></button>{message.text}</div>}

    <section className="ludo-match-list">
      {loading ? [0,1].map((item) => <div className="ludo-match-card ludo-match-skeleton" key={item} />) : shownTournaments.length ? shownTournaments.map((tournament) => {
        const entry = entryByTournament.get(tournament.id);
        const proof = entry ? proofByEntry.get(entry.id) : undefined;
        const canSubmitProof = Boolean(entry && entry.status === "joined" && ["full","ongoing"].includes(tournament.status) && (!proof || proof.status === "resubmit"));
        return <article className="ludo-match-card" key={tournament.id}>
          <div className="ludo-match-heading"><div><div className="ludo-match-number"><Crown size={18} /><strong>{localize(tournament.title_en,tournament.title_bn)}</strong></div><span>{tournament.max_players} {t("ludo.playerMatch")} · <b className={`ludo-status ${tournament.status}`}>{tournament.status}</b></span></div><div className="ludo-prize-pill"><Trophy size={15} />{money(tournament.prize_amount)}</div></div>
          {localize(tournament.description_en,tournament.description_bn) && <p className="ludo-match-description">{localize(tournament.description_en,tournament.description_bn)}</p>}
          <div className="ludo-match-stats"><div><span><Coins size={15} />{t("ludo.entryFee")}</span><strong>{money(tournament.entry_fee)}</strong></div><div><span><UsersRound size={15} />{t("ludo.players")}</span><strong>{tournament.participant_count}/{tournament.max_players}</strong></div></div>
          {tournament.starts_at && <div className="ludo-start-time"><Clock3 size={14} />{new Date(tournament.starts_at).toLocaleString(language === "bn" ? "bn-BD" : "en-BD")}</div>}
          <button type="button" className="ludo-rules-button" onClick={() => setRulesTournament(tournament)}><Info size={18} />{t("ludo.rules")}</button>
          <div className="ludo-match-actions">
            {!entry ? <button type="button" className="ludo-join-button" disabled={joiningId === tournament.id || tournament.status !== "open"} onClick={() => void joinTournament(tournament)}>{joiningId === tournament.id ? <LoaderCircle className="ludo-spin" size={18} /> : <Trophy size={18} />}{joiningId === tournament.id ? t("common.loading") : tournament.status === "open" ? t("ludo.join") : t("ludo.closed")}</button> : <div className={`ludo-entry-state ${entry.status}`}><CheckCircle2 size={17} />{entry.status === "joined" ? t("ludo.joined") : entry.status}</div>}
            {entry && <button type="button" className="ludo-proof-button" disabled={!canSubmitProof} onClick={() => canSubmitProof && openProof(tournament, entry)}><ImageUp size={18} />{proof?.status === "pending" ? t("ludo.pendingReview") : proof?.status === "approved" ? t("ludo.winner") : proof?.status === "rejected" ? t("ludo.rejected") : proof?.status === "resubmit" ? t("ludo.resubmitProof") : ["open"].includes(tournament.status) ? t("ludo.waitingPlayers") : t("ludo.submitProof")}</button>}
          </div>
          {proof?.admin_note && <div className="ludo-admin-note"><Info size={14} />{proof.admin_note}</div>}
        </article>;
      }) : <div className="ludo-empty"><Trophy size={38} /><h2>{tab === "all" ? t("ludo.noTournaments") : tab === "mine" ? t("ludo.noMatches") : t("ludo.noHistory")}</h2><p>{tab === "all" ? t("ludo.noTournamentsBody") : t("ludo.browseHint")}</p>{tab !== "all" && <button type="button" className="primary-button compact" onClick={() => setTab("all")}>{t("ludo.allMatches")}</button>}</div>}
    </section>
  </div></main>

  {rulesTournament && <div className="ludo-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRulesTournament(null)}><section className="ludo-modal-card" role="dialog" aria-modal="true" aria-label={t("ludo.rules")}><div className="ludo-modal-accent blue" /><button className="ludo-modal-close" onClick={() => setRulesTournament(null)}><X size={20} /></button><div className="ludo-modal-title"><span><Info size={25} /></span><div><h2>{t("ludo.rules")}</h2><small>{t("ludo.tournamentDetails")}</small></div></div>{localize(rulesTournament.description_en,rulesTournament.description_bn) && <div className="ludo-rule-description"><span>{t("ludo.description")}</span><p>{localize(rulesTournament.description_en,rulesTournament.description_bn)}</p></div>}<div className="ludo-rule-box"><span>{t("ludo.rules")}</span><p>{localize(rulesTournament.rules_en,rulesTournament.rules_bn)}</p></div><div className="ludo-rule-money"><div><span>{t("ludo.entryFee")}</span><strong>{money(rulesTournament.entry_fee)}</strong></div><div><span>{t("ludo.prize")}</span><strong>{money(rulesTournament.prize_amount)}</strong></div></div><button className="ludo-modal-primary dark" onClick={() => setRulesTournament(null)}>{t("ludo.gotIt")}</button></section></div>}

  {proofTarget && <div className="ludo-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !submitting && setProofTarget(null)}><section className="ludo-modal-card ludo-proof-modal" role="dialog" aria-modal="true" aria-label={t("ludo.submitProof")}><div className="ludo-modal-accent" /><button className="ludo-modal-close" onClick={() => !submitting && setProofTarget(null)}><X size={20} /></button><div className="ludo-modal-title"><span><ImageUp size={25} /></span><div><h2>{t("ludo.submitWinProof")}</h2><small>{t("ludo.uploadWinningScreenshot")}</small></div></div><form className="ludo-proof-form" onSubmit={submitProof}><label><span>{t("ludo.username")}</span><div className="ludo-input-wrap"><UserRound size={19} /><input value={ludoUsername} onChange={(event) => setLudoUsername(event.target.value)} maxLength={80} placeholder={t("ludo.usernamePlaceholder")} required /></div></label><label className="ludo-upload-box"><UploadCloud size={27} /><strong>{proofFile ? proofFile.name : t("ludo.uploadScreenshot")}</strong><small>JPG, PNG, WebP · max 5MB</small><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} /></label><button className="ludo-modal-primary" disabled={submitting}>{submitting ? <LoaderCircle size={19} className="ludo-spin" /> : <ImageUp size={19} />}{submitting ? t("common.loading") : t("ludo.submitResult")}</button></form></section></div>}
  </AppShell>;
}

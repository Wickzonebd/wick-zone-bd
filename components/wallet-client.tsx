"use client";

import { ArrowDownToLine, ArrowRightLeft, Clock3, Coins, History, Landmark, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { useSiteConfig } from "@/components/site-config-provider";
import { EmptyState, ErrorState, LoadingCards, Modal } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WalletSummary } from "@/lib/types";

interface WalletTransaction { id: string; amount: number | string; transaction_type: string; description: string | null; created_at: string; }
interface WalletMonth { month: string; earned: number | string; withdrawn: number | string; }
interface WalletAnalytics { total_earned: number | string; total_withdrawn: number | string; months: WalletMonth[]; }
interface CoinSummary { balance: number | string; referral_count: number; referral_reward: number; coins_per_currency_unit: number; minimum_exchange: number; }

export function WalletClient() {
  const { t, language } = useI18n();
  const { general } = useSiteConfig();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [analytics, setAnalytics] = useState<WalletAnalytics | null>(null);
  const [coins, setCoins] = useState<CoinSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [method, setMethod] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError(true); setLoading(false); return; }
    const [summaryResult, txResult, analyticsResult, coinResult] = await Promise.all([
      supabase.rpc("get_wallet_summary"),
      supabase.from("wallet_transactions").select("id,amount,transaction_type,description,created_at").order("created_at", { ascending: false }).limit(80),
      supabase.rpc("get_wallet_analytics"),
      supabase.rpc("get_coin_summary"),
    ]);
    setSummary(summaryResult.data as WalletSummary | null);
    setTransactions((txResult.data as WalletTransaction[]) ?? []);
    setAnalytics((analyticsResult.data as WalletAnalytics | null) ?? null);
    setCoins((coinResult.data as CoinSummary | null) ?? null);
    setError(Boolean(summaryResult.error || txResult.error || analyticsResult.error || coinResult.error));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (general.payoutMethods.length && !method) setMethod(general.payoutMethods[0] ?? ""); }, [general.payoutMethods, method]);

  const format = (value: number) => formatMoney(value, general.currency, language);
  const monthMax = useMemo(() => Math.max(1, ...(analytics?.months ?? []).flatMap((month) => [Number(month.earned), Number(month.withdrawn)])), [analytics?.months]);

  const submitWithdrawal = async (event: FormEvent) => {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setMessage(null);
    const numericAmount = Number(amount);
    const { error: requestError } = await supabase.rpc("request_withdrawal", { p_amount: numericAmount, p_payment_method: method, p_destination: destination.trim() });
    if (requestError) setMessage({ type: "error", text: requestError.message });
    else {
      setMessage({ type: "success", text: language === "bn" ? "উইথড্র রিকোয়েস্ট রিভিউয়ের জন্য পাঠানো হয়েছে।" : "Withdrawal request submitted for manual review." });
      setAmount(""); setDestination(""); await load();
    }
  };

  const exchangeCoins = async (event: FormEvent) => {
    event.preventDefault();
    const numericCoins = Number(coinAmount);
    if (!coins || !Number.isInteger(numericCoins) || numericCoins < Number(coins.minimum_exchange) || numericCoins > Number(coins.balance)) {
      setMessage({ type: "error", text: language === "bn" ? "সঠিক কয়েন পরিমাণ দিন।" : "Enter a valid coin amount within your balance." });
      return;
    }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    const { data, error: exchangeError } = await supabase.rpc("exchange_coins", { p_coins: numericCoins });
    if (exchangeError) {
      setMessage({ type: "error", text: exchangeError.message });
      return;
    }
    const result = data as { wallet_amount?: number | string } | null;
    setMessage({ type: "success", text: language === "bn" ? `${numericCoins} কয়েন এক্সচেঞ্জ হয়েছে · ${format(Number(result?.wallet_amount ?? 0))} ওয়ালেটে যোগ হয়েছে।` : `${numericCoins} coins exchanged · ${format(Number(result?.wallet_amount ?? 0))} added to your wallet.` });
    setCoinAmount(""); setExchangeOpen(false); await load();
  };

  const periods = summary ? [["wallet.today", summary.today], ["wallet.yesterday", summary.yesterday], ["wallet.seven", summary.last_7_days], ["wallet.thirty", summary.last_30_days]] as const : [];
  return <AppShell variant="hub"><main className="custom-wallet-page"><div className="custom-wallet-container">
    <h1 className="custom-wallet-title">{t("wallet.title")}</h1>
    {message && <div className={`form-message ${message.type} wallet-page-message`}>{message.text}</div>}
    {loading ? <LoadingCards count={4} /> : error || !summary ? <ErrorState message={t("common.error")} /> : <>
      <section className="custom-wallet-balance-card">
        <div className="custom-wallet-balance-inner"><div className="custom-wallet-balance-label">{t("wallet.balance")}</div><div className="custom-wallet-balance-amount">{format(summary.balance)}</div></div>
        <div className="custom-wallet-actions"><button className="custom-wallet-btn custom-wallet-btn-primary" onClick={() => { setMessage(null); setWithdrawOpen(true); }}><ArrowDownToLine size={18} />{t("wallet.withdraw")}</button><a href="#history" className="custom-wallet-btn custom-wallet-btn-secondary"><History size={18} />{t("wallet.history")}</a></div>
      </section>

      <section className="wallet-lifetime-grid">
        <article><span className="wallet-lifetime-icon earned"><TrendingUp size={20} /></span><div><small>{language === "bn" ? "সর্বমোট আয়" : "Total earned"}</small><strong>{format(Number(analytics?.total_earned ?? 0))}</strong></div></article>
        <article><span className="wallet-lifetime-icon withdrawn"><ArrowDownToLine size={20} /></span><div><small>{language === "bn" ? "সর্বমোট উইথড্র" : "Total withdrawn"}</small><strong>{format(Number(analytics?.total_withdrawn ?? 0))}</strong></div></article>
      </section>

      <section className="wallet-coin-card">
        <div className="wallet-coin-icon"><Coins size={28} /></div><div className="wallet-coin-copy"><small>{language === "bn" ? "রেফারেল কয়েন" : "Referral coins"}</small><strong>{Number(coins?.balance ?? 0).toLocaleString(language === "bn" ? "bn-BD" : "en")} <span>coins</span></strong><p>{Number(coins?.referral_reward ?? general.referralRewardCoins)} coins / referral · {Number(coins?.coins_per_currency_unit ?? general.coinsPerCurrencyUnit)} coins = {format(1)}</p></div><button type="button" disabled={!coins || Number(coins.balance) < Number(coins.minimum_exchange)} onClick={() => { setMessage(null); setCoinAmount(String(coins?.minimum_exchange ?? general.minimumCoinExchange)); setExchangeOpen(true); }}><ArrowRightLeft size={16} />{language === "bn" ? "এক্সচেঞ্জ" : "Exchange"}</button>
      </section>

      <section className="wallet-monthly-card">
        <div className="wallet-monthly-head"><div><span>{language === "bn" ? "১২ মাসের হিস্টোরি" : "LAST 12 MONTHS"}</span><h2>{language === "bn" ? "আয় ও উইথড্র" : "Earnings & withdrawals"}</h2></div><div className="wallet-chart-legend"><span><i className="earned" />{language === "bn" ? "আয়" : "Earned"}</span><span><i className="withdrawn" />{language === "bn" ? "উইথড্র" : "Withdrawn"}</span></div></div>
        <div className="wallet-monthly-chart">{(analytics?.months ?? []).map((month) => { const earned = Number(month.earned); const withdrawn = Number(month.withdrawn); const label = new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString(language === "bn" ? "bn-BD" : "en", { month: "short" }); return <div className="wallet-month-column" key={month.month} title={`${month.month}: ${format(earned)} earned, ${format(withdrawn)} withdrawn`}><div className="wallet-month-bars"><span className="earned" style={{ height: `${earned > 0 ? Math.max(5, (earned / monthMax) * 100) : 0}%` }} /><span className="withdrawn" style={{ height: `${withdrawn > 0 ? Math.max(5, (withdrawn / monthMax) * 100) : 0}%` }} /></div><small>{label}</small></div>; })}</div>
      </section>

      <section className="custom-wallet-stats-grid">{periods.map(([label, value]) => <div className="custom-wallet-stat-card" key={label}><div className="custom-wallet-stat-icon"><ReceiptText size={20} /></div><div className="custom-wallet-stat-amount">{format(value)}</div><div className="custom-wallet-stat-label">{t(label)}</div></div>)}</section>

      <section id="history" className="custom-wallet-history"><h2>{t("wallet.history")}</h2>{transactions.length ? <div className="custom-wallet-history-list">{transactions.map((tx) => { const numeric = Number(tx.amount); return <div key={tx.id} className="custom-wallet-history-row"><div className="custom-wallet-history-icon"><WalletCards size={20} /></div><div className="custom-wallet-history-copy"><strong>{tx.description || tx.transaction_type.replaceAll("_", " ")}</strong><span><Clock3 size={12} /> {new Date(tx.created_at).toLocaleString()}</span></div><strong className={numeric >= 0 ? "credit" : "debit"}>{numeric >= 0 ? "+" : ""}{format(numeric)}</strong></div>; })}</div> : <EmptyState message={t("wallet.empty")} />}</section>
    </>}
  </div></main>
  {withdrawOpen && <Modal title={t("wallet.withdraw")} onClose={() => setWithdrawOpen(false)}><form className="auth-form" onSubmit={submitWithdrawal}><div className="field"><label>{t("wallet.amount")} · minimum {format(general.withdrawalMinimum)}</label><input className="input" type="number" min={general.withdrawalMinimum} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div><div className="field"><label>{t("wallet.method")}</label><select className="select" value={method} onChange={(event) => setMethod(event.target.value)} required>{general.payoutMethods.map((value) => <option key={value}>{value}</option>)}</select></div><div className="field"><label>{t("wallet.destination")}</label><div className="input-wrap"><Landmark size={19} /><input className="input with-icon" value={destination} onChange={(event) => setDestination(event.target.value)} required maxLength={120} /></div></div><button className="primary-button">{t("wallet.request")}</button></form></Modal>}
  {exchangeOpen && coins && <Modal title={language === "bn" ? "কয়েন এক্সচেঞ্জ" : "Exchange coins"} onClose={() => setExchangeOpen(false)}><form className="auth-form" onSubmit={exchangeCoins}><div className="wallet-exchange-summary"><Coins size={24} /><div><small>{language === "bn" ? "বর্তমান ব্যালেন্স" : "Coin balance"}</small><strong>{Number(coins.balance).toLocaleString()} coins</strong></div></div><div className="field"><label>{language === "bn" ? `এক্সচেঞ্জ কয়েন · সর্বনিম্ন ${coins.minimum_exchange}` : `Coins to exchange · minimum ${coins.minimum_exchange}`}</label><input className="input" type="number" min={coins.minimum_exchange} max={Number(coins.balance)} step={1} value={coinAmount} onChange={(event) => setCoinAmount(event.target.value)} required /></div><div className="wallet-exchange-rate">{coins.coins_per_currency_unit} coins = {format(1)} · {language === "bn" ? "ওয়ালেটে পাবেন" : "you receive"} {format(Number(coinAmount || 0) / Number(coins.coins_per_currency_unit))}</div><button className="primary-button"><ArrowRightLeft size={18} />{language === "bn" ? "ওয়ালেটে এক্সচেঞ্জ করুন" : "Exchange to wallet"}</button></form></Modal>}
  </AppShell>;
}

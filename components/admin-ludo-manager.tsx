"use client";

import { Ban, Check, Clock3, Edit3, Eye, EyeOff, FileCheck2, ImageIcon, LoaderCircle, Plus, RefreshCw, RotateCcw, Save, Trash2, Trophy, UsersRound, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatMoney } from "@/lib/money";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TournamentStatus = "draft" | "open" | "full" | "ongoing" | "completed" | "cancelled";
type ProofStatus = "pending" | "approved" | "rejected" | "resubmit";

interface Tournament {
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
  status: TournamentStatus;
  starts_at: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface Proof {
  id: string;
  tournament_id: string;
  entry_id: string;
  user_id: string;
  ludo_username: string;
  screenshot_path: string;
  status: ProofStatus;
  admin_note: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}

interface TournamentForm {
  title_en: string;
  title_bn: string;
  description_en: string;
  description_bn: string;
  rules_en: string;
  rules_bn: string;
  max_players: string;
  entry_fee: string;
  prize_amount: string;
  status: "draft" | "open" | "ongoing";
  starts_at: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm: TournamentForm = {
  title_en: "",
  title_bn: "",
  description_en: "",
  description_bn: "",
  rules_en: "",
  rules_bn: "",
  max_players: "2",
  entry_fee: "0",
  prize_amount: "0",
  status: "draft",
  starts_at: "",
  sort_order: "0",
  is_active: false,
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function AdminProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !path) return;
    void supabase.storage.from("job-proofs").createSignedUrl(path, 300).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);

  return <div className="admin-ludo-proof-image">{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Ludo win proof" /></a> : <ImageIcon size={30} />}</div>;
}

export function AdminLudoManager({ currency }: { currency: string }) {
  const { language } = useI18n();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [section, setSection] = useState<"tournaments" | "proofs">("tournaments");
  const [form, setForm] = useState<TournamentForm>(emptyForm);
  const [editing, setEditing] = useState<Tournament | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const money = (value: number | string) => formatMoney(Number(value), currency, language);
  const tournamentById = useMemo(() => new Map(tournaments.map((item) => [item.id, item])), [tournaments]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setMessage({ type: "error", text: "Supabase is not available." }); setLoading(false); return; }
    setLoading(true);
    const [tournamentResult, proofResult] = await Promise.all([
      supabase.from("ludo_tournaments").select("id,title_en,title_bn,description_en,description_bn,rules_en,rules_bn,max_players,participant_count,entry_fee,prize_amount,status,starts_at,sort_order,is_active,created_at").order("sort_order").order("created_at", { ascending: false }),
      supabase.from("ludo_proofs").select("id,tournament_id,entry_id,user_id,ludo_username,screenshot_path,status,admin_note,created_at,profiles!ludo_proofs_user_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = tournamentResult.error || proofResult.error;
    if (firstError) setMessage({ type: "error", text: firstError.message });
    setTournaments((tournamentResult.data as unknown as Tournament[]) ?? []);
    setProofs((proofResult.data as unknown as Proof[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage(null);
  };

  const startEdit = (item: Tournament) => {
    setEditing(item);
    setForm({
      title_en: item.title_en,
      title_bn: item.title_bn ?? "",
      description_en: item.description_en ?? "",
      description_bn: item.description_bn ?? "",
      rules_en: item.rules_en,
      rules_bn: item.rules_bn ?? "",
      max_players: String(item.max_players),
      entry_fee: String(item.entry_fee),
      prize_amount: String(item.prize_amount),
      status: ["open", "ongoing"].includes(item.status) ? item.status as "open" | "ongoing" : "draft",
      starts_at: toLocalDateTime(item.starts_at),
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    });
    setShowForm(true);
    setMessage(null);
  };

  const saveTournament = async (event: FormEvent) => {
    event.preventDefault();
    const title = form.title_en.trim();
    const rules = form.rules_en.trim();
    const maxPlayers = Number(form.max_players);
    const entryFee = Number(form.entry_fee);
    const prize = Number(form.prize_amount);
    if (!title || !rules || !Number.isInteger(maxPlayers) || maxPlayers < 2 || entryFee < 0 || prize < 0) {
      setMessage({ type: "error", text: "Add a title, rules, at least 2 players, and valid entry/prize amounts." });
      return;
    }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setSaving(true); setMessage(null);
    const locked = Boolean(editing && editing.participant_count > 0);
    const payload = {
      title_en: title,
      title_bn: form.title_bn.trim() || null,
      description_en: form.description_en.trim() || null,
      description_bn: form.description_bn.trim() || null,
      rules_en: rules,
      rules_bn: form.rules_bn.trim() || null,
      max_players: locked ? editing!.max_players : maxPlayers,
      entry_fee: locked ? Number(editing!.entry_fee) : entryFee,
      prize_amount: locked ? Number(editing!.prize_amount) : prize,
      status: editing && ["full", "completed", "cancelled"].includes(editing.status) ? editing.status : form.status,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const result = editing
      ? await supabase.from("ludo_tournaments").update(payload).eq("id", editing.id)
      : await supabase.from("ludo_tournaments").insert(payload);
    setSaving(false);
    if (result.error) { setMessage({ type: "error", text: result.error.message }); return; }
    setMessage({ type: "success", text: editing ? "Tournament updated." : "Tournament created." });
    setShowForm(false); setEditing(null); setForm(emptyForm);
    await load();
  };

  const toggleVisible = async (item: Tournament) => {
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusyId(item.id); setMessage(null);
    const { error } = await supabase.from("ludo_tournaments").update({ is_active: !item.is_active }).eq("id", item.id);
    setBusyId(null);
    if (error) setMessage({ type: "error", text: error.message }); else await load();
  };

  const deleteTournament = async (item: Tournament) => {
    if (item.participant_count > 0) { setMessage({ type: "error", text: "A tournament with joined players cannot be deleted. Cancel it to refund players instead." }); return; }
    if (!window.confirm(`Delete “${item.title_en}”?`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusyId(item.id);
    const { error } = await supabase.from("ludo_tournaments").delete().eq("id", item.id);
    setBusyId(null);
    if (error) setMessage({ type: "error", text: error.message }); else { setMessage({ type: "success", text: "Tournament deleted." }); await load(); }
  };

  const cancelTournament = async (item: Tournament) => {
    if (!window.confirm(`Cancel “${item.title_en}” and refund every joined player's captured entry fee?`)) return;
    const reason = window.prompt("Cancellation reason (shown in the audit log):", "Tournament cancelled by admin")?.trim();
    if (reason === undefined) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusyId(item.id); setMessage(null);
    const { error } = await supabase.rpc("admin_cancel_ludo_tournament", { p_tournament_id: item.id, p_reason: reason || "Tournament cancelled by admin" });
    setBusyId(null);
    if (error) setMessage({ type: "error", text: error.message }); else { setMessage({ type: "success", text: "Tournament cancelled and entry fees refunded." }); await load(); }
  };

  const startMatch = async (item: Tournament) => {
    if (!window.confirm(`Start “${item.title_en}” now? Players will be able to submit win proof.`)) return;
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusyId(item.id); setMessage(null);
    const { error } = await supabase.from("ludo_tournaments").update({ status: "ongoing" }).eq("id", item.id).eq("status", "full");
    setBusyId(null);
    if (error) setMessage({ type: "error", text: error.message }); else { setMessage({ type: "success", text: "Match started." }); await load(); }
  };

  const reviewProof = async (proof: Proof, action: "approve" | "reject" | "resubmit") => {
    const tournament = tournamentById.get(proof.tournament_id);
    if (action === "approve" && !window.confirm(`Approve this proof and pay ${tournament ? money(tournament.prize_amount) : "the prize"} to the winner?`)) return;
    let note = "";
    if (action !== "approve") {
      const value = window.prompt(action === "resubmit" ? "Tell the player what to fix:" : "Rejection note:", "");
      if (value === null) return;
      note = value.trim();
    }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusyId(proof.id); setMessage(null);
    const { error } = await supabase.rpc("admin_review_ludo_proof", { p_proof_id: proof.id, p_action: action, p_note: note || null });
    setBusyId(null);
    if (error) setMessage({ type: "error", text: error.message }); else { setMessage({ type: "success", text: `Proof ${action === "approve" ? "approved and prize paid" : action === "reject" ? "rejected" : "sent back for resubmission"}.` }); await load(); }
  };

  const pendingCount = proofs.filter((proof) => proof.status === "pending").length;

  return <div className="admin-ludo-manager">
    <div className="admin-ludo-toolbar">
      <div><span className="admin-ludo-kicker">TASKORA GAMING</span><h2><Trophy size={23} /> Ludo Tournaments</h2><p>Create matches, set rules and prizes, and review winning screenshots.</p></div>
      <button type="button" className="secondary-button compact" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "ludo-spin" : ""} /> Refresh</button>
    </div>

    <div className="admin-ludo-tabs">
      <button type="button" className={section === "tournaments" ? "active" : ""} onClick={() => setSection("tournaments")}><Trophy size={17} /> Tournaments <span>{tournaments.length}</span></button>
      <button type="button" className={section === "proofs" ? "active" : ""} onClick={() => setSection("proofs")}><FileCheck2 size={17} /> Win Proofs {pendingCount > 0 && <span className="pending">{pendingCount}</span>}</button>
    </div>

    {message && <div className={`form-message ${message.type}`}><button type="button" aria-label="Dismiss" onClick={() => setMessage(null)}><X size={15} /></button>{message.text}</div>}

    {section === "tournaments" && <>
      <div className="admin-ludo-section-head"><div><h3>Tournament list</h3><p>Only active tournaments are promoted to users.</p></div><button type="button" className="primary-button compact" onClick={startCreate}><Plus size={17} /> New Tournament</button></div>

      {showForm && <form className="admin-ludo-form" onSubmit={saveTournament}>
        <div className="admin-ludo-form-head"><div><strong>{editing ? "Edit tournament" : "Create tournament"}</strong><small>{editing?.participant_count ? "Player, entry-fee and prize fields are locked after the first join." : "You can publish it when the match is ready."}</small></div><button type="button" className="icon-button" onClick={() => { setShowForm(false); setEditing(null); }}><X size={18} /></button></div>
        <div className="admin-ludo-form-grid">
          <label><span>Title (English)</span><input value={form.title_en} onChange={(e) => setForm((old) => ({ ...old, title_en: e.target.value }))} maxLength={120} required /></label>
          <label><span>Title (Bangla)</span><input value={form.title_bn} onChange={(e) => setForm((old) => ({ ...old, title_bn: e.target.value }))} maxLength={120} /></label>
          <label className="wide"><span>Description (English)</span><textarea value={form.description_en} onChange={(e) => setForm((old) => ({ ...old, description_en: e.target.value }))} rows={2} /></label>
          <label className="wide"><span>Description (Bangla)</span><textarea value={form.description_bn} onChange={(e) => setForm((old) => ({ ...old, description_bn: e.target.value }))} rows={2} /></label>
          <label className="wide"><span>Match rules (English)</span><textarea value={form.rules_en} onChange={(e) => setForm((old) => ({ ...old, rules_en: e.target.value }))} rows={4} required /></label>
          <label className="wide"><span>Match rules (Bangla)</span><textarea value={form.rules_bn} onChange={(e) => setForm((old) => ({ ...old, rules_bn: e.target.value }))} rows={4} /></label>
          <label><span>Max players</span><input type="number" min="2" max="100" step="1" disabled={Boolean(editing?.participant_count)} value={form.max_players} onChange={(e) => setForm((old) => ({ ...old, max_players: e.target.value }))} required /></label>
          <label><span>Entry fee ({currency})</span><input type="number" min="0" step="0.01" disabled={Boolean(editing?.participant_count)} value={form.entry_fee} onChange={(e) => setForm((old) => ({ ...old, entry_fee: e.target.value }))} required /></label>
          <label><span>Prize ({currency})</span><input type="number" min="0" step="0.01" disabled={Boolean(editing?.participant_count)} value={form.prize_amount} onChange={(e) => setForm((old) => ({ ...old, prize_amount: e.target.value }))} required /></label>
          <label><span>Starts at</span><input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((old) => ({ ...old, starts_at: e.target.value }))} /></label>
          <label><span>Status</span><select value={form.status} disabled={Boolean(editing && ["full","completed","cancelled"].includes(editing.status))} onChange={(e) => setForm((old) => ({ ...old, status: e.target.value as TournamentForm["status"] }))}><option value="draft">Draft</option><option value="open">Open</option><option value="ongoing">Ongoing</option></select></label>
          <label><span>Sort order</span><input type="number" step="1" value={form.sort_order} onChange={(e) => setForm((old) => ({ ...old, sort_order: e.target.value }))} /></label>
          <label className="admin-ludo-check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((old) => ({ ...old, is_active: e.target.checked }))} /><span>Visible to users</span></label>
        </div>
        <div className="admin-ludo-form-actions"><button type="button" className="secondary-button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle size={17} className="ludo-spin" /> : <Save size={17} />}{saving ? "Saving…" : "Save Tournament"}</button></div>
      </form>}

      <div className="admin-ludo-list">
        {loading ? <div className="admin-empty-state"><LoaderCircle className="ludo-spin" size={28} /><p>Loading tournaments…</p></div> : tournaments.length ? tournaments.map((item) => <article className="admin-ludo-card" key={item.id}>
          <div className="admin-ludo-card-main"><div className="admin-ludo-card-title"><span className={`admin-ludo-state ${item.status}`}>{item.status}</span>{item.is_active ? <span className="admin-ludo-visible"><Eye size={13} /> Visible</span> : <span className="admin-ludo-hidden"><EyeOff size={13} /> Hidden</span>}</div><h3>{item.title_en}</h3>{item.title_bn && <p>{item.title_bn}</p>}<div className="admin-ludo-meta"><span><UsersRound size={14} /> {item.participant_count}/{item.max_players}</span><span>Entry {money(item.entry_fee)}</span><span>Prize {money(item.prize_amount)}</span>{item.starts_at && <span><Clock3 size={14} /> {new Date(item.starts_at).toLocaleString()}</span>}</div></div>
          <div className="admin-ludo-card-actions"><button type="button" title="Edit" onClick={() => startEdit(item)}><Edit3 size={16} /> Edit</button><button type="button" title={item.is_active ? "Hide" : "Show"} disabled={busyId === item.id} onClick={() => void toggleVisible(item)}>{item.is_active ? <EyeOff size={16} /> : <Eye size={16} />}{item.is_active ? "Hide" : "Show"}</button>{item.status === "full" && <button type="button" disabled={busyId === item.id} onClick={() => void startMatch(item)}><Trophy size={16} /> Start Match</button>}{item.participant_count > 0 && !["completed","cancelled"].includes(item.status) && <button type="button" className="danger-soft" disabled={busyId === item.id} onClick={() => void cancelTournament(item)}><Ban size={16} /> Cancel & Refund</button>}<button type="button" className="danger-soft" disabled={busyId === item.id || item.participant_count > 0} onClick={() => void deleteTournament(item)}><Trash2 size={16} /> Delete</button></div>
        </article>) : <div className="admin-empty-state"><Trophy size={34} /><h3>No Ludo tournaments yet</h3><p>Create the first match and choose when it becomes visible.</p></div>}
      </div>
    </>}

    {section === "proofs" && <div className="admin-ludo-proof-list">
      {loading ? <div className="admin-empty-state"><LoaderCircle className="ludo-spin" size={28} /><p>Loading proofs…</p></div> : proofs.length ? proofs.map((proof) => {
        const tournament = tournamentById.get(proof.tournament_id);
        return <article className="admin-ludo-proof-card" key={proof.id}><AdminProofImage path={proof.screenshot_path} /><div className="admin-ludo-proof-body"><div className="admin-ludo-proof-head"><span className={`admin-ludo-state ${proof.status}`}>{proof.status}</span><time>{new Date(proof.created_at).toLocaleString()}</time></div><h3>{tournament?.title_en ?? "Ludo Tournament"}</h3><p><strong>Player:</strong> {proof.profiles?.full_name || proof.user_id.slice(0, 8)} · <strong>Ludo username:</strong> {proof.ludo_username}</p>{tournament && <p><strong>Prize:</strong> {money(tournament.prize_amount)}</p>}{proof.admin_note && <div className="admin-ludo-proof-note">Admin note: {proof.admin_note}</div>}<div className="admin-ludo-proof-actions">{proof.status === "pending" && <><button type="button" className="approve" disabled={busyId === proof.id} onClick={() => void reviewProof(proof,"approve")}><Check size={16} /> Approve & Pay</button><button type="button" disabled={busyId === proof.id} onClick={() => void reviewProof(proof,"resubmit")}><RotateCcw size={16} /> Resubmit</button><button type="button" className="danger-soft" disabled={busyId === proof.id} onClick={() => void reviewProof(proof,"reject")}><X size={16} /> Reject</button></>}</div></div></article>;
      }) : <div className="admin-empty-state"><FileCheck2 size={34} /><h3>No win proofs yet</h3><p>Player submissions will appear here for review.</p></div>}
    </div>}
  </div>;
}

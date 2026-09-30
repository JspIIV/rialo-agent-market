"use client";

import { useMemo, useState } from "react";
import { X, Castle, ScrollText, Scale, Gavel, AlertTriangle, ShieldX, ShieldAlert, BadgeCheck, Flag } from "lucide-react";
import clsx from "clsx";
import * as E from "@/lib/diplomacy/engine";
import { useAgents } from "@/context/AgentsContext";
import { enclaveInputFromAgent, useDiplomacy, type Verdict } from "@/context/DiplomacyContext";
import { useWallet } from "@/context/WalletContext";

export const inputCls = "w-full bg-[#161616] border border-white/15 rounded-lg px-3 py-2 text-base sm:text-sm placeholder:text-ink-muted outline-none focus:border-rialo-600/60 transition-all";
export const labelCls = "text-xs text-ink-secondary";
export const btnPrimary = "px-4 py-2 bg-gradient-to-r from-rialo-400 to-rialo-500 hover:from-rialo-300 hover:to-rialo-400 text-black rounded-lg text-sm font-semibold transition-all disabled:opacity-40";
export const btnGhost = "px-4 py-2 border border-white/10 hover:border-white/30 rounded-lg text-sm text-ink-secondary hover:text-white transition-all";

export function Modal({ title, icon: Icon, onClose, children, wide }: {
  title: string; icon: React.FC<{ className?: string }>; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div className={clsx("w-full rounded-2xl border border-[#2e2a20] bg-[#111] p-5 space-y-4 shadow-2xl my-auto", wide ? "max-w-3xl" : "max-w-lg")}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2"><Icon className="w-5 h-5 text-rialo-400" />{title}</h2>
          <button onClick={onClose} className="text-ink-secondary hover:text-white" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --- Found a sovereignty -------------------------------------------------------
export function FoundModal({ onClose }: { onClose: () => void }) {
  const { agents } = useAgents();
  const { world, found } = useDiplomacy();
  const { balance } = useWallet();
  const free = agents.filter(a => a.active && !world.enclaves.some(e => e.agentId === a.id));
  const [agentId, setAgentId] = useState<string>("");
  const [f, setF] = useState({ name: "", archetype: "Autonomous Arbiter" as E.Archetype, charter: "", collateral: "100", treasury: "200" });
  const agent = free.find(a => String(a.id) === agentId);
  const cost = (Number(f.collateral) || 0) + (Number(f.treasury) || 0);

  function pickAgent(id: string) {
    setAgentId(id);
    const a = free.find(x => String(x.id) === id);
    if (a) {
      const base = enclaveInputFromAgent(a, 0, 0);
      setF(prev => ({ ...prev, name: a.name, archetype: base.archetype, charter: base.charter }));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const collateral = Number(f.collateral), treasury = Number(f.treasury);
    const input = agent
      ? { ...enclaveInputFromAgent(agent, collateral, treasury), name: f.name, archetype: f.archetype, charter: f.charter }
      : { name: f.name, archetype: f.archetype, charter: f.charter, collateral, treasury };
    if (found(input)) onClose();
  }

  return (
    <Modal title="Found a sovereignty" icon={Castle} onClose={onClose}>
      <p className="text-xs text-ink-secondary leading-relaxed">
        An enclave is an agent that has posted collateral and written a charter. Link one of your marketplace agents so other
        agents can hire it under service treaties, or found a sovereign that only signs and litigates.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <label className={labelCls}>Marketplace agent (optional)</label>
          <select className={clsx(inputCls, "bg-[#0A0A0A]")} value={agentId} onChange={e => pickAgent(e.target.value)}>
            <option value="">None: a sovereign without an endpoint</option>
            {free.map(a => <option key={a.id} value={a.id}>{a.name} · {a.capabilities.join(", ")} · {a.price} RIALO/call</option>)}
          </select>
          {free.length === 0 && <p className="text-[11px] text-ink-muted">Every agent already governs an enclave. Register a new one on the Agents page to link it.</p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Name</label>
            <input className={inputCls} required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Meridian" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Archetype</label>
            <select className={clsx(inputCls, "bg-[#0A0A0A]")} value={f.archetype} onChange={e => setF({ ...f, archetype: e.target.value as E.Archetype })}>
              {E.ARCHETYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Charter: the governance philosophy counterparties read</label>
          <textarea rows={2} className={clsx(inputCls, "resize-none")} required value={f.charter} onChange={e => setF({ ...f, charter: e.target.value })}
            placeholder="We sign with anyone of good standing and answer breaches in the tribunal." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Collateral (min {E.MIN_ENCLAVE_COLLATERAL}, locked)</label>
            <input type="number" min={E.MIN_ENCLAVE_COLLATERAL} className={inputCls} value={f.collateral} onChange={e => setF({ ...f, collateral: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Treasury (bonds and fees)</label>
            <input type="number" min={0} className={inputCls} value={f.treasury} onChange={e => setF({ ...f, treasury: e.target.value })} />
          </div>
        </div>
        <div className="text-xs text-ink-secondary">Costs <span className="text-rialo-400 font-medium">{cost} RIALO</span> from your wallet ({balance} available).</div>
        <div className="flex gap-2 pt-1">
          <button type="submit" className={btnPrimary} disabled={cost > balance || !f.name.trim()}>Found enclave</button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// --- Propose a treaty ------------------------------------------------------------
export function ProposeModal({ from, to, onClose }: { from?: string; to?: string; onClose: () => void }) {
  const { world, propose } = useDiplomacy();
  const mine = world.enclaves.filter(e => e.owner === "you" && e.status === "active");
  const [proposer, setProposer] = useState(from ?? mine[0]?.id ?? "");
  const [counterparty, setCounterparty] = useState(to ?? "");
  const [kind, setKind] = useState<E.TreatyKind>("SERVICE");
  const [bond, setBond] = useState("20");
  const [minutes, setMinutes] = useState("15");
  const [fee, setFee] = useState("");
  const [calls, setCalls] = useState("3");
  const [terms, setTerms] = useState("");
  const others = world.enclaves.filter(e => e.id !== proposer && e.status === "active");
  const me = world.enclaves.find(e => e.id === proposer);
  const peer = world.enclaves.find(e => e.id === counterparty);
  const feeValue = fee === "" ? (peer?.price ?? 3) : Number(fee);

  function suggest(k = kind, p = peer) {
    if (me && p) setTerms(k === "SERVICE" ? E.composeTerms(k, p, me) : E.composeTerms(k, me, p));
  }

  // What the counterparty's decider would say to this offer, before it is sent.
  const preview = useMemo(() => {
    if (!me || !peer || peer.owner === "you") return null;
    const t: E.Treaty = {
      id: 0, kind, terms, partyA: me.id, partyB: peer.id, bondA: Number(bond) || 0, bondB: 0,
      feePerCall: kind === "SERVICE" ? feeValue : 0, callBudget: 0, calls: [], durationMs: (Number(minutes) || 0) * 60_000,
      proposedAt: 0, status: "proposed", elevatedSlashedA: false, elevatedSlashedB: false,
    };
    return E.evaluateProposal(world, t, peer.id);
  }, [world, me, peer, kind, terms, bond, minutes, feeValue]);

  if (!mine.length) {
    return (
      <Modal title="Propose a treaty" icon={ScrollText} onClose={onClose}>
        <p className="text-sm text-ink-secondary">Treaties are signed by sovereigns. Found an enclave first, then propose from it.</p>
        <button onClick={onClose} className={btnGhost}>Close</button>
      </Modal>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = propose({
      proposer, counterparty, kind, terms, bond: Number(bond), durationMs: Number(minutes) * 60_000,
      feePerCall: kind === "SERVICE" ? feeValue : undefined, maxCalls: kind === "SERVICE" ? Number(calls) : undefined,
    });
    if (ok) onClose();
  }

  const escrow = (Number(bond) || 0) + (kind === "SERVICE" ? feeValue * (Number(calls) || 0) : 0);
  return (
    <Modal title="Propose a treaty" icon={ScrollText} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>From (your enclave)</label>
            <select className={clsx(inputCls, "bg-[#0A0A0A]")} value={proposer} onChange={e => setProposer(e.target.value)}>
              {mine.map(e => <option key={e.id} value={e.id}>{e.name} · {e.treasury} RIALO</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>To</label>
            <select className={clsx(inputCls, "bg-[#0A0A0A]")} required value={counterparty}
              onChange={e => { setCounterparty(e.target.value); suggest(kind, world.enclaves.find(x => x.id === e.target.value)); }}>
              <option value="" disabled>Choose a sovereign</option>
              {others.map(e => <option key={e.id} value={e.id}>{e.name} · {e.archetype} · rep {e.reputation}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {E.TREATY_KINDS.map(k => (
            <button type="button" key={k} onClick={() => { setKind(k); suggest(k); }}
              disabled={k === "SERVICE" && !!peer && !peer.endpoint}
              className={clsx("px-3 py-1.5 rounded-lg text-xs border transition-all disabled:opacity-30",
                kind === k ? "border-rialo-400/60 bg-rialo-400/10 text-rialo-300" : "border-white/10 text-ink-secondary hover:text-white")}>
              {E.KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {kind === "SERVICE" && (
          <p className="text-[11px] text-ink-secondary -mt-1">You hire {peer?.name ?? "the counterparty"}: every call goes to its real endpoint and pays the fee from a prepaid budget.</p>
        )}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Terms: the clause the tribunal will read</label>
            <button type="button" className="text-[11px] text-rialo-400 hover:text-rialo-300" onClick={() => suggest()}>Draft for me</button>
          </div>
          <textarea rows={3} required className={clsx(inputCls, "resize-none")} value={terms} onChange={e => setTerms(e.target.value)} />
        </div>
        <div className={clsx("grid gap-3", kind === "SERVICE" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
          <div className="space-y-1"><label className={labelCls}>Bond (each side)</label><input type="number" min={1} className={inputCls} value={bond} onChange={e => setBond(e.target.value)} /></div>
          <div className="space-y-1"><label className={labelCls}>Duration (min)</label><input type="number" min={1} max={1440} className={inputCls} value={minutes} onChange={e => setMinutes(e.target.value)} /></div>
          {kind === "SERVICE" && <>
            <div className="space-y-1"><label className={labelCls}>Fee / call</label><input type="number" min={0.5} step={0.5} className={inputCls} placeholder={String(peer?.price ?? 3)} value={fee} onChange={e => setFee(e.target.value)} /></div>
            <div className="space-y-1"><label className={labelCls}>Calls</label><input type="number" min={1} max={20} className={inputCls} value={calls} onChange={e => setCalls(e.target.value)} /></div>
          </>}
        </div>
        <div className="text-xs text-ink-secondary">Locks <span className="text-rialo-400 font-medium">{E.r2(escrow)} RIALO</span> from {me?.name}&apos;s treasury in Rialo escrow.</div>
        {preview && (
          <div className={clsx("rounded-lg border px-3 py-2 text-[11px] leading-relaxed", preview.accept ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300/90" : "border-red-500/25 bg-red-500/5 text-red-300/90")}>
            <span className="font-medium">{peer?.name}&apos;s decider would {preview.accept ? "ratify" : "reject"} this:</span> {preview.reasons.join("; ")}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="submit" className={btnPrimary} disabled={!counterparty || !terms.trim()}>Propose treaty</button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// --- Dispute: the bilateral adjudication matrix -----------------------------------------
function corridorNote(bps: number | null): string {
  if (bps === null) return "No objective metric: a full sanction needs evidence the tribunal can read.";
  if (bps >= E.BPS_ELEVATED) return `≥ ${E.BPS_ELEVATED / 100}%: the record corroborates a breach, so this filing can never be ruled malicious.`;
  if (bps < E.BPS_NEGLIGIBLE) return `< ${E.BPS_NEGLIGIBLE / 100}%: negligible. No slash is possible whatever the evidence says.`;
  return `Below ${E.BPS_ELEVATED / 100}%: a full sanction is impossible; at most a 25% slash, and only with evidence.`;
}

export function DisputeModal({ treatyId, onClose }: { treatyId: number; onClose: () => void }) {
  const { world, now, fileDispute } = useDiplomacy();
  const t = world.treaties.find(x => x.id === treatyId);
  const mine = t ? [t.partyA, t.partyB].filter(id => world.enclaves.find(e => e.id === id)?.owner === "you") : [];
  const [plaintiff, setPlaintiff] = useState(mine[0] ?? "");
  const [allegation, setAllegation] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  if (!t || !plaintiff) return null;
  const p = world.enclaves.find(e => e.id === plaintiff)!;
  const defendantId = plaintiff === t.partyA ? t.partyB : t.partyA;
  const d = world.enclaves.find(e => e.id === defendantId)!;
  const bps = E.defendantMetricBps(t, defendantId);
  const bond = E.requiredDisputeBond(p.reputation);
  const failed = t.calls.filter(c => !c.ok).length;
  const cooling = t.lastDisputeAt && now - t.lastDisputeAt < E.DISPUTE_COOLDOWN_MS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onClose();
    await fileDispute(treatyId, plaintiff, allegation, evidence.trim());
    setBusy(false);
  }

  return (
    <Modal title="Initiate bilateral adjudication" icon={Scale} onClose={onClose} wide>
      <p className="text-xs text-ink-secondary leading-relaxed">
        A dispute has two halves. The left column is what you assert; the right is what the protocol measures on its own and
        what the tribunal is bound by. GenLayer validators read both, and settlement of the RIALO escrow follows their tier.
      </p>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="text-[11px] font-semibold tracking-widest text-ink-secondary">PLAINTIFF ASSERTS</div>
          {mine.length > 1 && (
            <select className={clsx(inputCls, "bg-[#0A0A0A]")} value={plaintiff} onChange={e => setPlaintiff(e.target.value)}>
              {mine.map(id => <option key={id} value={id}>{world.enclaves.find(e => e.id === id)?.name}</option>)}
            </select>
          )}
          <div className="text-sm"><span className="text-ink-secondary">Filing party: </span>{p.name}</div>
          <div className="space-y-1">
            <label className={labelCls}>Allegation</label>
            <textarea rows={3} required className={clsx(inputCls, "resize-none")} value={allegation} onChange={e => setAllegation(e.target.value)}
              placeholder={`${d.name} broke the covenant by...`} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Evidence URL (https, optional)</label>
            <input className={inputCls} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="https://..." />
            <p className="text-[10px] text-ink-muted">Its SHA-256 is committed when you file. Validators only admit it if it still hashes the same.</p>
          </div>
        </div>
        <div className="rounded-xl border border-rialo-600/20 bg-rialo-600/[0.04] p-4 space-y-2.5 text-sm">
          <div className="text-[11px] font-semibold tracking-widest text-rialo-300/70">PROTOCOL MEASURES</div>
          <div><span className="text-ink-secondary">Defendant: </span>{d.name} <span className="text-ink-muted">({defendantId === t.partyA ? "party_a" : "party_b"})</span></div>
          <div className="text-xs text-ink-secondary bg-white/[0.03] rounded-lg p-2.5 leading-relaxed max-h-24 overflow-y-auto">&ldquo;{t.terms}&rdquo;</div>
          <div>
            <span className="text-ink-secondary">Service record: </span>
            {t.kind === "SERVICE" && defendantId === t.partyB
              ? <>{failed} of {t.calls.length} calls failed{bps !== null ? <> · <span className="text-rialo-300 font-medium">{bps} bps</span></> : <span className="text-ink-muted"> (needs {E.MIN_CALLS_FOR_METRIC}+ calls)</span>}</>
              : t.kind === "SERVICE" ? <>hiring party: payment is prepaid, measures 0 bps</> : <>none for a {E.KIND_LABEL[t.kind].toLowerCase()} treaty</>}
          </div>
          <div className="text-xs text-ink-secondary flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rialo-400" />{corridorNote(bps)}</div>
          <div><span className="text-ink-secondary">Dispute bond: </span><span className="text-rialo-300 font-medium">{bond} RIALO</span> <span className="text-ink-muted text-xs">(scales with your reputation {p.reputation})</span></div>
          <div className="text-[11px] text-ink-muted">Malicious report forfeits the bond. Normal returns it minus {E.VALIDATION_FEE}. Critical breach pays you both bonds and sanctions {d.name}.</div>
        </div>
        <div className="md:col-span-2 flex gap-2 items-center">
          <button type="submit" className={btnPrimary} disabled={busy || !allegation.trim() || p.treasury < bond || !!cooling}>
            <Gavel className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />File with the tribunal
          </button>
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          {p.treasury < bond && <span className="text-xs text-red-300">Treasury {p.treasury} is below the bond.</span>}
          {cooling && <span className="text-xs text-amber-300">One dispute per minute on a treaty.</span>}
        </div>
      </form>
    </Modal>
  );
}

// --- Verdict ------------------------------------------------------------------------------
export const TIER_STYLE: Record<E.Tier, string> = {
  CRITICAL_BREACH: "text-red-400 border-red-500/30 bg-red-500/10",
  ELEVATED_RISK: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  NORMAL: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  MALICIOUS_REPORT: "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10",
};

// Each tier reads differently at a glance: colour, icon and one plain line.
const TIER_META: Record<E.Tier, { icon: React.FC<{ className?: string }>; bar: string; line: string }> = {
  CRITICAL_BREACH: { icon: ShieldX, bar: "#E5484D", line: "Breach proven: the defendant's bond goes to the plaintiff and the enclave is sanctioned." },
  ELEVATED_RISK: { icon: ShieldAlert, bar: "#FB923C", line: "Partial breach: 25% of the defendant's bond is slashed; the treaty stays in force." },
  NORMAL: { icon: BadgeCheck, bar: "#34D399", line: "No breach found: the case is dismissed and the filing bond returned minus the fee." },
  MALICIOUS_REPORT: { icon: Flag, bar: "#C084FC", line: "Frivolous filing: the plaintiff's dispute bond is forfeited to reserves." },
};

export function VerdictModal({ verdict, onClose }: { verdict: Verdict; onClose: () => void }) {
  const { world } = useDiplomacy();
  const name = (id: string) => world.enclaves.find(e => e.id === id)?.name ?? id;
  return (
    <Modal title={`Tribunal verdict · treaty #${verdict.treatyId}`} icon={Gavel} onClose={onClose}>
      {(() => {
        const { icon: TierIcon, bar, line } = TIER_META[verdict.tier];
        return (
          <div className={clsx("rounded-xl border overflow-hidden text-center", TIER_STYLE[verdict.tier])}>
            <div className="h-1" style={{ background: bar }} />
            <div className="px-4 py-3">
              <TierIcon className="w-6 h-6 mx-auto mb-1" />
              <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Verdict tier</div>
              <div className="text-2xl font-display font-bold mt-0.5">{E.TIER_LABEL[verdict.tier]}</div>
              <div className="text-xs mt-1 opacity-90">{line}</div>
            </div>
          </div>
        );
      })()}
      <div className="text-sm space-y-2">
        <div><span className="text-ink-secondary">{name(verdict.plaintiff)}</span> v. <span className="text-ink-secondary">{name(verdict.defendant)}</span></div>
        <p className="text-ink-primary leading-relaxed">{verdict.rationale}</p>
        <div className="text-xs text-ink-secondary bg-white/[0.03] rounded-lg px-3 py-2">{verdict.settlement}</div>
        <div className="text-[11px] text-ink-muted flex items-center gap-2 flex-wrap">
          ruled by {verdict.by}
          {verdict.metricBps !== null && <span>· metric {verdict.metricBps} bps</span>}
          {verdict.txHash && (
            <a className="text-rialo-400 underline" target="_blank" rel="noreferrer" href={`https://explorer-studio.genlayer.com/tx/${verdict.txHash}`}>on-chain tx ↗</a>
          )}
        </div>
        {verdict.by === "local rule" && (
          <p className="text-[11px] text-amber-300/70">GenLayer was not reachable, so a deterministic local rule decided on the service record alone. It reads no evidence.</p>
        )}
      </div>
      <button onClick={onClose} className={btnPrimary}>Close</button>
    </Modal>
  );
}

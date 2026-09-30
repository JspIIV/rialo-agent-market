"use client";

import { useState } from "react";
import clsx from "clsx";
import { Castle, ScrollText, Radio, Gavel, Coins, LogOut, Check, X, Undo2, Zap, Loader2 } from "lucide-react";
import * as E from "@/lib/diplomacy/engine";
import { useDiplomacy } from "@/context/DiplomacyContext";
import { timeAgo } from "@/context/AgentsContext";
import { BIOME_BY_ARCHETYPE, KIND_COLOR, STATUS_COLOR, STATUS_LABEL } from "./board/world";
import { TIER_STYLE, btnGhost, btnPrimary } from "./modals";

export const panelCls = "rounded-2xl border border-[#262626] bg-[#0d0d0d]/92 backdrop-blur-sm";

function remaining(ms: number) {
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

const STATUS_PILL: Record<E.TreatyStatus, string> = {
  proposed: "text-amber-300 bg-amber-500/10",
  active: "text-emerald-300 bg-emerald-500/10",
  settled: "text-white/50 bg-white/5",
  expired: "text-white/40 bg-white/5",
  cancelled: "text-white/40 bg-white/5",
  rejected: "text-red-300 bg-red-500/10",
};

export function EnclaveDirectory({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { world, statusOf } = useDiplomacy();
  const sorted = [...world.enclaves].sort((a, b) => Number(b.owner === "you") - Number(a.owner === "you") || b.reputation - a.reputation);
  return (
    <div className="space-y-1">
      {sorted.map(e => {
        const st = statusOf(e.id);
        const live = E.treatiesOf(world, e.id).filter(t => t.status === "active").length;
        return (
          <button key={e.id} onClick={() => onSelect(e.id)}
            className={clsx("w-full text-left rounded-lg px-2.5 py-2 transition-all flex items-center gap-2.5 border",
              selectedId === e.id ? "border-rialo-400/40 bg-rialo-400/[0.07]" : "border-transparent hover:bg-white/[0.04]")}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[st], boxShadow: `0 0 8px ${STATUS_COLOR[st]}` }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm truncate">{e.name}{e.owner === "you" && <span className="text-rialo-400 text-[10px] ml-1.5">YOURS</span>}</span>
              <span className="block text-[10px] text-white/35 truncate">{e.archetype} · {live} active</span>
            </span>
            <span className="text-right shrink-0">
              <span className="block text-xs font-mono">{e.reputation}</span>
              <span className="block text-[9px] text-white/30">rep</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const LEDGER_DOT: Partial<Record<E.LedgerKind, string>> = {
  "treaty-signed": "#34d399", "treaty-proposed": "#f59e0b", "treaty-rejected": "#ef4444", verdict: "#e8b44f",
  sanction: "#ef4444", "service-call": "#38bdf8", "realm-founded": "#a78bfa", "dispute-opened": "#f59e0b",
};

export function Ledger({ limit = 14 }: { limit?: number }) {
  const { world } = useDiplomacy();
  return (
    <div className="space-y-1.5">
      {world.ledger.slice(0, limit).map(ev => (
        <div key={ev.id} className="flex gap-2 text-[11px] leading-snug">
          <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: LEDGER_DOT[ev.kind] ?? "#737373" }} />
          <span className="text-white/60 min-w-0">{ev.text} <span className="text-white/25">· {timeAgo(ev.ts)}</span></span>
        </div>
      ))}
      {world.ledger.length === 0 && <div className="text-xs text-white/30">Nothing has happened yet.</div>}
    </div>
  );
}

export function EnclaveDossier({ id, onSelectTreaty, onPropose }: {
  id: string; onSelectTreaty: (id: number) => void; onPropose: (to?: string, from?: string) => void;
}) {
  const { world, statusOf, claim, withdraw } = useDiplomacy();
  const e = world.enclaves.find(x => x.id === id);
  if (!e) return null;
  const st = statusOf(e.id);
  const biome = BIOME_BY_ARCHETYPE[e.archetype];
  const treaties = E.treatiesOf(world, e.id).filter(t => t.status === "active" || t.status === "proposed");
  const locked = E.r2(treaties.reduce((s, t) => s + (t.partyA === e.id ? t.bondA + t.callBudget : t.bondB), 0));
  const history = world.disputes.filter(d => d.plaintiff === e.id || d.defendant === e.id).slice(0, 4);
  const mine = e.owner === "you";
  const haveEnclave = world.enclaves.some(x => x.owner === "you" && x.status === "active");

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-white/10"
          style={{ background: `linear-gradient(135deg, ${biome.accent}55, ${biome.base})` }}>
          <Castle className="w-5 h-5 text-white/80" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{e.name}</div>
          <div className="text-[11px] text-white/40">{e.archetype}{e.capability ? ` · sells ${e.capability} at ${e.price} RIALO/call` : " · no endpoint"}</div>
          <div className="text-[10px] font-semibold tracking-widest mt-0.5" style={{ color: STATUS_COLOR[st] }}>{STATUS_LABEL[st]}{mine ? " · YOURS" : e.owner === "autonomous" ? " · AUTONOMOUS" : ""}</div>
        </div>
      </div>
      <p className="text-xs text-white/55 italic leading-relaxed">&ldquo;{e.charter}&rdquo;</p>
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]"><span className="text-white/40">Reputation</span><span className="font-mono">{e.reputation}/100</span></div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-rialo-600 to-rialo-300" style={{ width: `${e.reputation}%` }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        {[["Collateral", e.collateral], ["Treasury", e.treasury], ["Locked in treaties", locked], ["Claimable", e.claimable]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-white/[0.04] py-2">
            <div className="text-sm font-semibold font-mono">{v as number}</div>
            <div className="text-[10px] text-white/35">{k as string}</div>
          </div>
        ))}
      </div>
      {mine && (
        <div className="flex gap-2 flex-wrap">
          <button className={clsx(btnPrimary, "text-xs px-3 py-1.5")} disabled={e.claimable <= 0} onClick={() => claim(e.id)}>
            <Coins className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Claim {e.claimable || ""}
          </button>
          <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} disabled={e.treasury <= 0} onClick={() => withdraw(e.id, e.treasury)}>
            Withdraw to wallet
          </button>
          <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} onClick={() => onPropose(undefined, e.id)}>Propose treaty</button>
        </div>
      )}
      {!mine && e.status === "active" && (
        <button className={clsx(btnPrimary, "text-xs px-3 py-1.5 w-full")} onClick={() => onPropose(e.id)}>
          {haveEnclave ? `Propose a treaty to ${e.name}` : "Found an enclave to sign with them"}
        </button>
      )}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold tracking-widest text-white/35">TREATIES</div>
        {treaties.length === 0 && <div className="text-xs text-white/30">No live treaties.</div>}
        {treaties.map(t => {
          const other = world.enclaves.find(x => x.id === (t.partyA === e.id ? t.partyB : t.partyA));
          return (
            <button key={t.id} onClick={() => onSelectTreaty(t.id)} className="w-full text-left rounded-lg bg-white/[0.03] hover:bg-white/[0.06] px-2.5 py-2 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: KIND_COLOR[t.kind] }} />
              <span className="flex-1 min-w-0 truncate">#{t.id} {E.KIND_LABEL[t.kind]} {t.partyA === e.id ? "→" : "←"} {other?.name}</span>
              <span className={clsx("px-1.5 py-0.5 rounded text-[10px]", STATUS_PILL[t.status])}>{t.status}</span>
            </button>
          );
        })}
      </div>
      {history.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold tracking-widest text-white/35">TRIBUNAL RECORD</div>
          {history.map(d => (
            <div key={d.id} className={clsx("rounded-lg border px-2.5 py-1.5 text-[11px]", TIER_STYLE[d.tier])}>
              {E.TIER_LABEL[d.tier]} · {d.plaintiff === e.id ? "as plaintiff" : "as defendant"} · treaty #{d.treatyId}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TreatyInspector({ id, onSelectEnclave, onDispute }: {
  id: number; onSelectEnclave: (id: string) => void; onDispute: (id: number) => void;
}) {
  const { world, now, busyTreaties, pendingDisputes, ratify, reject, cancel, exit, invoke } = useDiplomacy();
  const [rejectNote, setRejectNote] = useState<string | null>(null);
  const t = world.treaties.find(x => x.id === id);
  if (!t) return null;
  const a = world.enclaves.find(e => e.id === t.partyA)!;
  const b = world.enclaves.find(e => e.id === t.partyB)!;
  const aMine = a.owner === "you", bMine = b.owner === "you";
  const bps = E.defendantMetricBps(t, t.partyB);
  const failed = t.calls.filter(c => !c.ok).length;
  const busy = busyTreaties.has(t.id);
  const underReview = pendingDisputes.has(t.id);
  const disputes = world.disputes.filter(d => d.treatyId === t.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText className="w-4 h-4" style={{ color: KIND_COLOR[t.kind] }} />
        <span className="font-semibold">Treaty #{t.id} · {E.KIND_LABEL[t.kind]}</span>
        <span className={clsx("ml-auto px-1.5 py-0.5 rounded text-[10px]", STATUS_PILL[t.status])}>{t.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[[a, t.bondA, t.kind === "SERVICE" ? "hires" : "party_a"], [b, t.bondB, t.kind === "SERVICE" ? "serves" : "party_b"]].map(([e, bond, role]) => {
          const en = e as E.Enclave;
          return (
            <button key={en.id} onClick={() => onSelectEnclave(en.id)} className="rounded-lg bg-white/[0.04] hover:bg-white/[0.07] p-2 text-left">
              <div className="text-[10px] text-white/35">{role as string}</div>
              <div className="font-medium truncate">{en.name}{en.owner === "you" && <span className="text-rialo-400"> ◆</span>}</div>
              <div className="text-white/50 font-mono">{bond as number} bonded</div>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-white/60 bg-white/[0.03] rounded-lg p-2.5 leading-relaxed">&ldquo;{t.terms}&rdquo;</div>
      <div className="text-[11px] text-white/45 space-y-0.5">
        {t.status === "active" && t.expiresAt && <div>Expires in {remaining(t.expiresAt - now)}</div>}
        {t.status === "proposed" && <div>Proposed {timeAgo(t.proposedAt)}, awaiting {b.name}</div>}
        {t.kind === "SERVICE" && <div>{t.feePerCall} RIALO per call · {t.callBudget} RIALO budget left ({Math.floor(t.callBudget / (t.feePerCall || 1))} calls)</div>}
        {t.decisionNote && <div className="text-white/35">Decision: {t.decisionNote}</div>}
      </div>

      {t.kind === "SERVICE" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold tracking-widest text-white/35">SERVICE RECORD</span>
            <span className="text-white/50">{failed}/{t.calls.length} failed{bps !== null ? ` · ${bps} bps` : ""}</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {t.calls.slice().reverse().map((c, i) => (
              <div key={i} className="text-[10px] font-mono bg-white/[0.03] rounded px-2 py-1 flex gap-2">
                <span className={c.ok ? "text-emerald-400" : "text-red-400"}>{c.ok ? "OK " : "ERR"}</span>
                <span className="text-white/50 truncate flex-1">{c.output}</span>
                <span className="text-white/30 shrink-0">{c.ms}ms</span>
              </div>
            ))}
            {t.calls.length === 0 && <div className="text-[11px] text-white/30">No calls yet.</div>}
          </div>
        </div>
      )}

      {underReview && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />GenLayer validators are deliberating...
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {t.status === "proposed" && bMine && rejectNote === null && <>
          <button className={clsx(btnPrimary, "text-xs px-3 py-1.5")} onClick={() => ratify(t.id)}><Check className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Ratify ({t.bondA})</button>
          <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} onClick={() => setRejectNote("")}><X className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Reject</button>
        </>}
        {t.status === "proposed" && bMine && rejectNote !== null && (
          <div className="w-full flex gap-2">
            <input autoFocus className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none" placeholder="Why?" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            <button className={clsx(btnGhost, "text-xs px-3 py-1")} onClick={() => { reject(t.id, rejectNote || "declined"); setRejectNote(null); }}>Send</button>
          </div>
        )}
        {t.status === "proposed" && aMine && (
          <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} onClick={() => cancel(t.id)}><Undo2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Withdraw proposal</button>
        )}
        {t.status === "active" && aMine && t.kind === "SERVICE" && (
          <button className={clsx(btnPrimary, "text-xs px-3 py-1.5")} disabled={busy || !E.canInvoke(t)} onClick={() => invoke(t.id)}>
            {busy ? <Loader2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
            Call {b.name}
          </button>
        )}
        {t.status === "active" && (aMine || bMine) && !underReview && (
          <button className={clsx(btnGhost, "text-xs px-3 py-1.5 hover:text-red-300")} onClick={() => onDispute(t.id)}><Gavel className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />File dispute</button>
        )}
        {t.status === "active" && (aMine || bMine) && (
          <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} onClick={() => exit(t.id, aMine ? a.id : b.id)}><LogOut className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Exit (−{E.EXIT_PENALTY_BPS / 100}%)</button>
        )}
        {!aMine && !bMine && (t.status === "active" || t.status === "proposed") && (
          <div className="text-[11px] text-white/35 flex items-center gap-1.5"><Radio className="w-3 h-3" />Autonomous treaty: the parties act on their own.</div>
        )}
      </div>

      {disputes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold tracking-widest text-white/35">DISPUTES</div>
          {disputes.map(d => (
            <div key={d.id} className={clsx("rounded-lg border px-2.5 py-2 text-[11px] space-y-0.5", TIER_STYLE[d.tier])}>
              <div className="font-medium">{E.TIER_LABEL[d.tier]} · {d.by}</div>
              <div className="opacity-80">{d.settlement}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { Castle, ScrollText, Globe2, Gavel, Landmark, Bot, Pause, Play, X, ChevronLeft, ChevronRight, Info } from "lucide-react";
import * as E from "@/lib/diplomacy/engine";
import { useDiplomacy } from "@/context/DiplomacyContext";
import { useWallet } from "@/context/WalletContext";
import { timeAgo } from "@/context/AgentsContext";
import { DisputeModal, FoundModal, ProposeModal, TIER_STYLE, VerdictModal, btnGhost, btnPrimary } from "./modals";
import { EnclaveDirectory, EnclaveDossier, Ledger, TreatyInspector, panelCls } from "./panels";

// WebGL is browser-only: the board never renders on the server.
const Board = dynamic(() => import("./board/Board"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.3em] text-rialo-400/80 font-mono animate-pulse">
      RAISING THE ARCHIPELAGO...
    </div>
  ),
});

type View = "world" | "tribunal" | "treasury";

export default function DiplomacyApp() {
  const d = useDiplomacy();
  const { world } = d;
  const [view, setView] = useState<View>("world");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [treaty, setTreaty] = useState<number | null>(null);
  const [foundOpen, setFoundOpen] = useState(false);
  const [propose, setPropose] = useState<{ to?: string; from?: string } | null>(null);
  const [disputeFor, setDisputeFor] = useState<number | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [about, setAbout] = useState(false);

  const escrow = E.lockedEscrow(world);
  const active = world.treaties.filter(t => t.status === "active").length;
  const haveEnclave = world.enclaves.some(e => e.owner === "you");
  const modalOpen = foundOpen || !!propose || disputeFor !== null || !!d.latestVerdict || about;

  function selectEnclave(id: string | null) {
    setSelected(id);
    setTreaty(null);
    if (id) setFocus(id);
  }
  function selectTreaty(id: number) {
    setTreaty(id);
    setSelected(null);
  }
  function openPropose(to?: string, from?: string) {
    if (!haveEnclave) setFoundOpen(true);
    else setPropose({ to, from });
  }

  const detail = treaty !== null
    ? <TreatyInspector id={treaty} onSelectEnclave={selectEnclave} onDispute={setDisputeFor} />
    : selected
      ? <EnclaveDossier id={selected} onSelectTreaty={selectTreaty} onPropose={openPropose} />
      : null;

  return (
    <div className="fixed inset-x-0 top-16 bottom-0 z-30 bg-[#060606] text-[#F5F0E6] overflow-hidden">
      {view === "world" && (
        <Board world={world} statusOf={d.statusOf} busyTreaties={d.busyTreaties} escrow={escrow}
          hoveredId={hovered} selectedId={selected} focusId={focus} selectedTreaty={treaty} showLabels={!modalOpen}
          onHover={setHovered} onSelect={selectEnclave} onSelectTreaty={selectTreaty} />
      )}

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 px-3 sm:px-4 pt-3 pointer-events-none">
        <div className={clsx(panelCls, "pointer-events-auto flex items-center gap-2 sm:gap-3 px-3 py-2 flex-wrap")}>
          <div className="flex items-center gap-2 mr-1">
            <Globe2 className="w-4 h-4 text-rialo-400" />
            <span className="font-display font-semibold">Agent Diplomacy</span>
            <button onClick={() => setAbout(true)} className="text-white/35 hover:text-white" aria-label="About"><Info className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex bg-white/[0.04] rounded-lg p-0.5">
            {([["world", "World", Globe2], ["tribunal", "Tribunal", Gavel], ["treasury", "Treasury", Landmark]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setView(v)}
                className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all",
                  view === v ? "bg-rialo-400/15 text-rialo-300" : "text-white/50 hover:text-white")}>
                <Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="hidden lg:flex items-center gap-4 text-[11px] text-white/45 font-mono">
            <span><span className="text-white/80">{world.enclaves.length}</span> enclaves</span>
            <span><span className="text-white/80">{active}</span> active treaties</span>
            <span><span className="text-rialo-300">{escrow}</span> RIALO in escrow</span>
            <span><span className="text-white/80">{world.disputes.length}</span> verdicts</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => d.setAutonomous(!d.autonomous)}
              className={clsx("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all",
                d.autonomous ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10" : "border-white/10 text-white/50")}
              title="Autonomous agents propose, ratify, call each other, litigate and claim on their own">
              <Bot className="w-3.5 h-3.5" />{d.autonomous ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span className="hidden sm:inline">Agents {d.autonomous ? "on" : "paused"}</span>
            </button>
            <button onClick={() => openPropose()} className={clsx(btnGhost, "text-xs px-2.5 py-1.5 flex items-center gap-1.5")}>
              <ScrollText className="w-3.5 h-3.5" /><span className="hidden sm:inline">Propose</span>
            </button>
            <button onClick={() => setFoundOpen(true)} className={clsx(btnPrimary, "text-xs px-2.5 py-1.5 flex items-center gap-1.5")}>
              <Castle className="w-3.5 h-3.5" /><span className="hidden sm:inline">Found enclave</span>
            </button>
          </div>
        </div>
      </div>

      {view === "world" && <>
        {/* Left: directory + ledger */}
        <div className={clsx("absolute z-10 top-[4.5rem] bottom-4 left-3 sm:left-4 w-64 flex-col gap-3 transition-transform hidden md:flex",
          !leftOpen && "-translate-x-[calc(100%+1rem)]")}>
          <div className={clsx(panelCls, "p-3 flex-1 min-h-0 flex flex-col")}>
            <div className="text-[11px] font-semibold tracking-widest text-white/35 mb-2">SOVEREIGNS</div>
            <div className="overflow-y-auto min-h-0"><EnclaveDirectory selectedId={selected} onSelect={selectEnclave} /></div>
          </div>
          <div className={clsx(panelCls, "p-3 h-[38%] flex flex-col")}>
            <div className="text-[11px] font-semibold tracking-widest text-white/35 mb-2">LEDGER</div>
            <div className="overflow-y-auto min-h-0"><Ledger /></div>
          </div>
          <button onClick={() => setLeftOpen(!leftOpen)} aria-label="Toggle panel"
            className={clsx(panelCls, "absolute top-1/2 -right-7 w-6 h-10 flex items-center justify-center text-white/50 hover:text-white")}>
            {leftOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Right (desktop) / bottom sheet (mobile): the selection */}
        {detail && (
          <div className={clsx(panelCls, "absolute z-10 p-4 overflow-y-auto",
            "inset-x-3 bottom-3 max-h-[55%] md:inset-x-auto md:right-4 md:top-[4.5rem] md:bottom-4 md:max-h-none md:w-80")}>
            <button onClick={() => { setSelected(null); setTreaty(null); setFocus(null); }} className="absolute top-3 right-3 text-white/35 hover:text-white" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
            {detail}
          </div>
        )}

        {!detail && !haveEnclave && (
          <div className={clsx(panelCls, "absolute z-10 bottom-4 left-1/2 -translate-x-1/2 px-4 py-3 text-xs text-white/60 max-w-md text-center w-[calc(100%-1.5rem)]")}>
            The marketplace&apos;s agents already govern these islands and sign with each other on their own.
            <button onClick={() => setFoundOpen(true)} className="text-rialo-400 hover:text-rialo-300 ml-1">Found your own enclave</button> to join them.
          </div>
        )}
      </>}

      {view === "tribunal" && <TribunalView />}
      {view === "treasury" && <TreasuryView onFound={() => setFoundOpen(true)} />}

      {d.toast && (
        <div className="absolute z-[130] top-[4.75rem] left-1/2 -translate-x-1/2 rounded-lg border border-red-500/30 bg-[#1a0d0d] px-4 py-2 text-xs text-red-200 flex items-center gap-3 shadow-xl max-w-[90%]">
          {d.toast}
          <button onClick={d.dismissToast} aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {foundOpen && <FoundModal onClose={() => setFoundOpen(false)} />}
      {propose && <ProposeModal from={propose.from} to={propose.to} onClose={() => setPropose(null)} />}
      {disputeFor !== null && <DisputeModal treatyId={disputeFor} onClose={() => setDisputeFor(null)} />}
      {d.latestVerdict && <VerdictModal verdict={d.latestVerdict} onClose={d.dismissVerdict} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}

function TribunalView() {
  const { world } = useDiplomacy();
  const name = (id: string) => world.enclaves.find(e => e.id === id)?.name ?? id;
  const count = (t: E.Tier) => world.disputes.filter(x => x.tier === t).length;
  return (
    <div className="absolute inset-0 top-[4.5rem] overflow-y-auto px-3 sm:px-4 pb-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {E.TIERS.map(t => (
            <div key={t} className={clsx("rounded-xl border px-3 py-2.5", TIER_STYLE[t])}>
              <div className="text-2xl font-display font-bold">{count(t)}</div>
              <div className="text-[11px] opacity-80">{E.TIER_LABEL[t]}</div>
            </div>
          ))}
        </div>
        {world.disputes.length === 0 && (
          <div className={clsx(panelCls, "p-8 text-center text-sm text-white/40")}>No disputes have been adjudicated yet. When a hired agent keeps failing its calls, its employer will file here on its own.</div>
        )}
        {world.disputes.map(v => (
          <div key={v.id} className={clsx(panelCls, "p-4 space-y-2")}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx("px-2 py-0.5 rounded border text-[11px] font-semibold", TIER_STYLE[v.tier])}>{E.TIER_LABEL[v.tier]}</span>
              <span className="text-sm">{name(v.plaintiff)} <span className="text-white/35">v.</span> {name(v.defendant)}</span>
              <span className="text-[11px] text-white/35 ml-auto">treaty #{v.treatyId} · {timeAgo(v.ts)}</span>
            </div>
            <div className="text-xs text-white/50"><span className="text-white/30">Allegation: </span>{v.allegation}</div>
            <p className="text-sm text-white/75 leading-relaxed">{v.rationale}</p>
            <div className="text-[11px] text-white/45 flex gap-3 flex-wrap">
              <span>{v.settlement}</span>
              <span>· bond {v.bond}</span>
              {v.metricBps !== null && <span>· metric {v.metricBps} bps</span>}
              <span>· {v.by}</span>
              {v.txHash && <a className="text-rialo-400 underline" target="_blank" rel="noreferrer" href={`https://explorer-studio.genlayer.com/tx/${v.txHash}`}>tx ↗</a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreasuryView({ onFound }: { onFound: () => void }) {
  const { world, claim, withdraw } = useDiplomacy();
  const { balance } = useWallet();
  const mine = world.enclaves.filter(e => e.owner === "you");
  const collateral = E.r2(world.enclaves.reduce((s, e) => s + e.collateral, 0));
  const claimable = E.r2(world.enclaves.reduce((s, e) => s + e.claimable, 0));
  return (
    <div className="absolute inset-0 top-[4.5rem] overflow-y-auto px-3 sm:px-4 pb-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[["Collateral", collateral], ["Locked in treaties", E.lockedEscrow(world)], ["Awaiting claim", claimable], ["Protocol reserves", world.reserves]].map(([k, v]) => (
            <div key={k as string} className={clsx(panelCls, "px-3 py-2.5")}>
              <div className="text-xl font-display font-bold text-rialo-300">{v as number}</div>
              <div className="text-[11px] text-white/40">{k as string} (RIALO)</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40 leading-relaxed">
          Settlement is pull-over-push: a verdict or an expiry only credits an enclave&apos;s claimable balance, and the enclave
          moves it into its treasury itself. Reserves collect slashes, validation fees and exit penalties. Rialo is on devnet,
          so these balances are simulated in your browser. The tribunal runs on GenLayer when it is configured.
        </p>
        <div className={clsx(panelCls, "p-4 space-y-3")}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Your enclaves</div>
            <div className="text-xs text-white/40">Wallet: <span className="text-rialo-300">{balance} RIALO</span></div>
          </div>
          {mine.length === 0 && (
            <div className="text-sm text-white/40">You govern no enclave yet. <button onClick={onFound} className="text-rialo-400">Found one</button> to sign treaties and hire other agents.</div>
          )}
          {mine.map(e => (
            <div key={e.id} className="flex items-center gap-3 flex-wrap rounded-lg bg-white/[0.03] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{e.name}</div>
                <div className="text-[11px] text-white/40">{e.status === "sanctioned" ? "SANCTIONED · " : ""}rep {e.reputation} · collateral {e.collateral}</div>
              </div>
              <div className="text-xs font-mono text-white/60">treasury {e.treasury} · claimable {e.claimable}</div>
              <button className={clsx(btnPrimary, "text-xs px-3 py-1.5")} disabled={e.claimable <= 0} onClick={() => claim(e.id)}>Claim</button>
              <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} disabled={e.treasury <= 0} onClick={() => withdraw(e.id, e.treasury)}>Withdraw</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  const { reset } = useDiplomacy();
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#2e2a20] bg-[#111] p-5 space-y-3 text-sm text-white/70 leading-relaxed" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-lg text-white flex items-center gap-2"><Globe2 className="w-5 h-5 text-rialo-400" />Agent Diplomacy</h2>
        <p>The marketplace is where people hire agents. This is where agents deal with each other. Every agent is a sovereign
          enclave that posts RIALO collateral and signs treaties in plain language, backed by a bond from each side.</p>
        <p><span className="text-rialo-300">Service contracts</span> let one agent hire another: its calls go to the other agent&apos;s real endpoint and
          pay a fee per success out of a prepaid budget. <span className="text-cyan-300">Data sharing</span> and <span className="text-emerald-300">non-aggression</span> treaties
          bind conduct without payment.</p>
        <p>When a party alleges a breach, a GenLayer validator quorum reads the covenant, the evidence and the defendant&apos;s service record and
          agrees on one of four tiers. The RIALO escrow settles from that tier.</p>
        <p className="text-xs text-white/40">The protocol, the four tiers and the board are adapted from Westphalia by moltaphet (MIT). Escrow runs on
          Rialo instead of GEN on GenLayer, which only hosts the tribunal.</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={btnPrimary}>Close</button>
          <button onClick={() => { if (confirm("Reset the archipelago to its seeded state?")) { reset(); onClose(); } }} className={btnGhost}>Reset world</button>
        </div>
      </div>
    </div>
  );
}

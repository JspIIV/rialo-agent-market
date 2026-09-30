"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { Castle, ScrollText, Globe2, Gavel, Landmark, Bot, X, ChevronLeft, ChevronRight, Info, MoreHorizontal, Users, Map as MapIcon, List as ListIcon } from "lucide-react";
import * as E from "@/lib/diplomacy/engine";
import { useDiplomacy } from "@/context/DiplomacyContext";
import { useWallet } from "@/context/WalletContext";
import { timeAgo } from "@/context/AgentsContext";
import { DisputeModal, FoundModal, ProposeModal, TIER_STYLE, VerdictModal, btnGhost, btnPrimary } from "./modals";
import { EnclaveDirectory, EnclaveDossier, Ledger, TreatyInspector, panelCls } from "./panels";
import { KIND_COLOR } from "./board/world";

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
type MobilePanel = "directory" | "ledger" | null;

const TOUR_KEY = "am_diplomacy_onboarded";

const TABS = [["world", "World", Globe2], ["tribunal", "Tribunal", Gavel], ["treasury", "Treasury", Landmark]] as const;

// What the colours on the board mean. Always on screen in the World view.
function Legend({ highlight, className }: { highlight: boolean; className?: string }) {
  const items: [string, React.ReactNode][] = [
    ["Service", <span key="s" className="w-4 h-0.5 rounded-full" style={{ background: KIND_COLOR.SERVICE }} />],
    ["Data", <span key="d" className="w-4 h-0.5 rounded-full" style={{ background: KIND_COLOR.DATA_SHARING }} />],
    ["Non-aggression", <span key="n" className="w-4 h-0.5 rounded-full" style={{ background: KIND_COLOR.NON_AGGRESSION }} />],
    ["Proposed", <span key="p" className="w-4 h-0.5 rounded-full opacity-40" style={{ background: KIND_COLOR.SERVICE }} />],
    ["Under tribunal", <span key="t" className="w-2.5 h-2.5 rounded-full border border-amber-400 bg-amber-400/25" />],
    ["Sanctioned", <span key="x" className="w-2.5 h-2.5 border border-red-400" />],
    ["Rialo escrow", <span key="e" className="w-2.5 h-2.5 rounded-full bg-rialo-400" />],
  ];
  return (
    <div className={clsx("flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#0A0A0A]/85 border border-[#2A2A2A] overflow-x-auto no-scrollbar transition-shadow",
      highlight && "ring-2 ring-rialo-400 shadow-[0_0_24px_rgba(232,180,79,0.35)]", className)}>
      {items.map(([label, swatch]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-ink-secondary whitespace-nowrap shrink-0">{swatch}{label}</span>
      ))}
    </div>
  );
}

// A switch, not a filter: it starts and pauses the autonomous agents.
function AutonomySwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
      title="When on, the agents propose, ratify, call each other, litigate and claim by themselves"
      className="flex items-center gap-2 text-xs text-ink-secondary hover:text-ink-primary whitespace-nowrap">
      <span className={clsx("relative w-9 h-5 rounded-full transition-colors", on ? "bg-emerald-500/70" : "bg-white/15")}>
        <span className={clsx("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <Bot className="w-3.5 h-3.5" /><span className="md:hidden xl:inline">Autonomous agents</span><span className="hidden md:inline xl:hidden">Agents</span>
    </button>
  );
}

const TOUR = [
  { title: "This is the agent archipelago", body: "Each island is an enclave: one of the marketplace's agents acting as a sovereign. It posts RIALO collateral, writes a charter, and signs treaties with the others. The gold hub in the middle is the Rialo escrow that holds every treaty bond." },
  { title: "Arcs are living treaties", body: "Gold: one agent hired another, and each call goes to its real endpoint. Cyan: they share data. Green: they agreed not to undercut each other. A faint arc is still a proposal. An amber dome means a dispute is before the tribunal; a red cage means the enclave was sanctioned." },
  { title: "Click an island or an arc", body: "An island opens its dossier: charter, reputation, balances and treaties. An arc opens the treaty: its terms, bonds and service record. A GenLayer tribunal decides disputes with one of four verdicts: Normal, Elevated risk, Critical breach or Malicious report." },
  { title: "Found an enclave to take part", body: "The agents already deal with each other on their own. Found your own enclave from your wallet to propose treaties, hire other agents, and sue when they break their word." },
];

function Tour({ step, onStep, onDone, onFound }: { step: number; onStep: (n: number) => void; onDone: () => void; onFound: () => void }) {
  const t = TOUR[step];
  return (
    <div className="fixed inset-0 z-[125] bg-black/50 flex items-end md:items-center justify-center p-4 pointer-events-none">
      <div role="dialog" aria-modal="true" aria-labelledby="tour-title"
        className="pointer-events-auto w-[min(420px,calc(100vw-32px))] rounded-2xl bg-[#101010] border border-[#2A2A2A] p-5 space-y-3 shadow-2xl mb-20 md:mb-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.16em] text-rialo-500">Step {step + 1} of {TOUR.length}</span>
          <button onClick={onDone} className="text-xs text-ink-muted hover:text-ink-primary">Skip</button>
        </div>
        <h2 id="tour-title" className="text-xl font-display font-semibold text-ink-primary">{t.title}</h2>
        <p className="text-sm text-ink-secondary leading-relaxed">{t.body}</p>
        <div className="flex items-center gap-2 pt-1">
          {step > 0 && <button onClick={() => onStep(step - 1)} className={clsx(btnGhost, "text-xs px-3 py-1.5")}>Back</button>}
          {step < TOUR.length - 1
            ? <button onClick={() => onStep(step + 1)} className={clsx(btnPrimary, "text-xs px-3 py-1.5")}>Next</button>
            : <>
                <button onClick={() => { onDone(); onFound(); }} className={clsx(btnPrimary, "text-xs px-3 py-1.5")}>Found an enclave</button>
                <button onClick={onDone} className={clsx(btnGhost, "text-xs px-3 py-1.5")}>Explore first</button>
              </>}
          <span className="ml-auto flex gap-1">
            {TOUR.map((_, i) => <span key={i} className={clsx("w-1.5 h-1.5 rounded-full", i === step ? "bg-rialo-400" : "bg-white/15")} />)}
          </span>
        </div>
      </div>
    </div>
  );
}

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [tour, setTour] = useState<number | null>(null);

  const escrow = E.lockedEscrow(world);
  const active = world.treaties.filter(t => t.status === "active").length;
  const haveEnclave = world.enclaves.some(e => e.owner === "you");
  const modalOpen = foundOpen || !!propose || disputeFor !== null || !!d.latestVerdict || about || tour !== null;

  // First visit: walk through the board once.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTour(0);
    } catch { /* storage unavailable: skip the tour */ }
  }, []);
  function endTour() {
    setTour(null);
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ }
  }

  function clearSelection() {
    setSelected(null);
    setTreaty(null);
    setFocus(null);
  }
  function selectEnclave(id: string | null) {
    setSelected(id);
    setTreaty(null);
    setMobilePanel(null);
    if (id) setFocus(id);
  }
  function selectTreaty(id: number) {
    setTreaty(id);
    setSelected(null);
    setMobilePanel(null);
  }
  function openPropose(to?: string, from?: string) {
    setMoreOpen(false);
    if (!haveEnclave) setFoundOpen(true);
    else setPropose({ to, from });
  }

  // Esc closes the top-most layer, then the selection.
  const esc = useRef<() => void>(() => {});
  esc.current = () => {
    if (tour !== null) endTour();
    else if (d.latestVerdict) d.dismissVerdict();
    else if (disputeFor !== null) setDisputeFor(null);
    else if (propose) setPropose(null);
    else if (foundOpen) setFoundOpen(false);
    else if (about) setAbout(false);
    else if (moreOpen) setMoreOpen(false);
    else if (mobilePanel) setMobilePanel(null);
    else clearSelection();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") esc.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const detail = treaty !== null
    ? <TreatyInspector id={treaty} onSelectEnclave={selectEnclave} onDispute={setDisputeFor} />
    : selected
      ? <EnclaveDossier id={selected} onSelectTreaty={selectTreaty} onPropose={openPropose} />
      : null;

  const stats = (
    <>
      <span><span className="text-ink-primary">{world.enclaves.length}</span> enclaves</span>
      <span><span className="text-ink-primary">{active}</span> active treaties</span>
      <span><span className="text-rialo-300">{escrow}</span> RIALO in escrow</span>
      <span><span className="text-ink-primary">{world.disputes.length}</span> verdicts</span>
    </>
  );

  return (
    <div className="dip fixed inset-x-0 top-16 bottom-0 z-30 bg-[#060606] text-ink-primary overflow-hidden">
      <div className="sr-only" aria-live="polite">
        {world.ledger.find(ev => ev.kind === "verdict" || ev.kind === "sanction")?.text}
      </div>
      {view === "world" && (
        <div role="application" aria-label="Agent archipelago: islands are agents, arcs are treaties" className="absolute inset-0 isolate z-0">
          <Board world={world} statusOf={d.statusOf} busyTreaties={d.busyTreaties} escrow={escrow}
            hoveredId={hovered} selectedId={selected} focusId={focus} selectedTreaty={treaty} showLabels={!modalOpen}
            interactive={!modalOpen} onHover={setHovered} onSelect={selectEnclave} onSelectTreaty={selectTreaty} />
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 px-3 sm:px-4 pt-3 pointer-events-none">
        <div className={clsx(panelCls, "pointer-events-auto flex items-center gap-2 sm:gap-3 px-3 py-2")}>
          <div className="hidden md:flex items-center gap-2 mr-1 whitespace-nowrap shrink-0">
            <Globe2 className="w-4 h-4 text-rialo-400" />
            <span className="font-display font-semibold">Agent Diplomacy</span>
            <button onClick={() => setAbout(true)} className="text-ink-muted hover:text-ink-primary" aria-label="About Agent Diplomacy"><Info className="w-3.5 h-3.5" /></button>
          </div>
          <div role="tablist" aria-label="Views" className="flex bg-[#161616] rounded-full p-0.5 shrink-0">
            {TABS.map(([v, label, Icon]) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={clsx("flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] transition-all",
                  view === v ? "bg-rialo-400 text-[#0A0A0A] font-medium" : "text-ink-secondary hover:text-ink-primary")}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          <div className="hidden 2xl:flex items-center gap-4 text-[12px] text-ink-secondary font-mono whitespace-nowrap">{stats}</div>
          <div className="ml-auto hidden md:flex items-center gap-3 whitespace-nowrap shrink-0">
            <AutonomySwitch on={d.autonomous} onChange={d.setAutonomous} />
            {/* One gold button per screen: the action that moves money. */}
            <button onClick={() => setFoundOpen(true)} className="h-8 px-3 rounded-lg border border-white/15 text-ink-secondary hover:text-ink-primary hover:bg-white/5 text-[13px] flex items-center gap-1.5">
              <Castle className="w-3.5 h-3.5" />Found enclave
            </button>
            <button onClick={() => openPropose()} className="h-8 px-3 rounded-lg bg-rialo-400 hover:bg-rialo-300 text-[#0A0A0A] font-medium text-[13px] flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5" />Propose treaty
            </button>
          </div>
          {/* Phones: everything but the tabs lives behind one button. */}
          <div className="ml-auto md:hidden relative">
            <button onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-label="More"
              className="h-8 w-8 rounded-full bg-[#161616] flex items-center justify-center text-ink-secondary">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <div className={clsx(panelCls, "absolute right-0 mt-2 w-64 p-3 space-y-3 z-30")}>
                <div className="flex flex-col gap-0.5 text-[12px] text-ink-secondary font-mono">{stats}</div>
                <AutonomySwitch on={d.autonomous} onChange={d.setAutonomous} />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setMoreOpen(false); setFoundOpen(true); }} className="h-11 rounded-lg border border-white/15 text-ink-secondary text-sm">Found enclave</button>
                  <button onClick={() => openPropose()} className="h-11 rounded-lg bg-rialo-400 text-[#0A0A0A] font-medium text-sm">Propose</button>
                </div>
                <button onClick={() => { setMoreOpen(false); setAbout(true); }} className="text-xs text-ink-secondary flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />About and tour</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {view === "world" && <>
        {/* Desktop left: directory + ledger */}
        <div className={clsx("absolute z-10 top-[4.5rem] bottom-4 left-3 sm:left-4 w-64 flex-col gap-3 transition-transform hidden md:flex",
          !leftOpen && "-translate-x-[calc(100%+1rem)]")}>
          <div className={clsx(panelCls, "p-3 flex-1 min-h-0 flex flex-col")}>
            <div className="text-[10px] uppercase tracking-[0.16em] text-rialo-500 mb-2">Sovereigns</div>
            <div className="overflow-y-auto min-h-0"><EnclaveDirectory selectedId={selected} onSelect={selectEnclave} /></div>
          </div>
          <div className={clsx(panelCls, "p-3 h-[40%] flex flex-col")}>
            <div className="text-[10px] uppercase tracking-[0.16em] text-rialo-500 mb-2">Ledger</div>
            <Ledger />
          </div>
          <button onClick={() => setLeftOpen(!leftOpen)} aria-label={leftOpen ? "Hide panel" : "Show panel"}
            className={clsx(panelCls, "absolute top-1/2 -right-7 w-6 h-10 flex items-center justify-center text-ink-secondary hover:text-ink-primary")}>
            {leftOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Selection: right panel on desktop, bottom sheet above the tab bar on phones */}
        {detail && (
          <div className={clsx(panelCls, "absolute z-10 p-4 overflow-y-auto",
            "inset-x-3 bottom-[4.5rem] max-h-[58%] md:inset-x-auto md:right-4 md:top-[4.5rem] md:bottom-4 md:max-h-none md:w-80")}>
            <button onClick={clearSelection} className="absolute top-3 right-3 text-ink-muted hover:text-ink-primary" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
            {detail}
          </div>
        )}

        {/* Phones: directory or ledger sheet */}
        {!detail && mobilePanel && (
          <div className={clsx(panelCls, "md:hidden absolute z-10 inset-x-3 bottom-[4.5rem] max-h-[58%] p-4 flex flex-col")}>
            <div className="text-[10px] uppercase tracking-[0.16em] text-rialo-500 mb-2">{mobilePanel === "directory" ? "Sovereigns" : "Ledger"}</div>
            <div className="overflow-y-auto min-h-0 flex flex-col">
              {mobilePanel === "directory" ? <EnclaveDirectory selectedId={selected} onSelect={selectEnclave} /> : <Ledger />}
            </div>
          </div>
        )}

        {/* Legend: bottom centre on desktop, above the tab bar on phones */}
        {!(detail || mobilePanel) && (
          <Legend highlight={tour === 1} className="absolute z-10 bottom-[4.5rem] md:bottom-4 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-[calc(100%-44rem)] xl:max-w-none" />
        )}

        {/* Phones: bottom tab bar */}
        <nav aria-label="Panels" className="md:hidden absolute z-20 bottom-0 inset-x-0 h-14 bg-[#0A0A0A]/95 border-t border-[#262626] grid grid-cols-3">
          {([["directory", "Directory", Users], [null, "Map", MapIcon], ["ledger", "Ledger", ListIcon]] as const).map(([panel, label, Icon]) => {
            const on = panel === null ? !mobilePanel && !detail : mobilePanel === panel;
            return (
              <button key={label} onClick={() => { clearSelection(); setMobilePanel(panel); }} aria-pressed={on}
                className={clsx("flex flex-col items-center justify-center gap-0.5 text-[11px]", on ? "text-rialo-400" : "text-ink-secondary")}>
                <Icon className="w-5 h-5" />{label}
              </button>
            );
          })}
        </nav>
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
      {about && <AboutModal onClose={() => setAbout(false)} onTour={() => { setAbout(false); setTour(0); }} />}
      {tour !== null && <Tour step={tour} onStep={setTour} onDone={endTour} onFound={() => setFoundOpen(true)} />}
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
          <div className={clsx(panelCls, "p-8 text-center text-sm text-ink-secondary")}>No disputes have been adjudicated yet. When a hired agent keeps failing its calls, its employer will file here on its own.</div>
        )}
        {world.disputes.map(v => (
          <div key={v.id} className={clsx(panelCls, "p-4 space-y-2")}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx("px-2 py-0.5 rounded border text-[11px] font-semibold", TIER_STYLE[v.tier])}>{E.TIER_LABEL[v.tier]}</span>
              <span className="text-sm">{name(v.plaintiff)} <span className="text-ink-muted">v.</span> {name(v.defendant)}</span>
              <span className="text-[11px] text-ink-muted ml-auto">treaty #{v.treatyId} · {timeAgo(v.ts)}</span>
            </div>
            <div className="text-xs text-ink-secondary"><span className="text-ink-muted">Allegation: </span>{v.allegation}</div>
            <p className="text-sm text-ink-primary leading-relaxed">{v.rationale}</p>
            <div className="text-[11px] text-ink-secondary flex gap-3 flex-wrap">
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
              <div className="text-[11px] text-ink-secondary">{k as string} (RIALO)</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">
          Settlement is pull-over-push: a verdict or an expiry only credits an enclave&apos;s claimable balance, and the enclave
          moves it into its treasury itself. Reserves collect slashes, validation fees and exit penalties. Rialo is on devnet,
          so these balances are simulated in your browser. The tribunal runs on GenLayer when it is configured.
        </p>
        <div className={clsx(panelCls, "p-4 space-y-3")}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Your enclaves</div>
            <div className="text-xs text-ink-secondary">Wallet: <span className="text-rialo-300">{balance} RIALO</span></div>
          </div>
          {mine.length === 0 && (
            <div className="text-sm text-ink-secondary">You govern no enclave yet. <button onClick={onFound} className="text-rialo-400">Found one</button> to sign treaties and hire other agents.</div>
          )}
          {mine.map(e => (
            <div key={e.id} className="flex items-center gap-3 flex-wrap rounded-lg bg-white/[0.03] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{e.name}</div>
                <div className="text-[11px] text-ink-secondary">{e.status === "sanctioned" ? "SANCTIONED · " : ""}rep {e.reputation} · collateral {e.collateral}</div>
              </div>
              <div className="text-xs font-mono text-ink-secondary">treasury {e.treasury} · claimable {e.claimable}</div>
              <button className={clsx(btnPrimary, "text-xs px-3 py-1.5")} disabled={e.claimable <= 0} onClick={() => claim(e.id)}>Claim</button>
              <button className={clsx(btnGhost, "text-xs px-3 py-1.5")} disabled={e.treasury <= 0} onClick={() => withdraw(e.id, e.treasury)}>Withdraw</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose, onTour }: { onClose: () => void; onTour: () => void }) {
  const { reset } = useDiplomacy();
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#2e2a20] bg-[#111] p-5 space-y-3 text-sm text-ink-primary leading-relaxed" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-lg text-white flex items-center gap-2"><Globe2 className="w-5 h-5 text-rialo-400" />Agent Diplomacy</h2>
        <p>The marketplace is where people hire agents. This is where agents deal with each other. Every agent is a sovereign
          enclave that posts RIALO collateral and signs treaties in plain language, backed by a bond from each side.</p>
        <p><span className="text-rialo-300">Service contracts</span> let one agent hire another: its calls go to the other agent&apos;s real endpoint and
          pay a fee per success out of a prepaid budget. <span className="text-cyan-300">Data sharing</span> and <span className="text-emerald-300">non-aggression</span> treaties
          bind conduct without payment.</p>
        <p>When a party alleges a breach, a GenLayer validator quorum reads the covenant, the evidence and the defendant&apos;s service record and
          agrees on one of four tiers. The RIALO escrow settles from that tier.</p>
        <p className="text-xs text-ink-secondary">The protocol, the four tiers and the board are adapted from Westphalia by moltaphet (MIT). Escrow runs on
          Rialo instead of GEN on GenLayer, which only hosts the tribunal.</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={btnPrimary}>Close</button>
          <button onClick={onTour} className={btnGhost}>Take the tour</button>
          <button onClick={() => { if (confirm("Reset the archipelago to its seeded state?")) { reset(); onClose(); } }} className={btnGhost}>Reset world</button>
        </div>
      </div>
    </div>
  );
}

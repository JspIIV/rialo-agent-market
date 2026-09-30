"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { useAgents, MOCK_AGENTS, type Agent } from "@/context/AgentsContext";
import { useWallet } from "@/context/WalletContext";
import { callAgentEndpoint } from "@/lib/agentCall";
import * as E from "@/lib/diplomacy/engine";
import type { VisualStatus } from "@/components/diplomacy/board/world";

const STORAGE_KEY = "am_diplomacy";
const AUTO_KEY = "am_diplomacy_auto";

export type Verdict = E.DisputeRecord;

type DiplomacyState = {
  world: E.World;
  now: number;
  autonomous: boolean;
  setAutonomous: (on: boolean) => void;
  pendingDisputes: Set<number>;
  busyTreaties: Set<number>;
  statusOf: (id: string) => VisualStatus;
  toast: string | null;
  dismissToast: () => void;
  latestVerdict: Verdict | null;
  dismissVerdict: () => void;
  found: (input: Omit<E.FoundInput, "owner">) => boolean;
  propose: (input: E.ProposeInput) => boolean;
  ratify: (id: number) => boolean;
  reject: (id: number, note: string) => boolean;
  cancel: (id: number) => boolean;
  exit: (id: number, by: string) => boolean;
  claim: (enclaveId: string) => boolean;
  withdraw: (enclaveId: string, amount: number) => boolean;
  invoke: (treatyId: number) => Promise<void>;
  fileDispute: (treatyId: number, plaintiff: string, allegation: string, evidenceUri: string) => Promise<void>;
  reset: () => void;
};

const DiplomacyContext = createContext<DiplomacyState | null>(null);

// Market agents become sovereigns: each governs an enclave, sells its
// capability under service treaties, and bonds what it signs.
function archetypeFor(capability: string): E.Archetype {
  if (capability === "data-analysis") return "Oracle Collective";
  if (capability === "translation") return "Liquidity Nexus";
  if (capability === "unit-tests" || capability === "code-review") return "Defense Vanguard";
  return "Autonomous Arbiter";
}

const CHARTER: Record<E.Archetype, string> = {
  "Oracle Collective": "We sell measurements and nothing else. Every figure we publish is fetched live, never estimated, and we bond our word on it.",
  "Liquidity Nexus": "We move meaning between parties. We take any fair contract, pay promptly, and litigate only on evidence.",
  "Autonomous Arbiter": "We judge, summarise and audit. Our charter is neutrality: we sign with anyone of good standing and walk away from bad faith.",
  "Defense Vanguard": "We test and we guard. Non-aggression first, service second, and we answer breaches in the tribunal, not in the market.",
};

export function enclaveInputFromAgent(a: Agent, collateral: number, treasury: number): Omit<E.FoundInput, "owner"> {
  const capability = a.capabilities[0];
  const archetype = archetypeFor(capability);
  return {
    name: a.name, archetype, charter: CHARTER[archetype], collateral, treasury,
    agentId: a.id, endpoint: a.endpoint, capability, price: a.price,
  };
}

function seedWorld(agents: Agent[], now: number): E.World {
  let w = E.emptyWorld();
  for (const a of agents) w = E.foundEnclave(w, { ...enclaveInputFromAgent(a, 200, 300), owner: "autonomous" }, now);
  // Two standing treaties so the archipelago opens with traffic on it.
  const id = (agentId: number) => w.enclaves.find(e => e.agentId === agentId)?.id;
  const oracle = id(2), translator = id(1), bitprice = id(3);
  try {
    if (oracle && translator) {
      w = E.proposeTreaty(w, {
        proposer: oracle, counterparty: translator, kind: "SERVICE", bond: 40, durationMs: 30 * 60_000,
        feePerCall: 3, maxCalls: 5,
        terms: E.composeTerms("SERVICE", E.enclaveById(w, translator), E.enclaveById(w, oracle)),
      }, now);
      w = E.ratifyTreaty(w, w.nextTreatyId - 1, translator, now, "seed treaty");
    }
    if (oracle && bitprice) {
      w = E.proposeTreaty(w, {
        proposer: bitprice, counterparty: oracle, kind: "DATA_SHARING", bond: 30, durationMs: 30 * 60_000,
        terms: E.composeTerms("DATA_SHARING", E.enclaveById(w, bitprice), E.enclaveById(w, oracle)),
      }, now);
      w = E.ratifyTreaty(w, w.nextTreatyId - 1, oracle, now, "seed treaty");
    }
  } catch {
    /* seed treaties are decoration; the enclaves are what matter */
  }
  return w;
}

// What a hiring agent sends a provider under a service treaty.
function serviceInput(capability: string | undefined, terms: string): string {
  if (capability === "translation") return "Every agent that keeps its word is welcome in this market.";
  if (capability === "data-analysis") return "Return the current price in USD.";
  return terms.slice(0, 200);
}

export function DiplomacyProvider({ children }: { children: React.ReactNode }) {
  const [world, setWorld] = usePersistentState<E.World>(STORAGE_KEY, E.emptyWorld);
  const [autonomous, setAutoState] = usePersistentState<boolean>(AUTO_KEY, true);
  const [now, setNow] = useState(() => Date.now());
  const [pendingDisputes, setPending] = useState<Set<number>>(new Set());
  const [busyTreaties, setBusy] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [latestVerdict, setLatestVerdict] = useState<Verdict | null>(null);
  const { recordResult, penalise, reward } = useAgents();
  const { spend, refund } = useWallet();

  // Every mutation runs against the latest world synchronously, so an engine
  // error surfaces here as a toast instead of inside a React state updater.
  const ref = useRef(world);
  ref.current = world;
  const mutate = useCallback((fn: (w: E.World) => E.World): boolean => {
    try {
      const next = fn(ref.current);
      ref.current = next;
      setWorld(next);
      return true;
    } catch (e) {
      if (e instanceof E.DiplomacyError) { setToast(e.message); return false; }
      throw e;
    }
  }, [setWorld]);

  // First visit: seed the archipelago from the marketplace's agents. Checked
  // against storage directly, because the persisted world loads in an effect
  // of its own and may not have landed in state yet.
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== null) return;
    } catch { /* storage unavailable: seed in memory */ }
    const seeded = seedWorld(MOCK_AGENTS, Date.now());
    ref.current = seeded;
    setWorld(seeded);
  }, [setWorld]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const addTo = (set: React.Dispatch<React.SetStateAction<Set<number>>>, id: number, on: boolean) =>
    set(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });

  const invoke = useCallback(async (treatyId: number) => {
    const t = ref.current.treaties.find(x => x.id === treatyId);
    if (!t || !E.canInvoke(t)) { setToast("That treaty cannot take calls right now."); return; }
    const provider = E.enclaveById(ref.current, t.partyB);
    if (!provider.endpoint) return;
    const input = serviceInput(provider.capability, t.terms);
    addTo(setBusy, treatyId, true);
    const t0 = performance.now();
    let ok = true;
    let output: string;
    try {
      output = await callAgentEndpoint({ endpoint: provider.endpoint }, input);
      if (!output.trim()) { ok = false; output = "empty response"; }
    } catch (err) {
      ok = false;
      output = (err as Error).message;
    }
    const ms = Math.round(performance.now() - t0);
    addTo(setBusy, treatyId, false);
    const done = mutate(w => E.recordServiceCall(w, treatyId, { ts: Date.now(), ok, ms, input, output: output.slice(0, 300) }, Date.now()));
    // The provider's marketplace record reflects work it did for other agents too.
    if (done && provider.agentId !== undefined) {
      recordResult(provider.agentId, { taskId: treatyId, taskTitle: `Treaty #${treatyId} call`, ms, success: ok, ts: Date.now() });
    }
  }, [mutate, recordResult]);

  const fileDispute = useCallback(async (treatyId: number, plaintiff: string, allegation: string, evidenceUri: string) => {
    let c: E.DisputeCase;
    try {
      c = E.prepareDispute(ref.current, treatyId, plaintiff, allegation, Date.now());
    } catch (e) {
      if (e instanceof E.DiplomacyError) { setToast(e.message); return; }
      throw e;
    }
    addTo(setPending, treatyId, true);
    const t = c.treaty;
    const serviceRecord = t.kind === "SERVICE" && c.defendantRole === "party_b"
      ? { calls: t.calls.length, failed: t.calls.filter(x => !x.ok).length } : null;

    let tier: E.Tier;
    let rationale: string;
    let by: E.VerdictSource = "local rule";
    let txHash: string | undefined;
    const started = Date.now();
    try {
      const res = await fetch("/api/tribunal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: `t${treatyId}-${plaintiff}-${started}`, kind: t.kind, terms: t.terms,
          defendantRole: c.defendantRole, allegation, evidenceUri, serviceRecord, metricBps: c.metricBps,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.configured || !E.TIERS.includes(data.tier)) throw new Error("tribunal unavailable");
      by = data.source;
      // The TreatyTribunal contract clamps on-chain; the fallback judge does
      // not, so the same corridors are applied here to its answer.
      tier = by === "GenLayer TreatyTribunal" ? data.tier : E.clampTier(data.tier, c.metricBps, false);
      rationale = data.rationale;
      txHash = data.txHash;
    } catch {
      // The local rule cannot read documents, so it never counts evidence.
      await new Promise(r => setTimeout(r, Math.max(0, 2500 - (Date.now() - started))));
      const v = E.localTribunal(c.metricBps, false);
      tier = E.clampTier(v.tier, c.metricBps, false);
      rationale = v.rationale;
    }

    // Re-check the gates against the world as it is now: the treaty may have
    // moved while the validators deliberated.
    const at = Date.now();
    const ok = mutate(w => E.settleDispute(w, E.prepareDispute(w, treatyId, plaintiff, allegation, at),
      { tier, rationale, by, txHash, allegation, evidenceUri }, at));
    addTo(setPending, treatyId, false);
    if (!ok) return;
    const record = ref.current.disputes[0];
    const defendant = E.enclaveById(ref.current, c.defendant.id);
    const plaintiffE = E.enclaveById(ref.current, plaintiff);
    // Only a case you are party to interrupts you; the rest go to the ledger
    // and the Tribunal view.
    if (defendant.owner === "you" || plaintiffE.owner === "you") setLatestVerdict(record);
    // Verdicts also move the agents' standing on the marketplace.
    if ((tier === "CRITICAL_BREACH" || tier === "ELEVATED_RISK") && defendant.agentId !== undefined) penalise(defendant.agentId);
    if (tier === "CRITICAL_BREACH" && plaintiffE.agentId !== undefined) reward(plaintiffE.agentId);
    if (tier === "MALICIOUS_REPORT" && plaintiffE.agentId !== undefined) penalise(plaintiffE.agentId);
  }, [mutate, penalise, reward]);

  // Expiry, and the autonomous agents taking one step at a time. The loop
  // reads its helpers through a ref: they change identity on every render, and
  // restarting the interval with them would mean it never fires.
  const turn = useRef(0);
  const acting = useRef(false);
  const fns = useRef({ mutate, invoke, fileDispute });
  fns.current = { mutate, invoke, fileDispute };
  useEffect(() => {
    const tick = async () => {
      const { mutate, invoke, fileDispute } = fns.current;
      const at = Date.now();
      if (ref.current.treaties.some(t => t.status === "active" && t.expiresAt && t.expiresAt <= at)) {
        mutate(w => E.expireTreaties(w, at));
      }
      if (!autonomous || acting.current) return;
      const action = E.nextAutonomousAction(ref.current, at, turn.current++);
      if (!action) return;
      acting.current = true;
      try {
        switch (action.type) {
          case "propose": mutate(w => E.proposeTreaty(w, action.input, at)); break;
          case "ratify": mutate(w => E.ratifyTreaty(w, action.treatyId, action.by, at, action.note)); break;
          case "reject": mutate(w => E.rejectTreaty(w, action.treatyId, action.by, at, action.note)); break;
          case "claim": mutate(w => E.claim(w, action.enclaveId, at)); break;
          case "invoke": await invoke(action.treatyId); break;
          case "dispute": await fileDispute(action.treatyId, action.plaintiff, action.allegation, ""); break;
        }
      } finally {
        acting.current = false;
      }
    };
    const t = setInterval(tick, 3500);
    return () => clearInterval(t);
  }, [autonomous]);

  const statusOf = useCallback((id: string): VisualStatus => {
    const e = world.enclaves.find(x => x.id === id);
    if (e?.status === "sanctioned") return "sanctioned";
    for (const tid of pendingDisputes) {
      const t = world.treaties.find(x => x.id === tid);
      if (t && (t.partyA === id || t.partyB === id)) return "contested";
    }
    return "active";
  }, [world, pendingDisputes]);

  const yours = (id: string) => ref.current.enclaves.find(e => e.id === id)?.owner === "you";
  const denyNotYours = () => { setToast("You can only act for enclaves you founded."); return false; };

  const value: DiplomacyState = {
    world, now, autonomous, setAutonomous: setAutoState, pendingDisputes, busyTreaties, statusOf,
    toast, dismissToast: () => setToast(null), latestVerdict, dismissVerdict: () => setLatestVerdict(null),
    found: (input) => {
      const cost = E.r2(input.collateral + input.treasury);
      if (input.collateral < E.MIN_ENCLAVE_COLLATERAL) { setToast(`Collateral must be at least ${E.MIN_ENCLAVE_COLLATERAL} RIALO.`); return false; }
      if (!spend(cost)) { setToast(`Founding costs ${cost} RIALO from your wallet. Top up with the devnet faucet.`); return false; }
      const ok = mutate(w => E.foundEnclave(w, { ...input, owner: "you" }, Date.now()));
      if (!ok) refund(cost);
      return ok;
    },
    propose: (input) => (yours(input.proposer) ? mutate(w => E.proposeTreaty(w, input, Date.now())) : denyNotYours()),
    ratify: (id) => {
      const t = ref.current.treaties.find(x => x.id === id);
      return t && yours(t.partyB) ? mutate(w => E.ratifyTreaty(w, id, t.partyB, Date.now(), "ratified by hand")) : denyNotYours();
    },
    reject: (id, note) => {
      const t = ref.current.treaties.find(x => x.id === id);
      return t && yours(t.partyB) ? mutate(w => E.rejectTreaty(w, id, t.partyB, Date.now(), note)) : denyNotYours();
    },
    cancel: (id) => {
      const t = ref.current.treaties.find(x => x.id === id);
      return t && yours(t.partyA) ? mutate(w => E.cancelProposal(w, id, t.partyA, Date.now())) : denyNotYours();
    },
    exit: (id, by) => (yours(by) ? mutate(w => E.exitTreaty(w, id, by, Date.now())) : denyNotYours()),
    claim: (enclaveId) => (yours(enclaveId) ? mutate(w => E.claim(w, enclaveId, Date.now())) : denyNotYours()),
    withdraw: (enclaveId, amount) => {
      if (!yours(enclaveId)) return denyNotYours();
      const e = ref.current.enclaves.find(x => x.id === enclaveId);
      if (!e || amount <= 0 || amount > e.treasury) { setToast("Nothing to withdraw."); return false; }
      const ok = mutate(w => ({ ...w, enclaves: w.enclaves.map(x => x.id === enclaveId ? { ...x, treasury: E.r2(x.treasury - amount) } : x) }));
      if (ok) refund(amount);
      return ok;
    },
    invoke: async (treatyId) => {
      const t = ref.current.treaties.find(x => x.id === treatyId);
      if (!t || !yours(t.partyA)) { denyNotYours(); return; }
      await invoke(treatyId);
    },
    fileDispute: async (treatyId, plaintiff, allegation, evidenceUri) => {
      if (!yours(plaintiff)) { denyNotYours(); return; }
      await fileDispute(treatyId, plaintiff, allegation, evidenceUri);
    },
    reset: () => {
      const seeded = seedWorld(MOCK_AGENTS, Date.now());
      ref.current = seeded;
      setWorld(seeded);
      setPending(new Set());
      setLatestVerdict(null);
    },
  };

  return <DiplomacyContext.Provider value={value}>{children}</DiplomacyContext.Provider>;
}

export function useDiplomacy() {
  const ctx = useContext(DiplomacyContext);
  if (!ctx) throw new Error("useDiplomacy must be used within DiplomacyProvider");
  return ctx;
}

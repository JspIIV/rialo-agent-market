// Agent diplomacy engine: sovereign agents ("enclaves") post RIALO collateral,
// sign bonded treaties with each other, hire each other through service
// treaties, and settle breaches through a four-tier tribunal verdict.
//
// The protocol model and every settlement rule are ported from Westphalia
// (github.com/moltaphet/westphalia, MIT, contracts/westphalia.py). What changed
// is the ground the rules stand on: escrow is RIALO on Rialo instead of GEN on
// GenLayer, and GenLayer is kept for the one thing it is needed for, the
// tribunal. Amounts are scaled for a devnet wallet (Westphalia's 500 GEN
// dispute bond is 50 RIALO here), and the enclave maturation delay and dispute
// cooldown are shortened so a demo can reach them.
//
// Everything in this file is pure: a function takes the world and returns the
// next one, or throws a DiplomacyError naming the rule that refused. Rialo is
// on devnet, so the world lives in the browser; when the program is deployed
// these functions are the specification it has to match.

export type Archetype = "Autonomous Arbiter" | "Liquidity Nexus" | "Oracle Collective" | "Defense Vanguard";
export const ARCHETYPES: Archetype[] = ["Autonomous Arbiter", "Liquidity Nexus", "Oracle Collective", "Defense Vanguard"];

export type EnclaveStatus = "active" | "sanctioned";
export type TreatyKind = "SERVICE" | "DATA_SHARING" | "NON_AGGRESSION";
export const TREATY_KINDS: TreatyKind[] = ["SERVICE", "DATA_SHARING", "NON_AGGRESSION"];
export type TreatyStatus = "proposed" | "active" | "settled" | "expired" | "cancelled" | "rejected";
export type Tier = "CRITICAL_BREACH" | "ELEVATED_RISK" | "NORMAL" | "MALICIOUS_REPORT";
export const TIERS: Tier[] = ["CRITICAL_BREACH", "ELEVATED_RISK", "NORMAL", "MALICIOUS_REPORT"];

export const KIND_LABEL: Record<TreatyKind, string> = {
  SERVICE: "Service contract",
  DATA_SHARING: "Data sharing",
  NON_AGGRESSION: "Non-aggression",
};

export const TIER_LABEL: Record<Tier, string> = {
  CRITICAL_BREACH: "Critical breach",
  ELEVATED_RISK: "Elevated risk",
  NORMAL: "Normal",
  MALICIOUS_REPORT: "Malicious report",
};

// --- Protocol constants (Westphalia value in GEN, in brackets) --------------
export const MIN_ENCLAVE_COLLATERAL = 100; // [100] floor that makes Sybil enclaves costly
export const MIN_DISPUTE_BOND = 50;        // [500] baseline anti-griefing deterrent
export const VALIDATION_FEE = 0.5;         // [5]   charged on every non-critical dispute
export const MAX_UNTRUSTED_BOND = 200;     // [2000] bond cap for proposers under 30 reputation
export const HIGH_BOND_THRESHOLD = 500;    // [5000] bonds above this need a matured enclave
export const ENCLAVE_MATURATION_MS = 5 * 60_000;  // [1h]
export const DISPUTE_COOLDOWN_MS = 60_000;        // [300s] between disputes on one treaty
export const MIN_TREATY_DURATION_MS = 60_000;
export const MAX_TREATY_DURATION_MS = 24 * 3600_000;
export const EXIT_PENALTY_BPS = 1000;      // 10% of the exiting party's bond, to reserves
export const MIN_REP_THROUGHPUT = 10;      // [100] defendant bond needed to earn reputation

export const REP_SEED = 50;
export const REP_REWARD_CRITICAL = 15;
export const REP_DEBIT_ELEVATED = 10;
export const REP_DEBIT_MALICIOUS = 20;

// Objective metric corridors (basis points of failed service calls).
export const BPS_CRITICAL = 7500;
export const BPS_ELEVATED = 2500;
export const BPS_NEGLIGIBLE = 500;
// A provider's failure rate is only a measurement once it has served this many calls.
export const MIN_CALLS_FOR_METRIC = 3;

// --- Types --------------------------------------------------------------------
export interface Enclave {
  id: string;
  name: string;
  archetype: Archetype;
  charter: string;          // natural-language governance philosophy
  owner: "you" | "autonomous";
  agentId?: number;         // the marketplace agent this sovereignty speaks for
  endpoint?: string;        // where its service treaties are invoked
  capability?: string;      // what it sells under a service treaty
  price?: number;           // its asking fee per call
  collateral: number;       // locked for as long as the enclave exists
  treasury: number;         // liquid RIALO it bonds and pays from
  claimable: number;        // credited by settlement, pulled with claim()
  reputation: number;       // 0 - 100
  status: EnclaveStatus;
  foundedAt: number;
  seed: number;             // terrain seed for the board
}

export interface ServiceCall {
  ts: number;
  ok: boolean;
  ms: number;
  fee: number;              // paid to the provider (0 when the call failed)
  input: string;
  output: string;
}

export interface Treaty {
  id: number;
  kind: TreatyKind;
  terms: string;            // the clause, in prose; this is what the tribunal reads
  partyA: string;           // proposer (the hiring party for a service treaty)
  partyB: string;           // counterparty (the provider for a service treaty)
  bondA: number;
  bondB: number;
  feePerCall: number;       // service treaties only
  callBudget: number;       // prepaid by partyA, drawn down by successful calls
  calls: ServiceCall[];
  durationMs: number;
  proposedAt: number;
  activatedAt?: number;
  expiresAt?: number;
  status: TreatyStatus;
  elevatedSlashedA: boolean;
  elevatedSlashedB: boolean;
  lastDisputeAt?: number;
  decisionNote?: string;    // the counterparty's reasoning when it ratified or rejected
}

export type VerdictSource = "GenLayer TreatyTribunal" | "GenLayer AgentMarketJudge" | "local rule";

export interface DisputeRecord {
  id: number;
  treatyId: number;
  plaintiff: string;
  defendant: string;
  allegation: string;
  evidenceUri: string;
  bond: number;
  metricBps: number | null;
  tier: Tier;
  rationale: string;
  by: VerdictSource;
  txHash?: string;
  ts: number;
  settlement: string;
}

export type LedgerKind =
  | "realm-founded" | "treaty-proposed" | "treaty-signed" | "treaty-rejected" | "treaty-closed"
  | "service-call" | "dispute-opened" | "verdict" | "escrow-released" | "sanction";

export interface LedgerEvent {
  id: number;
  ts: number;
  kind: LedgerKind;
  text: string;
}

export interface World {
  enclaves: Enclave[];
  treaties: Treaty[];
  disputes: DisputeRecord[];
  ledger: LedgerEvent[];
  reserves: number;          // protocol treasury: slashes, fees, exit penalties
  replay: string[];          // treatyId|plaintiff|allegation-hash of adjudicated filings
  nextTreatyId: number;
  nextDisputeId: number;
  nextEventId: number;
}

export class DiplomacyError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// --- Helpers ------------------------------------------------------------------
export const r2 = (n: number) => Math.round(n * 100) / 100;
const clampRep = (n: number) => Math.max(0, Math.min(100, n));

export function enclaveById(w: World, id: string): Enclave {
  const e = w.enclaves.find(x => x.id === id);
  if (!e) throw new DiplomacyError("ERR_STATE", `unknown enclave ${id}`);
  return e;
}

export function treatyById(w: World, id: number): Treaty {
  const t = w.treaties.find(x => x.id === id);
  if (!t) throw new DiplomacyError("ERR_STATE", `unknown treaty #${id}`);
  return t;
}

function patchEnclave(w: World, id: string, f: (e: Enclave) => Enclave): World {
  return { ...w, enclaves: w.enclaves.map(e => (e.id === id ? f(e) : e)) };
}

function patchTreaty(w: World, id: number, f: (t: Treaty) => Treaty): World {
  return { ...w, treaties: w.treaties.map(t => (t.id === id ? f(t) : t)) };
}

function credit(w: World, id: string, amount: number): World {
  if (amount <= 0) return w;
  return patchEnclave(w, id, e => ({ ...e, claimable: r2(e.claimable + amount) }));
}

function debitTreasury(w: World, id: string, amount: number, what: string): World {
  const e = enclaveById(w, id);
  if (e.treasury + 1e-9 < amount) {
    throw new DiplomacyError("ERR_INSUFFICIENT_BOND", `${e.name} needs ${r2(amount)} RIALO for ${what} but holds ${e.treasury}`);
  }
  return patchEnclave(w, id, x => ({ ...x, treasury: r2(x.treasury - amount) }));
}

function repDelta(w: World, id: string, delta: number): World {
  return patchEnclave(w, id, e => ({ ...e, reputation: clampRep(e.reputation + delta) }));
}

export function log(w: World, ts: number, kind: LedgerKind, text: string): World {
  return {
    ...w,
    nextEventId: w.nextEventId + 1,
    ledger: [{ id: w.nextEventId, ts, kind, text }, ...w.ledger].slice(0, 80),
  };
}

function requireActiveEnclave(e: Enclave) {
  if (e.status !== "active") throw new DiplomacyError("ERR_STATE", `${e.name} is sanctioned and has no standing`);
}

// Cheap stable string hash, used for the replay index and terrain seeds.
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function emptyWorld(): World {
  return { enclaves: [], treaties: [], disputes: [], ledger: [], reserves: 0, replay: [], nextTreatyId: 1, nextDisputeId: 1, nextEventId: 1 };
}

// --- Enclaves -----------------------------------------------------------------
export interface FoundInput {
  name: string;
  archetype: Archetype;
  charter: string;
  collateral: number;
  treasury: number;
  owner: Enclave["owner"];
  agentId?: number;
  endpoint?: string;
  capability?: string;
  price?: number;
}

export function foundEnclave(w: World, input: FoundInput, now: number): World {
  const name = input.name.trim();
  if (!name) throw new DiplomacyError("ERR_STATE", "an enclave needs a name");
  if (input.collateral < MIN_ENCLAVE_COLLATERAL) {
    throw new DiplomacyError("ERR_INSUFFICIENT_BOND", `collateral must be at least ${MIN_ENCLAVE_COLLATERAL} RIALO`);
  }
  if (input.agentId !== undefined && w.enclaves.some(e => e.agentId === input.agentId)) {
    throw new DiplomacyError("ERR_STATE", "that agent already governs an enclave");
  }
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "enclave";
  let id = base;
  for (let i = 2; w.enclaves.some(e => e.id === id); i++) id = `${base}-${i}`;
  const enclave: Enclave = {
    id, name, archetype: input.archetype, charter: input.charter.trim(), owner: input.owner,
    agentId: input.agentId, endpoint: input.endpoint, capability: input.capability, price: input.price,
    collateral: r2(input.collateral), treasury: r2(input.treasury), claimable: 0,
    reputation: REP_SEED, status: "active", foundedAt: now, seed: hashStr(id) % 100000,
  };
  const next = { ...w, enclaves: [...w.enclaves, enclave] };
  return log(next, now, "realm-founded", `${name} founded a sovereignty (${input.archetype}) with ${enclave.collateral} RIALO collateral`);
}

// Pull-over-push: settlement only ever credits claimable; the enclave moves it.
export function claim(w: World, id: string, now: number): World {
  const e = enclaveById(w, id);
  if (e.claimable <= 0) throw new DiplomacyError("ERR_NO_CLAIMABLE_BALANCE", `${e.name} has nothing to claim`);
  const next = patchEnclave(w, id, x => ({ ...x, treasury: r2(x.treasury + x.claimable), claimable: 0 }));
  return log(next, now, "escrow-released", `${e.name} claimed ${e.claimable} RIALO into its treasury`);
}

// --- Treaties -----------------------------------------------------------------
export interface ProposeInput {
  proposer: string;
  counterparty: string;
  kind: TreatyKind;
  terms: string;
  bond: number;
  durationMs: number;
  feePerCall?: number;
  maxCalls?: number;
}

export function proposeTreaty(w: World, input: ProposeInput, now: number): World {
  const a = enclaveById(w, input.proposer);
  const b = enclaveById(w, input.counterparty);
  requireActiveEnclave(a);
  requireActiveEnclave(b);
  if (a.id === b.id) throw new DiplomacyError("ERR_INVALID_TREATY_PARAMS", "an enclave cannot sign a treaty with itself");
  if (!input.terms.trim()) throw new DiplomacyError("ERR_INVALID_TREATY_PARAMS", "a treaty needs written terms");
  if (!(input.bond > 0)) throw new DiplomacyError("ERR_INSUFFICIENT_BOND", "the bond must be positive");
  if (input.durationMs < MIN_TREATY_DURATION_MS || input.durationMs > MAX_TREATY_DURATION_MS) {
    throw new DiplomacyError("ERR_INVALID_TREATY_PARAMS", "duration must be between 1 minute and 24 hours");
  }
  // Anti-Sybil: a low-reputation proposer cannot inflate bonds.
  if (a.reputation < 30 && input.bond > MAX_UNTRUSTED_BOND) {
    throw new DiplomacyError("ERR_UNTRUSTED_BOND_CAP", `reputation ${a.reputation} caps the bond at ${MAX_UNTRUSTED_BOND} RIALO`);
  }
  // High-tier treaties need an enclave that has existed for a while.
  if (input.bond > HIGH_BOND_THRESHOLD && now - a.foundedAt < ENCLAVE_MATURATION_MS) {
    throw new DiplomacyError("ERR_ENCLAVE_NOT_MATURED", `bonds above ${HIGH_BOND_THRESHOLD} RIALO need an enclave older than 5 minutes`);
  }
  let feePerCall = 0;
  let callBudget = 0;
  if (input.kind === "SERVICE") {
    if (!b.endpoint) throw new DiplomacyError("ERR_INVALID_TREATY_PARAMS", `${b.name} has no endpoint to serve calls from`);
    feePerCall = r2(input.feePerCall ?? 0);
    const maxCalls = Math.floor(input.maxCalls ?? 0);
    if (feePerCall <= 0 || maxCalls < 1) throw new DiplomacyError("ERR_INVALID_TREATY_PARAMS", "a service treaty needs a fee per call and at least one call");
    callBudget = r2(feePerCall * maxCalls);
  }
  const bond = r2(input.bond);
  let next = debitTreasury(w, a.id, bond + callBudget, callBudget ? "the bond and prepaid calls" : "the bond");
  const treaty: Treaty = {
    id: w.nextTreatyId, kind: input.kind, terms: input.terms.trim(), partyA: a.id, partyB: b.id,
    bondA: bond, bondB: 0, feePerCall, callBudget, calls: [], durationMs: input.durationMs,
    proposedAt: now, status: "proposed", elevatedSlashedA: false, elevatedSlashedB: false,
  };
  next = { ...next, treaties: [treaty, ...next.treaties], nextTreatyId: w.nextTreatyId + 1 };
  const extra = callBudget ? ` and prepaid ${callBudget} RIALO for calls` : "";
  return log(next, now, "treaty-proposed", `${a.name} proposed a ${KIND_LABEL[input.kind].toLowerCase()} to ${b.name}, bonding ${bond} RIALO${extra}`);
}

export function ratifyTreaty(w: World, id: number, by: string, now: number, note?: string): World {
  const t = treatyById(w, id);
  if (t.status !== "proposed") throw new DiplomacyError("ERR_INVALID_STATE", `treaty #${id} is not awaiting ratification`);
  if (by !== t.partyB) throw new DiplomacyError("ERR_UNAUTHORIZED_PARTY", "only the counterparty can ratify");
  const b = enclaveById(w, by);
  requireActiveEnclave(b);
  requireActiveEnclave(enclaveById(w, t.partyA));
  // The counterparty matches the proposer's bond.
  let next = debitTreasury(w, by, t.bondA, "the matching bond");
  next = patchTreaty(next, id, x => ({
    ...x, bondB: t.bondA, status: "active", activatedAt: now, expiresAt: now + t.durationMs, decisionNote: note,
  }));
  return log(next, now, "treaty-signed", `${b.name} ratified treaty #${id} with ${enclaveById(w, t.partyA).name}, matching the ${t.bondA} RIALO bond`);
}

// The counterparty declines. The proposer's escrow comes back through claimable.
export function rejectTreaty(w: World, id: number, by: string, now: number, note: string): World {
  const t = treatyById(w, id);
  if (t.status !== "proposed") throw new DiplomacyError("ERR_INVALID_STATE", `treaty #${id} is not awaiting ratification`);
  if (by !== t.partyB) throw new DiplomacyError("ERR_UNAUTHORIZED_PARTY", "only the counterparty can reject");
  let next = credit(w, t.partyA, r2(t.bondA + t.callBudget));
  next = patchTreaty(next, id, x => ({ ...x, status: "rejected", bondA: 0, callBudget: 0, decisionNote: note }));
  return log(next, now, "treaty-rejected", `${enclaveById(w, by).name} rejected treaty #${id}: ${note}`);
}

// Anti-hostage: a proposer is never stuck waiting on a counterparty that stalls.
export function cancelProposal(w: World, id: number, by: string, now: number): World {
  const t = treatyById(w, id);
  if (t.status !== "proposed") throw new DiplomacyError("ERR_INVALID_STATE", `treaty #${id} is not a pending proposal`);
  if (by !== t.partyA) throw new DiplomacyError("ERR_UNAUTHORIZED_PARTY", "only the proposer can cancel");
  let next = credit(w, t.partyA, r2(t.bondA + t.callBudget));
  next = patchTreaty(next, id, x => ({ ...x, status: "cancelled", bondA: 0, callBudget: 0 }));
  return log(next, now, "treaty-closed", `${enclaveById(w, by).name} withdrew proposal #${id}; escrow returned`);
}

// Unilateral exit: the leaving party forfeits 10% of its bond to reserves;
// everything else is returned to both sides.
export function exitTreaty(w: World, id: number, by: string, now: number): World {
  const t = treatyById(w, id);
  if (t.status !== "active") throw new DiplomacyError("ERR_TREATY_NOT_ACTIVE", `treaty #${id} is not active`);
  if (by !== t.partyA && by !== t.partyB) throw new DiplomacyError("ERR_UNAUTHORIZED_PARTY", "only a party can exit");
  const ownBond = by === t.partyA ? t.bondA : t.bondB;
  const penalty = r2((ownBond * EXIT_PENALTY_BPS) / 10000);
  let next: World = { ...w, reserves: r2(w.reserves + penalty) };
  next = credit(next, t.partyA, r2((by === t.partyA ? t.bondA - penalty : t.bondA) + t.callBudget));
  next = credit(next, t.partyB, r2(by === t.partyB ? t.bondB - penalty : t.bondB));
  next = patchTreaty(next, id, x => ({ ...x, status: "settled", bondA: 0, bondB: 0, callBudget: 0 }));
  return log(next, now, "treaty-closed", `${enclaveById(w, by).name} exited treaty #${id}, forfeiting ${penalty} RIALO to reserves`);
}

// Expired treaties release both bonds and any unspent call budget.
export function expireTreaties(w: World, now: number): World {
  let next = w;
  for (const t of w.treaties) {
    if (t.status !== "active" || !t.expiresAt || t.expiresAt > now) continue;
    next = credit(next, t.partyA, r2(t.bondA + t.callBudget));
    next = credit(next, t.partyB, t.bondB);
    next = patchTreaty(next, t.id, x => ({ ...x, status: "expired", bondA: 0, bondB: 0, callBudget: 0 }));
    next = log(next, now, "treaty-closed", `Treaty #${t.id} expired; ${r2(t.bondA + t.bondB)} RIALO of bonds released`);
  }
  return next;
}

// --- Service treaties: agents using each other --------------------------------
export function canInvoke(t: Treaty): boolean {
  return t.kind === "SERVICE" && t.status === "active" && t.callBudget + 1e-9 >= t.feePerCall;
}

// Records one call partyA made to partyB's endpoint. A successful call pays the
// fee out of the prepaid budget; a failed call pays nothing and is the evidence
// the tribunal's objective metric is computed from.
export function recordServiceCall(
  w: World, id: number, call: Omit<ServiceCall, "fee">, now: number,
): World {
  const t = treatyById(w, id);
  if (!canInvoke(t)) throw new DiplomacyError("ERR_TREATY_NOT_ACTIVE", `treaty #${id} cannot take calls`);
  const fee = call.ok ? t.feePerCall : 0;
  let next = credit(w, t.partyB, fee);
  next = patchTreaty(next, id, x => ({
    ...x,
    callBudget: r2(x.callBudget - fee),
    calls: [...x.calls, { ...call, fee }].slice(-30),
  }));
  const a = enclaveById(w, t.partyA).name;
  const b = enclaveById(w, t.partyB).name;
  return log(next, now, "service-call", call.ok
    ? `${a} called ${b} under treaty #${id} (${call.ms}ms) · ${fee} RIALO paid`
    : `${a} called ${b} under treaty #${id} and it FAILED · nothing paid`);
}

// The defendant's objective metric: its share of failed calls, in basis
// points. Only a service provider has one, and only once it has served enough
// calls for the rate to mean something. The hiring party's obligation (paying)
// is enforced by the prepaid budget, so it can never fail it: 0 bps.
export function defendantMetricBps(t: Treaty, defendant: string): number | null {
  if (t.kind !== "SERVICE") return null;
  if (defendant === t.partyA) return 0;
  if (t.calls.length < MIN_CALLS_FOR_METRIC) return null;
  const failed = t.calls.filter(c => !c.ok).length;
  return Math.round((failed / t.calls.length) * 10000);
}

// --- Disputes ----------------------------------------------------------------
// Lower-reputation plaintiffs post a larger anti-griefing bond.
export function requiredDisputeBond(reputation: number): number {
  return r2((MIN_DISPUTE_BOND * (150 - Math.min(reputation, 100))) / 100);
}

export interface DisputeCase {
  treaty: Treaty;
  plaintiff: Enclave;
  defendant: Enclave;
  defendantRole: "party_a" | "party_b";
  bond: number;
  metricBps: number | null;
  replayKey: string;
}

// Every deterministic gate a filing has to clear before the tribunal runs.
export function prepareDispute(w: World, treatyId: number, plaintiffId: string, allegation: string, now: number): DisputeCase {
  const t = treatyById(w, treatyId);
  if (t.status !== "active") throw new DiplomacyError("ERR_TREATY_NOT_ACTIVE", `treaty #${treatyId} is not active`);
  if (plaintiffId !== t.partyA && plaintiffId !== t.partyB) throw new DiplomacyError("ERR_UNAUTHORIZED_PARTY", "only a treaty party can file");
  const plaintiff = enclaveById(w, plaintiffId);
  requireActiveEnclave(plaintiff);
  if (t.expiresAt && now >= t.expiresAt) throw new DiplomacyError("ERR_TREATY_NOT_ACTIVE", "the treaty has expired");
  if (!allegation.trim()) throw new DiplomacyError("ERR_EMPTY_EVIDENCE", "a dispute needs an allegation");
  const bond = requiredDisputeBond(plaintiff.reputation);
  if (plaintiff.treasury + 1e-9 < bond) {
    throw new DiplomacyError("ERR_INSUFFICIENT_BOND", `${plaintiff.name} needs ${bond} RIALO to file but holds ${plaintiff.treasury}`);
  }
  const replayKey = `${treatyId}|${plaintiffId}|${hashStr(allegation.trim().toLowerCase())}`;
  if (w.replay.includes(replayKey)) throw new DiplomacyError("ERR_REPLAY_DISPUTE", "this exact filing was already adjudicated");
  if (t.lastDisputeAt && now - t.lastDisputeAt < DISPUTE_COOLDOWN_MS) {
    throw new DiplomacyError("ERR_DISPUTE_COOLDOWN", "one dispute per minute on a treaty");
  }
  const defendantId = plaintiffId === t.partyA ? t.partyB : t.partyA;
  return {
    treaty: t, plaintiff, defendant: enclaveById(w, defendantId),
    defendantRole: defendantId === t.partyA ? "party_a" : "party_b",
    bond, metricBps: defendantMetricBps(t, defendantId), replayKey,
  };
}

// The code-side guardrail around the tribunal (Westphalia's _clamp_tier): the
// verdict is trusted inside the band the objective metric can support, and
// clamped outside it. Without a metric (non-service treaties) the one rule
// kept is that a full sanction needs evidence.
export function clampTier(tier: Tier, bps: number | null, evidencePresent: boolean): Tier {
  if (bps === null) {
    if (tier === "CRITICAL_BREACH" && !evidencePresent) return "ELEVATED_RISK";
    return tier;
  }
  if (bps >= BPS_ELEVATED && tier === "MALICIOUS_REPORT") return "NORMAL";
  if (bps < BPS_NEGLIGIBLE && (tier === "CRITICAL_BREACH" || tier === "ELEVATED_RISK")) return "NORMAL";
  if (bps < BPS_ELEVATED && tier === "CRITICAL_BREACH") return evidencePresent ? "ELEVATED_RISK" : "NORMAL";
  return tier;
}

// The fallback when no GenLayer tribunal is reachable. Deterministic and
// labelled as such everywhere it appears: it rules on the metric alone.
export function localTribunal(bps: number | null, evidencePresent: boolean): { tier: Tier; rationale: string } {
  if (bps === null) {
    return evidencePresent
      ? { tier: "ELEVATED_RISK", rationale: "No objective metric exists for this treaty; the filed evidence supports a partial finding but not a full sanction." }
      : { tier: "NORMAL", rationale: "No objective metric exists for this treaty and no evidence was filed, so the allegation is unproven." };
  }
  if (bps >= BPS_CRITICAL) return { tier: "CRITICAL_BREACH", rationale: `The defendant failed ${bps / 100}% of the calls it was paid to serve, a clear and unexcused breach of the service covenant.` };
  if (bps >= BPS_ELEVATED) return { tier: "ELEVATED_RISK", rationale: `The defendant failed ${bps / 100}% of calls: a measurable deviation from the covenant, short of a total breach.` };
  if (bps >= BPS_NEGLIGIBLE) return { tier: "NORMAL", rationale: `A ${bps / 100}% failure rate is within acceptable variance for the covenant.` };
  return evidencePresent
    ? { tier: "NORMAL", rationale: `The defendant served ${100 - bps / 100}% of calls successfully; the evidence does not outweigh that record.` }
    : { tier: "MALICIOUS_REPORT", rationale: `The defendant served ${100 - bps / 100}% of calls successfully and no evidence was filed: the allegation is contradicted by the record.` };
}

// Deterministic settlement per tier, ported from Westphalia's trigger_dispute.
export function settleDispute(
  w: World,
  c: DisputeCase,
  verdict: { tier: Tier; rationale: string; by: VerdictSource; txHash?: string; allegation: string; evidenceUri: string },
  now: number,
): World {
  const t = treatyById(w, c.treaty.id);
  const plaintiff = c.plaintiff.id;
  const defendant = c.defendant.id;
  const plaintiffIsA = plaintiff === t.partyA;
  const defendantBond = plaintiffIsA ? t.bondB : t.bondA;
  const plaintiffBond = plaintiffIsA ? t.bondA : t.bondB;
  // The dispute bond is posted as the filing is adjudicated (msg.value).
  let next = debitTreasury(w, plaintiff, c.bond, "the dispute bond");
  next = { ...next, replay: [...next.replay, c.replayKey] };
  const fee = Math.min(VALIDATION_FEE, c.bond);
  let settlement: string;

  switch (verdict.tier) {
    case "CRITICAL_BREACH": {
      // Both bonds and the dispute bond go to the plaintiff; the defendant is sanctioned.
      next = credit(next, plaintiff, r2(defendantBond + plaintiffBond + c.bond));
      next = credit(next, t.partyA, t.callBudget);
      next = patchEnclave(next, defendant, e => ({ ...e, status: "sanctioned" }));
      if (defendantBond >= MIN_REP_THROUGHPUT) next = repDelta(next, plaintiff, REP_REWARD_CRITICAL);
      next = patchTreaty(next, t.id, x => ({ ...x, bondA: 0, bondB: 0, callBudget: 0, status: "settled" }));
      settlement = `${defendantBond} RIALO defendant bond slashed to ${c.plaintiff.name}; ${c.defendant.name} sanctioned; treaty settled`;
      next = log(next, now, "sanction", `${c.defendant.name} was SANCTIONED after a critical breach of treaty #${t.id}`);
      break;
    }
    case "ELEVATED_RISK": {
      const defendantIsB = plaintiffIsA;
      const alreadySlashed = defendantIsB ? t.elevatedSlashedB : t.elevatedSlashedA;
      next = { ...next, reserves: r2(next.reserves + fee) };
      next = credit(next, plaintiff, r2(c.bond - fee));
      if (alreadySlashed) {
        // A defendant can be elevated-slashed once per treaty; a second
        // elevated verdict closes the treaty instead of bleeding it dry.
        next = credit(next, t.partyA, r2(t.bondA + t.callBudget));
        next = credit(next, t.partyB, t.bondB);
        next = patchTreaty(next, t.id, x => ({ ...x, bondA: 0, bondB: 0, callBudget: 0, status: "settled" }));
        settlement = "second elevated verdict against the same party: treaty settled, remaining bonds returned";
      } else {
        const slash = r2((defendantBond * 25) / 100);
        next = { ...next, reserves: r2(next.reserves + slash) };
        next = patchTreaty(next, t.id, x => defendantIsB
          ? { ...x, bondB: r2(x.bondB - slash), elevatedSlashedB: true }
          : { ...x, bondA: r2(x.bondA - slash), elevatedSlashedA: true });
        next = repDelta(next, defendant, -REP_DEBIT_ELEVATED);
        settlement = `25% of ${c.defendant.name}'s bond (${slash} RIALO) slashed to reserves; treaty stays active`;
      }
      break;
    }
    case "NORMAL": {
      next = { ...next, reserves: r2(next.reserves + fee) };
      next = credit(next, plaintiff, r2(c.bond - fee));
      settlement = `dismissed; dispute bond returned minus the ${fee} RIALO validation fee`;
      break;
    }
    case "MALICIOUS_REPORT": {
      next = { ...next, reserves: r2(next.reserves + c.bond) };
      next = repDelta(next, plaintiff, -REP_DEBIT_MALICIOUS);
      settlement = `frivolous filing: ${c.plaintiff.name}'s ${c.bond} RIALO dispute bond forfeited to reserves`;
      break;
    }
  }

  next = patchTreaty(next, t.id, x => ({ ...x, lastDisputeAt: now }));
  const record: DisputeRecord = {
    id: next.nextDisputeId, treatyId: t.id, plaintiff, defendant,
    allegation: verdict.allegation, evidenceUri: verdict.evidenceUri, bond: c.bond, metricBps: c.metricBps,
    tier: verdict.tier, rationale: verdict.rationale, by: verdict.by, txHash: verdict.txHash, ts: now, settlement,
  };
  next = { ...next, disputes: [record, ...next.disputes], nextDisputeId: next.nextDisputeId + 1 };
  return log(next, now, "verdict", `Tribunal (${verdict.by}) ruled ${verdict.tier} on treaty #${t.id}: ${settlement}`);
}

// --- Autonomous agents ----------------------------------------------------------
// Deterministic, auditable heuristics, as in Westphalia's agent/decider.py:
// the same world always produces the same decision.

export const KINDS_BY_ARCHETYPE: Record<Archetype, TreatyKind[]> = {
  "Oracle Collective": ["DATA_SHARING", "SERVICE"],
  "Liquidity Nexus": ["SERVICE", "DATA_SHARING"],
  "Autonomous Arbiter": ["SERVICE", "NON_AGGRESSION"],
  "Defense Vanguard": ["NON_AGGRESSION", "SERVICE"],
};

export interface Evaluation {
  accept: boolean;
  score: number;
  reasons: string[];
}

export function evaluateProposal(w: World, t: Treaty, evaluatorId: string): Evaluation {
  const me = enclaveById(w, evaluatorId);
  const peer = enclaveById(w, t.partyA);
  const reasons: string[] = [];
  let hardFail = false;

  if (!KINDS_BY_ARCHETYPE[me.archetype].includes(t.kind)) {
    return { accept: false, score: 0, reasons: [`${KIND_LABEL[t.kind]} is outside a ${me.archetype} charter`] };
  }
  const cap = r2(me.treasury * 0.4);
  if (t.bondA > me.treasury) { reasons.push(`bond ${t.bondA} exceeds treasury ${me.treasury}`); hardFail = true; }
  else if (t.bondA > cap) { reasons.push(`bond ${t.bondA} exceeds the 40% treasury cap (${cap})`); hardFail = true; }
  if (peer.reputation < 35) { reasons.push(`peer reputation ${peer.reputation} is below the floor of 35`); hardFail = true; }
  if (t.kind === "SERVICE" && me.price && t.feePerCall < me.price * 0.8) {
    reasons.push(`fee ${t.feePerCall} is under 80% of the asking price ${me.price}`);
    hardFail = true;
  }

  const bondScore = Math.max(0, 1 - Math.abs(t.bondA - cap / 2) / Math.max(1, cap / 2));
  const repScore = peer.reputation / 100;
  const hours = t.durationMs / 3600_000;
  const horizonScore = hours <= 2 ? 1 : Math.max(0, 1 - (hours - 2) / 22);
  const feeScore = t.kind === "SERVICE" && me.price ? Math.min(1, t.feePerCall / me.price) : 0.8;
  const score = Math.round((0.3 * bondScore + 0.3 * repScore + 0.2 * horizonScore + 0.2 * feeScore) * 100) / 100;
  reasons.push(`score ${score} (bond ${bondScore.toFixed(2)}, peer rep ${repScore.toFixed(2)}, horizon ${horizonScore.toFixed(2)}, fee ${feeScore.toFixed(2)})`);
  const accept = !hardFail && score >= 0.45;
  if (!hardFail && !accept) reasons.push("below the 0.45 acceptance threshold");
  return { accept, score, reasons };
}

// Plain-language covenants for the offers the autonomous agents compose.
export function composeTerms(kind: TreatyKind, provider: Enclave, hirer: Enclave): string {
  switch (kind) {
    case "SERVICE":
      return `${provider.name} serves ${hirer.name}'s ${provider.capability ?? "service"} requests from its registered endpoint. Every call must return a real, non-empty result for the input it was given; a failed, empty or fabricated response is a breach. ${hirer.name} pays the agreed fee for each successful call out of the prepaid budget.`;
    case "DATA_SHARING":
      return `${provider.name} and ${hirer.name} keep each other's endpoints reachable and share what they measure without alteration. Withholding, delaying on purpose or tampering with shared data is a breach.`;
    case "NON_AGGRESSION":
      return `${provider.name} and ${hirer.name} will not undercut, impersonate, spam or front-run each other on the marketplace for the term of this treaty.`;
  }
}

export type AutoAction =
  | { type: "ratify"; treatyId: number; by: string; note: string }
  | { type: "reject"; treatyId: number; by: string; note: string }
  | { type: "invoke"; treatyId: number }
  | { type: "dispute"; treatyId: number; plaintiff: string; allegation: string }
  | { type: "claim"; enclaveId: string }
  | { type: "propose"; input: ProposeInput };

const isAuto = (w: World, id: string) => enclaveById(w, id).owner === "autonomous";

// Picks the one next thing the autonomous enclaves do, in priority order:
// answer pending proposals, litigate breaches, use active service treaties,
// collect payouts, then reach out with a new offer. `turn` rotates who acts.
export function nextAutonomousAction(w: World, now: number, turn: number): AutoAction | null {
  const live = w.enclaves.filter(e => e.status === "active");
  if (live.length < 2) return null;

  for (const t of w.treaties) {
    if (t.status === "proposed" && isAuto(w, t.partyB) && now - t.proposedAt > 2500) {
      const ev = evaluateProposal(w, t, t.partyB);
      return { type: ev.accept ? "ratify" : "reject", treatyId: t.id, by: t.partyB, note: ev.reasons.join("; ") };
    }
  }

  for (const t of w.treaties) {
    if (t.status !== "active" || t.kind !== "SERVICE" || !isAuto(w, t.partyA)) continue;
    const bps = defendantMetricBps(t, t.partyB);
    const cooled = !t.lastDisputeAt || now - t.lastDisputeAt >= DISPUTE_COOLDOWN_MS;
    const hirer = enclaveById(w, t.partyA);
    if (bps !== null && bps >= BPS_ELEVATED && cooled && hirer.status === "active" && hirer.treasury >= requiredDisputeBond(hirer.reputation)) {
      const failed = t.calls.filter(c => !c.ok).length;
      return {
        type: "dispute", treatyId: t.id, plaintiff: t.partyA,
        allegation: `${enclaveById(w, t.partyB).name} failed ${failed} of the last ${t.calls.length} calls it was paid to serve under treaty #${t.id}.`,
      };
    }
  }

  // Nobody keeps paying a sanctioned provider; its treaties run out instead.
  const invokable = w.treaties.filter(t => canInvoke(t) && isAuto(w, t.partyA)
    && enclaveById(w, t.partyB).status === "active" && enclaveById(w, t.partyA).status === "active"
    && (t.calls.length === 0 || now - t.calls[t.calls.length - 1].ts > 6000));
  if (invokable.length) return { type: "invoke", treatyId: invokable[turn % invokable.length].id };

  const owed = live.find(e => e.owner === "autonomous" && e.claimable > 0);
  if (owed) return { type: "claim", enclaveId: owed.id };

  // Outreach: at most a handful of live treaties, so the board stays readable.
  const open = w.treaties.filter(t => t.status === "proposed" || t.status === "active").length;
  if (open >= Math.max(3, live.length)) return null;
  const proposers = live.filter(e => e.owner === "autonomous");
  if (!proposers.length) return null;
  const me = proposers[turn % proposers.length];
  const allied = new Set(w.treaties
    .filter(t => (t.status === "proposed" || t.status === "active") && (t.partyA === me.id || t.partyB === me.id))
    .map(t => (t.partyA === me.id ? t.partyB : t.partyA)));
  const peers = live.filter(p => p.id !== me.id && !allied.has(p.id)).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
  const peer = peers[turn % Math.max(1, peers.length)];
  if (!peer) return null;
  const kind = KINDS_BY_ARCHETYPE[peer.archetype].find(k => KINDS_BY_ARCHETYPE[me.archetype].includes(k) && (k !== "SERVICE" || !!peer.endpoint));
  if (!kind) return null;
  const bond = Math.floor(Math.min(me.treasury * 0.15, peer.treasury * 0.15, MAX_UNTRUSTED_BOND));
  if (bond < 5) return null;
  const fee = peer.price ?? 3;
  if (kind === "SERVICE" && me.treasury < bond + fee * 3) return null;
  return {
    type: "propose",
    input: {
      proposer: me.id, counterparty: peer.id, kind, bond, durationMs: 15 * 60_000,
      terms: kind === "SERVICE" ? composeTerms(kind, peer, me) : composeTerms(kind, me, peer),
      feePerCall: kind === "SERVICE" ? fee : undefined,
      maxCalls: kind === "SERVICE" ? 3 : undefined,
    },
  };
}

// --- Aggregates for the HUD ---------------------------------------------------
export function lockedEscrow(w: World): number {
  return r2(w.treaties.reduce((s, t) => s + t.bondA + t.bondB + t.callBudget, 0));
}

export function treatiesOf(w: World, id: string): Treaty[] {
  return w.treaties.filter(t => t.partyA === id || t.partyB === id);
}

export function isContested(w: World, id: string, now: number): boolean {
  return w.disputes.some(d => (d.defendant === id || d.plaintiff === id) && now - d.ts < 20_000);
}

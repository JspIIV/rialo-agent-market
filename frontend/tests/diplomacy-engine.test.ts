// Engine tests for agent diplomacy: every rule, gate and settlement tier, plus
// conservation (RIALO is never created or destroyed) across a long run of the
// autonomous agents. Run with: npm run test:diplomacy
import * as E from "../src/lib/diplomacy/engine";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const throws = (f: () => unknown, code: string, m: string) => { try { f(); ok(false, m + " (no throw)"); } catch (e) { const got = e instanceof E.DiplomacyError ? e.code : String(e); ok(got === code, `${m}: got ${got}`); } };
const t0 = 1_000_000;
function base() {
  let w = E.emptyWorld();
  w = E.foundEnclave(w, { name: "Hirer", archetype: "Liquidity Nexus", charter: "c", collateral: 200, treasury: 400, owner: "autonomous" }, t0);
  w = E.foundEnclave(w, { name: "Provider", archetype: "Oracle Collective", charter: "c", collateral: 200, treasury: 400, owner: "autonomous", endpoint: "https://x", capability: "data-analysis", price: 5 }, t0);
  w = E.proposeTreaty(w, { proposer: "hirer", counterparty: "provider", kind: "SERVICE", terms: "serve", bond: 100, durationMs: 600_000, feePerCall: 5, maxCalls: 4 }, t0);
  w = E.ratifyTreaty(w, 1, "provider", t0 + 1);
  return w;
}
const total = (w: E.World) => E.r2(w.enclaves.reduce((s, e) => s + e.treasury + e.claimable, 0) + E.lockedEscrow(w) + w.reserves);
let w = base();
ok(E.enclaveById(w, "hirer").treasury === 280, "hirer paid bond+budget");
ok(E.enclaveById(w, "provider").treasury === 300, "provider matched bond");
ok(total(w) === 800, "conservation after ratify");
throws(() => E.ratifyTreaty(w, 1, "provider", t0), "ERR_INVALID_STATE", "double ratify");
// calls: 3 fail, 1 ok
const call = (ok: boolean) => ({ ts: t0, ok, ms: 10, input: "i", output: "o" });
for (const c of [false, false, true, false]) w = E.recordServiceCall(w, 1, call(c), t0 + 5);
const t = E.treatyById(w, 1);
ok(t.callBudget === 15 && E.enclaveById(w, "provider").claimable === 5, "one fee paid");
ok(E.defendantMetricBps(t, "provider") === 7500, "metric 7500");
ok(E.defendantMetricBps(t, "hirer") === 0, "hirer metric 0");
ok(total(w) === 800, "conservation after calls");
// CRITICAL
let c = E.prepareDispute(w, 1, "hirer", "failed calls", t0 + 10);
ok(c.bond === 50, "bond at rep 50 = 50");
let w2 = E.settleDispute(w, c, { tier: "CRITICAL_BREACH", rationale: "r", by: "local rule", allegation: "a", evidenceUri: "" }, t0 + 10);
ok(E.enclaveById(w2, "provider").status === "sanctioned", "sanctioned");
ok(E.enclaveById(w2, "hirer").reputation === 65, "plaintiff +15");
ok(E.treatyById(w2, 1).status === "settled", "settled");
ok(E.enclaveById(w2, "hirer").claimable === E.r2(100 + 100 + 50 + 15), "plaintiff gets both bonds + dispute bond + budget");
ok(total(w2) === 800, "conservation critical");
throws(() => E.prepareDispute(w2, 1, "hirer", "again", t0 + 99_999), "ERR_TREATY_NOT_ACTIVE", "settled treaty");
// ELEVATED twice
let w3 = E.settleDispute(w, c, { tier: "ELEVATED_RISK", rationale: "r", by: "local rule", allegation: "a", evidenceUri: "" }, t0 + 10);
ok(E.treatyById(w3, 1).bondB === 75 && w3.reserves === 25.5, "25% slash + fee");
ok(E.enclaveById(w3, "provider").reputation === 40, "defendant -10");
ok(total(w3) === 800, "conservation elevated");
throws(() => E.prepareDispute(w3, 1, "hirer", "new text", t0 + 20), "ERR_DISPUTE_COOLDOWN", "cooldown");
throws(() => E.prepareDispute(w3, 1, "hirer", "failed calls", t0 + 100_000), "ERR_REPLAY_DISPUTE", "replay");
let c2 = E.prepareDispute(w3, 1, "hirer", "second", t0 + 100_000);
let w4 = E.settleDispute(w3, c2, { tier: "ELEVATED_RISK", rationale: "r", by: "local rule", allegation: "a", evidenceUri: "" }, t0 + 100_000);
ok(E.treatyById(w4, 1).status === "settled", "second elevated settles");
ok(total(w4) === 800, "conservation elevated x2");
// NORMAL, MALICIOUS
let w5 = E.settleDispute(w, c, { tier: "NORMAL", rationale: "r", by: "local rule", allegation: "a", evidenceUri: "" }, t0 + 10);
ok(w5.reserves === 0.5 && E.enclaveById(w5, "hirer").claimable === 49.5, "normal fee");
let w6 = E.settleDispute(w, c, { tier: "MALICIOUS_REPORT", rationale: "r", by: "local rule", allegation: "a", evidenceUri: "" }, t0 + 10);
ok(w6.reserves === 50 && E.enclaveById(w6, "hirer").reputation === 30, "malicious forfeits bond, -20");
ok(total(w5) === 800 && total(w6) === 800, "conservation normal/malicious");
// clamp
ok(E.clampTier("MALICIOUS_REPORT", 3000, false) === "NORMAL", "clamp 1");
ok(E.clampTier("CRITICAL_BREACH", 300, true) === "NORMAL", "clamp 2");
ok(E.clampTier("CRITICAL_BREACH", 1000, true) === "ELEVATED_RISK", "clamp 3a");
ok(E.clampTier("CRITICAL_BREACH", 1000, false) === "NORMAL", "clamp 3b");
ok(E.clampTier("CRITICAL_BREACH", null, false) === "ELEVATED_RISK", "clamp null");
// exit + expire + claim
let w7 = E.exitTreaty(w, 1, "provider", t0 + 20);
ok(w7.reserves === 10 && E.enclaveById(w7, "provider").claimable === 95 && total(w7) === 800, "exit penalty");
let w8 = E.expireTreaties(w, t0 + 600_002);
ok(E.treatyById(w8, 1).status === "expired" && total(w8) === 800, "expiry");
w8 = E.claim(w8, "hirer", t0 + 600_003);
ok(E.enclaveById(w8, "hirer").claimable === 0 && total(w8) === 800, "claim");
// gates
let g = E.emptyWorld();
throws(() => E.foundEnclave(g, { name: "x", archetype: "Liquidity Nexus", charter: "", collateral: 50, treasury: 0, owner: "you" }, t0), "ERR_INSUFFICIENT_BOND", "min collateral");
w = base();
throws(() => E.proposeTreaty(w, { proposer: "hirer", counterparty: "provider", kind: "NON_AGGRESSION", terms: "t", bond: 281, durationMs: 600_000 }, t0 + 2), "ERR_INSUFFICIENT_BOND", "treasury");
let w9 = E.foundEnclave(w, { name: "Rich", archetype: "Defense Vanguard", charter: "", collateral: 100, treasury: 2000, owner: "you" }, t0);
throws(() => E.proposeTreaty(w9, { proposer: "rich", counterparty: "hirer", kind: "NON_AGGRESSION", terms: "t", bond: 600, durationMs: 600_000 }, t0 + 1000), "ERR_ENCLAVE_NOT_MATURED", "maturation");
// autonomous loop runs a full cycle without throwing
let a = E.emptyWorld();
const names = ["A", "B", "C", "D"]; const arch: E.Archetype[] = ["Oracle Collective", "Liquidity Nexus", "Autonomous Arbiter", "Defense Vanguard"];
names.forEach((n, i) => { a = E.foundEnclave(a, { name: n, archetype: arch[i], charter: "", collateral: 200, treasury: 300, owner: "autonomous", endpoint: "https://e", capability: "x", price: 4 }, t0); });
const kinds: Record<string, number> = {};
for (let i = 0, now = t0 + 10_000; i < 200; i++, now += 7000) {
  const act = E.nextAutonomousAction(a, now, i);
  if (!act) continue;
  kinds[act.type] = (kinds[act.type] ?? 0) + 1;
  if (act.type === "propose") a = E.proposeTreaty(a, act.input, now);
  if (act.type === "ratify") a = E.ratifyTreaty(a, act.treatyId, act.by, now, act.note);
  if (act.type === "reject") a = E.rejectTreaty(a, act.treatyId, act.by, now, act.note);
  if (act.type === "claim") a = E.claim(a, act.enclaveId, now);
  if (act.type === "invoke") a = E.recordServiceCall(a, act.treatyId, call(i % 3 !== 0), now);
  if (act.type === "dispute") { const d = E.prepareDispute(a, act.treatyId, act.plaintiff, act.allegation, now); const v = E.localTribunal(d.metricBps, false); a = E.settleDispute(a, d, { ...v, tier: E.clampTier(v.tier, d.metricBps, false), by: "local rule", allegation: act.allegation, evidenceUri: "" }, now); }
  a = E.expireTreaties(a, now);
}
ok(total(a) === 1200, "autonomous conservation " + total(a));
console.log("actions", JSON.stringify(kinds));
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

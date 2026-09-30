import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

// Adjudicates a treaty dispute between two agents on GenLayer.
//
// Preferred: the TreatyTribunal intelligent contract (contracts/genlayer),
// which returns one of four tiers and keys every case by id. Until it is
// deployed and GENLAYER_TRIBUNAL_ADDRESS is set, the existing AgentMarketJudge
// is used and its refund/release answer is mapped onto a tier. Without a
// funded GENLAYER_PRIVATE_KEY the route answers 501 and the client rules with
// its labelled local rule instead.
const TRIBUNAL_ADDRESS = process.env.GENLAYER_TRIBUNAL_ADDRESS as `0x${string}` | undefined;
const JUDGE_ADDRESS = (process.env.GENLAYER_JUDGE_ADDRESS ||
  "0x6CcDF8047830fb5185b4FC6b5a0c52B212577cC8") as `0x${string}`;

export const maxDuration = 60;

type Body = {
  caseId?: string;
  kind?: string;
  terms?: string;
  defendantRole?: "party_a" | "party_b";
  allegation?: string;
  evidenceUri?: string;
  serviceRecord?: { calls: number; failed: number } | null;
  metricBps?: number | null;
};

const TIERS = ["CRITICAL_BREACH", "ELEVATED_RISK", "NORMAL", "MALICIOUS_REPORT"];

// The server fetches a URL the user chose, so it refuses anything that could
// reach a private network (cloud metadata, localhost, RFC 1918, CGNAT).
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
}

async function safeToFetch(uri: string): Promise<boolean> {
  let url: URL;
  try { url = new URL(uri); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (isIP(host.replace(/^\[|\]$/g, ""))) return !privateAddress(host.replace(/^\[|\]$/g, ""));
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every(a => !privateAddress(a.address));
  } catch {
    return false;
  }
}

// The filing commits to the exact bytes of its evidence: the digest is taken
// here, at filing time, and the tribunal only admits a document that still
// hashes to it when the validators fetch it.
async function commitEvidence(uri: string): Promise<string> {
  if (!(await safeToFetch(uri))) return "";
  try {
    // No redirects: a public URL must not bounce the server onto a private one.
    const res = await fetch(uri, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    return createHash("sha256").update(await res.text(), "utf8").digest("hex");
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const privateKey = process.env.GENLAYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) return NextResponse.json({ configured: false }, { status: 501 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const caseId = String(body.caseId ?? "").slice(0, 120);
  const kind = String(body.kind ?? "");
  const terms = String(body.terms ?? "").slice(0, 2000);
  const allegation = String(body.allegation ?? "").slice(0, 2000);
  const evidenceUri = String(body.evidenceUri ?? "").slice(0, 500);
  const defendantRole = body.defendantRole === "party_a" ? "party_a" : "party_b";
  if (!caseId || !allegation) return NextResponse.json({ error: "caseId and allegation are required" }, { status: 400 });

  try {
    const client = createClient({ chain: studionet, account: createAccount(privateKey) });

    if (TRIBUNAL_ADDRESS) {
      const evidenceHash = await commitEvidence(evidenceUri);
      const txHash = await client.writeContract({
        address: TRIBUNAL_ADDRESS,
        functionName: "adjudicate",
        args: [caseId, kind, terms, defendantRole, allegation, evidenceUri, evidenceHash,
          body.serviceRecord ? JSON.stringify(body.serviceRecord) : ""],
        value: BigInt(0),
      });
      await client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED });
      const raw = await client.readContract({ address: TRIBUNAL_ADDRESS, functionName: "get_case", args: [caseId] });
      const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!TIERS.includes(rec.verdict)) throw new Error("tribunal returned no tier");
      return NextResponse.json({
        configured: true, source: "GenLayer TreatyTribunal", tier: rec.verdict,
        rationale: rec.rationale, txHash, address: TRIBUNAL_ADDRESS,
      });
    }

    // Fallback: the marketplace's two-outcome judge, read as a tier.
    const record = body.serviceRecord
      ? `Service record: ${body.serviceRecord.failed} of ${body.serviceRecord.calls} paid calls failed.`
      : "No service record: this treaty has no objective metric.";
    const txHash = await client.writeContract({
      address: JUDGE_ADDRESS,
      functionName: "resolve_dispute",
      args: [`Treaty between two AI agents (${kind}). Covenant: ${terms}`.slice(0, 2000), record, allegation],
      value: BigInt(0),
    });
    await client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED });
    const countRaw = await client.readContract({ address: JUDGE_ADDRESS, functionName: "get_case_count", args: [] });
    const verdictRaw = await client.readContract({ address: JUDGE_ADDRESS, functionName: "get_verdict", args: [Number(countRaw) - 1] });
    const v = typeof verdictRaw === "string" ? JSON.parse(verdictRaw) : verdictRaw;
    const bps = body.metricBps ?? null;
    const tier = v.verdict === "refund" ? (bps !== null && bps >= 7500 ? "CRITICAL_BREACH" : "ELEVATED_RISK") : "NORMAL";
    return NextResponse.json({
      configured: true, source: "GenLayer AgentMarketJudge", tier,
      rationale: v.reasoning, txHash, address: JUDGE_ADDRESS,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

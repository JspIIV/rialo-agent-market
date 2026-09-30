import { NextRequest, NextResponse } from "next/server";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

// Our deployed AgentMarketJudge intelligent contract on GenLayer Studio testnet.
// Public address — safe to keep here; overridable via env.
const JUDGE_ADDRESS = (process.env.GENLAYER_JUDGE_ADDRESS ||
  "0x6CcDF8047830fb5185b4FC6b5a0c52B212577cC8") as `0x${string}`;

// Long-running: the write executes an LLM under GenLayer consensus.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const privateKey = process.env.GENLAYER_PRIVATE_KEY as `0x${string}` | undefined;

  // Without a funded burner key we can't submit the write. Tell the client to
  // fall back to the local arbiter rather than failing the dispute.
  if (!privateKey) {
    return NextResponse.json({ configured: false }, { status: 501 });
  }

  let body: { taskDescription?: string; agentResponse?: string; posterClaim?: string; terms?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // The judge contract takes three strings, so agreed terms ride inside the
  // task description rather than needing a new contract deployment.
  const terms = (body.terms ?? "").trim();
  const taskDescription = (terms
    ? `${body.taskDescription ?? ""}\n\nAgreed terms (accepted by the agent when it took the job; judge the delivery against these): ${terms}`
    : body.taskDescription ?? "").slice(0, 2000);
  const agentResponse = (body.agentResponse ?? "").slice(0, 2000);
  const posterClaim = (body.posterClaim ?? "").slice(0, 2000);

  try {
    const account = createAccount(privateKey);
    const client = createClient({ chain: studionet, account });

    // 1) Submit the dispute — this runs the LLM arbiter on-chain.
    const txHash = await client.writeContract({
      address: JUDGE_ADDRESS,
      functionName: "resolve_dispute",
      args: [taskDescription, agentResponse, posterClaim],
      value: BigInt(0),
    });

    // ACCEPTED is where the verdict is available; FINALIZED only happens after
    // a long appeal window we don't need to block on.
    await client.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.ACCEPTED,
    });

    // 2) The new case is the last one; read its verdict back.
    const countRaw = await client.readContract({
      address: JUDGE_ADDRESS,
      functionName: "get_case_count",
      args: [],
    });
    const caseId = Number(countRaw) - 1;

    const verdictRaw = await client.readContract({
      address: JUDGE_ADDRESS,
      functionName: "get_verdict",
      args: [caseId],
    });
    const verdict = typeof verdictRaw === "string" ? JSON.parse(verdictRaw) : verdictRaw;

    return NextResponse.json({
      configured: true,
      verdict: verdict.verdict,
      reasoning: verdict.reasoning,
      violations: verdict.violations ?? [],
      caseId,
      txHash,
      address: JUDGE_ADDRESS,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

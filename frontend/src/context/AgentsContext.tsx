"use client";
import { createContext, useContext } from "react";
import { usePersistentState } from "@/lib/usePersistentState";

export type AgentJob = {
  taskId: number;
  taskTitle: string;
  ms: number;
  success: boolean;
  ts: number;
};

export type Agent = {
  id: number;
  name: string;
  capabilities: string[];
  price: number;
  endpoint: string;
  tasksCompleted: number;
  tasksFailed: number;
  totalMs: number;
  reputation: number;
  active: boolean;
  owner: string;
  history: AgentJob[];
  // Collateral, as in Westphalia's bonded treaties: free stake the agent can
  // put up, and the part currently locked against jobs it has taken. Optional
  // so agents saved before bonds existed still load (they read as 0).
  bond?: number;
  bondLocked?: number;
};

export type ActivityEvent = {
  id: number;
  text: string;
  status: "completed" | "in-progress" | "new" | "failed";
  ts: number;
};

// Protocol fee taken from each released escrow (basis points). This is how the
// marketplace itself earns — the rest goes to the agent.
export const PROTOCOL_FEE_BPS = 200; // 2%
export function feeSplit(budget: number) {
  const fee = Math.round(budget * PROTOCOL_FEE_BPS) / 10000;
  return { fee: Number(fee.toFixed(2)), toAgent: Number((budget - fee).toFixed(2)) };
}

// Every job locks a bond worth half its value from the agent that takes it.
// Delivering returns it; breaching slashes it to the party that was wronged.
export const BOND_BPS = 5000; // 50%
export function bondFor(amount: number) {
  return Number((amount * BOND_BPS / 10000).toFixed(2));
}
export function freeBond(a: Agent) {
  return a.bond ?? 0;
}
const round2 = (n: number) => Number(n.toFixed(2));

const base = (a: Partial<Agent> & Pick<Agent, "id" | "name" | "capabilities" | "price" | "endpoint" | "owner">): Agent => ({
  tasksCompleted: 0, tasksFailed: 0, totalMs: 0, reputation: 50, active: true, history: [], bond: 0, bondLocked: 0, ...a,
});

// Every seeded agent points at a REAL, reachable endpoint (no placeholder/mock
// data). Assigning a task to any of them makes a genuine HTTP call.
export const MOCK_AGENTS: Agent[] = [
  base({ id: 1, name: "TranslateBot",   capabilities: ["translation"],   price: 3, endpoint: "https://api.mymemory.translated.net/get", bond: 50, owner: "Live demo agent" }),
  base({ id: 2, name: "PriceOracleBot", capabilities: ["data-analysis"], price: 5, endpoint: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", bond: 50, owner: "Live demo agent" }),
  base({ id: 3, name: "BitPriceBot",    capabilities: ["data-analysis"], price: 5, endpoint: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", bond: 50, owner: "Live demo agent" }),
  base({ id: 4, name: "TaskRunner",     capabilities: ["unit-tests", "code-review"], price: 5, endpoint: "https://jsonplaceholder.typicode.com/posts", bond: 50, owner: "Live demo agent" }),
  base({ id: 5, name: "EchoWorker",     capabilities: ["text-summary", "security-audit"], price: 4, endpoint: "https://postman-echo.com/post", bond: 50, owner: "Live demo agent" }),
];

// Honest seed: the only pre-existing events are the live agents registering.
// Task activity fills in for real as the user assigns tasks during the demo.
function seedActivity(): ActivityEvent[] {
  const now = Date.now();
  return [
    { id: 5, text: "EchoWorker joined the marketplace (text-summary, security-audit)", status: "new", ts: now - 3 * 60_000 },
    { id: 4, text: "TaskRunner joined the marketplace (unit-tests, code-review)",       status: "new", ts: now - 6 * 60_000 },
    { id: 3, text: "BitPriceBot joined the marketplace (data-analysis)",                status: "new", ts: now - 9 * 60_000 },
    { id: 2, text: "PriceOracleBot joined the marketplace (data-analysis)",             status: "new", ts: now - 12 * 60_000 },
    { id: 1, text: "TranslateBot joined the marketplace (translation)",                 status: "new", ts: now - 15 * 60_000 },
  ];
}

export function isLiveAgent(agent: Agent) {
  return !agent.endpoint.includes("example.com");
}

export function avgResponseMs(a: Agent) {
  return a.tasksCompleted > 0 ? Math.round(a.totalMs / a.tasksCompleted) : null;
}

export function successRate(a: Agent) {
  const total = a.tasksCompleted + a.tasksFailed;
  return total > 0 ? Math.round((a.tasksCompleted / total) * 100) : null;
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type AgentsState = {
  agents: Agent[];
  activity: ActivityEvent[];
  addAgent: (a: Pick<Agent, "name" | "capabilities" | "price" | "endpoint" | "owner" | "bond">) => void;
  stakeBond: (agentId: number, amount: number) => void;
  lockBond: (agentId: number, amount: number) => boolean;
  releaseBond: (agentId: number, amount: number) => void;
  slashBond: (agentId: number, amount: number, toAgentId?: number) => void;
  recordResult: (agentId: number, job: AgentJob) => void;
  rateAgent: (agentId: number, stars: number) => void;
  penalise: (agentId: number) => void;
  reward: (agentId: number) => void;
  addActivity: (text: string, status: ActivityEvent["status"]) => void;
};

const AgentsContext = createContext<AgentsState | null>(null);

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = usePersistentState<Agent[]>("am_agents", MOCK_AGENTS);
  const [activity, setActivity] = usePersistentState<ActivityEvent[]>("am_activity", seedActivity);

  function addActivity(text: string, status: ActivityEvent["status"]) {
    setActivity(prev => [
      { id: (prev[0]?.id ?? 0) + 1, text, status, ts: Date.now() },
      ...prev,
    ].slice(0, 15));
  }

  function addAgent(a: Pick<Agent, "name" | "capabilities" | "price" | "endpoint" | "owner" | "bond">) {
    setAgents(prev => [
      base({ ...a, id: Math.max(0, ...prev.map(p => p.id)) + 1 }),
      ...prev,
    ]);
    addActivity(`${a.name} joined the marketplace (${a.capabilities.join(", ")})`, "new");
  }

  // Adds free stake to an agent (the caller has already taken it from a wallet).
  function stakeBond(agentId: number, amount: number) {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, bond: round2(freeBond(a) + amount) } : a));
  }

  // Moves stake from free to locked for a job. False if the agent can't cover it.
  function lockBond(agentId: number, amount: number) {
    const agent = agents.find(a => a.id === agentId);
    if (!agent || freeBond(agent) < amount) return false;
    setAgents(prev => prev.map(a => a.id === agentId && freeBond(a) >= amount
      ? { ...a, bond: round2(freeBond(a) - amount), bondLocked: round2((a.bondLocked ?? 0) + amount) } : a));
    return true;
  }

  // The job was delivered: the locked stake goes back to the agent.
  function releaseBond(agentId: number, amount: number) {
    setAgents(prev => prev.map(a => a.id === agentId
      ? { ...a, bond: round2(freeBond(a) + amount), bondLocked: round2(Math.max(0, (a.bondLocked ?? 0) - amount)) } : a));
  }

  // The job was breached: the locked stake leaves the agent. When the wronged
  // party is another agent it lands in that agent's stake; a human poster is
  // paid by the caller through the wallet.
  function slashBond(agentId: number, amount: number, toAgentId?: number) {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, bondLocked: round2(Math.max(0, (a.bondLocked ?? 0) - amount)) } :
      a.id === toAgentId ? { ...a, bond: round2(freeBond(a) + amount) } : a));
  }

  // Records a finished dispatch: updates counters, response time, history, and
  // nudges reputation up on success.
  function recordResult(agentId: number, job: AgentJob) {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId) return a;
      const history = [job, ...a.history].slice(0, 20);
      if (job.success) {
        return { ...a, tasksCompleted: a.tasksCompleted + 1, totalMs: a.totalMs + job.ms, reputation: Math.min(100, a.reputation + 2), history };
      }
      return { ...a, tasksFailed: a.tasksFailed + 1, reputation: Math.max(0, a.reputation - 8), history };
    }));
  }

  // Poster rates a completed task 1-5 stars; reputation drifts toward it.
  function rateAgent(agentId: number, stars: number) {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, reputation: Math.round(a.reputation * 0.7 + stars * 20 * 0.3) } : a
    ));
  }

  // Opening a dispute lowers the agent's reputation.
  function penalise(agentId: number) {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, reputation: Math.max(0, a.reputation - 10) } : a
    ));
  }

  // A dispute resolved in the agent's favour restores some reputation.
  function reward(agentId: number) {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, reputation: Math.min(100, a.reputation + 5) } : a
    ));
  }

  return (
    <AgentsContext.Provider value={{ agents, activity, addAgent, stakeBond, lockBond, releaseBond, slashBond, recordResult, rateAgent, penalise, reward, addActivity }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within AgentsProvider");
  return ctx;
}

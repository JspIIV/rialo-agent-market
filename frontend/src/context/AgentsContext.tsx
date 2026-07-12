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

const base = (a: Partial<Agent> & Pick<Agent, "id" | "name" | "capabilities" | "price" | "endpoint" | "owner">): Agent => ({
  tasksCompleted: 0, tasksFailed: 0, totalMs: 0, reputation: 50, active: true, history: [], ...a,
});

export const MOCK_AGENTS: Agent[] = [
  base({ id: 1, name: "GPT-Summariser", capabilities: ["text-summary", "translation"],   price: 10, endpoint: "https://api.example.com/summarise",  tasksCompleted: 23, totalMs: 23 * 480, reputation: 91, owner: "7xKp...3mNz" }),
  base({ id: 2, name: "CodeReview-Pro", capabilities: ["code-review", "security-audit"], price: 50, endpoint: "https://api.example.com/codereview",  tasksCompleted: 11, totalMs: 11 * 920, reputation: 84, owner: "9aQr...1pVw" }),
  base({ id: 3, name: "LinguaBot",      capabilities: ["translation", "text-summary"],   price: 8,  endpoint: "https://api.example.com/lingua",      tasksCompleted: 18, totalMs: 18 * 350, reputation: 78, owner: "3bFt...7xJk" }),
  base({ id: 4, name: "DevAssist-v2",   capabilities: ["code-review", "unit-tests"],     price: 35, endpoint: "https://api.example.com/devassist",   tasksCompleted: 6,  totalMs: 6 * 700,  reputation: 70, owner: "5cGm...2yLs" }),
  base({ id: 5, name: "DataAnalyser",   capabilities: ["data-analysis", "text-summary"], price: 25, endpoint: "https://api.example.com/dataanalyse", reputation: 50, active: false, owner: "1dHn...8wMt" }),
  base({ id: 6, name: "TranslateBot",   capabilities: ["translation"],                   price: 3,  endpoint: "https://api.mymemory.translated.net/get", owner: "Live demo agent" }),
  base({ id: 7, name: "PriceOracleBot", capabilities: ["data-analysis"],                 price: 5,  endpoint: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", owner: "Live demo agent" }),
];

function seedActivity(): ActivityEvent[] {
  const now = Date.now();
  return [
    { id: 4, text: 'Task #45 "Summarise Q2 report" completed by GPT-Summariser',  status: "completed",   ts: now - 2 * 60_000 },
    { id: 3, text: "CodeReview-Pro joined the marketplace (code-review)",          status: "new",         ts: now - 5 * 60_000 },
    { id: 2, text: 'Task #44 "Translate EN to TR" picked up by LinguaBot',         status: "in-progress", ts: now - 8 * 60_000 },
    { id: 1, text: 'Task #43 "Generate unit tests" completed by DevAssist-v2',     status: "completed",   ts: now - 12 * 60_000 },
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
  addAgent: (a: Pick<Agent, "name" | "capabilities" | "price" | "endpoint" | "owner">) => void;
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

  function addAgent(a: Pick<Agent, "name" | "capabilities" | "price" | "endpoint" | "owner">) {
    setAgents(prev => [
      base({ ...a, id: Math.max(0, ...prev.map(p => p.id)) + 1 }),
      ...prev,
    ]);
    addActivity(`${a.name} joined the marketplace (${a.capabilities.join(", ")})`, "new");
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
    <AgentsContext.Provider value={{ agents, activity, addAgent, recordResult, rateAgent, penalise, reward, addActivity }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within AgentsProvider");
  return ctx;
}

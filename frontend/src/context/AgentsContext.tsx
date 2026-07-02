"use client";
import { createContext, useContext, useState } from "react";

export type Agent = {
  id: number;
  name: string;
  capabilities: string[];
  price: number;
  endpoint: string;
  tasksCompleted: number;
  reputation: number;
  active: boolean;
  owner: string;
};

export type ActivityEvent = {
  id: number;
  text: string;
  status: "completed" | "in-progress" | "new" | "failed";
  ts: number;
};

export const MOCK_AGENTS: Agent[] = [
  { id: 1, name: "GPT-Summariser",   capabilities: ["text-summary", "translation"],    price: 10,  endpoint: "https://api.example.com/summarise",  tasksCompleted: 23, reputation: 91, active: true,  owner: "7xKp...3mNz" },
  { id: 2, name: "CodeReview-Pro",   capabilities: ["code-review", "security-audit"],  price: 50,  endpoint: "https://api.example.com/codereview",  tasksCompleted: 11, reputation: 84, active: true,  owner: "9aQr...1pVw" },
  { id: 3, name: "LinguaBot",        capabilities: ["translation", "text-summary"],    price: 8,   endpoint: "https://api.example.com/lingua",      tasksCompleted: 18, reputation: 78, active: true,  owner: "3bFt...7xJk" },
  { id: 4, name: "DevAssist-v2",     capabilities: ["code-review", "unit-tests"],      price: 35,  endpoint: "https://api.example.com/devassist",   tasksCompleted: 6,  reputation: 70, active: true,  owner: "5cGm...2yLs" },
  { id: 5, name: "DataAnalyser",     capabilities: ["data-analysis", "text-summary"],  price: 25,  endpoint: "https://api.example.com/dataanalyse", tasksCompleted: 0,  reputation: 50, active: false, owner: "1dHn...8wMt" },
  { id: 6, name: "TranslateBot",     capabilities: ["translation"],                    price: 10,  endpoint: "https://api.mymemory.translated.net/get", tasksCompleted: 0, reputation: 50, active: true, owner: "Live demo agent" },
  { id: 7, name: "PriceOracleBot",   capabilities: ["data-analysis"],                  price: 5,   endpoint: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", tasksCompleted: 0, reputation: 50, active: true, owner: "Live demo agent" },
];

// Built lazily inside useState so the timestamps are computed once on the
// client, not at module load (which differs between server and client and
// causes hydration mismatches).
function seedActivity(): ActivityEvent[] {
  const now = Date.now();
  return [
    { id: 4, text: 'Task #45 "Summarise Q2 report" completed by GPT-Summariser',  status: "completed",   ts: now - 2 * 60_000 },
    { id: 3, text: "CodeReview-Pro joined the marketplace (code-review)",          status: "new",         ts: now - 5 * 60_000 },
    { id: 2, text: 'Task #44 "Translate EN to TR" picked up by LinguaBot',         status: "in-progress", ts: now - 8 * 60_000 },
    { id: 1, text: 'Task #43 "Generate unit tests" completed by DevAssist-v2',     status: "completed",   ts: now - 12 * 60_000 },
  ];
}

// An agent counts as "live" when its endpoint is a real reachable API,
// not the example.com placeholder used for seeded demo data.
export function isLiveAgent(agent: Agent) {
  return !agent.endpoint.includes("example.com");
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
  addAgent: (a: Omit<Agent, "id" | "tasksCompleted" | "reputation" | "active">) => void;
  bumpStats: (agentId: number) => void;
  addActivity: (text: string, status: ActivityEvent["status"]) => void;
};

const AgentsContext = createContext<AgentsState | null>(null);

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [activity, setActivity] = useState<ActivityEvent[]>(seedActivity);

  function addActivity(text: string, status: ActivityEvent["status"]) {
    setActivity(prev => [
      { id: (prev[0]?.id ?? 0) + 1, text, status, ts: Date.now() },
      ...prev,
    ].slice(0, 12));
  }

  function addAgent(a: Omit<Agent, "id" | "tasksCompleted" | "reputation" | "active">) {
    setAgents(prev => [
      { ...a, id: Math.max(...prev.map(p => p.id)) + 1, tasksCompleted: 0, reputation: 50, active: true },
      ...prev,
    ]);
    addActivity(`${a.name} joined the marketplace (${a.capabilities.join(", ")})`, "new");
  }

  function bumpStats(agentId: number) {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, tasksCompleted: a.tasksCompleted + 1 } : a));
  }

  return (
    <AgentsContext.Provider value={{ agents, activity, addAgent, bumpStats, addActivity }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within AgentsProvider");
  return ctx;
}

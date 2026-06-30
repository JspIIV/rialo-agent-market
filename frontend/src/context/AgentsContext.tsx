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

export const MOCK_AGENTS: Agent[] = [
  { id: 1, name: "GPT-Summariser",   capabilities: ["text-summary", "translation"],    price: 10,  endpoint: "https://api.example.com/summarise",  tasksCompleted: 23, reputation: 91, active: true,  owner: "7xKp...3mNz" },
  { id: 2, name: "CodeReview-Pro",   capabilities: ["code-review", "security-audit"],  price: 50,  endpoint: "https://api.example.com/codereview",  tasksCompleted: 11, reputation: 84, active: true,  owner: "9aQr...1pVw" },
  { id: 3, name: "LinguaBot",        capabilities: ["translation", "text-summary"],    price: 8,   endpoint: "https://api.example.com/lingua",      tasksCompleted: 18, reputation: 78, active: true,  owner: "3bFt...7xJk" },
  { id: 4, name: "DevAssist-v2",     capabilities: ["code-review", "unit-tests"],      price: 35,  endpoint: "https://api.example.com/devassist",   tasksCompleted: 6,  reputation: 70, active: true,  owner: "5cGm...2yLs" },
  { id: 5, name: "DataAnalyser",     capabilities: ["data-analysis", "text-summary"],  price: 25,  endpoint: "https://api.example.com/dataanalyse", tasksCompleted: 0,  reputation: 50, active: false, owner: "1dHn...8wMt" },
  { id: 6, name: "TranslateBot",     capabilities: ["translation"],                    price: 10,  endpoint: "https://api.mymemory.translated.net/get", tasksCompleted: 0, reputation: 50, active: true, owner: "Live demo agent" },
  { id: 7, name: "PriceOracleBot",   capabilities: ["data-analysis"],                  price: 5,   endpoint: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", tasksCompleted: 0, reputation: 50, active: true, owner: "Live demo agent" },
];

type AgentsState = {
  agents: Agent[];
  addAgent: (a: Omit<Agent, "id" | "tasksCompleted" | "reputation" | "active">) => void;
  bumpStats: (agentId: number) => void;
};

const AgentsContext = createContext<AgentsState | null>(null);

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);

  function addAgent(a: Omit<Agent, "id" | "tasksCompleted" | "reputation" | "active">) {
    setAgents(prev => [
      { ...a, id: Math.max(...prev.map(p => p.id)) + 1, tasksCompleted: 0, reputation: 50, active: true },
      ...prev,
    ]);
  }

  function bumpStats(agentId: number) {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, tasksCompleted: a.tasksCompleted + 1 } : a));
  }

  return (
    <AgentsContext.Provider value={{ agents, addAgent, bumpStats }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within AgentsProvider");
  return ctx;
}

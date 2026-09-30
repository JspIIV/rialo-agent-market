"use client";
import { createContext, useContext, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";

export type TaskStatus = "open" | "assigned" | "in-progress" | "completed" | "disputed" | "cancelled" | "expired" | "refunded";

// A sub-job spun off when the primary agent hires another agent (A2A).
export type SubJob = {
  agentId: number;
  agentName: string;
  capability: string;
  cost: number;
  ms: number;
  endpoint: string;
  result: string;
  // Collateral the sub-agent locked when it was hired, and whether it was
  // slashed to the hiring agent because the sub-job failed.
  bond?: number;
  breached?: boolean;
};

export type Task = {
  id: number;
  title: string;
  description: string;
  capability: string;
  budget: number;
  poster: string;
  status: TaskStatus;
  assignedAgent?: string;
  assignedAgentId?: number;
  result?: string;
  durationMs?: number;
  dispatchedTo?: string;
  requestPayload?: string;
  rating?: number;
  deadlineTs?: number;
  createdAt: string;
  // Plain-language terms the agent accepts by taking the job. The arbiter
  // judges a dispute against these, not just against the description.
  terms?: string;
  // Collateral the assigned agent locked when it took the job; settled once
  // the poster accepts (rates) the result or the arbiter rules.
  agentBond?: number;
  bondSettled?: boolean;
  // When a delivered job's bond returns on its own if nobody has disputed it.
  bondReleaseTs?: number;
  // Dispute / adjudication
  disputeReason?: string;
  verdict?: "refund" | "release";
  verdictReasoning?: string;
  verdictBy?: string;
  verdictTxHash?: string;
  // A2A pipeline
  secondCapability?: string;
  subJob?: SubJob;
};

// All seed tasks are OPEN — nothing here is a fabricated "completed" result.
// When you assign any of these to a live agent, the result you see is a real
// HTTP response produced during the demo.
// How long a delivered job stays open to dispute before the agent's bond is
// returned without anyone accepting it by hand.
export const DISPUTE_WINDOW_MS = 2 * 60_000;

export const MOCK_TASKS: Task[] = [
  { id: 47, title: "Report SOL price in Turkish",     description: "Solana price in USD",                          capability: "data-analysis",  budget: 12, poster: "A2A demo", status: "open", secondCapability: "translation", terms: "The price must be fetched live, not invented. The Turkish sentence must contain the same number.", createdAt: "just now" },
  { id: 46, title: "Translate greeting to Turkish",   description: "Good morning, welcome to the marketplace",     capability: "translation",    budget: 3,  poster: "demo",    status: "open", createdAt: "just now" },
  { id: 45, title: "Fetch live BTC price",            description: "Return the current Bitcoin price in USD",     capability: "data-analysis",  budget: 5,  poster: "demo",    status: "open", createdAt: "2m ago" },
  { id: 44, title: "Generate unit tests for login",   description: "Write Jest tests for the login flow",         capability: "unit-tests",     budget: 5,  poster: "demo",    status: "open", createdAt: "5m ago" },
  { id: 43, title: "Summarise release notes",         description: "Summarise the v2 release notes into 3 points", capability: "text-summary",   budget: 4,  poster: "demo",    status: "open", createdAt: "9m ago" },
];

type TasksState = {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  search: string;
  setSearch: (s: string) => void;
};

const TasksContext = createContext<TasksState | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = usePersistentState<Task[]>("am_tasks", MOCK_TASKS);
  const [search, setSearch] = useState("");

  return (
    <TasksContext.Provider value={{ tasks, setTasks, search, setSearch }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used within TasksProvider");
  return ctx;
}

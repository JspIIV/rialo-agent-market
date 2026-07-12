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

export const MOCK_TASKS: Task[] = [
  { id: 47, title: "Report SOL price in Turkish",      description: "Solana price in USD",                                       capability: "data-analysis",  budget: 12, poster: "A2A demo",           status: "open", secondCapability: "translation", createdAt: "just now" },
  { id: 46, title: "Translate greeting to Turkish",   description: "Hello, welcome to the Rialo agent marketplace.",            capability: "translation",    budget: 10, poster: "TranslateBot demo",  status: "open",        createdAt: "just now" },
  { id: 45, title: "Summarise Q2 Financial Report",  description: "Summarise a 20-page PDF into key points.",                capability: "text-summary",   budget: 10, poster: "7xKp...3mNz", status: "completed",   assignedAgent: "GPT-Summariser",  result: "Q2 revenue +12% YoY. Operating margin improved by 3 points.", createdAt: "2m ago" },
  { id: 44, title: "Translate product docs EN to TR", description: "Translate 3 markdown files from English to Turkish.",     capability: "translation",    budget: 8,  poster: "9aQr...1pVw", status: "in-progress", assignedAgent: "LinguaBot",       createdAt: "8m ago" },
  { id: 43, title: "Code review for auth module",    description: "Review the JWT implementation for security issues.",       capability: "code-review",    budget: 50, poster: "3bFt...7xJk", status: "completed",   assignedAgent: "CodeReview-Pro",  result: "Found 2 issues in token expiry logic. Recommended fix included.", createdAt: "12m ago" },
  { id: 42, title: "Generate unit tests for API",    description: "Write Jest tests for the REST API endpoints.",             capability: "unit-tests",     budget: 35, poster: "5cGm...2yLs", status: "open",        createdAt: "20m ago" },
  { id: 41, title: "Fetch live SOL price",           description: "Return the current Solana price in USD.",                  capability: "data-analysis",  budget: 5,  poster: "1dHn...8wMt", status: "open",        createdAt: "1h ago" },
  { id: 40, title: "Security audit smart contract",  description: "Review the escrow contract for vulnerabilities.",          capability: "security-audit", budget: 80, poster: "7xKp...3mNz", status: "disputed",    assignedAgent: "CodeReview-Pro", assignedAgentId: 2, result: "Live agent response: looks fine, no issues found.", disputeReason: "The audit was one line with no detail — it clearly did not review the escrow logic.", createdAt: "2h ago" },
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

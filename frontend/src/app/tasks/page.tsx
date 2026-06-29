"use client";
import { useState } from "react";
import { ClipboardList, Plus, Zap, Clock, CheckCircle, AlertCircle, XCircle, Loader2 } from "lucide-react";
import clsx from "clsx";

type TaskStatus = "open" | "assigned" | "in-progress" | "completed" | "disputed" | "cancelled";

type Task = {
  id: number;
  title: string;
  description: string;
  capability: string;
  budget: number;
  poster: string;
  status: TaskStatus;
  assignedAgent?: string;
  result?: string;
  createdAt: string;
};

const MOCK_TASKS: Task[] = [
  { id: 45, title: "Summarise Q2 Financial Report",  description: "Summarise a 20-page PDF into key points.",                capability: "text-summary",   budget: 10, poster: "7xKp...3mNz", status: "completed",   assignedAgent: "GPT-Summariser",  result: "Q2 revenue +12% YoY. Operating margin improved by 3 points.", createdAt: "2m ago" },
  { id: 44, title: "Translate product docs EN to TR", description: "Translate 3 markdown files from English to Turkish.",     capability: "translation",    budget: 8,  poster: "9aQr...1pVw", status: "in-progress", assignedAgent: "LinguaBot",       createdAt: "8m ago" },
  { id: 43, title: "Code review for auth module",    description: "Review the JWT implementation for security issues.",       capability: "code-review",    budget: 50, poster: "3bFt...7xJk", status: "completed",   assignedAgent: "CodeReview-Pro",  result: "Found 2 issues in token expiry logic. Recommended fix included.", createdAt: "12m ago" },
  { id: 42, title: "Generate unit tests for API",    description: "Write Jest tests for the REST API endpoints.",             capability: "unit-tests",     budget: 35, poster: "5cGm...2yLs", status: "open",        createdAt: "20m ago" },
  { id: 41, title: "Analyse user engagement data",   description: "Identify drop-off patterns in the onboarding funnel.",    capability: "data-analysis",  budget: 25, poster: "1dHn...8wMt", status: "open",        createdAt: "1h ago" },
  { id: 40, title: "Security audit smart contract",  description: "Review the escrow contract for vulnerabilities.",          capability: "security-audit", budget: 80, poster: "7xKp...3mNz", status: "disputed",    assignedAgent: "CodeReview-Pro",  createdAt: "2h ago" },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.FC<{className?:string}> }> = {
  open:        { label: "Open",        color: "bg-blue-600/20   text-blue-400",   icon: ClipboardList },
  assigned:    { label: "Assigned",    color: "bg-yellow-600/20 text-yellow-400", icon: Clock },
  "in-progress":{ label:"In Progress", color: "bg-purple-600/20 text-purple-400", icon: Loader2 },
  completed:   { label: "Completed",   color: "bg-rialo-600/20  text-rialo-400",  icon: CheckCircle },
  disputed:    { label: "Disputed",    color: "bg-red-600/20    text-red-400",    icon: AlertCircle },
  cancelled:   { label: "Cancelled",   color: "bg-white/10      text-white/30",   icon: XCircle },
};

const ALL_CAPS = ["text-summary","translation","code-review","security-audit","unit-tests","data-analysis"];

export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>(MOCK_TASKS);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dispatching, setDispatching]   = useState<number | null>(null);
  const [form, setForm] = useState({ title:"", description:"", capability:"text-summary", budget:"", poster:"" });

  const filtered = filterStatus === "all"
    ? tasks
    : tasks.filter(t => t.status === filterStatus);

  function postTask(e: React.FormEvent) {
    e.preventDefault();
    const newTask: Task = {
      id: Math.max(...tasks.map(t => t.id)) + 1,
      title: form.title,
      description: form.description,
      capability: form.capability,
      budget: Number(form.budget),
      poster: form.poster || "Your wallet",
      status: "open",
      createdAt: "just now",
    };
    setTasks(prev => [newTask, ...prev]);
    setForm({ title:"", description:"", capability:"text-summary", budget:"", poster:"" });
    setShowForm(false);
  }

  // Simulate the on-chain HTTP dispatch
  function simulateDispatch(taskId: number) {
    setDispatching(taskId);
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: "in-progress" as TaskStatus, assignedAgent: "GPT-Summariser" } : t
    ));

    // Simulate agent HTTP response after 2s
    setTimeout(() => {
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: "completed" as TaskStatus, result: "Agent responded. Payment released." }
          : t
      ));
      setDispatching(null);
    }, 2000);
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Task Board</h1>
          <p className="text-white/40 mt-1">
            {tasks.filter(t => t.status === "open").length} open tasks waiting for agents
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-rialo-600 hover:bg-rialo-500 rounded-xl font-medium transition-all text-sm"
        >
          <Plus className="w-4 h-4" /> Post Task
        </button>
      </div>

      {/* Post task form */}
      {showForm && (
        <form onSubmit={postTask} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-rialo-400" /> Post a New Task
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm text-white/50">Task Title</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder="Summarise Q3 report"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm text-white/50">Description</label>
              <textarea
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all resize-none"
                placeholder="Describe what you need the agent to do..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Required Capability</label>
              <select
                className="w-full bg-[#0a0f0d] border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                value={form.capability}
                onChange={e => setForm(f => ({ ...f, capability: e.target.value }))}
              >
                {ALL_CAPS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Budget (RIALO)</label>
              <input
                type="number" min="1"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder="20"
                value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Your Pubkey</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder="Your wallet address"
                value={form.poster}
                onChange={e => setForm(f => ({ ...f, poster: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-5 py-2 bg-rialo-600 hover:bg-rialo-500 rounded-xl text-sm font-medium transition-all">
              Post Task
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-white/10 hover:border-white/30 rounded-xl text-sm text-white/50 hover:text-white transition-all">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "in-progress", "completed", "disputed"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filterStatus === s
                ? "bg-rialo-600/30 text-rialo-400 border border-rialo-600/50"
                : "bg-white/5 text-white/40 border border-white/10 hover:text-white"
            )}
          >
            {s === "all" ? "All" : STATUS_CONFIG[s as TaskStatus]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {filtered.map(task => {
          const cfg = STATUS_CONFIG[task.status];
          const StatusIcon = cfg.icon;
          const isDispatching = dispatching === task.id;

          return (
            <div key={task.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 hover:border-white/20 transition-all">

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30 font-mono">#{task.id}</span>
                    <h3 className="font-semibold">{task.title}</h3>
                  </div>
                  <p className="text-sm text-white/40">{task.description}</p>
                </div>
                <span className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0", cfg.color)}>
                  <StatusIcon className={clsx("w-3 h-3", isDispatching && "animate-spin")} />
                  {cfg.label}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-white/30">
                <span className="px-2 py-0.5 bg-rialo-600/10 text-rialo-400 rounded-md font-medium">{task.capability}</span>
                <span><span className="text-white font-medium">{task.budget}</span> RIALO</span>
                {task.assignedAgent && <span>→ <span className="text-white/60">{task.assignedAgent}</span></span>}
                <span className="ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{task.createdAt}</span>
              </div>

              {/* Result */}
              {task.result && (
                <div className="bg-rialo-600/10 border border-rialo-600/20 rounded-xl px-4 py-3 text-sm text-rialo-300 flex items-start gap-2">
                  <Zap className="w-4 h-4 shrink-0 mt-0.5 text-rialo-400 opacity-60" />
                  {task.result}
                </div>
              )}

              {/* Assign button for open tasks */}
              {task.status === "open" && (
                <button
                  onClick={() => simulateDispatch(task.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-rialo-600/20 hover:bg-rialo-600/40 border border-rialo-600/30 rounded-xl text-rialo-400 text-sm font-medium transition-all"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Assign Agent
                </button>
              )}

            </div>
          );
        })}
      </div>

    </div>
  );
}

"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Zap, Clock, CheckCircle, AlertCircle, XCircle, Loader2, ChevronDown, Send, Radio } from "lucide-react";
import clsx from "clsx";
import { useWallet } from "@/context/WalletContext";
import { useAgents, Agent, isLiveAgent } from "@/context/AgentsContext";

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
  durationMs?: number;
  dispatchedTo?: string;
  requestPayload?: string;
  createdAt: string;
};

const MOCK_TASKS: Task[] = [
  { id: 46, title: "Translate greeting to Turkish",   description: "Hello, welcome to the Rialo agent marketplace.",            capability: "translation",    budget: 10, poster: "TranslateBot demo",  status: "open",        createdAt: "just now" },
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

function TasksPageInner() {
  const [tasks, setTasks]     = useState<Task[]>(MOCK_TASKS);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dispatching, setDispatching]   = useState<number | null>(null);
  const [form, setForm] = useState({ title:"", description:"", capability:"text-summary", budget:"", poster:"" });
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [dispatchStep, setDispatchStep] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { pubkey, balance, spend } = useWallet();
  const { agents, bumpStats, addActivity } = useAgents();

  // Sync filter with ?filter= in the URL so the wallet menu can deep-link here.
  const searchParams = useSearchParams();
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f) setFilterStatus(f);
  }, [searchParams]);

  const myPoster = pubkey ?? "";
  const filtered =
    filterStatus === "all"  ? tasks :
    filterStatus === "mine" ? tasks.filter(t => t.poster === myPoster && myPoster !== "") :
    filterStatus === "my-disputes" ? tasks.filter(t => t.poster === myPoster && myPoster !== "" && t.status === "disputed") :
    tasks.filter(t => t.status === filterStatus);

  function postTask(e: React.FormEvent) {
    e.preventDefault();
    const budget = Number(form.budget);

    // Escrow lock: the budget comes out of the wallet balance at posting time,
    // exactly like the contract's post_task locks funds.
    if (!spend(budget)) {
      setFormError(`Insufficient balance: this task needs ${budget} RIALO but you have ${balance}. Use the + button in the navbar (devnet faucet).`);
      return;
    }
    setFormError(null);

    const newTask: Task = {
      id: Math.max(...tasks.map(t => t.id)) + 1,
      title: form.title,
      description: form.description,
      capability: form.capability,
      budget,
      poster: form.poster || pubkey || "Anonymous",
      status: "open",
      createdAt: "just now",
    };
    setTasks(prev => [newTask, ...prev]);
    addActivity(`Task #${newTask.id} "${newTask.title}" posted · ${budget} RIALO locked in escrow`, "new");
    setForm({ title:"", description:"", capability:"text-summary", budget:"", poster:"" });
    setShowForm(false);
  }

  function openDispute(taskId: number) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: "disputed" as TaskStatus } : t
    ));
    addActivity(`Dispute opened on Task #${taskId} "${task.title}"`, "failed");
  }

  // Live agents (real endpoints) are listed before seeded demo agents.
  function eligibleAgents(capability: string) {
    return agents
      .filter(a => a.active && a.capabilities.includes(capability))
      .sort((a, b) => Number(isLiveAgent(b)) - Number(isLiveAgent(a)));
  }

  const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

  // What the contract actually sends to the agent, shown in the task details
  // panel as proof of the request that went out.
  function payloadFor(agent: Agent, task: Task): string {
    if (agent.endpoint.includes("api.mymemory.translated.net")) {
      return `GET ?q=${task.description}&langpair=en|tr`;
    }
    if (agent.endpoint.includes("api.coingecko.com")) {
      return "GET " + agent.endpoint.split("?")[1];
    }
    return JSON.stringify({ task: task.title, description: task.description });
  }

  // Dispatch the task to a specific agent's registered HTTP endpoint, mirroring
  // the contract's native AFTER/CALL flow. The step indicator walks through the
  // same three phases the contract goes through: dispatch, response, escrow.
  async function dispatchToAgent(taskId: number, agent: Agent) {
    setPickerFor(null);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setDispatching(taskId);
    setDispatchStep(1);
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: "in-progress" as TaskStatus, assignedAgent: agent.name } : t
    ));
    addActivity(`Task #${taskId} "${task.title}" picked up by ${agent.name}`, "in-progress");

    await pause(700);
    setDispatchStep(2);
    const t0 = performance.now();

    try {
      const result = await callAgentEndpoint(agent, task);
      const ms = Math.round(performance.now() - t0);
      setDispatchStep(3);
      await pause(900);
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: "completed" as TaskStatus, result, durationMs: ms, dispatchedTo: agent.endpoint, requestPayload: payloadFor(agent, task) }
          : t
      ));
      bumpStats(agent.id);
      addActivity(`Task #${taskId} "${task.title}" completed by ${agent.name} in ${ms}ms`, "completed");
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: "disputed" as TaskStatus, result: "Agent call failed: " + (err as Error).message, durationMs: ms, dispatchedTo: agent.endpoint, requestPayload: payloadFor(agent, task) }
          : t
      ));
      addActivity(`Task #${taskId} agent call failed (${agent.name})`, "failed");
    } finally {
      setDispatching(null);
      setDispatchStep(0);
    }
  }

  // Calls the agent's actual registered endpoint. The MyMemory translation API
  // is special-cased (GET with query params, no key needed, CORS-friendly) so
  // the demo agent gives a real response. Any other endpoint gets a generic
  // POST with the task payload — if it's a real live endpoint that allows
  // CORS, this hits it for real; if it's unreachable or blocks CORS, we surface
  // the real error instead of faking success.
  async function callAgentEndpoint(agent: Agent, task: Task): Promise<string> {
    if (agent.endpoint.includes("api.mymemory.translated.net")) {
      const url = `${agent.endpoint}?q=${encodeURIComponent(task.description)}&langpair=en|tr`;
      const data = await fetchWithFallback(url);
      return data.responseData?.translatedText
        ? `Live agent response: "${data.responseData.translatedText}"`
        : "Agent responded but returned no translation.";
    }

    if (agent.endpoint.includes("api.coingecko.com")) {
      const data = await fetchWithFallback(agent.endpoint);
      const [assetId] = Object.keys(data);
      const prices = data[assetId];
      const [currency, value] = Object.entries(prices)[0] as [string, number];
      return `Live agent response: ${assetId.toUpperCase()} = ${value} ${currency.toUpperCase()}`;
    }

    const res = await fetch(agent.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: task.title, description: task.description }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return `Live agent response: ${text.slice(0, 300)}`;
  }

  // Tries the direct request first. If the browser blocks it (extension,
  // antivirus, or a flaky network — "Failed to fetch" gives no real reason),
  // retries once through a public CORS relay so a local network quirk doesn't
  // sink the whole demo. If both fail, throws the original, more useful error.
  async function fetchWithFallback(url: string): Promise<any> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (directErr) {
      try {
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch {
        const reason = directErr instanceof TypeError
          ? "network/browser blocked the request (check VPN, ad blocker, or firewall)"
          : (directErr as Error).message;
        throw new Error(reason);
      }
    }
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
          className="flex items-center gap-2 px-4 py-2 bg-rialo-600 hover:bg-rialo-500 rounded-xl font-medium transition-all text-sm shadow-lg shadow-rialo-600/20 hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" /> Post Task
        </button>
      </div>

      {/* Post task form */}
      {showForm && (
        <form onSubmit={postTask} className="glass rounded-2xl p-6 space-y-4">
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
                placeholder={pubkey ? pubkey : "Connect wallet or enter manually"}
                value={form.poster}
                onChange={e => setForm(f => ({ ...f, poster: e.target.value }))}
              />
            </div>
          </div>
          {formError && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-xl px-4 py-3 text-sm text-red-300">
              {formError}
            </div>
          )}
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
        {["all", "mine", "open", "in-progress", "completed", "disputed"].map(s => (
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
            {s === "all" ? "All" : s === "mine" ? "My Tasks" : STATUS_CONFIG[s as TaskStatus]?.label ?? s}
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
            <div
              key={task.id}
              className={clsx(
                "card-hover glass rounded-2xl p-5 space-y-3 relative",
                pickerFor === task.id && "z-20"
              )}
            >

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

              <div className="flex items-center gap-2 text-xs text-white/30 flex-wrap">
                <span className="px-2 py-0.5 bg-rialo-600/10 border border-rialo-600/20 text-rialo-400 rounded-md font-medium">{task.capability}</span>
                <span className="px-2 py-0.5 bg-white/[0.04] rounded-md"><span className="text-white font-medium">{task.budget}</span> RIALO</span>
                {task.assignedAgent && <span className="px-2 py-0.5 bg-white/[0.04] rounded-md">→ <span className="text-white/60">{task.assignedAgent}</span></span>}
                <span className="ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{task.createdAt}</span>
              </div>

              {/* Dispatch flow indicator — mirrors the contract's AFTER/CALL phases */}
              {isDispatching && (
                <div className="flex items-center gap-2 text-xs flex-wrap bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                  {[
                    { n: 1, label: "Contract dispatching", icon: Send },
                    { n: 2, label: "Agent responding",     icon: Radio },
                    { n: 3, label: "Escrow released",      icon: CheckCircle },
                  ].map(({ n, label, icon: StepIcon }, i) => (
                    <span key={n} className="flex items-center gap-2">
                      {i > 0 && <span className="w-6 h-px bg-white/15" />}
                      <span className={clsx(
                        "flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium transition-all",
                        dispatchStep > n  ? "text-rialo-400" :
                        dispatchStep === n ? "text-rialo-300 bg-rialo-600/15 step-active" :
                        "text-white/25"
                      )}>
                        <StepIcon className="w-3.5 h-3.5" />
                        {label}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Result */}
              {task.result && (
                <div className={clsx(
                  "border rounded-xl px-4 py-3 text-sm flex items-start gap-2",
                  task.status === "disputed"
                    ? "bg-red-600/10 border-red-600/20 text-red-300"
                    : "bg-rialo-600/10 border-rialo-600/20 text-rialo-300"
                )}>
                  <Zap className="w-4 h-4 shrink-0 mt-0.5 opacity-60" />
                  <span className="min-w-0 break-words">
                    {task.result}
                    {task.durationMs !== undefined && (
                      <span className="ml-2 text-xs opacity-60">· {task.durationMs}ms round-trip</span>
                    )}
                  </span>
                </div>
              )}

              {/* Expandable dispatch details — the proof panel */}
              {(task.dispatchedTo || task.requestPayload) && (
                <div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setExpandedId(e => e === task.id ? null : task.id)}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-all"
                    >
                      <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", expandedId === task.id && "rotate-180")} />
                      Dispatch details
                    </button>
                    {task.status === "completed" && (
                      <button
                        onClick={() => openDispute(task.id)}
                        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 transition-all"
                        title="Not happy with the result? Open a dispute — payment gets frozen until it's resolved."
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Open dispute
                      </button>
                    )}
                  </div>

                  {expandedId === task.id && (
                    <div className="mt-3 grid gap-2 text-xs font-mono">
                      <div className="bg-white/[0.04] rounded-lg px-3 py-2 flex gap-2 items-start">
                        <span className="text-white/30 shrink-0">endpoint</span>
                        <span className="text-white/60 break-all">{task.dispatchedTo}</span>
                      </div>
                      {task.requestPayload && (
                        <div className="bg-white/[0.04] rounded-lg px-3 py-2 flex gap-2 items-start">
                          <span className="text-white/30 shrink-0">request</span>
                          <span className="text-white/60 break-all">{task.requestPayload}</span>
                        </div>
                      )}
                      {task.durationMs !== undefined && (
                        <div className="bg-white/[0.04] rounded-lg px-3 py-2 flex gap-2 items-start">
                          <span className="text-white/30 shrink-0">duration</span>
                          <span className="text-rialo-400">{task.durationMs}ms</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Assign button for open tasks */}
              {task.status === "open" && (
                <div className="relative">
                  <button
                    onClick={() => setPickerFor(p => p === task.id ? null : task.id)}
                    disabled={isDispatching}
                    className="flex items-center gap-2 px-4 py-2 bg-rialo-600/20 hover:bg-rialo-600/40 border border-rialo-600/30 rounded-xl text-rialo-400 text-sm font-medium transition-all disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {isDispatching ? "Dispatching to agent..." : "Assign Agent"}
                  </button>

                  {pickerFor === task.id && (
                    <div className="absolute z-30 mt-2 w-80 glass-strong rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
                      {eligibleAgents(task.capability).length === 0 ? (
                        <div className="px-4 py-3 text-xs text-white/40">
                          No active agents registered for &ldquo;{task.capability}&rdquo; yet. Register one on the Agents page.
                        </div>
                      ) : (
                        eligibleAgents(task.capability).map(agent => (
                          <button
                            key={agent.id}
                            onClick={() => dispatchToAgent(task.id, agent)}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-rialo-600/10 transition-all border-b border-white/5 last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{agent.name}</span>
                              {isLiveAgent(agent) ? (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rialo-600/15 text-rialo-400 text-[10px] font-medium">
                                  <span className="w-1 h-1 rounded-full bg-rialo-400 animate-pulse" /> live endpoint
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/30 text-[10px] font-medium">
                                  demo · no live endpoint
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-white/30 font-mono truncate mt-0.5">{agent.endpoint}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="glass rounded-2xl py-14 text-center space-y-3">
            <ClipboardList className="w-8 h-8 text-white/15 mx-auto" />
            <p className="text-sm text-white/40">
              {filterStatus === "my-disputes" ? "No disputes on your tasks. That's a good thing." :
               filterStatus === "mine" && !pubkey ? "Connect your wallet to see your tasks." :
               "No tasks match this filter."}
            </p>
            <button
              onClick={() => { setFilterStatus("all"); setShowForm(true); }}
              className="text-xs text-rialo-400 hover:text-rialo-300 transition-all"
            >
              Post a new task →
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksPageInner />
    </Suspense>
  );
}

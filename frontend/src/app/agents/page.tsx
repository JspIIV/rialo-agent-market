"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Plus, Star, XCircle, Zap, X, Radio, BadgeCheck, Gauge, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { useAgents, Agent, isLiveAgent, avgResponseMs, successRate, timeAgo } from "@/context/AgentsContext";
import { useTasks } from "@/context/TasksContext";
import { useWallet } from "@/context/WalletContext";

// An agent earns the verified badge after proving itself with enough
// completed tasks. On mainnet this threshold would live in the contract.
const VERIFIED_THRESHOLD = 10;
const isVerified = (a: Agent) => a.tasksCompleted >= VERIFIED_THRESHOLD;

type SortKey = "reputation" | "price" | "completed";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "reputation", label: "Top rated" },
  { key: "price",      label: "Cheapest" },
  { key: "completed",  label: "Most completed" },
];

const ALL_CAPS = ["text-summary","translation","code-review","security-audit","unit-tests","data-analysis"];

const AVATAR_RAMPS = [
  "from-emerald-500/40 to-emerald-900/40 text-emerald-300",
  "from-cyan-500/40 to-cyan-900/40 text-cyan-300",
  "from-violet-500/40 to-violet-900/40 text-violet-300",
  "from-amber-500/40 to-amber-900/40 text-amber-300",
  "from-rose-500/40 to-rose-900/40 text-rose-300",
];

function initials(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function avatarRamp(id: number) {
  return AVATAR_RAMPS[id % AVATAR_RAMPS.length];
}

function AgentsPageInner() {
  const { agents, addAgent } = useAgents();
  const { search } = useTasks();
  const { pubkey } = useWallet();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [form, setForm] = useState({ name:"", caps:"", price:"", endpoint:"", owner:"" });
  const [selected, setSelected] = useState<Agent | null>(null);
  const [ping, setPing] = useState<{ state: "idle" | "loading" | "done"; text?: string }>({ state: "idle" });
  const [sortKey, setSortKey] = useState<SortKey>("reputation");

  // Sync filter with ?filter= in the URL so the wallet menu can deep-link here.
  const searchParams = useSearchParams();
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f) setFilter(f);
  }, [searchParams]);

  // Fires a real request at the agent's endpoint and reports reachability +
  // latency. An HTTP error status still proves the endpoint exists and answers.
  async function pingAgent(agent: Agent) {
    setPing({ state: "loading" });
    const t0 = performance.now();
    try {
      const res = await fetch(agent.endpoint, { method: "GET" });
      const ms = Math.round(performance.now() - t0);
      setPing({ state: "done", text: `Reachable · HTTP ${res.status} · ${ms}ms` });
    } catch {
      const ms = Math.round(performance.now() - t0);
      setPing({ state: "done", text: `Unreachable (offline or CORS-blocked) · ${ms}ms` });
    }
  }

  function openAgent(agent: Agent) {
    setSelected(agent);
    setPing({ state: "idle" });
  }

  // Keep the open modal in sync with live stat changes (reputation, history).
  const sel = selected ? agents.find(a => a.id === selected.id) ?? selected : null;

  const q = search.trim().toLowerCase();
  const filtered = (
    filter === "all"  ? agents :
    filter === "mine" ? agents.filter(a => pubkey !== null && a.owner === pubkey) :
    agents.filter(a => a.capabilities.includes(filter))
  )
  .filter(a => q === "" ? true : a.name.toLowerCase().includes(q) || a.capabilities.some(c => c.includes(q)))
  .slice().sort((a, b) =>
    sortKey === "reputation" ? b.reputation - a.reputation :
    sortKey === "price"      ? a.price - b.price :
    b.tasksCompleted - a.tasksCompleted
  );

  function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    addAgent({
      name: form.name,
      capabilities: form.caps.split(",").map(s => s.trim().toLowerCase()),
      price: Number(form.price),
      endpoint: form.endpoint,
      owner: form.owner || pubkey || "Anonymous",
    });
    setForm({ name:"", caps:"", price:"", endpoint:"", owner:"" });
    setShowForm(false);
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Agents</h1>
          <p className="text-white/40 mt-1">
            {agents.filter(a => a.active).length} active agents on the marketplace
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-rialo-600 hover:bg-rialo-500 rounded-xl font-medium transition-all text-sm shadow-lg shadow-rialo-600/20 hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" /> Register Agent
        </button>
      </div>

      {/* Register form */}
      {showForm && (
        <form onSubmit={handleAddAgent} className="glass rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Bot className="w-5 h-5 text-rialo-400" /> Register New Agent
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { key:"name",     label:"Agent Name",                   placeholder:"GPT-Summariser",                      required: true },
              { key:"caps",     label:"Capabilities (comma-separated)", placeholder:"text-summary,translation",          required: true },
              { key:"price",    label:"Price per Task (RIALO)",        placeholder:"10",                                  required: true },
              { key:"endpoint", label:"HTTP Endpoint",                 placeholder:"https://your-agent.example.com/run", required: true },
              { key:"owner",    label:"Owner Pubkey (optional)",       placeholder: pubkey || "Leave blank to use connected wallet", required: false },
            ].map(({ key, label, placeholder, required }) => (
              <div key={key} className="space-y-1">
                <label className="text-sm text-white/50">{label}</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  required={required}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-5 py-2 bg-rialo-600 hover:bg-rialo-500 rounded-xl text-sm font-medium transition-all">
              Register on Devnet
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-white/10 hover:border-white/30 rounded-xl text-sm text-white/50 hover:text-white transition-all">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter + sort bar */}
      <div className="flex gap-2 flex-wrap items-center">
        {["all", "mine", ...ALL_CAPS].map(cap => (
          <button
            key={cap}
            onClick={() => setFilter(cap)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filter === cap
                ? "bg-rialo-600/30 text-rialo-400 border border-rialo-600/50"
                : "bg-white/5 text-white/40 border border-white/10 hover:text-white"
            )}
          >
            {cap === "all" ? "All" : cap === "mine" ? "My Agents" : cap}
          </button>
        ))}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="ml-auto bg-[#0a0f0d] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/60 outline-none focus:border-rialo-600/60 transition-all"
        >
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Agent grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map(agent => (
          <div
            key={agent.id}
            onClick={() => openAgent(agent)}
            className="card-hover glass rounded-2xl p-5 space-y-4 relative overflow-hidden cursor-pointer"
          >
            <div className={clsx("absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r", avatarRamp(agent.id).split(" ").slice(0, 2).join(" "))} />

            {/* Header row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={clsx("w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center font-bold text-sm shrink-0 border border-white/10", avatarRamp(agent.id))}>
                  {initials(agent.name) || <Bot className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-semibold flex items-center gap-2 flex-wrap">
                    {agent.name}
                    {isVerified(agent) && (
                      <BadgeCheck className="w-4 h-4 text-sky-400" aria-label="Verified: 10+ completed tasks" />
                    )}
                    {isLiveAgent(agent) ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rialo-600/15 text-rialo-400 text-[10px] font-medium">
                        <Radio className="w-2.5 h-2.5" /> live
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/30 text-[10px] font-medium">
                        demo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/30 font-mono">{agent.owner}</div>
                </div>
              </div>
              <span className={clsx(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                agent.active ? "bg-rialo-600/15 text-rialo-400" : "bg-red-600/15 text-red-400"
              )}>
                {agent.active
                  ? <span className="w-1.5 h-1.5 rounded-full bg-rialo-400 animate-pulse" />
                  : <XCircle    className="w-3 h-3" />
                }
                {agent.active ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Capabilities */}
            <div className="flex gap-2 flex-wrap">
              {agent.capabilities.map(cap => (
                <span key={cap} className="px-2 py-0.5 bg-rialo-600/10 border border-rialo-600/20 text-rialo-400 rounded-md text-xs font-medium">
                  {cap}
                </span>
              ))}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-white/[0.04] rounded-xl p-2.5">
                <div className="text-lg font-bold text-rialo-400 font-display">{agent.price}</div>
                <div className="text-xs text-white/30">RIALO/task</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-2.5">
                <div className="text-lg font-bold font-display">{agent.tasksCompleted}</div>
                <div className="text-xs text-white/30">completed</div>
              </div>
            </div>

            {/* Reputation bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-white/40">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> Reputation
                </span>
                <span className="font-medium text-yellow-400">{agent.reputation}/100</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-500/70 to-yellow-300/90"
                  style={{ width: `${agent.reputation}%` }}
                />
              </div>
            </div>

            {/* Endpoint */}
            <div className="flex items-center gap-2 text-xs text-white/30 bg-white/[0.04] rounded-lg px-3 py-2 font-mono truncate">
              <Zap className="w-3 h-3 shrink-0 text-rialo-400" />
              {agent.endpoint}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="glass rounded-2xl py-14 text-center space-y-3">
          <Bot className="w-8 h-8 text-white/15 mx-auto" />
          <p className="text-sm text-white/40">
            {filter === "mine"
              ? (pubkey ? "You haven't registered any agents with this wallet yet." : "Connect your wallet to see your agents.")
              : <>No agents registered for &ldquo;{filter}&rdquo; yet.</>}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-rialo-400 hover:text-rialo-300 transition-all"
          >
            Register the first one →
          </button>
        </div>
      )}

      {/* Agent detail modal */}
      {sel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-8 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md glass-strong rounded-2xl p-6 space-y-5 shadow-2xl my-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={clsx("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center font-bold text-base shrink-0 border border-white/10", avatarRamp(sel.id))}>
                  {initials(sel.name) || <Bot className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-semibold text-lg flex items-center gap-2 flex-wrap">
                    {sel.name}
                    {isVerified(sel) && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 text-[10px] font-medium">
                        <BadgeCheck className="w-3 h-3" /> Verified
                      </span>
                    )}
                    {isLiveAgent(sel) && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rialo-600/15 text-rialo-400 text-[10px] font-medium">
                        <Radio className="w-2.5 h-2.5" /> live
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/30 font-mono">{sel.owner}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              {sel.capabilities.map(cap => (
                <span key={cap} className="px-2 py-0.5 bg-rialo-600/10 border border-rialo-600/20 text-rialo-400 rounded-md text-xs font-medium">{cap}</span>
              ))}
            </div>

            {/* Primary stats */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/[0.04] rounded-xl p-3">
                <div className="text-lg font-bold text-rialo-400 font-display">{sel.price}</div>
                <div className="text-xs text-white/30">RIALO/task</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-3">
                <div className="text-lg font-bold font-display">{sel.tasksCompleted}</div>
                <div className="text-xs text-white/30">completed</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-3">
                <div className="flex items-center justify-center gap-1 text-lg font-bold text-yellow-400 font-display">
                  <Star className="w-3.5 h-3.5 fill-yellow-400" />{sel.reputation}
                </div>
                <div className="text-xs text-white/30">reputation</div>
              </div>
            </div>

            {/* Performance metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.04] rounded-xl p-3 flex items-center gap-2.5">
                <Gauge className="w-4 h-4 text-rialo-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{avgResponseMs(sel) !== null ? `${avgResponseMs(sel)}ms` : "—"}</div>
                  <div className="text-[11px] text-white/30">avg response</div>
                </div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-3 flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-rialo-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{successRate(sel) !== null ? `${successRate(sel)}%` : "—"}</div>
                  <div className="text-[11px] text-white/30">success rate</div>
                </div>
              </div>
            </div>

            {/* Job history */}
            {sel.history.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-white/40 font-medium">Recent jobs</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {sel.history.slice(0, 6).map((job, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.03] rounded-lg px-3 py-2">
                      {job.success
                        ? <span className="w-1.5 h-1.5 rounded-full bg-rialo-400 shrink-0" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                      <span className="truncate text-white/60">{job.taskTitle}</span>
                      <span className="ml-auto text-white/30 shrink-0">{job.ms}ms · {timeAgo(job.ts)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-white/40 bg-white/[0.04] rounded-lg px-3 py-2.5 font-mono break-all">
              <Zap className="w-3 h-3 shrink-0 text-rialo-400" />{sel.endpoint}
            </div>

            <div className="space-y-2">
              <button onClick={() => pingAgent(sel)} disabled={ping.state === "loading"}
                className="w-full px-4 py-2.5 bg-rialo-600 hover:bg-rialo-500 text-black rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
                {ping.state === "loading" ? "Pinging endpoint..." : "Ping this agent"}
              </button>
              {ping.state === "done" && ping.text && (
                <div className={clsx("border rounded-xl px-4 py-2.5 text-xs font-mono text-center",
                  ping.text.startsWith("Reachable") ? "bg-rialo-600/10 border-rialo-600/20 text-rialo-300" : "bg-red-600/10 border-red-600/20 text-red-300")}>
                  {ping.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageInner />
    </Suspense>
  );
}

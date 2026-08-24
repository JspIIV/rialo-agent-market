"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Zap, Clock, CheckCircle, AlertCircle, XCircle, Loader2, ChevronDown, Send, Radio, Star, Timer, Scale, Gavel, Undo2 } from "lucide-react";
import clsx from "clsx";
import { useWallet } from "@/context/WalletContext";
import { useAgents, Agent, isLiveAgent, feeSplit, PROTOCOL_FEE_BPS } from "@/context/AgentsContext";
import { useTasks, Task, TaskStatus } from "@/context/TasksContext";

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.FC<{className?:string}> }> = {
  open:        { label: "Open",        color: "bg-white/[0.06]  text-[#F5F0E6]/70 border border-white/10", icon: ClipboardList },
  assigned:    { label: "Assigned",    color: "bg-rialo-400/15  text-rialo-300",  icon: Clock },
  "in-progress":{ label:"In Progress", color: "bg-copper-400/15 text-copper-300", icon: Loader2 },
  completed:   { label: "Completed",   color: "bg-rialo-400/15  text-rialo-400",  icon: CheckCircle },
  disputed:    { label: "Disputed",    color: "bg-[#E0563F]/15  text-[#E0563F]",  icon: AlertCircle },
  cancelled:   { label: "Cancelled",   color: "bg-white/10      text-white/30",   icon: XCircle },
  expired:     { label: "Expired",     color: "bg-[#C97B3D]/15  text-[#C97B3D]",  icon: Timer },
  refunded:    { label: "Refunded",    color: "bg-[#C97B3D]/15  text-[#C97B3D]",  icon: Undo2 },
};

const ALL_CAPS = ["text-summary","translation","code-review","security-audit","unit-tests","data-analysis"];

function TasksPageInner() {
  const { tasks, setTasks, search } = useTasks();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dispatching, setDispatching]   = useState<number | null>(null);
  const [form, setForm] = useState({ title:"", description:"", capability:"text-summary", budget:"", poster:"", deadline:"", secondCapability:"" });
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [dispatchStep, setDispatchStep] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [disputeDraft, setDisputeDraft] = useState<{ id: number; reason: string } | null>(null);
  const [arbitrating, setArbitrating] = useState<number | null>(null);
  const { pubkey, balance, spend, refund } = useWallet();
  const { agents, recordResult, rateAgent, penalise, reward, addActivity } = useAgents();

  // Sync filter with ?filter= in the URL so the wallet menu can deep-link here.
  const searchParams = useSearchParams();
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f) setFilterStatus(f);
  }, [searchParams]);

  // Expire open tasks whose deadline has passed and refund the escrow.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      setTasks(prev => {
        let changed = false;
        const next = prev.map(t => {
          if (t.status === "open" && t.deadlineTs && t.deadlineTs < now) {
            changed = true;
            refund(t.budget);
            addActivity(`Task #${t.id} "${t.title}" expired · ${t.budget} RIALO refunded`, "failed");
            return { ...t, status: "expired" as TaskStatus };
          }
          return t;
        });
        return changed ? next : prev;
      });
    };
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, [setTasks, refund, addActivity]);

  const q = search.trim().toLowerCase();
  const myPoster = pubkey ?? "";
  const filtered = tasks
    .filter(t =>
      filterStatus === "all"  ? true :
      filterStatus === "mine" ? (t.poster === myPoster && myPoster !== "") :
      filterStatus === "my-disputes" ? (t.poster === myPoster && myPoster !== "" && t.status === "disputed") :
      t.status === filterStatus
    )
    .filter(t =>
      q === "" ? true :
      t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.capability.toLowerCase().includes(q)
    );

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

    const mins = Number(form.deadline);
    const newTask: Task = {
      id: Math.max(0, ...tasks.map(t => t.id)) + 1,
      title: form.title,
      description: form.description,
      capability: form.capability,
      budget,
      poster: form.poster || pubkey || "Anonymous",
      status: "open",
      deadlineTs: mins > 0 ? Date.now() + mins * 60_000 : undefined,
      secondCapability: form.secondCapability || undefined,
      createdAt: "just now",
    };
    setTasks(prev => [newTask, ...prev]);
    addActivity(`Task #${newTask.id} "${newTask.title}" posted · ${budget} RIALO locked in escrow`, "new");
    setForm({ title:"", description:"", capability:"text-summary", budget:"", poster:"", deadline:"", secondCapability:"" });
    setShowForm(false);
  }

  // Filing a dispute freezes the escrow and records the poster's reason. The
  // funds don't move until an arbiter rules.
  function fileDispute(taskId: number, reason: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !reason.trim()) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "disputed" as TaskStatus, disputeReason: reason.trim() } : t));
    setDisputeDraft(null);
    addActivity(`Dispute filed on Task #${taskId} "${task.title}" · escrow frozen`, "failed");
  }

  // Asks the GenLayer AgentMarketJudge intelligent contract to rule on the
  // dispute. If GenLayer isn't reachable/configured, falls back to a local
  // rule so the demo never stalls. Either way the verdict moves the escrow
  // and adjusts reputation.
  async function sendToArbiter(taskId: number) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setArbitrating(taskId);

    let verdict: "refund" | "release";
    let reasoning: string;
    let verdictBy = "local arbiter";
    let txHash: string | undefined;

    try {
      const res = await fetch("/api/arbitrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskDescription: task.description,
          agentResponse: task.result ?? "",
          posterClaim: task.disputeReason ?? "",
        }),
      });
      if (!res.ok) throw new Error(`arbiter ${res.status}`);
      const data = await res.json();
      if (!data.configured || !data.verdict) throw new Error("not configured");
      verdict = data.verdict;
      reasoning = data.reasoning;
      verdictBy = "GenLayer Studio testnet";
      txHash = data.txHash;
    } catch {
      // Local fallback: a failed agent call means the poster is right (refund);
      // a genuine response means the agent delivered (release).
      await pause(1400);
      const agentFailed = (task.result ?? "").startsWith("Agent call failed");
      verdict = agentFailed ? "refund" : "release";
      reasoning = agentFailed
        ? "The agent's endpoint did not return a valid response, so the work was not delivered. Escrow returns to the poster."
        : "The agent returned a valid response fulfilling the task. The complaint does not override delivery, so the escrow is released to the agent.";
    }

    if (verdict === "refund") {
      refund(task.budget);
      if (task.assignedAgentId) penalise(task.assignedAgentId);
      setTasks(prev => prev.map(t => t.id === taskId
        ? { ...t, status: "refunded" as TaskStatus, verdict, verdictReasoning: reasoning, verdictBy, verdictTxHash: txHash } : t));
      addActivity(`Arbiter ruled REFUND on Task #${taskId} · ${task.budget} RIALO returned to poster`, "failed");
    } else {
      const { toAgent, fee } = feeSplit(task.budget);
      if (task.assignedAgentId) reward(task.assignedAgentId);
      setTasks(prev => prev.map(t => t.id === taskId
        ? { ...t, status: "completed" as TaskStatus, verdict, verdictReasoning: reasoning, verdictBy, verdictTxHash: txHash } : t));
      addActivity(`Arbiter ruled RELEASE on Task #${taskId} · ${toAgent} to agent, ${fee} fee`, "completed");
    }
    setArbitrating(null);
  }

  function rateTask(taskId: number, stars: number) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.rating) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, rating: stars } : t));
    if (task.assignedAgentId) rateAgent(task.assignedAgentId, stars);
    addActivity(`Task #${taskId} rated ${stars}★ · ${task.assignedAgent} reputation updated`, "completed");
  }

  // Live agents (real endpoints) are listed before seeded demo agents.
  function eligibleAgents(capability: string) {
    return agents
      .filter(a => a.active && a.capabilities.includes(capability))
      .sort((a, b) => Number(isLiveAgent(b)) - Number(isLiveAgent(a)));
  }

  const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

  function payloadFor(agent: Agent, task: Task): string {
    if (agent.endpoint.includes("api.mymemory.translated.net")) return `GET ?q=${task.description}&langpair=en|tr`;
    if (agent.endpoint.includes("api.coingecko.com")) return "GET " + agent.endpoint.split("?")[1];
    return JSON.stringify({ task: task.title, description: task.description });
  }

  // Strips our display prefix/quotes so a result can feed the next agent.
  function cleanText(result: string): string {
    return result.replace(/^Live agent response:\s*/i, "").replace(/^"|"$/g, "").trim();
  }

  // Builds the input passed to a sub-agent. When the next agent is a translator
  // and the previous result is a bare "ASSET = N CUR" price, we phrase it as a
  // real sentence so the translation is actually meaningful (not just a number).
  function chainInput(result: string, subAgent: Agent): string {
    const clean = cleanText(result);
    if (subAgent.capabilities.includes("translation")) {
      const m = clean.match(/^([A-Za-z]+)\s*=\s*([\d.,]+)\s*([A-Za-z]+)$/);
      if (m) {
        const asset = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        return `The current ${asset} price is ${m[2]} ${m[3]}.`;
      }
    }
    return clean;
  }

  // Dispatch the task to a specific agent's registered HTTP endpoint, mirroring
  // the contract's native AFTER/CALL flow. If the task has a second capability,
  // the primary agent then hires a sub-agent for it (A2A) — a second real HTTP
  // call, with the escrow split three ways.
  async function dispatchToAgent(taskId: number, agent: Agent) {
    setPickerFor(null);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const isA2A = !!task.secondCapability;

    setDispatching(taskId);
    setDispatchStep(1);
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: "in-progress" as TaskStatus, assignedAgent: agent.name, assignedAgentId: agent.id } : t
    ));
    addActivity(`Task #${taskId} "${task.title}" picked up by ${agent.name}`, "in-progress");

    await pause(700);
    setDispatchStep(2);
    const t0 = performance.now();

    try {
      const result = await callAgentEndpoint(agent, task.description);
      const ms = Math.round(performance.now() - t0);

      // --- A2A subcontract ---
      let subJob: Task["subJob"] | undefined;
      if (isA2A) {
        const { fee } = feeSplit(task.budget);
        // The primary agent maximises its own cut by hiring the cheapest
        // capable sub-agent (live endpoints preferred).
        const candidates = eligibleAgents(task.secondCapability!)
          .filter(a => a.id !== agent.id)
          .sort((a, b) => (Number(isLiveAgent(b)) - Number(isLiveAgent(a))) || (a.price - b.price));
        const subAgent = candidates[0];
        const budgetForSub = task.budget - fee;

        if (subAgent && subAgent.price <= budgetForSub) {
          setDispatchStep(3);
          addActivity(`A2A: ${agent.name} is hiring ${subAgent.name} for ${task.secondCapability}`, "in-progress");
          await pause(700);
          setDispatchStep(4);
          const s0 = performance.now();
          const subInput = chainInput(result, subAgent);
          const subResult = await callAgentEndpoint(subAgent, subInput);
          const subMs = Math.round(performance.now() - s0);
          subJob = {
            agentId: subAgent.id, agentName: subAgent.name, capability: task.secondCapability!,
            cost: subAgent.price, ms: subMs, endpoint: subAgent.endpoint, result: subResult,
          };
          recordResult(subAgent.id, { taskId, taskTitle: `${task.title} (sub)`, ms: subMs, success: true, ts: Date.now() });
          addActivity(`A2A: ${subAgent.name} delivered sub-job in ${subMs}ms for ${subAgent.price} RIALO`, "completed");
        }
      }

      const finalResult = subJob ? `${result}  →  ${subJob.result}` : result;
      setDispatchStep(isA2A ? 5 : 3);
      await pause(900);
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: "completed" as TaskStatus, result: finalResult, durationMs: ms, dispatchedTo: agent.endpoint, requestPayload: payloadFor(agent, task), subJob }
          : t
      ));
      recordResult(agent.id, { taskId, taskTitle: task.title, ms, success: true, ts: Date.now() });
      const { toAgent, fee } = feeSplit(task.budget);
      if (subJob) {
        addActivity(`Task #${taskId} completed via A2A · ${(toAgent - subJob.cost).toFixed(2)} to ${agent.name}, ${subJob.cost} to ${subJob.agentName}, ${fee} fee`, "completed");
      } else {
        addActivity(`Task #${taskId} completed by ${agent.name} in ${ms}ms · ${toAgent} released, ${fee} fee`, "completed");
      }
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: "disputed" as TaskStatus, result: "Agent call failed: " + (err as Error).message, durationMs: ms, dispatchedTo: agent.endpoint, requestPayload: payloadFor(agent, task) }
          : t
      ));
      recordResult(agent.id, { taskId, taskTitle: task.title, ms, success: false, ts: Date.now() });
      addActivity(`Task #${taskId} agent call failed (${agent.name})`, "failed");
    } finally {
      setDispatching(null);
      setDispatchStep(0);
    }
  }

  // Calls an agent's endpoint with the given input text as the task payload.
  async function callAgentEndpoint(agent: Agent, inputText: string): Promise<string> {
    if (agent.endpoint.includes("api.mymemory.translated.net")) {
      const url = `${agent.endpoint}?q=${encodeURIComponent(inputText)}&langpair=en|tr`;
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
      body: JSON.stringify({ task: inputText, description: inputText }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return `Live agent response: ${text.slice(0, 300)}`;
  }

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
            {q && <span className="text-rialo-400"> · filtered by &ldquo;{search}&rdquo;</span>}
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rialo-400 to-rialo-500 hover:from-rialo-300 hover:to-rialo-400 text-black rounded-xl font-medium transition-all text-sm shadow-lg shadow-rialo-600/20 hover:-translate-y-0.5"
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
              <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder="Summarise Q3 report" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm text-white/50">Description</label>
              <textarea rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all resize-none"
                placeholder="Describe what you need the agent to do..." value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Required Capability</label>
              <select className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                value={form.capability} onChange={e => setForm(f => ({ ...f, capability: e.target.value }))}>
                {ALL_CAPS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Budget (RIALO)</label>
              <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder="20" value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Deadline in minutes (optional)</label>
              <input type="number" min="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder="e.g. 30 — escrow refunds if unclaimed" value={form.deadline}
                onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/50">Your Pubkey</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                placeholder={pubkey ? pubkey : "Connect wallet or enter manually"} value={form.poster}
                onChange={e => setForm(f => ({ ...f, poster: e.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm text-white/50 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-copper-400" /> Second step (optional) — the assigned agent hires another agent for this
              </label>
              <select className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-copper-400/60 transition-all"
                value={form.secondCapability} onChange={e => setForm(f => ({ ...f, secondCapability: e.target.value }))}>
                <option value="">No second step</option>
                {ALL_CAPS.filter(c => c !== form.capability).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {form.budget && Number(form.budget) > 0 && (
            <div className="text-xs text-white/40">
              {form.secondCapability ? (
                <>On completion: <span className="text-rialo-400">{feeSplit(Number(form.budget)).toAgent} split between primary &amp; hired agent</span> · {feeSplit(Number(form.budget)).fee} protocol fee ({PROTOCOL_FEE_BPS / 100}%)</>
              ) : (
                <>On completion: <span className="text-rialo-400">{feeSplit(Number(form.budget)).toAgent} to agent</span> · {feeSplit(Number(form.budget)).fee} protocol fee ({PROTOCOL_FEE_BPS / 100}%)</>
              )}
            </div>
          )}
          {formError && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-xl px-4 py-3 text-sm text-red-300">{formError}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-5 py-2 bg-gradient-to-r from-rialo-400 to-rialo-500 hover:from-rialo-300 hover:to-rialo-400 text-black rounded-xl text-sm font-medium transition-all">Post Task</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-white/10 hover:border-white/30 rounded-xl text-sm text-white/50 hover:text-white transition-all">Cancel</button>
          </div>
        </form>
      )}

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "mine", "open", "in-progress", "completed", "disputed"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filterStatus === s ? "bg-rialo-600/30 text-rialo-400 border border-rialo-600/50" : "bg-white/5 text-white/40 border border-white/10 hover:text-white")}>
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
          const isMine = task.poster === myPoster && myPoster !== "";
          const split = feeSplit(task.budget);

          return (
            <div key={task.id} className={clsx("card-hover glass rounded-2xl p-5 space-y-3 relative", pickerFor === task.id && "z-40")}>

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
                {task.secondCapability && (
                  <span className="px-2 py-0.5 bg-copper-400/10 border border-copper-400/25 text-copper-300 rounded-md font-medium flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5" />+ {task.secondCapability}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-white/[0.04] rounded-md"><span className="text-white font-medium">{task.budget}</span> RIALO</span>
                {task.assignedAgent && <span className="px-2 py-0.5 bg-white/[0.04] rounded-md">→ <span className="text-white/60">{task.assignedAgent}</span></span>}
                {task.subJob && <span className="px-2 py-0.5 bg-copper-400/10 text-copper-300 rounded-md">hired <span className="font-medium">{task.subJob.agentName}</span></span>}
                {task.status === "open" && task.deadlineTs && (
                  <span className="px-2 py-0.5 bg-orange-600/10 text-orange-400 rounded-md flex items-center gap-1"><Timer className="w-3 h-3" />deadline set</span>
                )}
                <span className="ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{task.createdAt}</span>
              </div>

              {/* Dispatch flow indicator (5 phases when the primary hires a sub-agent) */}
              {isDispatching && (
                <div className="flex items-center gap-2 text-xs flex-wrap bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                  {(task.secondCapability
                    ? [
                        { n: 1, label: "Contract dispatching", icon: Send },
                        { n: 2, label: "Agent A responding",   icon: Radio },
                        { n: 3, label: "A hires sub-agent",    icon: Radio },
                        { n: 4, label: "Agent B responding",   icon: Radio },
                        { n: 5, label: "Escrow split",         icon: CheckCircle },
                      ]
                    : [
                        { n: 1, label: "Contract dispatching", icon: Send },
                        { n: 2, label: "Agent responding",     icon: Radio },
                        { n: 3, label: "Escrow released",      icon: CheckCircle },
                      ]
                  ).map(({ n, label, icon: StepIcon }, i) => (
                    <span key={n} className="flex items-center gap-2">
                      {i > 0 && <span className="w-5 h-px bg-white/15" />}
                      <span className={clsx("flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium transition-all",
                        dispatchStep > n ? "text-rialo-400" : dispatchStep === n ? "text-rialo-300 bg-rialo-600/15 step-active" : "text-white/25")}>
                        <StepIcon className="w-3.5 h-3.5" />{label}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Result */}
              {task.result && (
                <div className={clsx("border rounded-xl px-4 py-3 text-sm flex items-start gap-2",
                  task.status === "disputed" ? "bg-red-600/10 border-red-600/20 text-red-300" : "bg-rialo-600/10 border-rialo-600/20 text-rialo-300")}>
                  <Zap className="w-4 h-4 shrink-0 mt-0.5 opacity-60" />
                  <span className="min-w-0 break-words">
                    {task.result}
                    {task.durationMs !== undefined && <span className="ml-2 text-xs opacity-60">· {task.durationMs}ms round-trip</span>}
                  </span>
                </div>
              )}

              {/* Escrow split on completed (three-way when a sub-agent was hired) */}
              {task.status === "completed" && (
                <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap">
                  <CheckCircle className="w-3.5 h-3.5 text-rialo-400" />
                  Escrow released:
                  {task.subJob ? (
                    <>
                      <span className="text-rialo-400 font-medium">{(split.toAgent - task.subJob.cost).toFixed(2)} → {task.assignedAgent}</span>
                      <span className="text-white/25">·</span>
                      <span className="text-copper-300 font-medium">{task.subJob.cost} → {task.subJob.agentName}</span>
                      <span className="text-white/25">·</span>
                      <span className="text-white/50">{split.fee} → protocol</span>
                    </>
                  ) : (
                    <>
                      <span className="text-rialo-400 font-medium">{split.toAgent} → agent</span>
                      <span className="text-white/25">·</span>
                      <span className="text-white/50">{split.fee} → protocol ({PROTOCOL_FEE_BPS / 100}%)</span>
                    </>
                  )}
                </div>
              )}

              {/* Rating (poster rates a completed task once) */}
              {task.status === "completed" && isMine && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/40">{task.rating ? "You rated:" : "Rate this result:"}</span>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} disabled={!!task.rating} onClick={() => rateTask(task.id, s)}
                        className={clsx("transition-all", !task.rating && "hover:scale-110")}>
                        <Star className={clsx("w-4 h-4", (task.rating ?? 0) >= s ? "fill-yellow-400 text-yellow-400" : "text-white/20")} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dispatch details + dispute */}
              {(task.dispatchedTo || task.requestPayload) && (
                <div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setExpandedId(e => e === task.id ? null : task.id)}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-all">
                      <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", expandedId === task.id && "rotate-180")} />
                      Dispatch details
                    </button>
                    {task.status === "completed" && !task.verdict && (
                      <button onClick={() => setDisputeDraft({ id: task.id, reason: "" })}
                        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 transition-all"
                        title="Not happy with the result? File a dispute — the escrow freezes until an arbiter rules.">
                        <AlertCircle className="w-3.5 h-3.5" />Open dispute
                      </button>
                    )}
                  </div>
                  {expandedId === task.id && (
                    <div className="mt-3 grid gap-2 text-xs font-mono">
                      <div className="bg-white/[0.04] rounded-lg px-3 py-2 flex gap-2 items-start">
                        <span className="text-white/30 shrink-0">endpoint</span><span className="text-white/60 break-all">{task.dispatchedTo}</span>
                      </div>
                      {task.requestPayload && (
                        <div className="bg-white/[0.04] rounded-lg px-3 py-2 flex gap-2 items-start">
                          <span className="text-white/30 shrink-0">request</span><span className="text-white/60 break-all">{task.requestPayload}</span>
                        </div>
                      )}
                      {task.durationMs !== undefined && (
                        <div className="bg-white/[0.04] rounded-lg px-3 py-2 flex gap-2 items-start">
                          <span className="text-white/30 shrink-0">duration</span><span className="text-rialo-400">{task.durationMs}ms</span>
                        </div>
                      )}
                      {task.subJob && (
                        <div className="bg-copper-400/[0.07] border border-copper-400/25 rounded-lg px-3 py-2 space-y-1">
                          <div className="text-copper-300/80 not-italic">↳ subcontracted to {task.subJob.agentName}</div>
                          <div className="flex gap-2 items-start"><span className="text-white/30 shrink-0">endpoint</span><span className="text-white/60 break-all">{task.subJob.endpoint}</span></div>
                          <div className="flex gap-2 items-start"><span className="text-white/30 shrink-0">result</span><span className="text-white/60 break-all">{task.subJob.result}</span></div>
                          <div className="flex gap-2 items-start"><span className="text-white/30 shrink-0">cost/time</span><span className="text-copper-300">{task.subJob.cost} RIALO · {task.subJob.ms}ms</span></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Dispute reason draft */}
              {disputeDraft?.id === task.id && (
                <div className="bg-red-600/5 border border-red-600/20 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-medium text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" /> Why are you disputing this result?
                  </div>
                  <textarea rows={2} autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/50 transition-all resize-none"
                    placeholder="e.g. the translation came back in the wrong language"
                    value={disputeDraft.reason}
                    onChange={e => setDisputeDraft({ id: task.id, reason: e.target.value })} />
                  <div className="flex gap-2">
                    <button onClick={() => fileDispute(task.id, disputeDraft.reason)} disabled={!disputeDraft.reason.trim()}
                      className="px-4 py-1.5 bg-red-600/80 hover:bg-red-600 rounded-lg text-xs font-medium transition-all disabled:opacity-40">
                      File dispute
                    </button>
                    <button onClick={() => setDisputeDraft(null)}
                      className="px-4 py-1.5 border border-white/10 hover:border-white/30 rounded-lg text-xs text-white/50 hover:text-white transition-all">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Verdict banner (resolved cases) */}
              {task.verdict && (
                <div className={clsx("border rounded-xl px-4 py-3 space-y-1.5",
                  task.verdict === "refund" ? "bg-orange-600/10 border-orange-600/20" : "bg-rialo-600/10 border-rialo-600/20")}>
                  <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                    <Gavel className={clsx("w-4 h-4", task.verdict === "refund" ? "text-orange-400" : "text-rialo-400")} />
                    Arbiter verdict: <span className={task.verdict === "refund" ? "text-orange-400" : "text-rialo-400"}>{task.verdict === "refund" ? "Refund to poster" : "Release to agent"}</span>
                    <span className="ml-auto flex items-center gap-2 text-[10px] text-white/30 font-normal">
                      via {task.verdictBy}
                      {task.verdictTxHash && (
                        <a href={`https://explorer-studio.genlayer.com/tx/${task.verdictTxHash}`} target="_blank" rel="noreferrer"
                          className="text-rialo-400 hover:text-rialo-300 underline">on-chain tx ↗</a>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">{task.verdictReasoning}</p>
                </div>
              )}

              {/* Dispute resolution panel */}
              {task.status === "disputed" && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-medium text-white/70 flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-rialo-400" /> Case file · escrow frozen ({task.budget} RIALO)
                  </div>
                  <div className="grid gap-2 text-xs">
                    <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                      <span className="text-white/30">Task asked: </span><span className="text-white/60">{task.description}</span>
                    </div>
                    {task.result && (
                      <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                        <span className="text-white/30">Agent delivered: </span><span className="text-white/60 break-words">{task.result}</span>
                      </div>
                    )}
                    {task.disputeReason && (
                      <div className="bg-red-600/5 rounded-lg px-3 py-2">
                        <span className="text-red-300/60">Poster claims: </span><span className="text-red-300/90">{task.disputeReason}</span>
                      </div>
                    )}
                  </div>

                  {arbitrating === task.id ? (
                    <div className="flex items-center gap-2 text-xs text-rialo-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> GenLayer arbiter reviewing the case on-chain...
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => sendToArbiter(task.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rialo-400 to-rialo-500 hover:from-rialo-300 hover:to-rialo-400 text-black text-black rounded-xl text-sm font-semibold transition-all">
                        <Gavel className="w-3.5 h-3.5" /> Send to arbiter
                      </button>
                      <span className="text-[10px] text-white/30">GenLayer intelligent contract · falls back to local rule if unreachable</span>
                    </div>
                  )}
                </div>
              )}

              {/* Assign button for open tasks */}
              {task.status === "open" && (
                <div className="relative">
                  <button onClick={() => setPickerFor(p => p === task.id ? null : task.id)} disabled={isDispatching}
                    className="flex items-center gap-2 px-4 py-2 bg-rialo-600/20 hover:bg-rialo-600/40 border border-rialo-600/30 rounded-xl text-rialo-400 text-sm font-medium transition-all disabled:opacity-50">
                    <Zap className="w-3.5 h-3.5" />{isDispatching ? "Dispatching to agent..." : "Assign Agent"}
                  </button>
                  {pickerFor === task.id && (
                    <div className="absolute z-50 mt-2 w-80 rounded-xl shadow-2xl shadow-black/70 overflow-hidden border border-[#2e2a20] bg-[#161616]">
                      {eligibleAgents(task.capability).length === 0 ? (
                        <div className="px-4 py-3 text-xs text-white/40">No active agents registered for &ldquo;{task.capability}&rdquo; yet. Register one on the Agents page.</div>
                      ) : (
                        eligibleAgents(task.capability).map(agent => (
                          <button key={agent.id} onClick={() => dispatchToAgent(task.id, agent)}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-rialo-600/10 transition-all border-b border-white/5 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{agent.name}</span>
                              {isLiveAgent(agent) ? (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rialo-600/15 text-rialo-400 text-[10px] font-medium">
                                  <span className="w-1 h-1 rounded-full bg-rialo-400 animate-pulse" /> live endpoint
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/30 text-[10px] font-medium">demo · no live endpoint</span>
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
              {q ? `No tasks match "${search}".` :
               filterStatus === "my-disputes" ? "No disputes on your tasks. That's a good thing." :
               filterStatus === "mine" && !pubkey ? "Connect your wallet to see your tasks." :
               "No tasks match this filter."}
            </p>
            <button onClick={() => { setFilterStatus("all"); setShowForm(true); }}
              className="text-xs text-rialo-400 hover:text-rialo-300 transition-all">Post a new task →</button>
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

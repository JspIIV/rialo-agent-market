"use client";
import { useState } from "react";
import { Bot, Plus, Star, CheckCircle, XCircle, Zap } from "lucide-react";
import clsx from "clsx";

type Agent = {
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

const MOCK_AGENTS: Agent[] = [
  { id: 1, name: "GPT-Summariser",   capabilities: ["text-summary", "translation"],    price: 10,  endpoint: "https://api.example.com/summarise",  tasksCompleted: 23, reputation: 91, active: true,  owner: "7xKp...3mNz" },
  { id: 2, name: "CodeReview-Pro",   capabilities: ["code-review", "security-audit"],  price: 50,  endpoint: "https://api.example.com/codereview",  tasksCompleted: 11, reputation: 84, active: true,  owner: "9aQr...1pVw" },
  { id: 3, name: "LinguaBot",        capabilities: ["translation", "text-summary"],    price: 8,   endpoint: "https://api.example.com/lingua",      tasksCompleted: 18, reputation: 78, active: true,  owner: "3bFt...7xJk" },
  { id: 4, name: "DevAssist-v2",     capabilities: ["code-review", "unit-tests"],      price: 35,  endpoint: "https://api.example.com/devassist",   tasksCompleted: 6,  reputation: 70, active: true,  owner: "5cGm...2yLs" },
  { id: 5, name: "DataAnalyser",     capabilities: ["data-analysis", "text-summary"],  price: 25,  endpoint: "https://api.example.com/dataanalyse", tasksCompleted: 0,  reputation: 50, active: false, owner: "1dHn...8wMt" },
];

const ALL_CAPS = ["text-summary","translation","code-review","security-audit","unit-tests","data-analysis"];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [form, setForm] = useState({ name:"", caps:"", price:"", endpoint:"", owner:"" });

  const filtered = filter === "all"
    ? agents
    : agents.filter(a => a.capabilities.includes(filter));

  function addAgent(e: React.FormEvent) {
    e.preventDefault();
    const newAgent: Agent = {
      id: agents.length + 1,
      name: form.name,
      capabilities: form.caps.split(",").map(s => s.trim().toLowerCase()),
      price: Number(form.price),
      endpoint: form.endpoint,
      owner: form.owner || "Your wallet",
      tasksCompleted: 0,
      reputation: 50,
      active: true,
    };
    setAgents(prev => [newAgent, ...prev]);
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
          className="flex items-center gap-2 px-4 py-2 bg-rialo-600 hover:bg-rialo-500 rounded-xl font-medium transition-all text-sm"
        >
          <Plus className="w-4 h-4" /> Register Agent
        </button>
      </div>

      {/* Register form */}
      {showForm && (
        <form onSubmit={addAgent} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Bot className="w-5 h-5 text-rialo-400" /> Register New Agent
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { key:"name",     label:"Agent Name",                   placeholder:"GPT-Summariser" },
              { key:"caps",     label:"Capabilities (comma-separated)", placeholder:"text-summary,translation" },
              { key:"price",    label:"Price per Task (RIALO)",        placeholder:"10" },
              { key:"endpoint", label:"HTTP Endpoint",                 placeholder:"https://your-agent.example.com/run" },
              { key:"owner",    label:"Owner Pubkey",                  placeholder:"Your wallet address" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-sm text-white/50">{label}</label>
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-rialo-600/60 transition-all"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  required
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

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {["all", ...ALL_CAPS].map(cap => (
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
            {cap === "all" ? "All" : cap}
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map(agent => (
          <div key={agent.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4 hover:border-white/20 transition-all">

            {/* Header row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rialo-600/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-rialo-400" />
                </div>
                <div>
                  <div className="font-semibold">{agent.name}</div>
                  <div className="text-xs text-white/30">{agent.owner}</div>
                </div>
              </div>
              {agent.active
                ? <CheckCircle className="w-4 h-4 text-rialo-400" />
                : <XCircle    className="w-4 h-4 text-red-400" />
              }
            </div>

            {/* Capabilities */}
            <div className="flex gap-2 flex-wrap">
              {agent.capabilities.map(cap => (
                <span key={cap} className="px-2 py-0.5 bg-rialo-600/20 text-rialo-400 rounded-md text-xs font-medium">
                  {cap}
                </span>
              ))}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/5 rounded-xl p-2">
                <div className="text-lg font-bold text-rialo-400">{agent.price}</div>
                <div className="text-xs text-white/30">RIALO/task</div>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <div className="text-lg font-bold">{agent.tasksCompleted}</div>
                <div className="text-xs text-white/30">completed</div>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-bold text-yellow-400">
                  <Star className="w-3.5 h-3.5" />{agent.reputation}
                </div>
                <div className="text-xs text-white/30">reputation</div>
              </div>
            </div>

            {/* Endpoint */}
            <div className="flex items-center gap-2 text-xs text-white/30 bg-white/5 rounded-lg px-3 py-2 font-mono truncate">
              <Zap className="w-3 h-3 shrink-0 text-rialo-400" />
              {agent.endpoint}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

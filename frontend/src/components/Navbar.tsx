"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Bot, ClipboardList, LayoutDashboard, Zap, Wallet, LogOut, ChevronDown, AlertCircle, Search, X } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useTasks } from "@/context/TasksContext";

const links = [
  { href: "/",        label: "Dashboard",  icon: LayoutDashboard },
  { href: "/agents",  label: "Agents",     icon: Bot },
  { href: "/tasks",   label: "Tasks",      icon: ClipboardList },
];

function shorten(pubkey: string) {
  return pubkey.length > 10 ? `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}` : pubkey;
}

export default function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { pubkey, connecting, connect, disconnect, balance, topUp, faucetCooldown } = useWallet();
  const { search, setSearch } = useTasks();
  const [menuOpen, setMenuOpen] = useState(false);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Search filters both Agents and Tasks; if we're on the dashboard, jump to
    // Agents so the user sees results.
    if (path !== "/agents" && path !== "/tasks") router.push("/agents");
  }

  const menuItems = [
    { href: "/agents?filter=mine",       label: "My Agents",   icon: Bot },
    { href: "/tasks?filter=mine",        label: "My Tasks",    icon: ClipboardList },
    { href: "/tasks?filter=my-disputes", label: "My Disputes", icon: AlertCircle },
  ];

  return (
    <nav className="border-b border-[#1c1c1c] bg-[#0A0A0A] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rialo-400 to-rialo-600 flex items-center justify-center shadow-lg shadow-rialo-600/30">
            <Zap className="w-4.5 h-4.5 text-black" fill="black" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">Agent<span className="text-rialo-400">Market</span></span>
          <span className="text-[11px] font-medium text-white/35 ml-0.5 border border-white/10 rounded-full px-2 py-0.5">on Rialo</span>
        </Link>

        {/* Links */}
        <div className="flex gap-1 bg-[#141414] border border-[#262626] rounded-xl p-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm transition-all",
                path === href
                  ? "bg-rialo-400/15 text-rialo-400 font-medium"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={onSearchSubmit} className="hidden lg:flex items-center gap-2 flex-1 max-w-xs bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 focus-within:border-rialo-600/50 transition-all">
          <Search className="w-4 h-4 text-white/30 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents & tasks..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-white/30"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-white/30 hover:text-white transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Wallet connect */}
        {pubkey ? (
          <div className="flex items-center gap-2 shrink-0">
            {/* Balance + devnet faucet */}
            <div className="hidden sm:flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-sm">
              <span className="font-medium">{balance.toLocaleString()}</span>
              <span className="text-white/40 text-xs">RIALO</span>
              <button
                onClick={topUp}
                disabled={faucetCooldown > 0}
                title={faucetCooldown > 0 ? `Faucet on cooldown: ${faucetCooldown}s` : "Devnet faucet: +500 RIALO"}
                className={clsx(
                  "ml-1 h-6 rounded-md text-xs font-bold transition-all leading-none flex items-center justify-center",
                  faucetCooldown > 0
                    ? "w-9 bg-white/[0.04] text-white/30 cursor-not-allowed"
                    : "w-6 bg-rialo-600/20 hover:bg-rialo-600/40 text-rialo-400 text-sm"
                )}
              >
                {faucetCooldown > 0 ? `${faucetCooldown}s` : "+"}
              </button>
            </div>
            {/* Wallet menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rialo-600/40 bg-rialo-600/5 text-rialo-400 text-sm hover:bg-rialo-600/10 transition-all"
              >
                <span className="w-2 h-2 rounded-full bg-rialo-400 animate-pulse" />
                {shorten(pubkey)}
                <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", menuOpen && "rotate-180")} />
              </button>

              {menuOpen && (
                <>
                  {/* Click-away backdrop */}
                  <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-2xl shadow-black/70 overflow-hidden z-[70] bg-[#161616] border border-[#2e2a20]">
                    {menuItems.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all border-b border-[#232323]"
                      >
                        <Icon className="w-4 h-4 text-rialo-400" />
                        {label}
                      </Link>
                    ))}
                    <button
                      onClick={() => { setMenuOpen(false); disconnect(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/50 hover:text-[#E0563F] hover:bg-[#E0563F]/10 transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-rialo-400 to-rialo-500 hover:from-rialo-300 hover:to-rialo-400 text-black font-semibold text-sm transition-all disabled:opacity-50 shrink-0 shadow-lg shadow-rialo-600/25"
          >
            <Wallet className="w-3.5 h-3.5" />
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>
    </nav>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Bot, ClipboardList, LayoutDashboard, Zap, Wallet, LogOut, ChevronDown, AlertCircle } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

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
  const { pubkey, connecting, connect, disconnect, balance, topUp } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = [
    { href: "/agents?filter=mine",       label: "My Agents",   icon: Bot },
    { href: "/tasks?filter=mine",        label: "My Tasks",    icon: ClipboardList },
    { href: "/tasks?filter=my-disputes", label: "My Disputes", icon: AlertCircle },
  ];

  return (
    <nav className="border-b border-white/10 bg-[#0a0f0d]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rialo-400 to-rialo-700 flex items-center justify-center shadow-lg shadow-rialo-600/30">
            <Zap className="w-4.5 h-4.5 text-black" fill="black" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">AgentMarket</span>
          <span className="text-[11px] font-medium text-white/35 ml-0.5 border border-white/10 rounded-full px-2 py-0.5">on Rialo</span>
        </Link>

        {/* Links */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/5 rounded-xl p-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm transition-all",
                path === href
                  ? "bg-rialo-600/25 text-rialo-400 font-medium"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>

        {/* Wallet connect */}
        {pubkey ? (
          <div className="flex items-center gap-2 shrink-0">
            {/* Balance + devnet faucet */}
            <div className="hidden sm:flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-sm">
              <span className="font-medium">{balance.toLocaleString()}</span>
              <span className="text-white/40 text-xs">RIALO</span>
              <button
                onClick={topUp}
                title="Devnet faucet: +500 RIALO"
                className="ml-1 w-6 h-6 rounded-md bg-rialo-600/20 hover:bg-rialo-600/40 text-rialo-400 text-sm font-bold transition-all leading-none"
              >
                +
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
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 glass-strong rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
                    {menuItems.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all border-b border-white/5"
                      >
                        <Icon className="w-4 h-4 text-rialo-400" />
                        {label}
                      </Link>
                    ))}
                    <button
                      onClick={() => { setMenuOpen(false); disconnect(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-white/50 hover:text-red-400 hover:bg-red-600/10 transition-all"
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rialo-600 hover:bg-rialo-500 text-black font-medium text-sm transition-all disabled:opacity-50 shrink-0 shadow-lg shadow-rialo-600/20"
          >
            <Wallet className="w-3.5 h-3.5" />
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>
    </nav>
  );
}

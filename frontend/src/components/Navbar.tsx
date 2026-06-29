"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Bot, ClipboardList, LayoutDashboard, Zap } from "lucide-react";

const links = [
  { href: "/",        label: "Dashboard",  icon: LayoutDashboard },
  { href: "/agents",  label: "Agents",     icon: Bot },
  { href: "/tasks",   label: "Tasks",      icon: ClipboardList },
];

export default function Navbar() {
  const path = usePathname();

  return (
    <nav className="border-b border-white/10 bg-black/40 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-rialo-400">
          <Zap className="w-5 h-5" />
          <span>AgentMarket</span>
          <span className="text-xs font-normal text-white/40 ml-1">on Rialo</span>
        </Link>

        {/* Links */}
        <div className="flex gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all",
                path === href
                  ? "bg-rialo-600/30 text-rialo-400 font-medium"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Wallet mock */}
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rialo-600/50 text-rialo-400 text-sm hover:bg-rialo-600/10 transition-all">
          <span className="w-2 h-2 rounded-full bg-rialo-400 animate-pulse" />
          Devnet
        </button>
      </div>
    </nav>
  );
}

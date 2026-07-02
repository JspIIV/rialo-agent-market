import { Zap, Github, BookOpen } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
        <span className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-gradient-to-br from-rialo-400 to-rialo-700 flex items-center justify-center">
            <Zap className="w-3 h-3 text-black" fill="black" />
          </span>
          AgentMarket · Built on Rialo Devnet · Contract in Rust (Venus PDK) · Pre-audit build
        </span>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/JspIIV/rialo-agent-market"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-white transition-all"
          >
            <Github className="w-3.5 h-3.5" /> GitHub
          </a>
          <a
            href="https://rialo.io"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-white transition-all"
          >
            <BookOpen className="w-3.5 h-3.5" /> Rialo
          </a>
        </div>
      </div>
    </footer>
  );
}

"use client";
import { useState } from "react";
import { Wallet, X } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

export default function WalletModal() {
  const { modalOpen, closeModal, setManualPubkey } = useWallet();
  const [value, setValue] = useState("");

  if (!modalOpen) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim()) setManualPubkey(value.trim());
    setValue("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={closeModal}>
      <div
        className="w-full max-w-sm bg-[#0f1411] border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Wallet className="w-5 h-5 text-rialo-400" />
            Connect Wallet
          </div>
          <button onClick={closeModal} className="text-white/30 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-white/40">
          No Solana-compatible wallet extension detected. Enter a Rialo devnet pubkey to use for this session.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:border-rialo-600/60 transition-all"
            placeholder="7xKp...3mNz"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-rialo-400 to-rialo-500 hover:from-rialo-300 hover:to-rialo-400 text-black rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use this address
          </button>
        </form>
      </div>
    </div>
  );
}

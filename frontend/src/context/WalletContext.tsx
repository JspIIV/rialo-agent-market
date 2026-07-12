"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";

type WalletState = {
  pubkey: string | null;
  connecting: boolean;
  hasProvider: boolean;
  modalOpen: boolean;
  balance: number;
  faucetCooldown: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  setManualPubkey: (key: string) => void;
  closeModal: () => void;
  topUp: () => void;
  spend: (amount: number) => boolean;
  refund: (amount: number) => void;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Devnet demo balance. On mainnet this would be read from the chain.
  const [balance, setBalance] = usePersistentState<number>("am_balance", 1000);
  const [faucetCooldown, setFaucetCooldown] = useState(0);

  // Real faucets rate-limit requests; mirror that with a 60s cooldown.
  const topUp = useCallback(() => {
    if (faucetCooldown > 0) return;
    setBalance(b => b + 500);
    setFaucetCooldown(60);
    const timer = setInterval(() => {
      setFaucetCooldown(c => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
  }, [faucetCooldown, setBalance]);

  // Locks funds for a task budget. Returns false if the balance can't cover it.
  const spend = useCallback((amount: number) => {
    if (balance < amount) return false;
    setBalance(b => b - amount);
    return true;
  }, [balance, setBalance]);

  // Returns escrowed funds to the wallet (task expired or cancelled).
  const refund = useCallback((amount: number) => {
    setBalance(b => b + amount);
  }, [setBalance]);

  useEffect(() => {
    setHasProvider(typeof window !== "undefined" && !!(window as any).solana?.isPhantom);
    const stored = typeof window !== "undefined" ? localStorage.getItem("wallet_pubkey") : null;
    if (stored) setPubkey(stored);
  }, []);

  const connect = useCallback(async () => {
    const provider = (window as any).solana;
    if (provider?.isPhantom) {
      setConnecting(true);
      try {
        const resp = await provider.connect();
        const addr = resp.publicKey.toString();
        setPubkey(addr);
        localStorage.setItem("wallet_pubkey", addr);
      } catch {
        // Extension present but connect failed/rejected — fall back to manual entry.
        setModalOpen(true);
      } finally {
        setConnecting(false);
      }
    } else {
      setModalOpen(true);
    }
  }, []);

  const setManualPubkey = useCallback((key: string) => {
    setPubkey(key);
    localStorage.setItem("wallet_pubkey", key);
    setModalOpen(false);
  }, []);

  const disconnect = useCallback(() => {
    setPubkey(null);
    localStorage.removeItem("wallet_pubkey");
    const provider = (window as any).solana;
    if (provider?.isPhantom) provider.disconnect?.();
  }, []);

  return (
    <WalletContext.Provider value={{ pubkey, connecting, hasProvider, modalOpen, balance, faucetCooldown, connect, disconnect, setManualPubkey, closeModal: () => setModalOpen(false), topUp, spend, refund }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

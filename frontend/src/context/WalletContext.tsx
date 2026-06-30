"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type WalletState = {
  pubkey: string | null;
  connecting: boolean;
  hasProvider: boolean;
  modalOpen: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  setManualPubkey: (key: string) => void;
  closeModal: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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
    <WalletContext.Provider value={{ pubkey, connecting, hasProvider, modalOpen, connect, disconnect, setManualPubkey, closeModal: () => setModalOpen(false) }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

"use client";
import { useCallback, useEffect, useState } from "react";

type Updater<T> = T | ((prev: T) => T);

// A useState that mirrors to localStorage, written to be robust against effect
// ordering and React StrictMode double-mounts.
//
// - First render uses `initial` so server and client markup match (no hydration
//   mismatch).
// - The stored value is read once on mount and applied WITHOUT writing back,
//   so loading can never clobber storage with the default.
// - Writing happens synchronously inside the setter (not in an effect), so an
//   explicit update is persisted immediately and nothing else can race it.
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* corrupt or unavailable storage — keep initial */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback((updater: Updater<T>) => {
    setValue(prev => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, [key]);

  return [value, set] as const;
}

"use client";
import { RotateCcw } from "lucide-react";

// Clears the persisted demo state (agents, tasks, balance, activity, quick-start
// dismissal) so the marketplace returns to its seeded starting point. Handy
// right before a live demo if test data has piled up.
export default function ResetDemo() {
  function reset() {
    if (!confirm("Reset the demo to its starting state? This clears agents, tasks and balance you added.")) return;
    ["am_agents", "am_tasks", "am_activity", "am_balance", "am_diplomacy", "am_diplomacy_auto", "qs_dismissed"].forEach(k => localStorage.removeItem(k));
    location.reload();
  }
  return (
    <button onClick={reset} className="flex items-center gap-1.5 hover:text-white transition-all">
      <RotateCcw className="w-3.5 h-3.5" /> Reset demo
    </button>
  );
}

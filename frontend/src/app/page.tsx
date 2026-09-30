"use client";
import { DiplomacyProvider } from "@/context/DiplomacyContext";
import DiplomacyApp from "@/components/diplomacy/DiplomacyApp";

// The home page is Agent Diplomacy: agents dealing with agents. The provider
// lives here rather than in the layout, so the sovereigns only act (and the
// board only renders) while someone is watching. The people-hire-agents
// marketplace lives at /market.
export default function HomePage() {
  return (
    <DiplomacyProvider>
      <DiplomacyApp />
    </DiplomacyProvider>
  );
}

"use client";
import { DiplomacyProvider } from "@/context/DiplomacyContext";
import DiplomacyApp from "@/components/diplomacy/DiplomacyApp";

// The second half of the product: agents dealing with agents. The provider
// lives here rather than in the layout, so the sovereigns only act (and the
// board only renders) while someone is watching.
export default function DiplomacyPage() {
  return (
    <DiplomacyProvider>
      <DiplomacyApp />
    </DiplomacyProvider>
  );
}

import { redirect } from "next/navigation";

// Agent Diplomacy moved to the home page.
export default function DiplomacyRedirect() {
  redirect("/");
}

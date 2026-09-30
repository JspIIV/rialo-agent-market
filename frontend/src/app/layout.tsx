import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WalletModal from "@/components/WalletModal";
import { WalletProvider } from "@/context/WalletContext";
import { AgentsProvider } from "@/context/AgentsContext";
import { TasksProvider } from "@/context/TasksContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "AgentMarket on Rialo · Agent Diplomacy",
  description: "AI agents that sign bonded treaties, hire each other and settle breaches in a GenLayer tribunal, plus a marketplace where people hire them. On Rialo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-[#0A0A0A] text-[#F5F0E6]">
        <WalletProvider>
          <AgentsProvider>
            <TasksProvider>
              <Navbar />
              <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
              <Footer />
              <WalletModal />
            </TasksProvider>
          </AgentsProvider>
        </WalletProvider>
      </body>
    </html>
  );
}

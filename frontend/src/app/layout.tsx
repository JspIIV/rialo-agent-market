import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WalletModal from "@/components/WalletModal";
import { WalletProvider } from "@/context/WalletContext";
import { AgentsProvider } from "@/context/AgentsContext";
import { TasksProvider } from "@/context/TasksContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Rialo Agent Marketplace",
  description: "Autonomous AI Agent Marketplace on Rialo — on-chain task dispatch, no oracle needed",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen bg-[#0a0f0d] text-white">
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

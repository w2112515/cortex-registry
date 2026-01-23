import type { Metadata } from "next";
import "./globals.css";
import Web3Provider from "@/components/Web3Provider";

export const metadata: Metadata = {
  title: "CortexRegistry | Star Map",
  description: "Decentralized MCP Service Discovery Network Visualization",
  keywords: ["MCP", "Service Discovery", "Blockchain", "AI Agents", "x402"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-mono antialiased">
        {/* Deep Space Background Layers */}
        <div className="deep-space-bg" />
        <div className="cyber-grid" />
        <div className="horizon-glow" />

        {/* Content with Web3 Context */}
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}

"use client";

/**
 * Web3 Provider Component
 * 
 * @description Provides wagmi/connectkit context for wallet connections
 * @see Task-36: 实现钱包连接 (wagmi + connectkit)
 * @see Task-38: 修复依赖链 - 安装了所有 peer dependencies
 */

import { useState } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { cronosTestnet, cronos } from 'wagmi/chains';

// 使用 ConnectKit 官方推荐的 getDefaultConfig
// 依赖已安装：@gemini-wallet/core, @metamask/sdk, @safe-global/*, @walletconnect/*
const config = createConfig(
    getDefaultConfig({
        chains: [cronosTestnet, cronos],
        transports: {
            [cronosTestnet.id]: http('https://evm-t3.cronos.org'),
            [cronos.id]: http('https://evm.cronos.org'),
        },

        // WalletConnect Project ID (可选 - 用于 WalletConnect 钱包)
        walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',

        // App metadata
        appName: 'CortexRegistry',
        appDescription: 'Decentralized MCP Service Discovery Network',
        appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://cortexregistry.xyz',
        appIcon: '/favicon.ico',
    })
);

interface Web3ProviderProps {
    children: React.ReactNode;
}

export default function Web3Provider({ children }: Web3ProviderProps) {
    // 使用 useState 确保 QueryClient 在客户端安全初始化
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnWindowFocus: false,
                retry: 1,
            },
        },
    }));

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <ConnectKitProvider
                    theme="midnight"
                    mode="dark"
                    options={{
                        embedGoogleFonts: true,
                        enforceSupportedChains: false,
                        hideBalance: false,
                        hideTooltips: false,
                        hideQuestionMarkCTA: true,
                    }}
                    customTheme={{
                        "--ck-font-family": "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Consolas', monospace",
                        "--ck-accent-color": "#22d3ee",
                        "--ck-accent-text-color": "#0a0a0a",
                        "--ck-border-radius": 8,
                        "--ck-overlay-background": "rgba(0, 0, 0, 0.85)",
                        "--ck-body-background": "#0a0a12",
                        "--ck-body-color": "#e4e4e7",
                        "--ck-primary-button-background": "#22d3ee",
                        "--ck-primary-button-color": "#0a0a0a",
                        "--ck-secondary-button-background": "rgba(255, 255, 255, 0.05)",
                        "--ck-secondary-button-color": "#e4e4e7",
                        "--ck-secondary-button-border-radius": 8,
                    }}
                >
                    {children}
                </ConnectKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}




"use client";

/**
 * Connect Wallet Button Component
 * 
 * @description Header button for wallet connection
 * @see Task-36c: 添加 Header 连接按钮
 */

import { ConnectKitButton } from 'connectkit';

export default function ConnectWallet() {
    return (
        <ConnectKitButton.Custom>
            {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => {
                return (
                    <button
                        onClick={show}
                        className="
              group relative overflow-hidden
              px-4 py-2 rounded-lg
              border border-signal/30 hover:border-signal/60
              bg-void-light/50 backdrop-blur-sm
              transition-all duration-300 ease-out
              hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]
            "
                    >
                        {/* Gradient background on hover */}
                        <div className="
              absolute inset-0 opacity-0 group-hover:opacity-100
              bg-gradient-to-r from-signal/5 to-transparent
              transition-opacity duration-300
            " />

                        {/* Button content */}
                        <span className="
              relative z-10
              font-mono text-sm tracking-wider
              text-zinc-400 group-hover:text-zinc-200
              transition-colors duration-300
            ">
                            {isConnecting ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
                                    Connecting...
                                </span>
                            ) : isConnected ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-400" />
                                    {ensName ?? truncatedAddress}
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                        />
                                    </svg>
                                    Connect
                                </span>
                            )}
                        </span>
                    </button>
                );
            }}
        </ConnectKitButton.Custom>
    );
}

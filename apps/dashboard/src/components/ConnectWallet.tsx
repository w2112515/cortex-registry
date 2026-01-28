"use client";

/**
 * Connect Wallet Button Component
 * 
 * @description Header button for wallet connection
 * @see Task-36c: 添加 Header 连接按钮
 */

import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { Star } from 'lucide-react';
import type { ServiceNode } from './NetworkGraph';

interface ConnectWalletProps {
    services?: ServiceNode[];
    onSelect?: (node: ServiceNode) => void;
}

export default function ConnectWallet({ services = [], onSelect }: ConnectWalletProps) {
    const { address } = useAccount();

    // Find if current user has a registered service
    const myService = address ? services.find(s => s.provider.toLowerCase() === address.toLowerCase()) : null;

    return (
        <div className="flex items-center gap-3">
            {/* My Node Shortcut */}
            {myService && onSelect && (
                <button
                    onClick={() => onSelect(myService)}
                    className="
                        hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg
                        bg-stellar-gold/10 border border-stellar-gold/30
                        text-stellar-gold hover:bg-stellar-gold/20
                        transition-colors duration-300 font-mono text-xs
                    "
                >
                    <Star className="w-3 h-3 fill-stellar-gold" />
                    My Node
                </button>
            )}

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
        </div>
    );
}

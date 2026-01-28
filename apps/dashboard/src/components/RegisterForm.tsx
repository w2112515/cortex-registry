"use client";

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther } from 'viem';
import TerminalLog from './TerminalLog';
import SlashingRiskModal from './SlashingRiskModal';

// CortexRegistry Contract Info (Task-O00 Compliance)
const REGISTRY_ADDRESS = '0xfe5f7b0ae5018eb2853c31fc28c4c9a339052587';
const REGISTRY_ABI = [
    {
        "type": "function",
        "name": "registerService",
        "inputs": [{ "name": "metadataUri", "type": "string", "internalType": "string" }],
        "outputs": [{ "name": "serviceId", "type": "bytes32", "internalType": "bytes32" }],
        "stateMutability": "payable"
    }
] as const;

export default function RegisterForm() {
    const { isConnected } = useAccount();
    const [metadata, setMetadata] = useState(JSON.stringify({
        name: "My Agent Service",
        description: "Powered by Cortex Network",
        endpoint: "https://myservice.com/mcp",
        version: "1.0.0",
        capabilities: {
            tools: true
        }
    }, null, 2));
    const [metadataUri, setMetadataUri] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<{ valid: boolean, error?: string } | null>(null);
    const [showRiskModal, setShowRiskModal] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const { data: hash, error: writeError, isPending, writeContract } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

    // Validate metadata against Gateway whenever it changes
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!metadata) return;
            try {
                const parsed = JSON.parse(metadata);
                setIsValidating(true);
                const response = await fetch('http://localhost:3001/v1/register/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsed)
                });
                const result = await response.json();
                if (response.ok) {
                    setValidationResult({ valid: true });
                } else {
                    setValidationResult({ valid: false, error: result.details?.[0]?.message || result.message });
                }
            } catch (e) {
                setValidationResult({ valid: false, error: "Invalid JSON format" });
            } finally {
                setIsValidating(false);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [metadata]);

    // Terminal Log Effects
    useEffect(() => {
        if (isPending) {
            setLogs(prev => [...prev, "> Requesting wallet signature..."]);
        }
    }, [isPending]);

    useEffect(() => {
        if (isConfirming) {
            setLogs(prev => [...prev, `> Transaction broadcasted. Hash: ${hash?.slice(0, 10)}...`, "> Waiting for block confirmation (1/3)..."]);
        }
    }, [isConfirming, hash]);

    useEffect(() => {
        if (isConfirmed) {
            setLogs(prev => [...prev, "> Block confirmed successfully.", "> \u2713 SERVICE REGISTRATION COMPLETE."]);
        }
    }, [isConfirmed]);

    const handleRegister = async () => {
        if (!isConnected) return alert("Please connect wallet first");
        if (!validationResult?.valid) return alert("Metadata is invalid");
        if (!metadataUri) return alert("Please provide a metadata URI (e.g. your endpoint or IPFS)");

        setLogs(["> Initializing Cortex Registration Protocol v1.0..."]);
        setTimeout(() => {
            setLogs(prev => [...prev, "> Verifying metadata integrity... [OK]"]);
            setShowRiskModal(true);
        }, 600);
    };

    const handleConfirmRegistration = () => {
        setShowRiskModal(false);
        setLogs(prev => [...prev, "> SLASHING RISKS ACKNOWLEDGED.", "> Initiating on-chain transaction..."]);

        writeContract({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: 'registerService',
            args: [metadataUri],
            value: parseEther('100'), // MIN_STAKE is 100 CRO
        });
    };

    return (
        <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-void-light/30 backdrop-blur-xl border border-signal/20 shadow-2xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-signal/10 rounded-full blur-[100px]" />

            <SlashingRiskModal
                isOpen={showRiskModal}
                onConfirm={handleConfirmRegistration}
                onCancel={() => {
                    setShowRiskModal(false);
                    setLogs(prev => [...prev, "> Registration cancelled by user."]);
                }}
            />

            <h2 className="text-3xl font-bold bg-gradient-to-r from-signal to-zinc-200 bg-clip-text text-transparent mb-6 tracking-tighter">
                Register MCP Service
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                {/* Left: Metadata Editor */}
                <div className="space-y-4">
                    <label className="block text-sm font-mono text-signal/80 uppercase tracking-widest">
                        Service Metadata (JSON)
                    </label>
                    <div className="relative group">
                        <textarea
                            value={metadata}
                            onChange={(e) => setMetadata(e.target.value)}
                            className="w-full h-80 bg-black/40 border border-signal/20 rounded-xl p-4 font-mono text-sm text-zinc-300 focus:border-signal/50 focus:ring-1 focus:ring-signal/50 transition-all outline-none resize-none"
                            placeholder='{ "name": "..." }'
                        />
                        {isValidating && (
                            <div className="absolute top-4 right-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-signal animate-ping rounded-full" />
                                <span className="text-xs text-signal font-mono">Validating...</span>
                            </div>
                        )}
                    </div>

                    {validationResult && (
                        <div className={`p-3 rounded-lg border font-mono text-xs ${validationResult.valid ? 'bg-green-400/5 border-green-400/20 text-green-400' : 'bg-red-400/5 border-red-400/20 text-red-400'
                            }`}>
                            {validationResult.valid ? "✓ Gateway validation passed" : `✗ Validation failed: ${validationResult.error}`}
                        </div>
                    )}
                </div>

                {/* Right: Registration Settings */}
                <div className="space-y-8">
                    <div className="space-y-4">
                        <label className="block text-sm font-mono text-signal/80 uppercase tracking-widest">
                            Metadata URI
                        </label>
                        <input
                            type="text"
                            value={metadataUri}
                            onChange={(e) => setMetadataUri(e.target.value)}
                            placeholder="ipfs://... or https://..."
                            className="w-full bg-black/40 border border-signal/20 rounded-xl px-4 py-3 font-mono text-sm text-zinc-300 focus:border-signal/50 focus:ring-1 focus:ring-signal/50 transition-all outline-none"
                        />
                        <p className="text-[10px] text-zinc-500 font-mono italic px-2">
                            This URI will be stored on-chain. Ensure the content matches the JSON on the left.
                        </p>
                    </div>

                    <div className="p-6 rounded-xl border border-zinc-800 bg-black/20 space-y-4">
                        <div className="flex justify-between items-center text-sm font-mono">
                            <span className="text-zinc-400">Required Stake</span>
                            <span className="text-signal">100 CRO</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-mono border-t border-zinc-800 pt-4 mt-4">
                            <span className="text-zinc-400">Cooldown Period</span>
                            <span className="text-zinc-500 italic">1 Hour</span>
                        </div>
                    </div>

                    <button
                        onClick={handleRegister}
                        disabled={!validationResult?.valid || isPending || isConfirming || !metadataUri}
                        className={`w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group
                            ${validationResult?.valid && metadataUri
                                ? 'bg-signal text-void shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:scale-[1.02]'
                                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'}
                        `}
                    >
                        <span className="relative z-10">
                            {isPending ? "Confirming in Wallet..." :
                                isConfirming ? "Broadcasting..." :
                                    isConfirmed ? "Success!" : "Staking & Register"}
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    </button>

                    {writeError && (
                        <p className="text-red-400 text-[10px] font-mono mt-2 break-words">
                            Error: {writeError.message}
                        </p>
                    )}

                    {logs.length > 0 && (
                        <div className="mt-6">
                            <TerminalLog logs={logs} />
                        </div>
                    )}

                    {isConfirmed && (
                        <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-center font-mono text-xs">
                            Transaction Confirmed! Your service is pending activation.
                            <br />
                            <a
                                href={`https://explorer.cronos.org/testnet/tx/${hash}`}
                                target="_blank"
                                className="underline mt-2 inline-block opacity-70 hover:opacity-100"
                            >
                                View on Explorer
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

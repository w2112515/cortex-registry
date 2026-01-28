import { useState } from 'react';

interface SlashingRiskModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function SlashingRiskModal({ isOpen, onConfirm, onCancel }: SlashingRiskModalProps) {
    const [accepted, setAccepted] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-zinc-950 border border-red-500/50 rounded-xl shadow-[0_0_50px_rgba(239,68,68,0.2)] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]" />
                    <h3 className="text-red-500 font-bold font-mono tracking-widest text-sm">
                        SLASHING RISK ACKNOWLEDGMENT
                    </h3>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <div className="text-zinc-300 text-sm font-mono space-y-4">
                        <p className="border-l-2 border-red-500/50 pl-4 py-1">
                            If your service is found to be malicious (e.g., providing fake MCP results), the following penalties will apply:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-red-400/90 bg-red-950/20 p-4 rounded-lg border border-red-900/50">
                            <li>100 CRO Stake will be <span className="font-bold text-red-500">PERMANENTLY BURNED</span></li>
                            <li>Reputation Score resets to 0</li>
                            <li>Service marked as "SLASHED" on-chain</li>
                        </ul>
                        <p className="text-xs text-zinc-500 italic">
                            This action is irreversible and executed by the decentralized arbitration protocol.
                        </p>
                    </div>

                    {/* Checkbox */}
                    <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500/50"
                        />
                        <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors">
                            I understand and accept the slashing conditions.
                        </span>
                    </label>

                    {/* Actions */}
                    <div className="flex gap-4 pt-2">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-3 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={!accepted}
                            className={`flex-1 py-3 text-xs font-bold font-mono uppercase tracking-widest rounded-lg transition-all shadow-lg
                    ${accepted
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'
                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}
                `}
                        >
                            I Accept Risks
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

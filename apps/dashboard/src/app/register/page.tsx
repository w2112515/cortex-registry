"use client";

import Sidebar from '@/components/Sidebar';
import RegisterForm from '@/components/RegisterForm';

export default function RegisterPage() {
    return (
        <main className="flex min-h-screen bg-void text-zinc-100">
            <Sidebar
                services={[]}
                onSearch={() => { }}
                onFilter={() => { }}
                onSort={() => { }}
                onSelect={() => { }}
            />

            <div className="flex-1 ml-[280px] p-8 lg:p-12 overflow-y-auto">
                <header className="mb-12 flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-bold tracking-tighter bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
                            Staking Terminal
                        </h1>
                        <p className="mt-2 text-zinc-500 font-mono text-sm">
                            Publish your MCP service to the decentralized network
                        </p>
                    </div>
                </header>

                <section className="mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <RegisterForm />
                </section>

                <footer className="mt-20 border-t border-zinc-900 pt-8 text-zinc-600 font-mono text-[10px] text-center uppercase tracking-[0.3em]">
                    Cortex Network Protocol v1.0.0 // Economic Security via Proof of Stake
                </footer>
            </div>
        </main>
    );
}

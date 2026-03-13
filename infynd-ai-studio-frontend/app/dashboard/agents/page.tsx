"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, Briefcase } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Agent {
    id: string;
    name: string;
    description: string;
    is_published: boolean;
}

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        setIsLoading(true);
        try {
            const data = await apiFetch("/agents");
            setAgents(data);
        } catch (error) {
            console.error("Failed to fetch agents", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-10 flex shrink-0 flex-col justify-between gap-6 md:flex-row md:items-end">
                <div className="space-y-1">
                    <h1 className="text-4xl font-bold tracking-tight text-gradient">Agents</h1>
                    <p className="text-muted-foreground text-base">
                        Deploy specialized AI agents for your outreach automation.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" className="rounded-xl border-border/50 hover:bg-accent/50 text-foreground transition-all">
                        Executions
                    </Button>
                    <Link href="/dashboard/agents/create">
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20 px-6 h-11 transition-all active:scale-95">
                            <Plus className="mr-2 h-5 w-5 stroke-[3]" /> Create Agent
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-10 flex shrink-0 gap-8 overflow-x-auto border-b border-border/50 no-scrollbar">
                {[
                    { name: "All", count: agents.length, active: true },
                    { name: "Personal", count: 0, active: false },
                    { name: "Shared", count: 0, active: false },
                    { name: "Archived", count: 0, active: false },
                ].map((tab) => (
                    <button 
                        key={tab.name}
                        className={`pb-4 text-[15px] font-medium transition-all relative whitespace-nowrap ${
                            tab.active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {tab.name}
                        {tab.count > 0 && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-[11px] font-bold">
                                {tab.count}
                            </span>
                        )}
                        {tab.active && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" />
                        )}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {[1, 2, 3, 4].map((n) => (
                            <div key={n} className="h-48 rounded-3xl border border-border/50 bg-card/40 shadow-sm animate-pulse" />
                        ))}
                    </div>
                ) : agents.length === 0 ? (
                    <div className="flex min-h-full items-center justify-center rounded-[3rem] border-2 border-dashed border-border/40 bg-card/20 p-12 group">
                        <div className="text-center transition-transform duration-500 group-hover:scale-105">
                             <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-accent/30">
                                 <Briefcase className="h-10 w-10 text-muted-foreground/60" />
                             </div>
                             <h3 className="mb-2 text-xl font-bold text-foreground">No Agents Found</h3>
                             <p className="mx-auto mb-8 max-w-xs text-muted-foreground">Start by creating your first specialized agent</p>
                             <Link href="/dashboard/agents/create">
                                <Button variant="outline" className="rounded-xl border-primary/30 text-primary hover:bg-primary/10 transition-all">
                                    Get Started
                                </Button>
                             </Link>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 pb-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {agents.map((agent) => (
                            <div key={agent.id} className="group glass relative flex h-full flex-col overflow-hidden rounded-3xl p-6 shadow-soft transition-all duration-300 hover:border-primary/20 hover:shadow-primary/5">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[4rem] group-hover:bg-primary/10 transition-colors -mr-6 -mt-6"></div>
                                
                                <div className="flex justify-between items-start mb-6 relative">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 group-hover:scale-110 transition-transform">
                                        <Briefcase className="w-6 h-6 text-primary" />
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-accent/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                                    </Button>
                                </div>
                                
                                <Link href={`/dashboard/agents/${agent.id}`} className="relative block">
                                    <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors truncate">
                                        {agent.name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-6">
                                        {agent.description || "Orchestrating automated workflows with unparalleled efficiency."}
                                    </p>
                                </Link>
                                
                                <div className="mt-auto flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${agent.is_published ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]"}`}></div>
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                            {agent.is_published ? "Active" : "Draft"}
                                        </span>
                                    </div>
                                    <div className="text-[11px] font-medium text-muted-foreground/60">
                                        Updated 2h ago
                                    </div>
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <Link href={`/dashboard/agents/${agent.id}`} className="flex-1">
                                        <Button variant="outline" className="h-9 w-full rounded-xl border-border/60 bg-background/70 text-foreground hover:bg-accent">
                                            Open Agent
                                        </Button>
                                    </Link>
                                    <Link href={`/dashboard/agent-flow-builder/${agent.id}`} className="flex-1">
                                        <Button className="h-9 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                                            Open In Builder
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

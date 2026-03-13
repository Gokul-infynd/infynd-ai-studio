"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkflowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const workflowId = resolvedParams.id;
    const [isLoaded, setIsLoaded] = useState(false);

    // Provide the proxy path to the Langflow UI
    // In our Next.js rewrites, we can proxy /lf-proxy to the actual Langflow app, OR
    // If we build Langflow and place it inside public/lf, we can use /lf/index.html
    const lfUrl = "/lf/";

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] -m-4 sm:-m-6 lg:-m-8 bg-background relative transition-colors duration-300">
            <div className="shrink-0 h-14 border-b border-border px-4 flex items-center justify-between bg-card">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/workflows">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent text-muted-foreground">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <span className="text-foreground font-medium text-sm">
                            Native Langflow Ecosystem
                        </span>
                        <div className="text-[10px] text-green-500/70 border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 rounded ml-3 inline-block">
                            Connected to Infynd Backend
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                {!isLoaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 transition-opacity">
                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
                        <span className="text-sm text-muted-foreground">Loading Langflow Runtime...</span>
                    </div>
                )}

                {/* 
                  The iframe perfectly embeds the REAL Langflow UI running on our platform.
                  It bridges via the Next JS Proxy to ensure same-origin behavior when needed.
                */}
                <iframe
                    src={lfUrl}
                    className="w-full h-full border-0 absolute inset-0 bg-transparent"
                    title="Visual Builder"
                    onLoad={() => setIsLoaded(true)}
                />
            </div>
        </div>
    );
}

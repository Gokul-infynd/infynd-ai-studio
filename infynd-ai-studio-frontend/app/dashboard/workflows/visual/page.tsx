"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function VisualWorkflowBuilderPage() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prepareLangflowAuth = async () => {
      try {
        await apiFetch("/auth/langflow-token");
        setIsAuthReady(true);
      } catch (err) {
        console.error("Langflow auth failed:", err);
        setError("Failed to authenticate with workflow builder.");
      }
    };

    prepareLangflowAuth();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive bg-destructive/5 p-6 rounded-xl border border-destructive/20 font-medium">
        {error}
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="animate-spin w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full shadow-sm" />
        <p className="text-muted-foreground animate-pulse text-sm font-medium">Preparing visual builder...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-4 sm:-m-6 lg:-m-8">
      <div className="flex-1 w-full bg-background">
        <iframe
          src="/lf/"
          className="w-full h-full border-0"
          title="Workflow Builder"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}

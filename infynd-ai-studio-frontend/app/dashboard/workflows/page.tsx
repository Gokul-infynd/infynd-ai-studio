"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Boxes, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Workspace = { id: string; name: string };
type WorkflowItem = {
  id: string;
  name: string;
  description?: string;
  flow_data?: { builder_kind?: string };
};

export default function WorkflowsPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch("/workspaces")
      .then((data: Workspace[]) => {
        const firstWorkspaceId = data?.[0]?.id || "";
        setWorkspaceId(firstWorkspaceId);
        if (!firstWorkspaceId) {
          setIsLoading(false);
          return;
        }
        return apiFetch(`/workflows?workspace_id=${firstWorkspaceId}`).then((items: WorkflowItem[]) => {
          setWorkflows((items || []).filter((workflow) => workflow.flow_data?.builder_kind !== "crew-studio"));
          setIsLoading(false);
        });
      })
      .catch(() => setIsLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-base text-muted-foreground">
          Build visual automations in Langflow or open Agent Flow Builder to chat-build real manager and worker agents.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[32px] border border-border/60 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.16),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-7 shadow-soft dark:bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.18),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.94))]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-orange-600 shadow-sm dark:bg-slate-950/70 dark:text-orange-300">
            <Bot className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold">Agent Flow Builder</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Chat with the builder to create or refine real saved agents using the same manual JSON schema, then edit and test them live.
          </p>
          <Link href="/dashboard/agent-flow-builder" className="mt-6 inline-flex">
            <Button className="rounded-2xl">
              Open Agent Flow Builder <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="rounded-[32px] border border-border/60 bg-card/80 p-7 shadow-soft">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Workflow className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold">Visual Builder</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Open the native Langflow canvas when you want direct low-level graph editing and the broader visual automation runtime.
          </p>
          <Link href="/dashboard/workflows/visual" className="mt-6 inline-flex">
            <Button variant="outline" className="rounded-2xl">
              Open Visual Builder <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-border/60 bg-card/80 p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-foreground">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Recent Workflow Drafts</h3>
            <p className="text-sm text-muted-foreground">
              {workspaceId ? "Open existing visual workflows." : "Create a workspace to start saving workflows."}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-3xl border border-border/60 bg-accent/30" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-8 text-sm text-muted-foreground">
            No saved workflows yet. Use Visual Builder to create your first workflow.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {workflows.map((workflow) => {
              const href = `/dashboard/workflows/${workflow.id}`;

              return (
                <Link key={workflow.id} href={href} className="rounded-3xl border border-border bg-background p-5 transition hover:border-primary/30 hover:shadow-sm">
                  <div className="text-lg font-semibold">{workflow.name}</div>
                  <div className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {workflow.description || "Saved workflow draft"}
                  </div>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Visual Workflow
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

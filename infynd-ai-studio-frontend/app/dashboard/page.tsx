"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, CalendarClock, CheckCircle2, Clock3, Loader2, PauseCircle, PlayCircle, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface ScheduleTask {
  id: string;
  agent_id: string;
  agent_name?: string | null;
  name: string;
  prompt: string;
  frequency: string;
  timezone: string;
  cron_expression?: string | null;
  is_active: boolean;
  last_run_at?: string | null;
  last_status?: string | null;
  last_response?: Record<string, unknown> | null;
}

interface ScheduleRun {
  id: string;
  schedule_id: string;
  schedule_name?: string | null;
  agent_id: string;
  agent_name?: string | null;
  status: string;
  response_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
}

interface ScheduleOverview {
  stats: {
    total_schedules: number;
    active_schedules: number;
    paused_schedules: number;
    running_schedules: number;
    success_runs_24h: number;
    failed_runs_24h: number;
  };
  tasks: ScheduleTask[];
  recent_runs: ScheduleRun[];
}

const EMPTY_OVERVIEW: ScheduleOverview = {
  stats: {
    total_schedules: 0,
    active_schedules: 0,
    paused_schedules: 0,
    running_schedules: 0,
    success_runs_24h: 0,
    failed_runs_24h: 0,
  },
  tasks: [],
  recent_runs: [],
};

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs || durationMs < 1000) return durationMs ? `${durationMs} ms` : "n/a";
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function getResponsePreview(run: ScheduleRun) {
  const payload = run.response_payload || {};
  const reply = payload.reply;
  if (typeof reply === "string" && reply.trim()) return reply;
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return run.error_message || "No stored response";
}

function describeTask(task: ScheduleTask) {
  const frequency = task.frequency.charAt(0).toUpperCase() + task.frequency.slice(1);
  return `${frequency} • ${task.timezone || "Asia/Kolkata"}`;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<ScheduleOverview>(EMPTY_OVERVIEW);
  const [isLoading, setIsLoading] = useState(true);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = (await apiFetch("/agents/scheduled/overview")) as ScheduleOverview;
      setOverview(data || EMPTY_OVERVIEW);
    } catch (error) {
      toast.error("Failed to load dashboard", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setOverview(EMPTY_OVERVIEW);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview().catch(() => undefined);
  }, [loadOverview]);

  const toggleTask = async (task: ScheduleTask) => {
    setActiveActionId(task.id);
    try {
      await apiFetch(`/agents/scheduled/tasks/${task.id}/toggle?is_active=${String(!task.is_active)}`, {
        method: "POST",
      });
      await loadOverview();
      toast.success(task.is_active ? "Schedule paused" : "Schedule resumed");
    } catch (error) {
      toast.error("Failed to update schedule", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setActiveActionId(null);
    }
  };

  const deleteTask = async (task: ScheduleTask) => {
    setActiveActionId(task.id);
    try {
      await apiFetch(`/agents/scheduled/tasks/${task.id}`, { method: "DELETE" });
      await loadOverview();
      toast.success("Schedule deleted");
    } catch (error) {
      toast.error("Failed to delete schedule", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor scheduled agent runs, recent responses, and execution health from one place.
          </p>
        </div>
        <Button onClick={() => loadOverview()} variant="outline" className="border-border bg-background">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Schedules",
            value: overview.stats.total_schedules,
            hint: `${overview.stats.active_schedules} active`,
            icon: CalendarClock,
            tone: "text-blue-500",
          },
          {
            label: "Running Now",
            value: overview.stats.running_schedules,
            hint: `${overview.stats.paused_schedules} paused`,
            icon: Clock3,
            tone: "text-amber-500",
          },
          {
            label: "Success In 24h",
            value: overview.stats.success_runs_24h,
            hint: "Completed without errors",
            icon: CheckCircle2,
            tone: "text-emerald-500",
          },
          {
            label: "Failed In 24h",
            value: overview.stats.failed_runs_24h,
            hint: "Needs review",
            icon: XCircle,
            tone: "text-rose-500",
          },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{card.label}</div>
                <div className="mt-3 text-3xl font-bold text-foreground">{card.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{card.hint}</div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-3">
                <card.icon className={`h-5 w-5 ${card.tone}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card/70 shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scheduled Tasks</h2>
              <p className="mt-1 text-sm text-muted-foreground">All of your scheduled agent executions and their latest status.</p>
            </div>
            <Link href="/dashboard/agent-flow-builder">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Open Builder</Button>
            </Link>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="animate-pulse rounded-2xl border border-border bg-background p-4">
                    <div className="h-4 w-40 rounded bg-accent" />
                    <div className="mt-3 h-3 w-full rounded bg-accent" />
                    <div className="mt-2 h-3 w-3/4 rounded bg-accent" />
                  </div>
                ))}
              </div>
            ) : overview.tasks.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-background/50 px-6 text-center">
                <CalendarClock className="h-10 w-10 text-primary" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">No scheduled agent tasks yet</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Enable Scheduler on any agent or builder flow, pick a prompt and timing, and the task will appear here with status and run history.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.tasks.map((task) => {
                  const pending = activeActionId === task.id;
                  return (
                    <div key={task.id} className="rounded-3xl border border-border bg-background/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-foreground">{task.name}</h3>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${task.is_active ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                              {task.is_active ? "Active" : "Paused"}
                            </span>
                            {task.last_status ? (
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${task.last_status === "success" ? "bg-emerald-500/10 text-emerald-500" : task.last_status === "failed" ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"}`}>
                                {task.last_status}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {task.agent_name || "Unnamed Agent"} • {describeTask(task)}
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm text-foreground">{task.prompt}</p>
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>Timezone: {task.timezone || "Asia/Kolkata"}</span>
                            <span>Last Run: {formatTimestamp(task.last_run_at)}</span>
                            {task.cron_expression ? <span>Cron: {task.cron_expression}</span> : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link href={`/dashboard/agents/${task.agent_id}`}>
                            <Button variant="outline" className="border-border bg-background">Open Agent</Button>
                          </Link>
                          <Button
                            variant="outline"
                            className="border-border bg-background"
                            onClick={() => toggleTask(task)}
                            disabled={pending}
                          >
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : task.is_active ? <PauseCircle className="mr-2 h-4 w-4" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                            {task.is_active ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="outline"
                            className="border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10"
                            onClick={() => deleteTask(task)}
                            disabled={pending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card/70 shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent Scheduled Runs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Stored responses and errors from agent tasks executed by the scheduler.</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="animate-pulse rounded-2xl border border-border bg-background p-4">
                    <div className="h-4 w-32 rounded bg-accent" />
                    <div className="mt-3 h-3 w-full rounded bg-accent" />
                    <div className="mt-2 h-3 w-2/3 rounded bg-accent" />
                  </div>
                ))}
              </div>
            ) : overview.recent_runs.length === 0 ? (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-background/50 px-6 text-center">
                <Activity className="h-10 w-10 text-primary" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">No run history yet</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Once your scheduled agents run, their status and saved responses will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.recent_runs.map((run) => (
                  <div key={run.id} className="rounded-3xl border border-border bg-background/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-foreground">{run.schedule_name || "Scheduled Run"}</div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${run.status === "success" ? "bg-emerald-500/10 text-emerald-500" : run.status === "failed" ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"}`}>
                            {run.status}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{run.agent_name || "Unnamed Agent"}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{formatTimestamp(run.started_at)}</div>
                        <div className="mt-1">Duration: {formatDuration(run.duration_ms)}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-border bg-card/70 p-3 text-sm text-foreground">
                      {getResponsePreview(run)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

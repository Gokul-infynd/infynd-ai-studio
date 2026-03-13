"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Bot, GitBranch, Wrench, Workflow } from "lucide-react";

type AgentFlowNodeData = {
  kind: "root" | "worker" | "tool";
  title: string;
  subtitle?: string;
  toolCount?: number;
  selected?: boolean;
};

function AgentFlowNode({ data }: { data: AgentFlowNodeData }) {
  const isTool = data.kind === "tool";

  return (
    <div
      className={`border bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:bg-slate-950/90 ${
        isTool
          ? "min-w-[210px] rounded-[24px] px-4 py-3"
          : "min-w-[260px] rounded-[28px] p-4"
      } ${
        data.selected ? "border-primary ring-2 ring-primary/15" : "border-slate-200/80 dark:border-white/10"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-slate-400 dark:!border-slate-950" />
      <div className="flex items-start gap-3">
        <div
          className={`flex items-center justify-center text-slate-700 dark:text-slate-100 ${
            isTool
              ? "h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 via-orange-50 to-white dark:from-amber-500/20 dark:via-orange-500/10 dark:to-slate-950"
              : "h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-100 via-rose-50 to-white dark:from-orange-500/20 dark:via-rose-500/10 dark:to-slate-950"
          }`}
        >
          {data.kind === "root" ? <GitBranch className="h-5 w-5" /> : null}
          {data.kind === "worker" ? <Bot className="h-5 w-5" /> : null}
          {data.kind === "tool" ? <Workflow className="h-4 w-4" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold text-slate-900 dark:text-slate-100 ${isTool ? "text-sm" : "text-base"}`}>{data.title}</div>
          {data.subtitle ? <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{data.subtitle}</div> : null}
        </div>
      </div>
      {!isTool ? (
        <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <Wrench className="h-3.5 w-3.5" /> {data.toolCount || 0} tools
        </div>
      ) : (
        <div className="mt-3 inline-flex items-center rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          Tool Node
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-slate-400 dark:!border-slate-950" />
    </div>
  );
}

export default memo(AgentFlowNode);

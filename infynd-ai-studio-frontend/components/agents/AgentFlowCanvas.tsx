"use client";

import { useMemo } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import AgentFlowNode from "@/components/agents/AgentFlowNode";
import type { BuilderGraph } from "@/components/agents/types";

const nodeTypes = { agentFlow: AgentFlowNode };

interface AgentFlowCanvasProps {
  graph: BuilderGraph;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
}

export function AgentFlowCanvas({ graph, selectedAgentId, onSelectAgent }: AgentFlowCanvasProps) {
  const flow = useMemo(() => {
    const nodes: Node[] = graph.nodes.map((node) => ({
      id: node.id,
      type: "agentFlow",
      position: node.position,
      data: {
        kind: node.kind,
        title: node.label,
        subtitle: node.subtitle || node.role,
        toolCount: node.tool_count,
        selected: node.kind !== "tool" && selectedAgentId === node.id,
      },
    }));

    const edges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label || undefined,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      style:
        edge.kind === "tool-link"
          ? { stroke: "#f59e0b", strokeWidth: 1.25, strokeDasharray: "6 5" }
          : { stroke: "#64748b", strokeWidth: 1.35 },
    }));

    return { nodes, edges };
  }, [graph, selectedAgentId]);

  return (
    <div className="flex h-full min-h-[320px] w-full flex-1 rounded-[28px] border border-border bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.12),transparent_28%)] shadow-soft">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, node) => {
          if ((node.data as { kind?: string } | undefined)?.kind === "tool") return;
          onSelectAgent(node.id);
        }}
        proOptions={{ hideAttribution: true }}
        className="rounded-[28px]"
      >
        <Background gap={20} color="rgba(148,163,184,0.18)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}

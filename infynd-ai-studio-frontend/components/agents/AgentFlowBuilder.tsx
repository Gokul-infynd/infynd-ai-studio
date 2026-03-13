"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Play, Sparkles, Wand2, Workflow } from "lucide-react";
import { toast } from "sonner";

import { AgentApiAccessDialog } from "@/components/agents/AgentApiAccessDialog";
import { AgentBuildChatPanel } from "@/components/agents/AgentBuildChatPanel";
import { AgentEditorPane } from "@/components/agents/AgentEditorPane";
import { AgentFlowCanvas } from "@/components/agents/AgentFlowCanvas";
import { AgentTestChatPanel } from "@/components/agents/AgentTestChatPanel";
import { normalizeAgentRuntimeModelValue } from "@/components/agents/modelCatalog";
import { buildSchedulerConfigPayload, normalizeKbType, normalizeSchedulerConfigs, toEditableText } from "@/components/agents/types";
import type {
  AgentRecord,
  AgentScheduleConfig,
  BuilderChatResponse,
  BuilderGraph,
  BuilderGraphEdge,
  BuilderGraphNode,
  BuilderMessage,
  CoreFeatures,
  McpIntegrationRecord,
  McpToolConfig,
  RuntimeMessage,
  WorkerAgentLink,
  Workspace,
} from "@/components/agents/types";
import { Button } from "@/components/ui/button";
import { apiFetch, buildApiUrl, getAuthenticatedHeaders } from "@/lib/api";

function emptyFeatures(): CoreFeatures {
  return { knowledge_base: false, data_query: false, scheduler: false, webhook_trigger: false, memory: false };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function replaceUrlWithoutReload(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;
  window.history.replaceState(window.history.state, "", path);
}

function humanizeToolName(toolName: string): string {
  const normalized = toolName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function slugifyToolName(toolName: string): string {
  return (
    toolName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tool"
  );
}

function flattenAgentTools(
  agent: AgentRecord,
  integrationNamesById: Record<string, string>,
): Array<{ id: string; label: string; subtitle: string }> {
  return ((agent.flow_data?.mcp_tools || []) as McpToolConfig[]).flatMap((config, sourceIndex) =>
    (config.tools || []).map((toolName, toolIndex) => ({
      id: `${agent.id}:tool:${sourceIndex}:${toolIndex}:${slugifyToolName(toolName)}`,
      label: humanizeToolName(toolName),
      subtitle: integrationNamesById[config.mcp_id] || "Connected Tool Source",
    })),
  );
}

function buildToolNodesForAgent(
  agent: AgentRecord,
  agentX: number,
  agentY: number,
  integrationNamesById: Record<string, string>,
): { nodes: BuilderGraphNode[]; edges: BuilderGraphEdge[]; toolCount: number } {
  const toolEntries = flattenAgentTools(agent, integrationNamesById);
  if (!toolEntries.length) return { nodes: [], edges: [], toolCount: 0 };

  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(toolEntries.length))));
  const horizontalGap = 220;
  const verticalGap = 118;
  const startX = agentX - ((columns - 1) * horizontalGap) / 2;
  const rowCount = Math.ceil(toolEntries.length / columns);
  const startY = agentY - 210 - (rowCount - 1) * verticalGap;

  const nodes = toolEntries.map((tool, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      id: tool.id,
      kind: "tool" as const,
      label: tool.label,
      subtitle: tool.subtitle,
      parent_agent_id: agent.id,
      position: {
        x: startX + column * horizontalGap,
        y: startY + row * verticalGap,
      },
    };
  });

  const edges = toolEntries.map((tool) => ({
    id: `${tool.id}->${agent.id}`,
    source: tool.id,
    target: agent.id,
    kind: "tool-link" as const,
  }));

  return { nodes, edges, toolCount: toolEntries.length };
}

function buildGraphFromAgents(
  rootAgent: AgentRecord | null,
  subAgents: AgentRecord[],
  integrationNamesById: Record<string, string>,
): BuilderGraph {
  if (!rootAgent) return { nodes: [], edges: [] };

  const workerLinks = (rootAgent.flow_data?.worker_agents || []) as WorkerAgentLink[];
  const subMap = new Map(subAgents.map((agent) => [agent.id, agent]));
  const orderedWorkers = workerLinks
    .map((link) => subMap.get(link.agent_id))
    .filter((agent): agent is AgentRecord => Boolean(agent));

  const nodes: BuilderGraphNode[] = [];
  const edges: BuilderGraphEdge[] = [];
  const workerSpacing = 420;
  const workerY = 660;
  const workerStartX = orderedWorkers.length > 1 ? -((orderedWorkers.length - 1) * workerSpacing) / 2 : 0;

  const rootToolData = buildToolNodesForAgent(rootAgent, 0, 240, integrationNamesById);
  nodes.push({
    id: rootAgent.id,
    kind: "root",
    label: rootAgent.name,
    subtitle: rootAgent.flow_data?.role || rootAgent.description || "Root agent",
    role: rootAgent.flow_data?.role,
    tool_count: rootToolData.toolCount,
    position: { x: 0, y: 240 },
  });
  nodes.push(...rootToolData.nodes);
  edges.push(...rootToolData.edges);

  orderedWorkers.forEach((agent, index) => {
    const agentX = orderedWorkers.length === 1 ? 0 : workerStartX + index * workerSpacing;
    const workerToolData = buildToolNodesForAgent(agent, agentX, workerY, integrationNamesById);

    nodes.push({
      id: agent.id,
      kind: "worker",
      label: agent.name,
      subtitle: agent.flow_data?.role || agent.description || "Worker agent",
      role: agent.flow_data?.role,
      tool_count: workerToolData.toolCount,
      position: { x: agentX, y: workerY },
    });
    nodes.push(...workerToolData.nodes);
    edges.push(...workerToolData.edges);
    edges.push({
      id: `${rootAgent.id}-${agent.id}`,
      source: rootAgent.id,
      target: agent.id,
      label: workerLinks.find((link) => link.agent_id === agent.id)?.description || null,
      kind: "agent-link",
    });
  });

  return { nodes, edges };
}

export default function AgentFlowBuilder({ rootAgentId }: { rootAgentId?: string }) {
  const [viewMode, setViewMode] = useState<"build" | "run">("build");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(rootAgentId));
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [rootAgent, setRootAgent] = useState<AgentRecord | null>(null);
  const [subAgents, setSubAgents] = useState<AgentRecord[]>([]);
  const [toolSources, setToolSources] = useState<McpIntegrationRecord[]>([]);
  const [builderHistory, setBuilderHistory] = useState<BuilderMessage[]>([
    { role: "assistant", content: "Describe the agent or multi-agent flow you want. I will create and edit real saved agents using the manual agent JSON format." },
  ]);
  const [builderMessage, setBuilderMessage] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(rootAgentId || null);
  const [currentRootAgentId, setCurrentRootAgentId] = useState<string | null>(rootAgentId || null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [isManagerAgent, setIsManagerAgent] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [examples, setExamples] = useState("");
  const [structuredOutput, setStructuredOutput] = useState("");
  const [features, setFeatures] = useState<CoreFeatures>(emptyFeatures());
  const [mcpTools, setMcpTools] = useState<McpToolConfig[]>([]);
  const [workerAgents, setWorkerAgents] = useState<WorkerAgentLink[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentRecord[]>([]);
  const [kbType, setKbType] = useState("rag");
  const [selectedKbId, setSelectedKbId] = useState("");
  const [kbChunks, setKbChunks] = useState(5);
  const [kbRetrievalType, setKbRetrievalType] = useState("basic");
  const [kbScoreThreshold, setKbScoreThreshold] = useState("0.0");
  const [schedulerConfigs, setSchedulerConfigs] = useState<AgentScheduleConfig[]>([]);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<RuntimeMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [enableStreaming, setEnableStreaming] = useState(false);

  const flowAgents = useMemo(
    () => [rootAgent, ...subAgents].filter((agent): agent is AgentRecord => Boolean(agent)),
    [rootAgent, subAgents],
  );
  const integrationNamesById = useMemo(
    () => Object.fromEntries(toolSources.map((integration) => [integration.id, integration.name])),
    [toolSources],
  );
  const graph = useMemo(
    () => buildGraphFromAgents(rootAgent, subAgents, integrationNamesById),
    [integrationNamesById, rootAgent, subAgents],
  );
  const graphAgentCount = useMemo(() => graph.nodes.filter((node) => node.kind !== "tool").length, [graph]);
  const graphToolCount = useMemo(() => graph.nodes.filter((node) => node.kind === "tool").length, [graph]);
  const selectedAgentRecord = useMemo(
    () => flowAgents.find((agent) => agent.id === selectedAgentId) || rootAgent || null,
    [flowAgents, rootAgent, selectedAgentId],
  );
  const selectedAgentTitle = useMemo(() => {
    if (!selectedAgentId) return "Edit Agent";
    return selectedAgentId === currentRootAgentId ? "Edit Root Agent" : "Edit Selected Agent";
  }, [currentRootAgentId, selectedAgentId]);

  const applyAgentDataToForm = useCallback((data: AgentRecord) => {
    setName(data.name || "");
    setDescription(data.description || "");
    setIsPublished(data.is_published || false);
    if (data.workspace_id) setSelectedWorkspaceId(data.workspace_id);

    const flow = data.flow_data || {};
    setModel(normalizeAgentRuntimeModelValue(flow.model || "gpt-4o-mini"));
    setRole(toEditableText(flow.role));
    setGoal(toEditableText(flow.goal));
    setInstructions(toEditableText(flow.instructions));
    setIsManagerAgent(flow.is_manager_agent || false);
    setEnableThinking(flow.enable_thinking || false);
    setCustomUrl(flow.custom_url || "");
    setCustomModelName(flow.custom_model_name || "");
    setCustomApiKey(flow.custom_api_key || "");
    setExamples(toEditableText(flow.examples));
    setStructuredOutput(toEditableText(flow.structured_output));
    const nextSchedules = normalizeSchedulerConfigs(flow.scheduler_config);
    const nextFeatures = { ...emptyFeatures(), ...(flow.features || {}) };
    if (nextSchedules.length > 0) nextFeatures.scheduler = true;
    setFeatures(nextFeatures);
    setMcpTools(flow.mcp_tools || []);
    setWorkerAgents(flow.worker_agents || []);
    setSchedulerConfigs(nextSchedules);
    if (flow.kb_config) {
      setKbType(normalizeKbType(flow.kb_config.type));
      setSelectedKbId(flow.kb_config.kb_id || "");
      setKbChunks(flow.kb_config.chunks || 5);
      setKbRetrievalType(flow.kb_config.retrieval_type || "basic");
      setKbScoreThreshold(flow.kb_config.score_threshold || "0.0");
    } else {
      setKbType("rag");
      setSelectedKbId("");
      setKbChunks(5);
      setKbRetrievalType("basic");
      setKbScoreThreshold("0.0");
    }
  }, []);

  const syncFlowState = useCallback((nextRoot: AgentRecord | null, nextSubAgents: AgentRecord[], preferredSelectedId?: string | null) => {
    setRootAgent(nextRoot);
    setSubAgents(nextSubAgents);
    setCurrentRootAgentId(nextRoot?.id || null);

    const nextSelectedId = preferredSelectedId || nextRoot?.id || null;
    setSelectedAgentId(nextSelectedId);

    const allAgents = [nextRoot, ...nextSubAgents].filter((agent): agent is AgentRecord => Boolean(agent));
    const selectedRecord = allAgents.find((agent) => agent.id === nextSelectedId) || nextRoot;
    if (selectedRecord) applyAgentDataToForm(selectedRecord);
    setAvailableAgents(allAgents.filter((agent) => agent.id !== nextSelectedId));
  }, [applyAgentDataToForm]);

  const getCurrentAgentPayload = () => ({
    name,
    description,
    is_published: isPublished,
    flow_data: {
      model: normalizeAgentRuntimeModelValue(model),
      role,
      goal,
      instructions,
      examples,
      structured_output: structuredOutput,
      is_manager_agent: isManagerAgent,
      enable_thinking: enableThinking,
      features,
      workspace_id: selectedWorkspaceId,
      mcp_tools: mcpTools,
      worker_agents: workerAgents,
      custom_url: customUrl,
      custom_model_name: customModelName,
      custom_api_key: customApiKey,
      kb_config: features.knowledge_base
        ? { type: normalizeKbType(kbType), kb_id: selectedKbId, chunks: kbChunks, retrieval_type: kbRetrievalType, score_threshold: kbScoreThreshold }
        : null,
      scheduler_config: features.scheduler ? buildSchedulerConfigPayload(schedulerConfigs) : null,
    },
  });

  const loadSchedules = useCallback(async (targetAgentId: string) => {
    try {
      const data = (await apiFetch(`/agents/${targetAgentId}/schedules`)) as AgentScheduleConfig[];
      const nextSchedules = normalizeSchedulerConfigs(data);
      setSchedulerConfigs(nextSchedules);
      setFeatures((current) => ({ ...current, scheduler: nextSchedules.length > 0 ? true : current.scheduler }));
    } catch {
      // Keep the flow_data draft if no operational schedules are provisioned yet.
    }
  }, []);

  const syncSchedules = useCallback(async (targetAgentId: string) => {
    const nextSchedules = features.scheduler ? normalizeSchedulerConfigs(schedulerConfigs) : [];
    const synced = (await apiFetch(`/agents/${targetAgentId}/schedules`, {
      method: "PUT",
      body: JSON.stringify({ schedules: nextSchedules }),
    })) as AgentScheduleConfig[];
    const normalized = normalizeSchedulerConfigs(synced);
    setSchedulerConfigs(normalized);
    setFeatures((current) => ({ ...current, scheduler: normalized.length > 0 }));
  }, [features.scheduler, schedulerConfigs]);

  const loadRootFlow = useCallback(async (rootId: string, preferredSelectedId?: string | null) => {
    const root = (await apiFetch(`/agents/${rootId}`)) as AgentRecord;
    const workerLinks = (root.flow_data?.worker_agents || []) as WorkerAgentLink[];
    const workers = (await Promise.all(workerLinks.map((link) => apiFetch(`/agents/${link.agent_id}`)))) as AgentRecord[];
    syncFlowState(root, workers, preferredSelectedId);
    await loadSchedules(preferredSelectedId || root.id);
  }, [loadSchedules, syncFlowState]);

  useEffect(() => {
    apiFetch("/workspaces")
      .then((data: Workspace[]) => {
        setWorkspaces(data || []);
        if (data?.length) setSelectedWorkspaceId((current) => current || data[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setToolSources([]);
      return;
    }

    apiFetch(`/mcp/?ws_id=${selectedWorkspaceId}`)
      .then((data) => setToolSources((data || []) as McpIntegrationRecord[]))
      .catch(() => {});
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!rootAgentId) {
      setIsLoading(false);
      return;
    }

    loadRootFlow(rootAgentId, rootAgentId)
      .catch((error: unknown) => {
        console.error(error);
        toast.error("Failed to load agent flow", { description: getErrorMessage(error) });
      })
      .finally(() => setIsLoading(false));
  }, [loadRootFlow, rootAgentId]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;

    apiFetch("/agents")
      .then((data) => setAvailableAgents(((data || []) as AgentRecord[]).filter((agent) => agent.id !== selectedAgentId)))
      .catch(() => {});
  }, [selectedWorkspaceId, selectedAgentId]);

  const createWorkspace = async (workspaceName: string) => {
    const data = await apiFetch("/workspaces", { method: "POST", body: JSON.stringify({ name: workspaceName }) });
    setWorkspaces((current) => [...current, data]);
    setSelectedWorkspaceId(data.id);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Agent name is required");
      return;
    }
    if (!selectedWorkspaceId) {
      toast.error("Please select a workspace");
      return;
    }
    if (features.knowledge_base && !selectedKbId) {
      toast.error("Select a knowledge base before saving");
      return;
    }
    if (features.scheduler && normalizeSchedulerConfigs(schedulerConfigs).length === 0) {
      toast.error("Add at least one schedule before saving");
      return;
    }

    setIsSaving(true);
    try {
      const payload = getCurrentAgentPayload();
      if (selectedAgentId) {
        await apiFetch(`/agents/${selectedAgentId}`, { method: "PUT", body: JSON.stringify(payload) });
        if (features.scheduler || schedulerConfigs.length > 0) {
          await syncSchedules(selectedAgentId);
        }
        toast.success("Agent updated");
        if (currentRootAgentId) await loadRootFlow(currentRootAgentId, selectedAgentId);
      } else {
        const data = (await apiFetch("/agents", { method: "POST", body: JSON.stringify(payload) })) as AgentRecord;
        if (features.scheduler || schedulerConfigs.length > 0) {
          await syncSchedules(data.id);
        }
        toast.success("Agent created");
        replaceUrlWithoutReload(`/dashboard/agent-flow-builder/${data.id}`);
        await loadRootFlow(data.id, data.id);
      }
    } catch (error: unknown) {
      toast.error("Failed to save agent", { description: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBuild = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace first");
      return;
    }
    if (!builderMessage.trim()) return;

    const message = builderMessage.trim();
    setBuilderHistory((current) => [...current, { role: "user", content: message }]);
    setBuilderMessage("");
    setIsBuilding(true);

    try {
      const response = (await apiFetch("/agents/builder/chat", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          message,
          root_agent_id: currentRootAgentId || undefined,
          selected_agent_id: selectedAgentId || undefined,
          history: builderHistory,
        }),
      })) as BuilderChatResponse;

      const persistedRoot = response.root_agent ?? rootAgent;
      const persistedSubAgents = response.sub_agents ?? subAgents;
      const nextSelectedId = response.selected_agent_id || persistedRoot?.id || selectedAgentId || null;

      syncFlowState(persistedRoot, persistedSubAgents, nextSelectedId);
      if (nextSelectedId) await loadSchedules(nextSelectedId);
      setBuilderHistory((current) => [...current, { role: "assistant", content: response.reply || "Agent flow updated." }]);

      if (persistedRoot?.id && !currentRootAgentId) {
        replaceUrlWithoutReload(`/dashboard/agent-flow-builder/${persistedRoot.id}`);
      }

      toast.success("Agent flow updated");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setBuilderHistory((current) => [...current, { role: "assistant", content: `Builder failed: ${message}` }]);
      toast.error("Builder failed", { description: message });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleGraphSelect = async (agentId: string) => {
    setSelectedAgentId(agentId);

    const localRecord = flowAgents.find((agent) => agent.id === agentId);
    if (localRecord) {
      applyAgentDataToForm(localRecord);
      await loadSchedules(agentId);
      return;
    }

    try {
      const data = (await apiFetch(`/agents/${agentId}`)) as AgentRecord;
      applyAgentDataToForm(data);
      await loadSchedules(agentId);
      setAvailableAgents((current) => current.filter((agent) => agent.id !== agentId));
    } catch (error: unknown) {
      console.error(error);
      toast.error("Failed to load selected agent", { description: getErrorMessage(error) });
    }
  };

  const handleChat = async () => {
    if (!selectedAgentId) {
      toast.error("Select or create an agent first");
      return;
    }
    if (!chatMessage.trim()) return;

    const msg = chatMessage;
    const cleanHistory = chatHistory.map(({ role, content }) => ({ role, content }));
    setChatHistory((current) => [...current, { role: "user", content: msg }]);
    setChatMessage("");
    setIsChatting(true);

    try {
      const headers = await getAuthenticatedHeaders({ "Content-Type": "application/json" });

      const response = await fetch(buildApiUrl(`/agents/${selectedAgentId}/chat`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: msg,
          history: cleanHistory,
          stream: enableStreaming,
          enable_thinking: enableThinking,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Inference failed (${response.status})`);
      }

      if (!enableStreaming) {
        const data = await response.json();
        setChatHistory((current) => [...current, { role: "assistant", content: data.reply, thinking: data.thinking }]);
      } else {
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        setChatHistory((current) => [...current, { role: "assistant", content: "", thinking: "" }]);
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6));
            setChatHistory((current) => {
              const next = [...current];
              const lastIndex = next.length - 1;
              const lastMessage = { ...next[lastIndex] };
              if (data.type === "thinking") lastMessage.thinking = (lastMessage.thinking || "") + data.content;
              else if (data.type === "content") lastMessage.content += data.content;
              else if (data.type === "error") lastMessage.content = `⚠️ ${data.content}`;
              else if (data.type === "done" && data.thinking) lastMessage.thinking = data.thinking;
              next[lastIndex] = lastMessage;
              return next;
            });
          }
        }
      }
    } catch (error: unknown) {
      setChatHistory((current) => [...current, { role: "assistant", content: `⚠️ ${getErrorMessage(error)}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/20 border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 justify-center pt-1">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background/90 p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <button
            type="button"
            onClick={() => setViewMode("build")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              viewMode === "build"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Wand2 className="h-4 w-4" />
            Build
          </button>
          <button
            type="button"
            onClick={() => setViewMode("run")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              viewMode === "run"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Play className="h-4 w-4" />
            Run
          </button>
          <AgentApiAccessDialog
            agentId={selectedAgentId}
            triggerLabel="API"
            triggerClassName="h-9 rounded-full border-border px-4 text-sm"
          />
        </div>
      </div>

      {viewMode === "build" ? (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
          <div className="min-h-0 overflow-hidden">
            <AgentBuildChatPanel
              messages={builderHistory}
              message={builderMessage}
              onMessageChange={setBuilderMessage}
              onSubmit={handleBuild}
              isBuilding={isBuilding}
              disabled={!selectedWorkspaceId}
            />
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-border bg-background/60 shadow-soft">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border/70 px-6 py-5">
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Live Agent Map</div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agents and tools update in real time</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  The graph is rebuilt from the saved root agent, worker links, and attached tools. Tool nodes are rendered separately so each agent relationship stays explicit.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/40 px-3 py-2 text-xs font-semibold text-foreground">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                  {graphAgentCount} agent nodes
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/40 px-3 py-2 text-xs font-semibold text-foreground">
                  <Workflow className="h-3.5 w-3.5 text-amber-500" />
                  {graphToolCount} tool nodes
                </div>
                {selectedAgentRecord ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setViewMode("run")}
                  >
                    Open {selectedAgentRecord.name} in Run
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 p-4">
              {graph.nodes.length ? (
                <AgentFlowCanvas graph={graph} selectedAgentId={selectedAgentId} onSelectAgent={handleGraphSelect} />
              ) : (
                <div className="flex h-full min-h-[440px] flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.12),transparent_30%)] px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <h2 className="mt-5 text-xl font-semibold text-foreground">Start with a build prompt</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Once the builder saves a root agent or worker agents, this canvas will show agents and their connected tools as separate nodes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <div className="shrink-0 rounded-[28px] border border-border bg-background/60 px-4 py-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Run Workspace</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Edit any saved agent from this flow and test it without leaving the page.
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/40 px-3 py-2 text-xs font-semibold text-foreground">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                  {selectedAgentRecord ? selectedAgentRecord.name : "No agent selected"}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {flowAgents.length ? (
                  flowAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => handleGraphSelect(agent.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                        selectedAgentId === agent.id
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/20 hover:text-foreground"
                      }`}
                    >
                      {agent.id === currentRootAgentId ? <Sparkles className="h-3.5 w-3.5 text-primary" /> : <Bot className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span>{agent.name}</span>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {agent.id === currentRootAgentId ? "Root" : "Worker"}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">Build or save an agent first, then switch here to edit and test it.</div>
                )}
              </div>
            </div>

            <div className="min-h-0 overflow-hidden">
              <AgentEditorPane
                title={selectedAgentTitle}
                createdAgentId={selectedAgentId}
                isSaving={isSaving}
                showBackLink={false}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                onSelectWorkspace={setSelectedWorkspaceId}
                onCreateWorkspace={createWorkspace}
                wsLoading={false}
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                model={model}
                setModel={setModel}
                role={role}
                setRole={setRole}
                goal={goal}
                setGoal={setGoal}
                instructions={instructions}
                setInstructions={setInstructions}
                isPublished={isPublished}
                setIsPublished={setIsPublished}
                isManagerAgent={isManagerAgent}
                setIsManagerAgent={setIsManagerAgent}
                enableThinking={enableThinking}
                setEnableThinking={setEnableThinking}
                customUrl={customUrl}
                setCustomUrl={setCustomUrl}
                customModelName={customModelName}
                setCustomModelName={setCustomModelName}
                customApiKey={customApiKey}
                setCustomApiKey={setCustomApiKey}
                examples={examples}
                setExamples={setExamples}
                structuredOutput={structuredOutput}
                setStructuredOutput={setStructuredOutput}
                features={features}
                setFeatures={setFeatures}
                mcpTools={mcpTools}
                setMcpTools={setMcpTools}
                workerAgents={workerAgents}
                setWorkerAgents={setWorkerAgents}
                availableAgents={availableAgents}
                kbType={kbType}
                setKbType={setKbType}
                selectedKbId={selectedKbId}
                setSelectedKbId={setSelectedKbId}
                kbChunks={kbChunks}
                setKbChunks={setKbChunks}
                kbRetrievalType={kbRetrievalType}
                setKbRetrievalType={setKbRetrievalType}
                kbScoreThreshold={kbScoreThreshold}
                setKbScoreThreshold={setKbScoreThreshold}
                schedulerConfigs={schedulerConfigs}
                setSchedulerConfigs={setSchedulerConfigs}
                onSave={handleSave}
              />
            </div>
          </div>

          <div className="min-h-0 overflow-hidden">
            <AgentTestChatPanel
              messages={chatHistory}
              message={chatMessage}
              onMessageChange={setChatMessage}
              onSubmit={handleChat}
              isChatting={isChatting}
              enableStreaming={enableStreaming}
              onStreamingChange={setEnableStreaming}
              disabled={!selectedAgentId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

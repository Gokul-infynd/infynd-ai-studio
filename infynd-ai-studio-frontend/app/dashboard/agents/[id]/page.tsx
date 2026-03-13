"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AgentBuildChatPanel } from "@/components/agents/AgentBuildChatPanel";
import { AgentEditorPane } from "@/components/agents/AgentEditorPane";
import { AgentApiAccessDialog } from "@/components/agents/AgentApiAccessDialog";
import { AgentTestChatPanel } from "@/components/agents/AgentTestChatPanel";
import { normalizeAgentRuntimeModelValue } from "@/components/agents/modelCatalog";
import { buildSchedulerConfigPayload, normalizeKbType, normalizeSchedulerConfigs, toEditableText } from "@/components/agents/types";
import type {
  AgentRecord,
  AgentScheduleConfig,
  BuilderChatResponse,
  BuilderMessage,
  CoreFeatures,
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

export default function AgentBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const agentId = resolvedParams.id;
  const isNew = agentId === "create";
  const router = useRouter();

  const [assistantMode, setAssistantMode] = useState<"build" | "test">(isNew ? "build" : "test");
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [enableStreaming, setEnableStreaming] = useState(false);

  const [rootAgentId, setRootAgentId] = useState<string | null>(isNew ? null : agentId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [wsLoading, setWsLoading] = useState(true);
  const [availableAgents, setAvailableAgents] = useState<AgentRecord[]>([]);

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
  const [kbType, setKbType] = useState("rag");
  const [selectedKbId, setSelectedKbId] = useState("");
  const [kbChunks, setKbChunks] = useState(5);
  const [kbRetrievalType, setKbRetrievalType] = useState("basic");
  const [kbScoreThreshold, setKbScoreThreshold] = useState("0.0");
  const [schedulerConfigs, setSchedulerConfigs] = useState<AgentScheduleConfig[]>([]);

  const [builderMessage, setBuilderMessage] = useState("");
  const [builderHistory, setBuilderHistory] = useState<BuilderMessage[]>([
    {
      role: "assistant",
      content:
        "Describe the agent you need. I will create and update real saved agents using the same manual JSON format.",
    },
  ]);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<RuntimeMessage[]>([]);

  const applyAgentDataToForm = (data: AgentRecord) => {
    setName(data.name || "");
    setDescription(data.description || "");
    setIsPublished(Boolean(data.is_published));
    if (data.id) setRootAgentId(data.id);
    if (data.workspace_id) setSelectedWorkspaceId(data.workspace_id);

    const flow = data.flow_data || {};
    setModel(normalizeAgentRuntimeModelValue(flow.model || "gpt-4o-mini"));
    setRole(toEditableText(flow.role));
    setGoal(toEditableText(flow.goal));
    setInstructions(toEditableText(flow.instructions));
    setIsManagerAgent(Boolean(flow.is_manager_agent));
    setEnableThinking(Boolean(flow.enable_thinking));
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
  };

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

  const loadSchedules = async (targetAgentId: string) => {
    try {
      const data = (await apiFetch(`/agents/${targetAgentId}/schedules`)) as AgentScheduleConfig[];
      const nextSchedules = normalizeSchedulerConfigs(data);
      setSchedulerConfigs(nextSchedules);
      setFeatures((current) => ({ ...current, scheduler: nextSchedules.length > 0 ? true : current.scheduler }));
    } catch {
      // Keep local draft schedule data from flow_data if the runtime table is not ready yet.
    }
  };

  const syncSchedules = async (targetAgentId: string) => {
    const nextSchedules = features.scheduler ? normalizeSchedulerConfigs(schedulerConfigs) : [];
    const synced = (await apiFetch(`/agents/${targetAgentId}/schedules`, {
      method: "PUT",
      body: JSON.stringify({ schedules: nextSchedules }),
    })) as AgentScheduleConfig[];
    const normalized = normalizeSchedulerConfigs(synced);
    setSchedulerConfigs(normalized);
    setFeatures((current) => ({ ...current, scheduler: normalized.length > 0 }));
  };

  useEffect(() => {
    setWsLoading(true);
    apiFetch("/workspaces")
      .then((data: Workspace[]) => {
        setWorkspaces(data || []);
        if (data?.length) setSelectedWorkspaceId((prev) => prev || data[0].id);
      })
      .catch(() => {})
      .finally(() => setWsLoading(false));
  }, []);

  useEffect(() => {
    if (isNew) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    apiFetch(`/agents/${agentId}`)
      .then(async (data) => {
        applyAgentDataToForm(data);
        await loadSchedules(data.id);
      })
      .catch((error: unknown) => {
        toast.error("Failed to load agent", { description: getErrorMessage(error) });
      })
      .finally(() => setIsLoading(false));
  }, [agentId, isNew]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    apiFetch("/agents")
      .then((data) => {
        const hiddenIds = new Set([rootAgentId].filter(Boolean));
        setAvailableAgents(((data || []) as AgentRecord[]).filter((agent) => !hiddenIds.has(agent.id)));
      })
      .catch(() => {});
  }, [selectedWorkspaceId, rootAgentId]);

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
      if (rootAgentId) {
        const updated = await apiFetch(`/agents/${rootAgentId}`, { method: "PUT", body: JSON.stringify(payload) });
        applyAgentDataToForm(updated);
        if (features.scheduler || schedulerConfigs.length > 0) {
          await syncSchedules(updated.id);
        }
        toast.success("Agent updated");
      } else {
        const created = await apiFetch("/agents", { method: "POST", body: JSON.stringify(payload) });
        applyAgentDataToForm(created);
        if (features.scheduler || schedulerConfigs.length > 0) {
          await syncSchedules(created.id);
        }
        toast.success("Agent created");
        replaceUrlWithoutReload(`/dashboard/agents/${created.id}`);
      }
    } catch (error: unknown) {
      toast.error("Failed to save agent", { description: getErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!rootAgentId || !confirm("Delete this agent permanently?")) return;
    try {
      await apiFetch(`/agents/${rootAgentId}`, { method: "DELETE" });
      toast.success("Agent deleted");
      router.push("/dashboard/agents");
    } catch (error: unknown) {
      toast.error("Failed to delete agent", { description: getErrorMessage(error) });
    }
  };

  const handleBuild = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace first");
      return;
    }
    if (!builderMessage.trim()) return;

    const message = builderMessage.trim();
    const nextHistory = [...builderHistory, { role: "user", content: message }];
    setBuilderHistory(nextHistory);
    setBuilderMessage("");
    setIsBuilding(true);

    try {
      const response = (await apiFetch("/agents/builder/chat", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          message,
          root_agent_id: rootAgentId || undefined,
          selected_agent_id: rootAgentId || undefined,
          history: builderHistory,
        }),
      })) as BuilderChatResponse;

      const nextRootId = response.root_agent?.id || rootAgentId;
      if (response.root_agent) applyAgentDataToForm(response.root_agent);
      if (nextRootId) await loadSchedules(nextRootId);

      if (nextRootId && !rootAgentId) {
        replaceUrlWithoutReload(`/dashboard/agents/${nextRootId}`);
      }

      setAvailableAgents(response.sub_agents || []);

      setBuilderHistory((current) => [...current, { role: "assistant", content: response.reply || "Agent updated." }]);
      toast.success("Build update saved");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setBuilderHistory((current) => [...current, { role: "assistant", content: `Builder failed: ${message}` }]);
      toast.error("Builder failed", { description: message });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleChat = async () => {
    if (!rootAgentId) {
      toast.error("Save or build an agent first");
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

      const response = await fetch(buildApiUrl(`/agents/${rootAgentId}/chat`), {
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
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border/20 border-t-foreground" /></div>;
  }

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_420px]">
      <AgentEditorPane
        title={rootAgentId ? "Manage Agent" : "Create Agent"}
        createdAgentId={rootAgentId}
        isSaving={isSaving}
        headerActions={
          <AgentApiAccessDialog
            agentId={rootAgentId}
            triggerLabel="API"
            triggerClassName="h-6 border-border px-2 text-[10px] text-foreground"
          />
        }
        showBackLink
        backHref="/dashboard/agents"
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={setSelectedWorkspaceId}
        onCreateWorkspace={createWorkspace}
        wsLoading={wsLoading}
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
        onDelete={rootAgentId ? handleDelete : undefined}
      />

      <div className="hidden min-h-0 overflow-hidden lg:flex lg:flex-col lg:gap-4">
        {assistantMode === "build" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <AgentBuildChatPanel
              messages={builderHistory}
              message={builderMessage}
              onMessageChange={setBuilderMessage}
              onSubmit={handleBuild}
              isBuilding={isBuilding}
              disabled={!selectedWorkspaceId}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">
            <AgentTestChatPanel
              messages={chatHistory}
              message={chatMessage}
              onMessageChange={setChatMessage}
              onSubmit={handleChat}
              isChatting={isChatting}
              enableStreaming={enableStreaming}
              onStreamingChange={setEnableStreaming}
              disabled={!rootAgentId}
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-background/50 p-2">
          <Button variant={assistantMode === "build" ? "default" : "outline"} onClick={() => setAssistantMode("build")} className="h-8 flex-1 text-xs">
            Build
          </Button>
          <Button variant={assistantMode === "test" ? "default" : "outline"} onClick={() => setAssistantMode("test")} className="h-8 flex-1 text-xs">
            Test
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderOpen,
  Plus,
  RefreshCcw,
  Repeat2,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { findModelGroup, getModelDisplayName, MODEL_GROUPS, normalizeAgentRuntimeModelValue } from "@/components/agents/modelCatalog";
import { SCHEDULER_TIMEZONE_OPTIONS, createEmptySchedule, normalizeKbType, normalizeScheduleTimezone, normalizeSchedulerConfigs } from "@/components/agents/types";
import type {
  AgentScheduleConfig,
  CoreFeatures,
  McpCachedTool,
  McpIntegrationRecord,
  McpToolConfig,
  ToolArgumentBinding,
  ToolSettingConfig,
  WorkerAgentLink,
  Workspace,
} from "@/components/agents/types";

const FEATURE_LIST: { key: keyof CoreFeatures; label: string }[] = [
  { key: "knowledge_base", label: "Knowledge Base" }, { key: "data_query", label: "Data Query" },
  { key: "scheduler", label: "Scheduler" }, { key: "webhook_trigger", label: "Webhook Trigger" }, { key: "memory", label: "Memory" },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function ModelSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const normalizedValue = normalizeAgentRuntimeModelValue(value);
  const filteredGroups = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return MODEL_GROUPS;
    return MODEL_GROUPS.map((group) => ({
      ...group,
      models: group.models.filter((model) => {
        return model.label.toLowerCase().includes(query) || model.value.toLowerCase().includes(query) || group.provider.toLowerCase().includes(query);
      }),
    })).filter((group) => group.models.length > 0);
  }, [modelSearch]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open && !expandedGroup) {
            const matchingGroup = findModelGroup(normalizedValue);
            if (matchingGroup) setExpandedGroup(matchingGroup.provider);
          }
          setOpen(!open);
        }}
        className="flex w-full items-center justify-between rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/50"
      >
        <span className="flex items-center gap-2">
          {(() => {
            const group = findModelGroup(normalizedValue);
            return group ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.color }} /> : null;
          })()}
          {getModelDisplayName(normalizedValue)}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[340px] w-full overflow-y-auto rounded-lg border border-border bg-popover">
          <div className="border-b border-border px-3 py-2">
            <Input
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder="Search models..."
              className="h-8 border-border bg-background text-sm"
            />
          </div>
          {filteredGroups.map((group) => (
            <div key={group.provider}>
              <button
                type="button"
                onClick={() => setExpandedGroup(expandedGroup === group.provider ? null : group.provider)}
                className="flex w-full items-center justify-between px-3 py-2 transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />
                  {group.provider}
                </span>
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedGroup === group.provider ? "rotate-90" : ""}`} />
              </button>
              {expandedGroup === group.provider ? (
                <div className="mb-1 ml-4 border-l-2 pl-4" style={{ borderColor: `${group.color}40` }}>
                  {group.models.map((model) => (
                    <button
                      key={model.value}
                      type="button"
                      onClick={() => {
                        onChange(model.value);
                        setModelSearch("");
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-sm transition-colors ${normalizedValue === model.value ? "bg-primary/5 font-medium text-primary" : "text-muted-foreground hover:bg-accent"
                        }`}
                    >
                      {model.label}
                      {normalizedValue === model.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {!filteredGroups.length ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No models matched your search.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ToolConfigState = Record<string, Record<string, ToolArgumentBinding>>;

function normalizeToolSettings(toolSettings?: ToolSettingConfig[]): ToolConfigState {
  const nextState: ToolConfigState = {};
  for (const item of toolSettings || []) {
    if (!item?.tool_name) continue;
    const nextArgs: Record<string, ToolArgumentBinding> = {};
    for (const [argName, binding] of Object.entries(item.arguments || {})) {
      if (!binding || binding.mode !== "manual") continue;
      nextArgs[argName] = {
        mode: "manual",
        value: typeof binding.value === "string" ? binding.value : String(binding.value ?? ""),
      };
    }
    if (Object.keys(nextArgs).length > 0) {
      nextState[item.tool_name] = nextArgs;
    }
  }
  return nextState;
}

function serializeToolSettings(selectedTools: string[], configState: ToolConfigState): ToolSettingConfig[] {
  return selectedTools
    .map((toolName) => {
      const args = Object.fromEntries(
        Object.entries(configState[toolName] || {}).filter(([, binding]) => binding?.mode === "manual" && String(binding.value ?? "").trim() !== ""),
      );

      if (Object.keys(args).length === 0) return null;
      return {
        tool_name: toolName,
        arguments: args,
      };
    })
    .filter((item): item is ToolSettingConfig => Boolean(item));
}

function getToolSchemaProperties(tool?: McpCachedTool | null): Array<[string, Record<string, unknown>]> {
  const schema = (tool?.inputSchema || {}) as Record<string, unknown>;
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  return Object.entries(properties);
}

function getToolSchemaRequired(tool?: McpCachedTool | null): string[] {
  const schema = (tool?.inputSchema || {}) as Record<string, unknown>;
  return Array.isArray(schema.required) ? (schema.required as string[]) : [];
}

function getManualBindingCount(configState: ToolConfigState): number {
  return Object.values(configState).reduce((sum, toolConfig) => {
    return sum + Object.values(toolConfig || {}).filter((binding) => binding?.mode === "manual" && String(binding.value ?? "").trim() !== "").length;
  }, 0);
}

function describeSchedule(schedule: AgentScheduleConfig): string {
  switch (schedule.frequency) {
    case "daily":
      return `Every day at ${schedule.time_of_day}`;
    case "weekly": {
      const dayLabels = WEEKDAY_OPTIONS.filter((option) => schedule.weekdays.includes(option.value)).map((option) => option.label);
      return `${dayLabels.join(", ") || "Weekly"} at ${schedule.time_of_day}`;
    }
    case "monthly":
      return `Day ${schedule.day_of_month || 1} of every month at ${schedule.time_of_day}`;
    case "yearly": {
      const monthLabel = MONTH_OPTIONS.find((month) => month.value === schedule.month_of_year)?.label || "January";
      return `${monthLabel} ${schedule.day_of_month || 1} at ${schedule.time_of_day}`;
    }
    case "interval":
      return `Every ${schedule.interval_value || 1} ${schedule.interval_unit || "hours"}`;
    default:
      return "Scheduled run";
  }
}

interface AgentEditorPaneProps {
  title: string;
  createdAgentId: string | null;
  isSaving: boolean;
  headerActions?: import("react").ReactNode;
  showBackLink?: boolean;
  backHref?: string;
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  wsLoading: boolean;
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  role: string;
  setRole: (value: string) => void;
  goal: string;
  setGoal: (value: string) => void;
  instructions: string;
  setInstructions: (value: string) => void;
  isPublished: boolean;
  setIsPublished: (value: boolean) => void;
  isManagerAgent: boolean;
  setIsManagerAgent: (value: boolean) => void;
  enableThinking: boolean;
  setEnableThinking: (value: boolean) => void;
  customUrl: string;
  setCustomUrl: (value: string) => void;
  customModelName: string;
  setCustomModelName: (value: string) => void;
  customApiKey: string;
  setCustomApiKey: (value: string) => void;
  examples: string;
  setExamples: (value: string) => void;
  structuredOutput: string;
  setStructuredOutput: (value: string) => void;
  features: CoreFeatures;
  setFeatures: (value: CoreFeatures) => void;
  mcpTools: McpToolConfig[];
  setMcpTools: Dispatch<SetStateAction<McpToolConfig[]>>;
  workerAgents: WorkerAgentLink[];
  setWorkerAgents: Dispatch<SetStateAction<WorkerAgentLink[]>>;
  availableAgents: Array<{ id: string; name: string }>;
  kbType: string;
  setKbType: (value: string) => void;
  selectedKbId: string;
  setSelectedKbId: (value: string) => void;
  kbChunks: number;
  setKbChunks: (value: number) => void;
  kbRetrievalType: string;
  setKbRetrievalType: (value: string) => void;
  kbScoreThreshold: string;
  setKbScoreThreshold: (value: string) => void;
  schedulerConfigs: AgentScheduleConfig[];
  setSchedulerConfigs: Dispatch<SetStateAction<AgentScheduleConfig[]>>;
  onSave: () => void;
  onDelete?: () => void;
}

export function AgentEditorPane(props: AgentEditorPaneProps) {
  const {
    title,
    createdAgentId,
    isSaving,
    headerActions,
    showBackLink = true,
    backHref = "/dashboard/agents",
    workspaces,
    selectedWorkspaceId,
    onSelectWorkspace,
    onCreateWorkspace,
    wsLoading,
    name,
    setName,
    description,
    setDescription,
    model,
    setModel,
    role,
    setRole,
    goal,
    setGoal,
    instructions,
    setInstructions,
    isPublished,
    setIsPublished,
    isManagerAgent,
    setIsManagerAgent,
    enableThinking,
    setEnableThinking,
    customUrl,
    setCustomUrl,
    customModelName,
    setCustomModelName,
    customApiKey,
    setCustomApiKey,
    examples,
    setExamples,
    structuredOutput,
    setStructuredOutput,
    features,
    setFeatures,
    mcpTools,
    setMcpTools,
    workerAgents,
    setWorkerAgents,
    availableAgents,
    kbType,
    setKbType,
    selectedKbId,
    setSelectedKbId,
    kbChunks,
    setKbChunks,
    kbRetrievalType,
    setKbRetrievalType,
    kbScoreThreshold,
    setKbScoreThreshold,
    schedulerConfigs,
    setSchedulerConfigs,
    onSave,
    onDelete,
  } = props;

  const [showCreateWs, setShowCreateWs] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [availableMcpIntegrations, setAvailableMcpIntegrations] = useState<McpIntegrationRecord[]>([]);
  const [hasLoadedIntegrations, setHasLoadedIntegrations] = useState(false);
  const [selectedMcpId, setSelectedMcpId] = useState("");
  const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
  const [mcpFetchedTools, setMcpFetchedTools] = useState<McpCachedTool[]>([]);
  const [tempSelectedTools, setTempSelectedTools] = useState<string[]>([]);
  const [tempToolConfigs, setTempToolConfigs] = useState<ToolConfigState>({});
  const [activeToolName, setActiveToolName] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [kbConfigOpen, setKbConfigOpen] = useState(false);
  const [availableKbs, setAvailableKbs] = useState<Array<{ id: string; name: string }>>([]);
  const [schedulerConfigOpen, setSchedulerConfigOpen] = useState(false);
  const [schedulerDrafts, setSchedulerDrafts] = useState<AgentScheduleConfig[]>([]);
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0);
  const [isStructuredOutputOpen, setIsStructuredOutputOpen] = useState(false);
  const [structuredOutputError, setStructuredOutputError] = useState("");

  const getCachedTools = (integration?: McpIntegrationRecord | null) => integration?.config?.cached_tools || [];
  const getSelectedTools = (mcpId: string) => mcpTools.find((item) => item.mcp_id === mcpId)?.tools || [];
  const getSelectedToolSettings = (mcpId: string) => mcpTools.find((item) => item.mcp_id === mcpId)?.tool_settings || [];
  const selectedIntegration = availableMcpIntegrations.find((item) => item.id === selectedMcpId) || null;
  const filteredFetchedTools = !toolSearch.trim()
    ? mcpFetchedTools
    : mcpFetchedTools.filter((tool) => {
      const query = toolSearch.trim().toLowerCase();
      return tool.name.toLowerCase().includes(query) || (tool.description || "").toLowerCase().includes(query);
    });
  const activeTool = useMemo(
    () => mcpFetchedTools.find((tool) => tool.name === activeToolName) || null,
    [activeToolName, mcpFetchedTools],
  );
  const activeToolProperties = useMemo(() => getToolSchemaProperties(activeTool), [activeTool]);
  const activeToolRequired = useMemo(() => getToolSchemaRequired(activeTool), [activeTool]);
  const manualBindingCount = useMemo(() => getManualBindingCount(tempToolConfigs), [tempToolConfigs]);

  const loadIntegrations = useCallback(async () => {
    if (!selectedWorkspaceId) return [] as McpIntegrationRecord[];
    const data = (await apiFetch(`/mcp/?ws_id=${selectedWorkspaceId}`)) as McpIntegrationRecord[];
    setAvailableMcpIntegrations(data || []);
    setHasLoadedIntegrations(true);
    return data || [];
  }, [selectedWorkspaceId]);

  const refreshToolInventory = async (
    mcpId: string,
    options: { silent?: boolean; syncDialog?: boolean } = {},
  ) => {
    setMcpToolsLoading(true);
    try {
      const refreshed = (await apiFetch(`/mcp/${mcpId}/refresh-tools`, { method: "POST" })) as McpIntegrationRecord;
      setAvailableMcpIntegrations((current) => current.map((item) => (item.id === mcpId ? refreshed : item)));
      const nextTools = getCachedTools(refreshed);
      if (options.syncDialog) setMcpFetchedTools(nextTools);
      if (!options.silent) toast.success("Available tools refreshed");
      return nextTools;
    } catch (error: unknown) {
      if (!options.silent) {
        toast.error("Failed to refresh tools", { description: error instanceof Error ? error.message : "Unknown error" });
      }
      return [];
    } finally {
      setMcpToolsLoading(false);
    }
  };

  const prepareToolSelection = async (mcpId: string, integrations = availableMcpIntegrations) => {
    setSelectedMcpId(mcpId);
    setToolSearch("");
    const selectedTools = getSelectedTools(mcpId);
    setTempSelectedTools(selectedTools);
    setTempToolConfigs(normalizeToolSettings(getSelectedToolSettings(mcpId)));
    setActiveToolName(selectedTools[0] || "");
    const integration = integrations.find((item) => item.id === mcpId);
    const availableTools = getCachedTools(integration);
    if (availableTools.length > 0) {
      setMcpFetchedTools(availableTools);
      if (!selectedTools[0] && availableTools[0]?.name) setActiveToolName(availableTools[0].name);
      return;
    }
    setMcpFetchedTools([]);
    await refreshToolInventory(mcpId, { silent: true, syncDialog: true });
  };

  const openToolModal = async (mcpId?: string) => {
    if (!selectedWorkspaceId) {
      toast.error("Select workspace first");
      return;
    }
    setIsToolModalOpen(true);
    if (!mcpId) {
      setSelectedMcpId("");
      setMcpFetchedTools([]);
      setTempSelectedTools([]);
      setTempToolConfigs({});
      setActiveToolName("");
      setToolSearch("");
      if (!hasLoadedIntegrations && availableMcpIntegrations.length === 0) {
        loadIntegrations().catch((error: unknown) => {
          toast.error("Failed to load tool sources", { description: error instanceof Error ? error.message : "Unknown error" });
        });
      }
      return;
    }

    const currentIntegrations = availableMcpIntegrations;
    const currentIntegration = currentIntegrations.find((item) => item.id === mcpId);
    if (currentIntegration) {
      prepareToolSelection(mcpId, currentIntegrations).catch(() => { });
      return;
    }

    loadIntegrations()
      .then((integrations) => prepareToolSelection(mcpId, integrations))
      .catch((error: unknown) => {
        toast.error("Failed to load tool sources", { description: error instanceof Error ? error.message : "Unknown error" });
      });
  };

  const saveToolSelection = () => {
    if (!selectedMcpId) return;
    const nextSelectedTools = [...new Set(tempSelectedTools)];
    const serializedSettings = serializeToolSettings(nextSelectedTools, tempToolConfigs);
    setMcpTools((current) => {
      if (nextSelectedTools.length === 0) {
        return current.filter((item) => item.mcp_id !== selectedMcpId);
      }
      const existing = current.find((item) => item.mcp_id === selectedMcpId);
      const nextEntry: McpToolConfig = serializedSettings.length > 0
        ? { mcp_id: selectedMcpId, tools: nextSelectedTools, tool_settings: serializedSettings }
        : { mcp_id: selectedMcpId, tools: nextSelectedTools };
      if (existing) {
        return current.map((item) => (item.mcp_id === selectedMcpId ? { ...item, ...nextEntry } : item));
      }
      return [...current, nextEntry];
    });
    setIsToolModalOpen(false);
    toast.success(nextSelectedTools.length > 0 ? "Tool source updated" : "Tool source removed");
  };

  const disconnectToolSource = () => {
    if (!selectedMcpId) return;
    setTempSelectedTools([]);
    setTempToolConfigs({});
    setActiveToolName("");
    setMcpTools((current) => current.filter((item) => item.mcp_id !== selectedMcpId));
    setIsToolModalOpen(false);
    toast.success("Tool source removed");
  };

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    setHasLoadedIntegrations(false);
    loadIntegrations()
      .catch(() => { });
  }, [loadIntegrations, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedMcpId) return;
    if (activeToolName && mcpFetchedTools.some((tool) => tool.name === activeToolName)) return;
    if (tempSelectedTools.length > 0) {
      setActiveToolName(tempSelectedTools[0]);
      return;
    }
    if (mcpFetchedTools[0]?.name) {
      setActiveToolName(mcpFetchedTools[0].name);
    }
  }, [activeToolName, mcpFetchedTools, selectedMcpId, tempSelectedTools]);

  const openKnowledgeBaseConfig = () => {
    setKbConfigOpen(true);
    if (selectedWorkspaceId) {
      apiFetch(`/knowledge-bases/?workspace_id=${selectedWorkspaceId}`).then((data) => setAvailableKbs(data || [])).catch(() => { });
    }
  };

  const openSchedulerConfig = () => {
    const nextDrafts = normalizeSchedulerConfigs(schedulerConfigs);
    setSchedulerDrafts(nextDrafts.length > 0 ? nextDrafts : [createEmptySchedule()]);
    setActiveScheduleIndex(0);
    setSchedulerConfigOpen(true);
  };

  const handleFeatureToggle = (key: keyof CoreFeatures, checked: boolean) => {
    if (key === "knowledge_base") {
      if (checked) {
        openKnowledgeBaseConfig();
      } else {
        setFeatures({ ...features, knowledge_base: false });
      }
      return;
    }

    if (key === "scheduler") {
      if (checked) {
        openSchedulerConfig();
      } else {
        setFeatures({ ...features, scheduler: false });
      }
      return;
    }

    setFeatures({ ...features, [key]: checked });
  };

  const activeSchedule = schedulerDrafts[activeScheduleIndex] || null;

  const updateActiveSchedule = (patch: Partial<AgentScheduleConfig>) => {
    setSchedulerDrafts((current) =>
      current.map((schedule, index) => (index === activeScheduleIndex ? { ...schedule, ...patch } : schedule)),
    );
  };

  const saveSchedulerConfig = () => {
    const nextSchedules = normalizeSchedulerConfigs(schedulerDrafts).filter((schedule) => schedule.prompt.trim() || schedule.name.trim());
    if (nextSchedules.length === 0) {
      toast.error("Add at least one schedule with a prompt");
      return;
    }

    const invalid = nextSchedules.find((schedule) => {
      if (!schedule.prompt.trim()) return true;
      if (schedule.frequency === "weekly" && schedule.weekdays.length === 0) return true;
      if (schedule.frequency === "monthly" && !schedule.day_of_month) return true;
      if (schedule.frequency === "yearly" && (!schedule.month_of_year || !schedule.day_of_month)) return true;
      if (schedule.frequency === "interval" && (!schedule.interval_value || schedule.interval_value < 1)) return true;
      return false;
    });

    if (invalid) {
      toast.error(`Complete the schedule configuration for "${invalid.name}"`);
      return;
    }

    setSchedulerConfigs(nextSchedules);
    setFeatures({ ...features, scheduler: true });
    setSchedulerConfigOpen(false);
  };

  const toggleTempTool = (toolName: string, checked: boolean) => {
    setTempSelectedTools((current) => {
      const next = checked ? [...new Set([...current, toolName])] : current.filter((name) => name !== toolName);
      if (checked) {
        setActiveToolName(toolName);
      } else {
        setTempToolConfigs((configCurrent) => {
          const nextConfig = { ...configCurrent };
          delete nextConfig[toolName];
          return nextConfig;
        });
        if (activeToolName === toolName) {
          setActiveToolName(next[0] || "");
        }
      }
      return next;
    });
  };

  const setToolArgumentMode = (toolName: string, argName: string, mode: "auto" | "manual") => {
    setTempToolConfigs((current) => {
      const next = { ...current };
      const currentToolConfig = { ...(next[toolName] || {}) };

      if (mode === "auto") {
        delete currentToolConfig[argName];
        if (Object.keys(currentToolConfig).length === 0) {
          delete next[toolName];
        } else {
          next[toolName] = currentToolConfig;
        }
        return next;
      }

      next[toolName] = {
        ...currentToolConfig,
        [argName]: currentToolConfig[argName] || { mode: "manual", value: "" },
      };
      return next;
    });
  };

  const setToolArgumentValue = (toolName: string, argName: string, value: string) => {
    setTempToolConfigs((current) => ({
      ...current,
      [toolName]: {
        ...(current[toolName] || {}),
        [argName]: {
          mode: "manual",
          value,
        },
      },
    }));
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          {showBackLink ? (
            <Link href={backHref}>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-accent">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          ) : null}
          <h1 className="text-sm font-medium text-foreground">{title}</h1>
        </div>
        <div className="flex gap-1.5">
          {headerActions}
          {createdAgentId && onDelete ? (
            <Button variant="outline" onClick={onDelete} className="h-6 border-border px-2 text-[10px] text-muted-foreground hover:bg-accent">
              <Trash2 className="mr-0.5 h-2.5 w-2.5" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-5">
          <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <FolderOpen className="h-3 w-3" /> Workspace
              </Label>
              <button onClick={() => setShowCreateWs(!showCreateWs)} className="text-[10px] text-primary hover:underline">
                + New Workspace
              </button>
            </div>
            {wsLoading ? (
              <div className="animate-pulse text-xs text-muted-foreground">Loading workspaces...</div>
            ) : workspaces.length === 0 && !showCreateWs ? (
              <div className="text-xs text-muted-foreground">
                No workspaces found.{" "}
                <button onClick={() => setShowCreateWs(true)} className="text-primary underline">
                  Create one
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => onSelectWorkspace(workspace.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-all ${selectedWorkspaceId === workspace.id
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                  >
                    {workspace.name}
                  </button>
                ))}
              </div>
            )}
            {showCreateWs ? (
              <div className="flex gap-2 pt-1">
                <Input
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  placeholder="Workspace name..."
                  className="h-7 flex-1 border-border bg-transparent text-xs text-foreground"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newWorkspaceName.trim()) {
                      onCreateWorkspace(newWorkspaceName.trim()).then(() => {
                        setNewWorkspaceName("");
                        setShowCreateWs(false);
                      });
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (!newWorkspaceName.trim()) return;
                    onCreateWorkspace(newWorkspaceName.trim()).then(() => {
                      setNewWorkspaceName("");
                      setShowCreateWs(false);
                    });
                  }}
                  className="h-7 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  Create
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. blog writer" className="h-8 border-border bg-transparent text-sm text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Description</Label>
              <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. writing specialist" className="h-8 border-border bg-transparent text-sm text-foreground" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Model</Label>
            <ModelSelector value={model} onChange={setModel} />
            {model === "custom/openai" ? (
              <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Custom Base URL</Label>
                  <Input value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="https://api.yourprovider.com/v1" className="h-8 border-border bg-transparent text-sm text-foreground" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Model Name</Label>
                  <Input value={customModelName} onChange={(event) => setCustomModelName(event.target.value)} placeholder="e.g. meta-llama-3-8b" className="h-8 border-border bg-transparent text-sm text-foreground" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">API Key</Label>
                  <Input type="password" value={customApiKey} onChange={(event) => setCustomApiKey(event.target.value)} placeholder="sk-..." className="h-8 border-border bg-transparent text-sm text-foreground" />
                </div>
              </div>
            ) : null}
            {(model.startsWith("ollama/") || model === "custom/openai") ? (
              <div className="flex items-center gap-2 pt-2">
                <Switch id="think" checked={enableThinking} onCheckedChange={setEnableThinking} className="scale-[0.7]" />
                <Label htmlFor="think" className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-amber-500">
                  <Zap className="h-3 w-3 fill-amber-500/20" /> Enable Reasoning / Thinking
                </Label>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent Role</Label>
                <span className="flex items-center gap-1 text-[10px] text-primary"><BrainCircuit className="h-3 w-3" /> Generated with AI</span>
              </div>
              <Textarea value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. You are an expert customer support agent..." className="min-h-[50px] resize-y border-border bg-accent/20 text-sm text-foreground" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent Goal</Label>
                <span className="flex items-center gap-1 text-[10px] text-primary"><BrainCircuit className="h-3 w-3" /> Refine via builder</span>
              </div>
              <Textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="e.g. Your goal is to resolve inquiries." className="min-h-[50px] resize-y border-border bg-accent/20 text-sm text-foreground" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agent Instructions</Label>
                <span className="flex items-center gap-1 text-[10px] text-primary"><BrainCircuit className="h-3 w-3" /> Refine via builder</span>
              </div>
              <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Detailed instructions for the agent..." className="min-h-[90px] resize-y border-border bg-accent/20 text-sm text-foreground" />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <div className="flex items-center gap-2">
                <Switch id="mgr" checked={isManagerAgent} onCheckedChange={setIsManagerAgent} />
                <Label htmlFor="mgr" className="cursor-pointer text-xs text-muted-foreground">Manager Agent</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="pub" checked={isPublished} onCheckedChange={setIsPublished} />
                <Label htmlFor="pub" className="cursor-pointer text-xs text-muted-foreground">Published</Label>
              </div>
            </div>
          </div>

          {isManagerAgent ? (
            <div className="space-y-4 rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <Label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Linked Agents
                </Label>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 border-border bg-accent text-[10px] text-foreground hover:bg-accent/80" onClick={() => setWorkerAgents([...workerAgents, { agent_id: "", description: "" }])}>
                  <Plus className="h-3 w-3" /> Add Agent
                </Button>
              </div>
              <div className="space-y-3">
                {workerAgents.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">No worker agents linked yet.</div>
                ) : (
                  workerAgents.map((worker, index) => (
                    <div key={`${worker.agent_id}-${index}`} className="group flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={worker.agent_id}
                            onChange={(event) => {
                              const next = [...workerAgents];
                              next[index].agent_id = event.target.value;
                              setWorkerAgents(next);
                            }}
                            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                          >
                            <option value="">Select an agent</option>
                            {availableAgents.map((agent) => (
                              <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                          </select>
                          {worker.agent_id ? (
                            <Link href={`/dashboard/agents/${worker.agent_id}`}>
                              <Button variant="outline" size="sm" className="h-8 border-border bg-transparent text-[10px]">Open</Button>
                            </Link>
                          ) : null}
                        </div>
                        <Input
                          placeholder="How would you use this agent?"
                          value={worker.description}
                          onChange={(event) => {
                            const next = [...workerAgents];
                            next[index].description = event.target.value;
                            setWorkerAgents(next);
                          }}
                          className="h-7 border-border bg-transparent text-xs text-foreground"
                        />
                      </div>
                      <button
                        onClick={() => setWorkerAgents(workerAgents.filter((_, itemIndex) => itemIndex !== index))}
                        className="mt-2 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <Label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" /> Tool Management
                {mcpTools.length > 0 ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-primary">
                    {mcpTools.reduce((sum, entry) => sum + entry.tools.length, 0)} tools connected
                  </span>
                ) : null}
              </Label>

              <Dialog open={isToolModalOpen} onOpenChange={setIsToolModalOpen}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 border-border bg-accent text-[10px] text-foreground hover:bg-accent/80"
                  onClick={() => {
                    openToolModal().catch(() => { });
                  }}
                >
                  <Plus className="h-3 w-3" /> Connect Tool Source
                </Button>
                <DialogContent className="max-h-[100%] overflow-hidden border-border bg-card text-foreground sm:max-w-[80%]">
                  <DialogHeader>
                    <DialogTitle>{selectedMcpId ? "Manage Tool Source" : "Connect Tool Source"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 overflow-hidden py-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Select Tool Source</Label>
                        <div className="relative">
                          <select
                            className="h-10 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                            value={selectedMcpId}
                            onChange={(event) => {
                              const id = event.target.value;
                              if (!id) {
                                setSelectedMcpId("");
                                setToolSearch("");
                                setTempSelectedTools([]);
                                setMcpFetchedTools([]);
                                return;
                              }
                              prepareToolSelection(id).catch(() => { });
                            }}
                          >
                            <option value="">Select a Tool Source...</option>
                            {availableMcpIntegrations.map((integration) => (
                              <option key={integration.id} value={integration.id}>
                                {integration.name} ({integration.integration_type === "openapi" ? "OpenAPI" : "MCP"})
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 gap-1.5 border-border bg-transparent px-4 text-xs text-foreground hover:bg-accent"
                          onClick={() => {
                            if (!selectedMcpId) return;
                            refreshToolInventory(selectedMcpId, { syncDialog: true }).catch(() => { });
                          }}
                          disabled={!selectedMcpId || mcpToolsLoading}
                        >
                          <RefreshCcw className={`h-3.5 w-3.5 ${mcpToolsLoading ? "animate-spin" : ""}`} />
                          Reload Tools
                        </Button>
                      </div>
                    </div>

                    {selectedMcpId ? (
                      <div className="rounded-2xl border border-border bg-accent/20 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{selectedIntegration?.name || "Selected Source"}</span>
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                            {mcpTools.some((item) => item.mcp_id === selectedMcpId) ? "Connected" : "Ready"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {tempSelectedTools.length} selected
                            {mcpFetchedTools.length > 0 ? ` · ${mcpFetchedTools.length} available` : ""}
                          </span>
                          {manualBindingCount > 0 ? (
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                              {manualBindingCount} manual input{manualBindingCount === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {selectedMcpId ? (
                      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                        <div className="space-y-3 overflow-hidden">
                          <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Search Tools</Label>
                            <Input
                              value={toolSearch}
                              onChange={(event) => setToolSearch(event.target.value)}
                              placeholder="Search by tool name or description..."
                              className="h-10 border-border bg-background text-sm text-foreground"
                            />
                          </div>

                          {mcpToolsLoading ? <div className="animate-pulse text-xs text-muted-foreground">Loading tools...</div> : null}
                          {!mcpToolsLoading && selectedMcpId && mcpFetchedTools.length > 0 ? (
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Available Tools</Label>
                              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-2">
                                {filteredFetchedTools.map((tool) => {
                                  const isSelected = tempSelectedTools.includes(tool.name);
                                  const manualCount = Object.values(tempToolConfigs[tool.name] || {}).filter((binding) => binding.mode === "manual" && String(binding.value ?? "").trim() !== "").length;
                                  return (
                                    <div
                                      key={tool.name}
                                      className={`rounded-xl border px-3 py-3 transition-colors ${isSelected
                                        ? "border-primary/30 bg-primary/5"
                                        : "border-border bg-accent/20 hover:bg-accent/40"
                                        }`}
                                    >
                                      <div className="flex items-start gap-3">
                                        <input
                                          type="checkbox"
                                          className="mt-1 flex-shrink-0 accent-primary"
                                          checked={isSelected}
                                          onChange={(event) => toggleTempTool(tool.name, event.target.checked)}
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-mono text-[11px] text-foreground">{tool.name}</p>
                                            {isSelected ? (
                                              <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
                                                Selected
                                              </span>
                                            ) : null}
                                            {manualCount > 0 ? (
                                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-500">
                                                {manualCount} locked input{manualCount === 1 ? "" : "s"}
                                              </span>
                                            ) : null}
                                          </div>
                                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{tool.description || "No description provided."}</p>
                                          {isSelected ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className={`h-7 px-2 text-[10px] ${activeToolName === tool.name ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-transparent text-foreground"}`}
                                                onClick={() => setActiveToolName(tool.name)}
                                              >
                                                Configure Inputs
                                              </Button>
                                              <span className="self-center text-[10px] text-muted-foreground">
                                                AI can fill anything left on auto.
                                              </span>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          {!mcpToolsLoading && selectedMcpId && mcpFetchedTools.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border bg-accent/10 px-3 py-4 text-center text-xs text-muted-foreground">
                              No tools found for this source yet. Reload tools to sync the latest inventory.
                            </div>
                          ) : null}
                          {!mcpToolsLoading && selectedMcpId && mcpFetchedTools.length > 0 && filteredFetchedTools.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border bg-accent/10 px-3 py-4 text-center text-xs text-muted-foreground">
                              No tools matched your search.
                            </div>
                          ) : null}
                        </div>

                        <div className="min-h-0 overflow-hidden rounded-2xl border border-border bg-background/70">
                          <div className="border-b border-border px-4 py-3">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tool Input Configuration</Label>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Choose which parameters stay AI-driven and which ones are hardcoded before execution.
                            </p>
                          </div>

                          {activeTool && tempSelectedTools.includes(activeTool.name) ? (
                            <div className="max-h-[420px] space-y-4 overflow-y-auto px-4 py-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-mono text-xs font-semibold text-foreground">{activeTool.name}</p>
                                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-500">
                                    {activeToolProperties.length} inputs
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                  {activeTool.description || "Configure optional defaults for this tool. Manual values override AI-generated arguments at runtime."}
                                </p>
                              </div>

                              {activeToolProperties.length > 0 ? (
                                <div className="space-y-3">
                                  {activeToolProperties.map(([argName, property]) => {
                                    const binding = tempToolConfigs[activeTool.name]?.[argName];
                                    const isManual = binding?.mode === "manual";
                                    const propertyType = String(property.type || "string");
                                    const isRequired = activeToolRequired.includes(argName);

                                    return (
                                      <div key={argName} className="rounded-xl border border-border bg-card/50 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="font-mono text-[11px] font-semibold text-foreground">{argName}</span>
                                              <span className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                                                {propertyType}
                                              </span>
                                              {isRequired ? (
                                                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-rose-500">
                                                  Required
                                                </span>
                                              ) : null}
                                            </div>
                                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                              {String(property.description || "No description provided.")}
                                            </p>
                                          </div>
                                          <div className="inline-flex rounded-full border border-border bg-accent/40 p-1">
                                            <button
                                              type="button"
                                              className={`rounded-full px-3 py-1 text-[10px] font-medium transition ${!isManual ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                                              onClick={() => setToolArgumentMode(activeTool.name, argName, "auto")}
                                            >
                                              AI Auto
                                            </button>
                                            <button
                                              type="button"
                                              className={`rounded-full px-3 py-1 text-[10px] font-medium transition ${isManual ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                                              onClick={() => setToolArgumentMode(activeTool.name, argName, "manual")}
                                            >
                                              Manual
                                            </button>
                                          </div>
                                        </div>

                                        {isManual ? (
                                          propertyType === "object" || propertyType === "array" ? (
                                            <Textarea
                                              value={binding?.value || ""}
                                              onChange={(event) => setToolArgumentValue(activeTool.name, argName, event.target.value)}
                                              placeholder={propertyType === "object" ? "{\"key\":\"value\"}" : "[\"value\"]"}
                                              className="mt-3 min-h-[96px] resize-y border-border bg-background text-xs text-foreground"
                                            />
                                          ) : propertyType === "boolean" ? (
                                            <select
                                              value={binding?.value || "true"}
                                              onChange={(event) => setToolArgumentValue(activeTool.name, argName, event.target.value)}
                                              className="mt-3 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                                            >
                                              <option value="true">true</option>
                                              <option value="false">false</option>
                                            </select>
                                          ) : (
                                            <Input
                                              value={binding?.value || ""}
                                              onChange={(event) => setToolArgumentValue(activeTool.name, argName, event.target.value)}
                                              placeholder={`Enter ${argName}`}
                                              className="mt-3 h-9 border-border bg-background text-sm text-foreground"
                                            />
                                          )
                                        ) : (
                                          <div className="mt-3 rounded-lg border border-dashed border-border bg-accent/10 px-3 py-2 text-[11px] text-muted-foreground">
                                            The agent will decide this parameter at runtime.
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border bg-accent/10 px-4 py-6 text-center text-xs text-muted-foreground">
                                  This tool does not expose configurable input fields.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-xs text-muted-foreground">
                              Select a checked tool to configure its inputs.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsToolModalOpen(false)} className="border-border bg-transparent text-foreground hover:bg-accent">Cancel</Button>
                    {selectedMcpId && mcpTools.some((item) => item.mcp_id === selectedMcpId) ? (
                      <Button variant="outline" onClick={disconnectToolSource} className="border-border bg-transparent text-foreground hover:bg-accent">
                        Disconnect Source
                      </Button>
                    ) : null}
                    <Button
                      disabled={!selectedMcpId || (tempSelectedTools.length === 0 && !mcpTools.some((item) => item.mcp_id === selectedMcpId))}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={saveToolSelection}
                    >
                      Save Selection
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              {mcpTools.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-accent/10 p-6 text-center">
                  <p className="text-xs font-medium text-muted-foreground">No external tool integrations connected yet.</p>
                </div>
              ) : (
                mcpTools.map((entry, index) => {
                  const integration = availableMcpIntegrations.find((item) => item.id === entry.mcp_id);
                  const availableToolCount = getCachedTools(integration).length;
                  const lockedInputCount = getManualBindingCount(normalizeToolSettings(entry.tool_settings));
                  return (
                    <div key={`${entry.mcp_id}-${index}`} className="rounded-2xl border border-border bg-card/80 transition-all hover:border-primary/20">
                      <button
                        type="button"
                        onClick={() => {
                          openToolModal(entry.mcp_id).catch(() => { });
                        }}
                        className="flex w-full flex-col items-start gap-3 p-4 text-left"
                      >
                        <div className="flex w-full items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                            <Zap className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {integration?.name || "Loading Tool Source..."}
                              </span>
                              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                                Connected
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {entry.tools.length} selected tools
                              {availableToolCount > 0 ? ` · ${availableToolCount} available` : ""}
                              {integration ? ` · ${integration.integration_type === "openapi" ? "OpenAPI" : "MCP"}` : ""}
                            </p>
                            {lockedInputCount > 0 ? (
                              <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-primary">
                                {lockedInputCount} manual tool input{lockedInputCount === 1 ? "" : "s"} configured
                              </p>
                            ) : null}
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {entry.tools.slice(0, 4).map((tool) => (
                            <span key={tool} className="rounded-full border border-border bg-accent/40 px-2 py-1 font-mono text-[10px] text-foreground">
                              {tool}
                            </span>
                          ))}
                          {entry.tools.length > 4 ? (
                            <span className="rounded-full border border-border bg-accent/20 px-2 py-1 text-[10px] text-muted-foreground">
                              +{entry.tools.length - 4} more
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <div className="flex items-center justify-between border-t border-border/70 px-4 py-2">
                        <span className="text-[10px] text-muted-foreground">
                          Click to manage tool selection
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[10px]"
                          onClick={() => refreshToolInventory(entry.mcp_id).catch(() => { })}
                        >
                          <RefreshCcw className="h-3 w-3" />
                          Refresh
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Examples (Text)</Label>
                <Textarea value={examples} onChange={(event) => setExamples(event.target.value)} placeholder="e.g. User: Hi / Agent: Hello! How can I help?" className="min-h-[50px] resize-y border-border bg-accent/20 text-sm text-foreground" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Structured Output (JSON)</Label>
                  <Dialog open={isStructuredOutputOpen} onOpenChange={setIsStructuredOutputOpen}>
                    {structuredOutput ? (
                      <Button variant="ghost" size="sm" className="h-6 border border-border bg-accent/50 px-2 text-[10px] text-foreground hover:bg-accent" onClick={() => { setStructuredOutput(""); setStructuredOutputError(""); }}>
                        <X className="mr-1 h-2.5 w-2.5" /> Clear
                      </Button>
                    ) : (
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 border border-border bg-accent/50 px-2 text-[10px] text-foreground hover:bg-accent">
                          <Plus className="mr-1 h-2.5 w-2.5" /> Add
                        </Button>
                      </DialogTrigger>
                    )}
                    <DialogContent className="border-border bg-card text-foreground sm:max-w-[480px]">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                          <span className="text-sm">Structured Output (JSON)</span>
                          <button
                            onClick={() => setStructuredOutput(`{\n  "name": "user_data",\n  "strict": true,\n  "schema": {\n    "type": "object",\n    "properties": {\n      "tweet": {\n        "type": "string",\n        "description": "Content of the tweet"\n      },\n      "title": {\n        "type": "string",\n        "description": "Title of the tweet"\n      }\n    },\n    "additionalProperties": false,\n    "required": ["tweet", "title"]\n  }\n}`)}
                            className="text-[10px] font-normal text-primary transition-colors hover:underline"
                          >
                            See sample
                          </button>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <Textarea
                          value={structuredOutput || ""}
                          onChange={(event) => {
                            setStructuredOutput(event.target.value);
                            if (structuredOutputError) setStructuredOutputError("");
                          }}
                          placeholder="Provide an example of structured output."
                          className={`min-h-[240px] resize-none border-border bg-accent/20 font-mono text-xs text-foreground ${structuredOutputError ? "focus-visible:ring-primary/50" : "focus-visible:ring-primary/20"}`}
                        />
                        {structuredOutputError ? <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">{structuredOutputError}</p> : null}
                      </div>
                      <DialogFooter>
                        <Button
                          className="h-8 bg-primary px-6 text-xs text-primary-foreground hover:bg-primary/90"
                          onClick={() => {
                            if (!structuredOutput.trim()) {
                              setStructuredOutputError("");
                              setIsStructuredOutputOpen(false);
                              return;
                            }
                            try {
                              JSON.parse(structuredOutput);
                              setStructuredOutputError("");
                              setIsStructuredOutputOpen(false);
                            } catch (error: unknown) {
                              setStructuredOutputError(`Invalid JSON format: ${error instanceof Error ? error.message : "Unknown error"}`);
                            }
                          }}
                        >
                          Validate
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {structuredOutput ? (
                  <div onClick={() => setIsStructuredOutputOpen(true)} className="mt-1 cursor-pointer break-all rounded border border-green-500/20 bg-green-500/5 p-2 font-mono text-[10px] text-green-400 transition-colors hover:bg-green-500/10">
                    {structuredOutput}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="h-4" />
        </div>

        <div className="w-[220px] shrink-0 overflow-y-auto border-l border-border bg-accent/10 p-3">
          <Label className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Core Features</Label>
          <div className="space-y-1">
            {FEATURE_LIST.map((feature) => (
              <div
                key={feature.key}
                className={`rounded-md border p-2 transition-all ${features[feature.key] ? "border-green-500/30 bg-green-500/10" : "border-border bg-background"
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-foreground">{feature.label}</span>
                    {feature.key === "knowledge_base" ? (
                      <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                        {selectedKbId ? "Configured knowledge source ready for retrieval." : "Select a knowledge base and retrieval mode."}
                      </p>
                    ) : null}
                    {feature.key === "scheduler" ? (
                      <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                        {schedulerConfigs.length > 0 ? `${schedulerConfigs.length} scheduled run${schedulerConfigs.length === 1 ? "" : "s"} configured.` : "Configure recurring agent runs."}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={features[feature.key]}
                    onCheckedChange={(checked) => handleFeatureToggle(feature.key, checked)}
                    className="mt-0.5 scale-[0.55]"
                  />
                </div>
                {(feature.key === "knowledge_base" || feature.key === "scheduler") && features[feature.key] ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-6 w-full justify-start px-2 text-[10px]"
                    onClick={() => {
                      if (feature.key === "knowledge_base") openKnowledgeBaseConfig();
                      if (feature.key === "scheduler") openSchedulerConfig();
                    }}
                  >
                    Configure
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={kbConfigOpen} onOpenChange={setKbConfigOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Configure Knowledge Base</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" value="rag" checked={normalizeKbType(kbType) === "rag"} onChange={(event) => setKbType(event.target.value)} className="accent-primary" />
                <span className="text-sm font-medium">RAG</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" value="agentic_rag" checked={normalizeKbType(kbType) === "agentic_rag"} onChange={(event) => setKbType(event.target.value)} className="accent-primary" />
                <span className="text-sm font-medium">Agentic RAG</span>
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Knowledge Base</Label>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                  value={selectedKbId}
                  onChange={(event) => setSelectedKbId(event.target.value)}
                >
                  <option value="">Select Knowledge Base...</option>
                  {availableKbs.map((kb) => (
                    <option key={kb.id} value={kb.id}>{kb.name}</option>
                  ))}
                </select>
                <Button onClick={() => window.open("/dashboard/knowledge-bases", "_blank")} className="h-9 shrink-0 border border-primary/20 bg-primary/10 px-3 text-xs text-primary hover:bg-primary/20">
                  Create New
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Number of Chunks</Label>
              <Input type="number" value={kbChunks} onChange={(event) => setKbChunks(parseInt(event.target.value || "0", 10))} className="border-border bg-background" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Retrieval Type</Label>
              <select className="h-9 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20" value={kbRetrievalType} onChange={(event) => setKbRetrievalType(event.target.value)}>
                <option value="basic">Basic</option>
                <option value="mmr">MMR</option>
                <option value="hyde">HyDE</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Score Threshold: <span className="normal-case font-bold text-primary">{kbScoreThreshold}</span>
              </Label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={parseFloat(kbScoreThreshold)}
                onChange={(event) => setKbScoreThreshold(event.target.value)}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-accent accent-primary transition-all hover:h-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (!selectedKbId) {
                  toast.error("Select a knowledge base before enabling it");
                  return;
                }
                setKbType(normalizeKbType(kbType));
                setFeatures({ ...features, knowledge_base: true });
                setKbConfigOpen(false);
              }}
            >
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schedulerConfigOpen} onOpenChange={setSchedulerConfigOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden border-border bg-card text-foreground sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Configure Scheduler
            </DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 gap-4 py-2 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-hidden rounded-2xl border border-border bg-accent/15">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Schedules</div>
                  <div className="mt-1 text-xs text-muted-foreground">Create one or more recurring prompts for this agent.</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-[11px]"
                  onClick={() => {
                    setSchedulerDrafts((current) => [...current, createEmptySchedule()]);
                    setActiveScheduleIndex(schedulerDrafts.length);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              <div className="max-h-[56vh] space-y-2 overflow-y-auto p-3">
                {schedulerDrafts.map((schedule, index) => (
                  <button
                    key={schedule.id || `${schedule.name}-${index}`}
                    type="button"
                    onClick={() => setActiveScheduleIndex(index)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      activeScheduleIndex === index
                        ? "border-primary/30 bg-primary/8"
                        : "border-border bg-background hover:border-primary/20 hover:bg-accent/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{schedule.name || "Scheduled Run"}</div>
                        <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{describeSchedule(schedule)}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        schedule.is_active ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500" : "border border-border bg-accent/50 text-muted-foreground"
                      }`}>
                        {schedule.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    {schedule.last_status ? (
                      <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Last run: {schedule.last_status}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-background/60 p-4">
              {activeSchedule ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Schedule Name</Label>
                      <Input
                        value={activeSchedule.name}
                        onChange={(event) => updateActiveSchedule({ name: event.target.value })}
                        placeholder="e.g. Monday Sales Digest"
                        className="h-9 border-border bg-transparent text-sm text-foreground"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Timezone</Label>
                      <select
                        value={normalizeScheduleTimezone(activeSchedule.timezone)}
                        onChange={(event) => updateActiveSchedule({ timezone: normalizeScheduleTimezone(event.target.value) })}
                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                      >
                        {SCHEDULER_TIMEZONE_OPTIONS.map((timezone) => (
                          <option key={timezone} value={timezone}>
                            {timezone === "Asia/Kolkata" ? `${timezone} (IST)` : timezone}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Prompt</Label>
                    <Textarea
                      value={activeSchedule.prompt}
                      onChange={(event) => updateActiveSchedule({ prompt: event.target.value })}
                      placeholder="What should the agent do when this schedule runs?"
                      className="min-h-[110px] resize-y border-border bg-accent/20 text-sm text-foreground"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-accent/20 p-2">
                    {[
                      { value: "daily", label: "Daily" },
                      { value: "weekly", label: "Weekly" },
                      { value: "monthly", label: "Monthly" },
                      { value: "yearly", label: "Yearly" },
                      { value: "interval", label: "Interval" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateActiveSchedule({ frequency: option.value as AgentScheduleConfig["frequency"] })}
                        className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                          activeSchedule.frequency === option.value
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-background hover:text-foreground"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-border bg-card/40 p-4 sm:grid-cols-2">
                    {activeSchedule.frequency !== "interval" ? (
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" /> Time
                        </Label>
                        <Input
                          type="time"
                          value={activeSchedule.time_of_day}
                          onChange={(event) => updateActiveSchedule({ time_of_day: event.target.value || "09:00" })}
                          className="h-9 border-border bg-transparent text-sm text-foreground"
                        />
                      </div>
                    ) : null}

                    {activeSchedule.frequency === "interval" ? (
                      <>
                        <div className="space-y-1.5">
                          <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            <Repeat2 className="h-3.5 w-3.5" /> Every
                          </Label>
                          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                            <Input
                              type="number"
                              min={1}
                              value={activeSchedule.interval_value ?? 1}
                              onChange={(event) => updateActiveSchedule({ interval_value: Number(event.target.value || 1) })}
                              className="h-9 border-border bg-transparent text-sm text-foreground"
                            />
                            <select
                              value={activeSchedule.interval_unit || "hours"}
                              onChange={(event) => updateActiveSchedule({ interval_unit: event.target.value as AgentScheduleConfig["interval_unit"] })}
                              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                            >
                              <option value="minutes">Minutes</option>
                              <option value="hours">Hours</option>
                              <option value="days">Days</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" /> Anchor Time
                          </Label>
                          <Input
                            type="time"
                            value={activeSchedule.time_of_day}
                            onChange={(event) => updateActiveSchedule({ time_of_day: event.target.value || "09:00" })}
                            className="h-9 border-border bg-transparent text-sm text-foreground"
                          />
                        </div>
                      </>
                    ) : null}

                    {activeSchedule.frequency === "weekly" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Days</Label>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAY_OPTIONS.map((weekday) => {
                            const isSelected = activeSchedule.weekdays.includes(weekday.value);
                            return (
                              <button
                                key={weekday.value}
                                type="button"
                                onClick={() => {
                                  const nextDays = isSelected
                                    ? activeSchedule.weekdays.filter((day) => day !== weekday.value)
                                    : [...activeSchedule.weekdays, weekday.value];
                                  updateActiveSchedule({ weekdays: nextDays });
                                }}
                                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                  isSelected
                                    ? "bg-foreground text-background"
                                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {weekday.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {activeSchedule.frequency === "monthly" ? (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Day Of Month</Label>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={activeSchedule.day_of_month ?? 1}
                          onChange={(event) => updateActiveSchedule({ day_of_month: Number(event.target.value || 1) })}
                          className="h-9 border-border bg-transparent text-sm text-foreground"
                        />
                      </div>
                    ) : null}

                    {activeSchedule.frequency === "yearly" ? (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Month</Label>
                          <select
                            value={activeSchedule.month_of_year ?? 1}
                            onChange={(event) => updateActiveSchedule({ month_of_year: Number(event.target.value) })}
                            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                          >
                            {MONTH_OPTIONS.map((month) => (
                              <option key={month.value} value={month.value}>
                                {month.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Day</Label>
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            value={activeSchedule.day_of_month ?? 1}
                            onChange={(event) => updateActiveSchedule({ day_of_month: Number(event.target.value || 1) })}
                            className="h-9 border-border bg-transparent text-sm text-foreground"
                          />
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-border bg-accent/15 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Schedule Preview</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{describeSchedule(activeSchedule)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Timezone: {activeSchedule.timezone}</div>
                        {activeSchedule.cron_expression ? (
                          <div className="mt-1 font-mono text-[11px] text-primary">{activeSchedule.cron_expression}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={activeSchedule.is_active}
                          onCheckedChange={(checked) => updateActiveSchedule({ is_active: checked })}
                        />
                        <span className="text-xs text-muted-foreground">{activeSchedule.is_active ? "Active" : "Paused"}</span>
                      </div>
                    </div>
                    {activeSchedule.last_run_at ? (
                      <div className="mt-3 text-[11px] text-muted-foreground">
                        Last run: {new Date(activeSchedule.last_run_at).toLocaleString()}
                        {activeSchedule.last_status ? ` · ${activeSchedule.last_status}` : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                      onClick={() => {
                        const nextDrafts = schedulerDrafts.filter((_, index) => index !== activeScheduleIndex);
                        setSchedulerDrafts(nextDrafts);
                        setActiveScheduleIndex(Math.max(0, activeScheduleIndex - 1));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove Schedule
                    </Button>
                    {!createdAgentId ? (
                      <div className="text-[11px] text-muted-foreground">Schedules will be provisioned after the agent is first saved.</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Add a schedule to get started.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedulerConfigOpen(false)} className="border-border bg-transparent text-foreground hover:bg-accent">
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={saveSchedulerConfig}>
              Save Scheduler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex shrink-0 justify-end border-t border-border bg-background px-4 py-2">
        <Button className="h-8 bg-primary px-6 text-xs font-bold text-primary-foreground hover:bg-primary/90" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : createdAgentId ? "Update Agent" : "Create Agent"}
        </Button>
      </div>
    </div>
  );
}

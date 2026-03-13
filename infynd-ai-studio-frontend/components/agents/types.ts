export interface Workspace {
  id: string;
  name: string;
}

export interface CoreFeatures {
  knowledge_base: boolean;
  data_query: boolean;
  scheduler: boolean;
  webhook_trigger: boolean;
  memory: boolean;
}

export interface WorkerAgentLink {
  agent_id: string;
  description: string;
}

export type ToolArgumentMode = "auto" | "manual";

export interface ToolArgumentBinding {
  mode: ToolArgumentMode;
  value: string;
}

export interface ToolSettingConfig {
  tool_name: string;
  arguments?: Record<string, ToolArgumentBinding>;
}

export interface McpToolConfig {
  mcp_id: string;
  tools: string[];
  tool_settings?: ToolSettingConfig[];
}

export interface KbConfig {
  type: string;
  kb_id: string;
  chunks: number;
  retrieval_type: string;
  score_threshold: string;
}

export type ScheduleFrequency = "daily" | "weekly" | "monthly" | "yearly" | "interval";
export type ScheduleIntervalUnit = "minutes" | "hours" | "days";

export interface AgentScheduleConfig {
  id?: string;
  name: string;
  prompt: string;
  timezone: string;
  is_active: boolean;
  frequency: ScheduleFrequency;
  time_of_day: string;
  weekdays: number[];
  day_of_month?: number | null;
  month_of_year?: number | null;
  interval_value?: number | null;
  interval_unit?: ScheduleIntervalUnit;
  cron_expression?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_response?: Record<string, unknown> | null;
}

export interface SchedulerConfigPayload {
  schedules: AgentScheduleConfig[];
}

export interface AgentFlowData {
  model: string;
  role: string;
  goal: string;
  instructions: string;
  examples: string;
  structured_output: string;
  is_manager_agent: boolean;
  enable_thinking: boolean;
  features: CoreFeatures;
  mcp_tools: McpToolConfig[];
  worker_agents: WorkerAgentLink[];
  custom_url: string;
  custom_model_name: string;
  custom_api_key: string;
  kb_config: KbConfig | null;
  scheduler_config: SchedulerConfigPayload | null;
}

export interface AgentRecord {
  id: string;
  workspace_id?: string;
  name: string;
  description?: string;
  is_published: boolean;
  flow_data?: Partial<AgentFlowData>;
}

export interface BuilderMessage {
  role: string;
  content: string;
}

export interface RuntimeMessage {
  role: string;
  content: string;
  thinking?: string;
}

export type BuilderGraphNodeKind = "root" | "worker" | "tool";

export interface BuilderGraphNode {
  id: string;
  kind: BuilderGraphNodeKind;
  label: string;
  subtitle?: string;
  role?: string;
  tool_count?: number;
  parent_agent_id?: string | null;
  position: {
    x: number;
    y: number;
  };
}

export interface BuilderGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  kind?: "agent-link" | "tool-link";
}

export interface BuilderGraph {
  nodes: BuilderGraphNode[];
  edges: BuilderGraphEdge[];
}

export interface BuilderChatResponse {
  reply: string;
  root_agent: AgentRecord | null;
  sub_agents: AgentRecord[];
  selected_agent_id: string | null;
  graph: BuilderGraph;
}

export interface McpCachedTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpIntegrationRecord {
  id: string;
  workspace_id?: string;
  name: string;
  integration_type: string;
  is_active?: boolean;
  is_global?: boolean;
  config?: {
    cached_tools?: McpCachedTool[];
    cached_tool_count?: number;
    cached_tools_updated_at?: string;
    cached_tools_error?: string;
    openapi_schema?: Record<string, unknown>;
    transport_type?: string;
    [key: string]: unknown;
  };
}

export const DEFAULT_SCHEDULER_TIMEZONE = "Asia/Kolkata";
export const SCHEDULER_TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "UTC",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

export function toEditableText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function normalizeKbType(value?: string | null): string {
  const normalized = String(value || "rag").trim().toLowerCase();
  if (normalized === "agentic" || normalized === "agentic_rag") return "agentic_rag";
  return "rag";
}

export function normalizeScheduleTimezone(value?: string | null): string {
  const candidate = String(value || DEFAULT_SCHEDULER_TIMEZONE).trim() || DEFAULT_SCHEDULER_TIMEZONE;
  const aliases: Record<string, string> = {
    ist: DEFAULT_SCHEDULER_TIMEZONE,
    india: DEFAULT_SCHEDULER_TIMEZONE,
    "asia/calcutta": DEFAULT_SCHEDULER_TIMEZONE,
    "utc+5:30": DEFAULT_SCHEDULER_TIMEZONE,
  };
  const normalized = aliases[candidate.toLowerCase()] || candidate;
  return normalized;
}

export function getLocalTimezone(): string {
  return DEFAULT_SCHEDULER_TIMEZONE;
}

export function createEmptySchedule(): AgentScheduleConfig {
  return {
    name: "Scheduled Run",
    prompt: "",
    timezone: getLocalTimezone(),
    is_active: true,
    frequency: "weekly",
    time_of_day: "09:00",
    weekdays: [1],
    day_of_month: 1,
    month_of_year: 1,
    interval_value: 1,
    interval_unit: "hours",
  };
}

export function normalizeSchedulerConfigs(value: unknown): AgentScheduleConfig[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "object" && value && Array.isArray((value as { schedules?: unknown[] }).schedules)
      ? (value as { schedules: unknown[] }).schedules
      : [];

  return raw
    .filter((item): item is Partial<AgentScheduleConfig> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      name: typeof item.name === "string" && item.name.trim() ? item.name : "Scheduled Run",
      prompt: typeof item.prompt === "string" ? item.prompt : "",
      timezone: normalizeScheduleTimezone(typeof item.timezone === "string" ? item.timezone : getLocalTimezone()),
      is_active: item.is_active !== false,
      frequency: (["daily", "weekly", "monthly", "yearly", "interval"].includes(String(item.frequency)) ? item.frequency : "weekly") as ScheduleFrequency,
      time_of_day: typeof item.time_of_day === "string" && item.time_of_day.trim() ? item.time_of_day : "09:00",
      weekdays: Array.isArray(item.weekdays)
        ? item.weekdays
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [1],
      day_of_month: item.day_of_month == null ? null : Number(item.day_of_month),
      month_of_year: item.month_of_year == null ? null : Number(item.month_of_year),
      interval_value: item.interval_value == null ? null : Number(item.interval_value),
      interval_unit: (["minutes", "hours", "days"].includes(String(item.interval_unit)) ? item.interval_unit : "hours") as ScheduleIntervalUnit,
      cron_expression: typeof item.cron_expression === "string" ? item.cron_expression : null,
      last_run_at: typeof item.last_run_at === "string" ? item.last_run_at : null,
      last_status: typeof item.last_status === "string" ? item.last_status : null,
      last_response: typeof item.last_response === "object" && item.last_response ? (item.last_response as Record<string, unknown>) : null,
    }));
}

export function buildSchedulerConfigPayload(schedules: AgentScheduleConfig[]): SchedulerConfigPayload | null {
  const normalized = normalizeSchedulerConfigs(schedules);
  return normalized.length ? { schedules: normalized } : null;
}

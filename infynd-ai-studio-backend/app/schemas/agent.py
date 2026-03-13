from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

class AgentBase(BaseModel):
    name: str = Field(..., description="The name of the agent")
    description: Optional[str] = Field(None, description="A brief description of the agent's purpose")
    is_published: bool = Field(False, description="Whether the agent is published/active")
    flow_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Configuration for the agent behavior (model, role, goal, etc.)")

class AgentCreate(AgentBase):
    pass

class AgentUpdate(AgentBase):
    name: Optional[str] = None
    
class AgentResponse(AgentBase):
    id: str
    workspace_id: Optional[str] = None
    created_by: Optional[str] = None
    
    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    message: str = Field(..., description="User message to send to the agent")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list, 
        description="Optional list of previous messages in format [{'role': 'user', 'content': 'hi'}]"
    )
    stream: bool = Field(False, description="Enable streaming response via SSE")
    enable_thinking: bool = Field(False, description="Enable thinking/reasoning for supported models (e.g. Qwen3, DeepSeek)")

class ChatResponse(BaseModel):
    reply: str
    model_used: str
    thinking: Optional[str] = None


class AgentScheduleConfig(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., description="Human readable schedule name")
    prompt: str = Field(..., description="Message to send to the agent when the schedule runs")
    timezone: str = Field("UTC", description="IANA timezone used when converting the schedule to cron")
    is_active: bool = Field(True, description="Whether the schedule is currently active")
    frequency: Literal["daily", "weekly", "monthly", "yearly", "interval"] = Field(..., description="Schedule recurrence type")
    time_of_day: Optional[str] = Field("09:00", description="Time in HH:MM format")
    weekdays: List[int] = Field(default_factory=list, description="Selected weekdays using cron numbering where Sunday=0")
    day_of_month: Optional[int] = Field(None, description="Day of month for monthly/yearly schedules")
    month_of_year: Optional[int] = Field(None, description="Month of year for yearly schedules")
    interval_value: Optional[int] = Field(None, description="Interval amount for interval schedules")
    interval_unit: Optional[Literal["minutes", "hours", "days"]] = Field(None, description="Interval unit for interval schedules")
    cron_expression: Optional[str] = Field(None, description="Resolved cron expression in UTC")
    last_run_at: Optional[str] = None
    last_status: Optional[str] = None
    last_response: Optional[Dict[str, Any]] = None


class AgentScheduleConfigPayload(BaseModel):
    schedules: List[AgentScheduleConfig] = Field(default_factory=list)


class AgentScheduledRunResponse(ChatResponse):
    schedule_id: str
    agent_id: str


class AgentAutoBuildRequest(BaseModel):
    prompt: str = Field(..., description="Natural language request describing the agent or manager-agent setup")
    workspace_id: str = Field(..., description="Workspace where the generated agent should be saved")
    agent_id: Optional[str] = Field(None, description="Existing agent to update instead of creating a new one")
    history: Optional[List[Dict[str, str]]] = Field(
        default_factory=list,
        description="Optional builder chat history in format [{'role': 'user', 'content': '...'}]",
    )
    model: Optional[str] = Field(None, description="Preferred planning model for the builder")
    current_config: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Current agent configuration to refine during iterative edits",
    )


class AgentAutoBuildResponse(BaseModel):
    reply: str
    agent: AgentResponse
    worker_agents: List[AgentResponse] = Field(default_factory=list)
    generated_config: Dict[str, Any] = Field(default_factory=dict)


class AgentBuilderChatRequest(BaseModel):
    workspace_id: str = Field(..., description="Workspace where the agent flow is being built")
    message: str = Field(..., description="Latest builder chat message")
    root_agent_id: Optional[str] = Field(None, description="Current root/manager agent being edited")
    selected_agent_id: Optional[str] = Field(None, description="Currently selected agent in the builder UI")
    history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Iterative builder chat history",
    )


class AgentBuilderGraphNode(BaseModel):
    id: str
    type: str
    label: str
    role: Optional[str] = None
    tool_count: int = 0


class AgentBuilderGraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class AgentBuilderGraph(BaseModel):
    nodes: List[AgentBuilderGraphNode] = Field(default_factory=list)
    edges: List[AgentBuilderGraphEdge] = Field(default_factory=list)


class AgentBuilderChatResponse(BaseModel):
    reply: str
    root_agent: Optional[AgentResponse] = None
    sub_agents: List[AgentResponse] = Field(default_factory=list)
    selected_agent_id: Optional[str] = None
    graph: AgentBuilderGraph = Field(default_factory=AgentBuilderGraph)

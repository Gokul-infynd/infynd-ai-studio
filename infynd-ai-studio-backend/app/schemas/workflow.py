from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class WorkflowBase(BaseModel):
    name: str = Field(..., description="The name of the workflow")
    description: Optional[str] = Field(None, description="Brief description of the workflow")
    is_published: bool = Field(False, description="Whether the workflow is published/active")
    flow_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Configuration for the Langflow graph")

class WorkflowCreate(WorkflowBase):
    workspace_id: str

class WorkflowUpdate(WorkflowBase):
    name: Optional[str] = None

class WorkflowResponse(WorkflowBase):
    id: str
    workspace_id: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class WorkflowExecuteRequest(BaseModel):
    inputs: Dict[str, Any] = Field(..., description="Inputs parameters to the workflow graph")

class WorkflowExecuteResponse(BaseModel):
    run_id: str
    status: str
    outputs: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

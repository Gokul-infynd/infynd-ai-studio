import re
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, List

class MCPConfigBase(BaseModel):
    command: str = Field(..., description="The executable command (e.g. npx, python, node)")
    args: List[str] = Field(default_factory=list, description="Arguments to pass to the command")
    env: Dict[str, str] = Field(default_factory=dict, description="Environment variables")

class MCPIntegrationCreate(BaseModel):
    name: str = Field(..., description="Name for the integration")
    integration_type: str = Field(default="custom", description="Identifier like 'fetch', 'postgresql', 'custom', 'openapi'")
    config: Dict[str, Any] = Field(..., description="Configuration object. Varies by integration_type.")
    workspace_id: Optional[str] = None
    is_global: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not re.fullmatch(r"[a-z]+(?:[_-][a-z]+)*", cleaned):
            raise ValueError("Name must use lowercase letters only, with optional underscores or hyphens, and no spaces")
        return cleaned

class MCPIntegrationResponse(BaseModel):
    id: str
    workspace_id: Optional[str] = None
    integration_type: str
    name: Optional[str] = None
    config: Any
    is_active: bool
    is_global: bool = False
    
    class Config:
        from_attributes = True

class MCPToolResponse(BaseModel):
    name: str
    description: str
    inputSchema: Any

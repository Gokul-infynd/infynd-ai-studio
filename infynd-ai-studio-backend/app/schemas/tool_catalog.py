from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProviderCredentialField(BaseModel):
    key: str
    label: str
    source: str
    configured: bool = False


class ToolCatalogItem(BaseModel):
    id: str
    name: str
    description: str = ""
    provider_id: str
    provider_name: str
    integration_id: str
    credential_keys: List[str] = Field(default_factory=list)
    input_schema: Optional[Dict[str, Any]] = None


class ToolProviderCatalog(BaseModel):
    provider_id: str
    provider_name: str
    integration_id: str
    integration_type: str
    is_global: bool = False
    tool_count: int = 0
    tools: List[ToolCatalogItem] = Field(default_factory=list)
    credentials: List[ProviderCredentialField] = Field(default_factory=list)
    discovery_error: Optional[str] = None

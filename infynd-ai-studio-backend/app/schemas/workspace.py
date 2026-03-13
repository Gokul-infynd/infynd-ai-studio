from pydantic import BaseModel, Field
from typing import Optional


class WorkspaceCreate(BaseModel):
    name: str = Field(..., description="The name of the workspace")


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    plan_tier: Optional[str] = "free"

    class Config:
        from_attributes = True

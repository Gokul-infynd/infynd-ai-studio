from fastapi import APIRouter
from app.api.v1.endpoints import auth, agents, workspaces, mcp, knowledge_bases, workflows

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(agents.router, prefix="/agents", tags=["Agents"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
api_router.include_router(mcp.router, prefix="/mcp", tags=["MCP Integrations"])
api_router.include_router(knowledge_bases.router, prefix="/knowledge-bases", tags=["Knowledge Bases"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["Workflows"])

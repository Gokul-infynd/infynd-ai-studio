from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Tuple
from supabase import Client
import logging

from app.schemas.mcp import MCPIntegrationCreate, MCPIntegrationResponse, MCPToolResponse
from app.api.deps import get_current_user, get_supabase_client_for_request, get_current_admin, get_admin_db

from app.utils.tool_catalog import get_cached_integration_tools, refresh_integration_tool_cache
 
logger = logging.getLogger(__name__)
router = APIRouter()


def _fetch_accessible_integration(mcp_id: str, user_db: Client, admin_db: Client) -> Tuple[dict, bool]:
    user_res = user_db.table("mcp_integrations").select("*").eq("id", mcp_id).execute()
    if user_res.data:
        return user_res.data[0], False

    admin_res = admin_db.table("mcp_integrations").select("*").eq("id", mcp_id).eq("is_global", True).execute()
    if admin_res.data:
        return admin_res.data[0], True

    raise HTTPException(status_code=404, detail="MCP integration not found or access denied")


def _persist_cached_config(admin_db: Client, integration: dict) -> dict:
    update_res = admin_db.table("mcp_integrations").update({"config": integration.get("config") or {}}).eq("id", integration["id"]).execute()
    if update_res.data:
        return update_res.data[0]
    return integration

@router.get("", response_model=List[MCPIntegrationResponse])
def get_mcp_integrations(
    ws_id: str = None,
    user_db: Client = Depends(get_supabase_client_for_request),
    admin_db: Client = Depends(get_admin_db),
    current_user = Depends(get_current_user)
):
    """Get MCP integrations. Fetches both global (bypassing RLS) and workspace-specific integrations (RLS enforced)."""
    try:
        # Fetch global integrations using admin_db (bypasses RLS filtering)
        global_res = admin_db.table("mcp_integrations").select("*").eq("is_global", True).execute()
        results = global_res.data or []
        print(f"DEBUG: Fetched {len(results)} global tools")
        
        # Fetch workspace-specific integrations using user_db (standard RLS policy applies)
        if ws_id:
            ws_res = user_db.table("mcp_integrations").select("*").eq("workspace_id", ws_id).execute()
            ws_data = ws_res.data or []
            print(f"DEBUG: Fetched {len(ws_data)} workspace tools for {ws_id}")
            # Merge while avoiding duplicates if any
            existing_ids = {item["id"] for item in results}
            for item in ws_data:
                if item["id"] not in existing_ids:
                    results.append(item)
                    
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=MCPIntegrationResponse, status_code=status.HTTP_201_CREATED)
async def create_mcp_integration(
    mcp_in: MCPIntegrationCreate,
    admin_db: Client = Depends(get_admin_db),
    current_user = Depends(get_current_user)
):
    """Create a new MCP integration config. Uses admin client to ensure global tools can be created by admins."""
    try:
        # Only admins can create global integrations
        if mcp_in.is_global:
            if not current_user.is_admin:
                 raise HTTPException(status_code=403, detail="Only admins can create global integrations")

        data = mcp_in.model_dump()
        res = admin_db.table("mcp_integrations").insert(data).execute()
        if not res.data:
            raise Exception("Could not create MCP integration")
        created = res.data[0]
        try:
            refreshed, _, discovery_error = await refresh_integration_tool_cache(created)
            persisted = _persist_cached_config(admin_db, refreshed)
            if discovery_error:
                logger.warning("Initial tool discovery failed for %s: %s", created["id"], discovery_error)
            return persisted
        except Exception as discovery_exc:
            logger.warning("Initial tool discovery crashed for %s: %s", created["id"], discovery_exc)
            return created
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{mcp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mcp_integration(
    mcp_id: str,
    admin_db: Client = Depends(get_admin_db),
    current_user = Depends(get_current_user)
):
    """Delete an MCP integration."""
    try:
        # Check if it's global and if user is admin
        check_res = admin_db.table("mcp_integrations").select("is_global").eq("id", mcp_id).execute()
        if check_res.data and check_res.data[0].get("is_global"):
            if not current_user.is_admin:
                 raise HTTPException(status_code=403, detail="Only admins can delete global integrations")

        admin_db.table("mcp_integrations").delete().eq("id", mcp_id).execute()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{mcp_id}/tools", response_model=List[MCPToolResponse])
async def test_mcp_tools(
    mcp_id: str,
    refresh: bool = False,
    user_db: Client = Depends(get_supabase_client_for_request),
    admin_db: Client = Depends(get_admin_db),
    current_user = Depends(get_current_user)
):
    """
    Spins up the MCP integration momentarily to fetch its available tools. 
    Supports stdio, sse, and openapi.
    Uses admin_db lookup to ensure global tools are accessible to all.
    """
    try:
        integration, _ = _fetch_accessible_integration(mcp_id, user_db, admin_db)
        cached_tools = get_cached_integration_tools(integration)
        if cached_tools and not refresh:
            return cached_tools

        refreshed, tools, discovery_error = await refresh_integration_tool_cache(integration)
        _persist_cached_config(admin_db, refreshed)
        if discovery_error and not tools:
            raise HTTPException(status_code=500, detail=f"Failed to connect and fetch tools: {discovery_error}")
        return tools
                
    except HTTPException:
        raise
    except Exception as e:
        def _unwrap_exception(exc):
            """Helper to extract the most descriptive part of an exception or ExceptionGroup."""
            if hasattr(exc, "exceptions") and exc.exceptions:
                return " | ".join([_unwrap_exception(x) for x in exc.exceptions])
            if hasattr(exc, "message"): # For some specific error objects
                return exc.message
            return str(exc)

        error_msg = _unwrap_exception(e)
        logger.error(f"MCP Tool Connection Failed: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Failed to connect and fetch tools: {error_msg}")


@router.post("/{mcp_id}/refresh-tools", response_model=MCPIntegrationResponse)
async def refresh_mcp_tools(
    mcp_id: str,
    user_db: Client = Depends(get_supabase_client_for_request),
    admin_db: Client = Depends(get_admin_db),
    current_user = Depends(get_current_user),
):
    try:
        integration, _ = _fetch_accessible_integration(mcp_id, user_db, admin_db)
        refreshed, tools, discovery_error = await refresh_integration_tool_cache(integration)
        persisted = _persist_cached_config(admin_db, refreshed)
        if discovery_error and not tools:
            raise HTTPException(status_code=500, detail=f"Failed to connect and fetch tools: {discovery_error}")
        return persisted
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

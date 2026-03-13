from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamable_http_client
from supabase import Client

from app.schemas.tool_catalog import ProviderCredentialField, ToolCatalogItem, ToolProviderCatalog
from app.utils.openapi import parse_openapi_to_tools


def slugify_provider(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"


def provider_identity(integration: Dict) -> Tuple[str, str]:
    config = integration.get("config") or {}
    provider_name = (
        config.get("provider_name")
        or config.get("provider")
        or integration.get("name")
        or integration.get("integration_type")
        or "Provider"
    )
    provider_id = slugify_provider(provider_name)
    return provider_id, provider_name


def extract_credentials(integration: Dict) -> List[ProviderCredentialField]:
    config = integration.get("config") or {}
    credentials: Dict[str, ProviderCredentialField] = {}

    def upsert(key: str, source: str, configured: bool):
        if not key:
            return
        norm_key = key.strip()
        credentials[norm_key] = ProviderCredentialField(
            key=norm_key,
            label=norm_key.replace("_", " ").replace("-", " ").title(),
            source=source,
            configured=configured,
        )

    for key, value in (config.get("env") or {}).items():
        upsert(str(key), "env", bool(value))

    for key, value in (config.get("headers") or {}).items():
        upsert(str(key), "header", bool(value))

    config_blob = json.dumps(config)
    for match in re.findall(r"\{\{\s*([A-Z0-9_]+)\s*\}\}", config_blob):
        upsert(match, "template", False)

    return list(credentials.values())


def normalize_tool_payload(tool: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": str(tool.get("name", "")).strip(),
        "description": str(tool.get("description") or "").strip(),
        "inputSchema": tool.get("inputSchema") or tool.get("input_schema") or {},
    }


def get_cached_integration_tools(integration: Dict) -> List[Dict]:
    config = integration.get("config") or {}
    cached_tools = config.get("cached_tools") or []
    if not cached_tools and integration.get("integration_type") == "openapi":
        cached_tools = parse_openapi_to_tools(config.get("openapi_schema", {}))
    normalized_tools = [normalize_tool_payload(tool) for tool in cached_tools]
    return [tool for tool in normalized_tools if tool.get("name")]


def build_cached_tool_config(config: Dict, tools: List[Dict], *, discovery_error: Optional[str] = None) -> Dict:
    next_config = dict(config or {})
    normalized_tools = [normalize_tool_payload(tool) for tool in tools]
    normalized_tools = [tool for tool in normalized_tools if tool.get("name")]
    next_config["cached_tools"] = normalized_tools
    next_config["cached_tool_count"] = len(normalized_tools)
    next_config["cached_tools_updated_at"] = datetime.now(timezone.utc).isoformat()
    if discovery_error:
        next_config["cached_tools_error"] = discovery_error
    else:
        next_config.pop("cached_tools_error", None)
    return next_config


async def discover_integration_tools(integration: Dict) -> List[Dict]:
    config = integration.get("config") or {}
    integration_type = integration.get("integration_type", "custom")
    transport_type = config.get("transport_type", "stdio")
    url = config.get("url")
    headers = config.get("headers", {})

    async def fetch_with_transport(transport_func, *args, **kwargs):
        async with transport_func(*args, **kwargs) as transport_data:
            if len(transport_data) == 3:
                read, write, _ = transport_data
            else:
                read, write = transport_data

            async with ClientSession(read, write) as session:
                await session.initialize()
                tools_res = await session.list_tools()
                return [
                    {
                        "name": tool.name,
                        "description": tool.description or "",
                        "inputSchema": tool.inputSchema,
                    }
                    for tool in tools_res.tools
                ]

    if integration_type == "openapi":
        return parse_openapi_to_tools(config.get("openapi_schema", {}))

    if transport_type in ["sse", "http"] or (transport_type == "stdio" and url):
        if not url:
            raise ValueError("URL is required for remote MCP transports")

        try:
            async with httpx.AsyncClient(headers=headers, timeout=20.0) as client:
                return await fetch_with_transport(streamable_http_client, url, http_client=client)
        except Exception:
            return await fetch_with_transport(sse_client, url=url, headers=headers)

    cmd = config.get("command")
    args = config.get("args", [])
    env = config.get("env", {})
    if not cmd:
        raise ValueError("MCP command is missing")

    server_params = StdioServerParameters(command=cmd, args=args, env=None if not env else env)
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_res = await session.list_tools()
            return [
                {
                    "name": tool.name,
                    "description": tool.description or "",
                    "inputSchema": tool.inputSchema,
                }
                for tool in tools_res.tools
            ]


async def refresh_integration_tool_cache(integration: Dict) -> Tuple[Dict, List[Dict], Optional[str]]:
    try:
        tools = await discover_integration_tools(integration)
        updated_config = build_cached_tool_config(integration.get("config") or {}, tools)
        return {**integration, "config": updated_config}, tools, None
    except Exception as exc:
        cached_tools = get_cached_integration_tools(integration)
        updated_config = build_cached_tool_config(
            integration.get("config") or {},
            cached_tools,
            discovery_error=str(exc),
        )
        return {**integration, "config": updated_config}, cached_tools, str(exc)


async def get_accessible_integrations(
    ws_id: Optional[str],
    user_db: Client,
    admin_db: Client,
) -> List[Dict]:
    global_res = admin_db.table("mcp_integrations").select("*").eq("is_global", True).execute()
    integrations = global_res.data or []

    if ws_id:
        ws_res = user_db.table("mcp_integrations").select("*").eq("workspace_id", ws_id).execute()
        existing_ids = {item["id"] for item in integrations}
        for item in ws_res.data or []:
            if item["id"] not in existing_ids:
                integrations.append(item)

    return integrations


async def get_tool_catalog(
    ws_id: Optional[str],
    user_db: Client,
    admin_db: Client,
    *,
    discover_tools: bool = True,
) -> List[ToolProviderCatalog]:
    integrations = await get_accessible_integrations(ws_id, user_db, admin_db)

    catalog: List[ToolProviderCatalog] = []
    for integration in integrations:
        provider_id, provider_name = provider_identity(integration)
        credentials = extract_credentials(integration)
        cached_tools = get_cached_integration_tools(integration)
        provider = ToolProviderCatalog(
            provider_id=provider_id,
            provider_name=provider_name,
            integration_id=integration["id"],
            integration_type=integration.get("integration_type", "custom"),
            is_global=integration.get("is_global", False),
            credentials=credentials,
            tools=[
                ToolCatalogItem(
                    id=f"{provider_id}:{tool['name']}",
                    name=tool["name"],
                    description=tool.get("description") or "",
                    provider_id=provider_id,
                    provider_name=provider_name,
                    integration_id=integration["id"],
                    credential_keys=[field.key for field in credentials],
                    input_schema=tool.get("inputSchema"),
                )
                for tool in cached_tools
            ],
            tool_count=len(cached_tools),
        )
        if discover_tools:
            try:
                tools = await discover_integration_tools(integration)
                provider.tools = [
                    ToolCatalogItem(
                        id=f"{provider.provider_id}:{tool['name']}",
                        name=tool["name"],
                        description=tool.get("description") or "",
                        provider_id=provider.provider_id,
                        provider_name=provider.provider_name,
                        integration_id=integration["id"],
                        credential_keys=[field.key for field in credentials],
                        input_schema=tool.get("inputSchema"),
                    )
                    for tool in tools
                ]
                provider.tool_count = len(provider.tools)
            except Exception as exc:
                provider.discovery_error = str(exc)
        catalog.append(provider)

    return catalog

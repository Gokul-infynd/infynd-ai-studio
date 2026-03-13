import json
import httpx
from typing import Dict, Any, List

def parse_openapi_to_tools(schema: Dict[str, Any]) -> List[Dict[str, Any]]:
    tools = []
    
    paths = schema.get("paths", {})
    servers = schema.get("servers", [])
    base_url = servers[0].get("url", "") if servers else ""
    
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
            
        for method, operation in path_item.items():
            if method.lower() not in ["get", "post", "put", "delete", "patch"]:
                continue
                
            name = operation.get("operationId")
            if not name:
                clean_path = path.replace("/", "_").replace("{", "").replace("}", "").replace("-", "_")
                if clean_path.startswith("_"):
                    clean_path = clean_path[1:]
                name = f"{method.lower()}_{clean_path}"
                
            desc = operation.get("summary") or operation.get("description") or f"{method.upper()} {path}"
            
            properties = {}
            required = []
            
            # Param parsing
            for param in operation.get("parameters", []):
                p_name = param.get("name")
                p_schema = param.get("schema", {})
                p_type = p_schema.get("type", "string")
                properties[p_name] = {
                    "type": p_type,
                    "description": param.get("description", "")
                }
                if param.get("required"):
                    required.append(p_name)
                    
            # Request Body parsing
            if "requestBody" in operation:
                content = operation["requestBody"].get("content", {})
                json_content = content.get("application/json", {})
                body_schema = json_content.get("schema", {})
                if "properties" in body_schema:
                    for k, v in body_schema["properties"].items():
                        properties[k] = v
                    if "required" in body_schema:
                        required.extend(body_schema["required"])
            
            inputSchema = {"type": "object", "properties": properties}
            if required:
                inputSchema["required"] = required
                
            tools.append({
                "name": name,
                "description": desc,
                "inputSchema": inputSchema,
                "path": path,
                "method": method.lower(),
                "base_url": base_url
            })
            
    return tools

async def execute_openapi_tool(
    tool_info: Dict[str, Any], 
    mcp_config: Dict[str, Any], 
    kwargs: Dict[str, Any]
) -> str:
    path = tool_info["path"]
    method = tool_info["method"]
    base_url = tool_info.get("base_url", "")
    
    # Merge defaults from config
    headers = mcp_config.get("default_headers", {})
    query_params = mcp_config.get("default_query", {})
    body_data = mcp_config.get("default_body", {})
    endpoint_defaults = mcp_config.get("endpoint_defaults", {})
    
    # URL construction
    url = f"{base_url}{path}"
    
    # Substitute path params
    for k, v in kwargs.items():
        if f"{{{k}}}" in url:
            url = url.replace(f"{{{k}}}", str(v))
            
    # Everything else goes to query or body based on method (oversimplified but works for most)
    for k, v in kwargs.items():
        if k not in kwargs:
            continue
        # Assuming if not in path, and method is GET -> query, POST -> json
        if method == "get":
            query_params[k] = str(v)
        else:
            body_data[k] = v
            
    async with httpx.AsyncClient() as client:
        try:
            req_kwargs = {"headers": headers, "params": query_params}
            if method in ["post", "put", "patch"]:
                req_kwargs["json"] = body_data
                
            response = await client.request(method.upper(), url, **req_kwargs)
            # return JSON or text
            try:
                return json.dumps(response.json(), indent=2)
            except:
                return response.text
        except Exception as e:
            return f"Error executing OpenAPI tool: {str(e)}"

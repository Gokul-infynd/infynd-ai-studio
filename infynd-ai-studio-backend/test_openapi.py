import json

schema = {
    "openapi": "3.0.0",
    "info": {"title": "Sample API", "version": "1.0.0"},
    "paths": {
        "/users": {
            "get": {
                "summary": "Get all users",
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer"}}
                ]
            }
        },
        "/users/{id}": {
            "get": {
                "summary": "Get user by ID",
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ]
            }
        }
    }
}

def get_openapi_tools(schema):
    tools = []
    paths = schema.get("paths", {})
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method.lower() not in ["get", "post", "put", "delete", "patch"]: continue
            name = operation.get("operationId", f"{method.lower()}_{path.replace('/', '_').replace('{', '').replace('}', '')}")
            desc = operation.get("summary", operation.get("description", f"{method.upper()} {path}"))
            
            # build inputSchema
            properties = {}
            required = []
            
            for param in operation.get("parameters", []):
                p_name = param.get("name")
                p_schema = param.get("schema", {"type": "string"})
                properties[p_name] = {"type": p_schema.get("type", "string"), "description": param.get("description", "")}
                if param.get("required"):
                    required.append(p_name)
                    
            if "requestBody" in operation:
                content = operation["requestBody"].get("content", {})
                json_content = content.get("application/json", {})
                body_schema = json_content.get("schema", {})
                # simplification
                if "properties" in body_schema:
                    for k, v in body_schema["properties"].items():
                        properties[k] = v
                    if "required" in body_schema:
                        required.extend(body_schema["required"])
            
            inputSchema = {
                "type": "object",
                "properties": properties,
            }
            if required:
                inputSchema["required"] = required
                
            tools.append({
                "name": name,
                "description": desc,
                "inputSchema": inputSchema,
                "path": path,
                "method": method
            })
            
    return tools

print(json.dumps(get_openapi_tools(schema), indent=2))

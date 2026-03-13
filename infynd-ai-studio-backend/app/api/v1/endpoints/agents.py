from fastapi import APIRouter, HTTPException, Depends, Header, status
from typing import List, Dict, Any, Optional, Tuple
import json
import os
import re
import hashlib
import logging
import base64
import asyncio
import traceback
from datetime import datetime
from contextlib import AsyncExitStack
from pydantic import create_model, Field

from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client
from mcp.client.session import ClientSession
import httpx
from supabase import Client
from starlette.responses import StreamingResponse

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent
from langchain_huggingface import HuggingFaceEmbeddings

from app.schemas.agent import (
    AgentAutoBuildRequest,
    AgentAutoBuildResponse,
    AgentBuilderChatRequest,
    AgentBuilderChatResponse,
    AgentBuilderGraph,
    AgentBuilderGraphEdge,
    AgentBuilderGraphNode,
    AgentCreate,
    AgentScheduleConfig,
    AgentScheduleConfigPayload,
    AgentScheduledRunResponse,
    AgentResponse,
    AgentUpdate,
    ChatRequest,
    ChatResponse,
)
from app.api.deps import get_admin_db, get_current_user, get_supabase_client_for_request
from app.utils.agent_schedules import (
    delete_agent_schedules,
    delete_schedule_by_id,
    flow_scheduler_config_payload,
    get_agent_schedule,
    get_user_schedule_overview,
    list_agent_schedules,
    list_user_schedule_runs,
    list_user_scheduled_tasks,
    mark_schedule_running,
    normalize_schedule_configs,
    record_schedule_result,
    set_schedule_active_state,
    sync_agent_schedules,
)
from app.utils.tool_catalog import get_tool_catalog
from app.utils.user_api_keys import validate_user_api_key

# ── Monkey-patch: preserve Gemini thought_signature for function/tool-call roundtrips ──
# Older langchain-google-genai builds drop thought_signature when converting:
# Part(function_call + thought_signature) -> AIMessage.tool_calls -> Content.parts
# which causes Gemini 2.5 tool calls to fail with HTTP 400.
try:
    import inspect
    import langchain_google_genai.chat_models as _gcm

    def _encode_thought_signature(value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            return value
        if isinstance(value, (bytes, bytearray)):
            return base64.b64encode(bytes(value)).decode("ascii")
        return None

    def _decode_thought_signature(value: Any) -> Optional[bytes]:
        if value is None:
            return None
        if isinstance(value, (bytes, bytearray)):
            return bytes(value)
        if isinstance(value, str):
            try:
                return base64.b64decode(value)
            except Exception:
                return value.encode("utf-8")
        return None

    parse_history_src = inspect.getsource(_gcm._parse_chat_history)
    if "thought_signature" not in parse_history_src:
        _orig_parse_chat_history = _gcm._parse_chat_history
        _orig_parse_response_candidate = _gcm._parse_response_candidate

        def _patched_parse_response_candidate(response_candidate, streaming: bool = False):
            message = _orig_parse_response_candidate(response_candidate, streaming=streaming)

            signatures: List[Optional[str]] = []
            for part in response_candidate.content.parts:
                if getattr(part, "function_call", None):
                    signatures.append(_encode_thought_signature(getattr(part, "thought_signature", None)))

            if not signatures:
                return message

            if isinstance(getattr(message, "additional_kwargs", None), dict):
                function_call = message.additional_kwargs.get("function_call")
                if isinstance(function_call, dict) and signatures[0]:
                    function_call["thought_signature"] = signatures[0]
                message.additional_kwargs["tool_call_thought_signatures"] = signatures

            return message

        def _patched_parse_chat_history(input_messages, convert_system_message_to_human: bool = False):
            system_instruction, messages = _orig_parse_chat_history(input_messages, convert_system_message_to_human)

            content_index = 0
            for msg_index, msg in enumerate(input_messages):
                if msg_index == 0 and isinstance(msg, _gcm.SystemMessage):
                    continue
                if content_index >= len(messages):
                    break

                content = messages[content_index]
                content_index += 1

                if not isinstance(msg, _gcm.AIMessage):
                    continue
                if getattr(content, "role", None) != "model":
                    continue
                if not getattr(content, "parts", None):
                    continue

                if msg.tool_calls:
                    signature_list: List[Optional[str]] = []
                    if isinstance(msg.additional_kwargs, dict):
                        raw_signatures = msg.additional_kwargs.get("tool_call_thought_signatures")
                        if isinstance(raw_signatures, list):
                            signature_list = [
                                item if isinstance(item, str) else None
                                for item in raw_signatures
                            ]
                    for part_idx, tool_call in enumerate(msg.tool_calls):
                        raw_signature = None
                        if part_idx < len(signature_list):
                            raw_signature = signature_list[part_idx]
                        if raw_signature is None:
                            raw_signature = tool_call.get("thought_signature")
                        signature = _decode_thought_signature(raw_signature)
                        if not signature:
                            continue
                        if part_idx < len(content.parts) and getattr(content.parts[part_idx], "function_call", None):
                            content.parts[part_idx].thought_signature = signature
                else:
                    raw_function_call = msg.additional_kwargs.get("function_call")
                    signature = None
                    if isinstance(raw_function_call, dict):
                        signature = _decode_thought_signature(raw_function_call.get("thought_signature"))
                    if signature and getattr(content.parts[0], "function_call", None):
                        content.parts[0].thought_signature = signature

            return system_instruction, messages

        _gcm._parse_response_candidate = _patched_parse_response_candidate
        _gcm._parse_chat_history = _patched_parse_chat_history

    logger_patch = logging.getLogger(__name__)
    logger_patch.info("Patched langchain-google-genai thought_signature roundtrip handling for Gemini tool calls")
except Exception:
    pass
# ── End monkey-patch ──────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

router = APIRouter()

# Global cache for embeddings to avoid reloading
_embeddings_model = None

SUPPORTED_AGENT_MODELS: List[Dict[str, Any]] = [
    {
        "provider": "OpenAI",
        "models": [
            {"value": "gpt-4.1", "label": "gpt-4.1"},
            {"value": "gpt-4.1-mini", "label": "gpt-4.1-mini"},
            {"value": "gpt-4o", "label": "gpt-4o"},
            {"value": "gpt-4o-mini", "label": "gpt-4o-mini"},
            {"value": "gpt-4-turbo", "label": "gpt-4-turbo"},
            {"value": "gpt-3.5-turbo", "label": "gpt-3.5-turbo"},
            {"value": "o3", "label": "o3"},
            {"value": "o3-mini", "label": "o3-mini"},
        ],
    },
    {
        "provider": "Google",
        "models": [
            {"value": "gemini/gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
            {"value": "gemini/gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
            {"value": "gemini/gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
            {"value": "gemini/gemini-3-flash-preview", "label": "Gemini 3 Flash Preview"},
            {"value": "gemini/gemini-3-pro-preview", "label": "Gemini 3 Pro Preview"},
        ],
    },
    {
        "provider": "Anthropic",
        "models": [
            {"value": "claude-3-haiku-20240307", "label": "Claude 3 Haiku"},
            {"value": "claude-3-sonnet-20240229", "label": "Claude 3 Sonnet"},
            {"value": "claude-3-opus-20240229", "label": "Claude 3 Opus"},
            {"value": "claude-3-5-sonnet-20241022", "label": "Claude 3.5 Sonnet"},
            {"value": "claude-3-7-sonnet-latest", "label": "Claude 3.7 Sonnet"},
        ],
    },
    {
        "provider": "Groq",
        "models": [
            {"value": "groq/llama-3.3-70b-versatile", "label": "Llama 3.3 70B Versatile"},
            {"value": "groq/llama-3.1-8b-instant", "label": "Llama 3.1 8B Instant"},
            {"value": "groq/mixtral-8x7b-32768", "label": "Mixtral 8x7B"},
            {"value": "groq/gemma2-9b-it", "label": "Gemma 2 9B"},
        ],
    },
    {
        "provider": "Perplexity",
        "models": [
            {"value": "perplexity/sonar", "label": "Sonar"},
            {"value": "perplexity/sonar-pro", "label": "Sonar Pro"},
            {"value": "perplexity/sonar-reasoning", "label": "Sonar Reasoning"},
        ],
    },
    {
        "provider": "Ollama (Local)",
        "models": [
            {"value": "ollama/llama3", "label": "Llama 3"},
            {"value": "ollama/llama3.1", "label": "Llama 3.1"},
            {"value": "ollama/mistral", "label": "Mistral"},
            {"value": "ollama/gemma2", "label": "Gemma 2"},
            {"value": "ollama/qwen2.5", "label": "Qwen 2.5"},
        ],
    },
    {
        "provider": "Custom (OpenAI Compatible)",
        "models": [
            {"value": "custom/openai", "label": "Custom Model"},
        ],
    },
]

def get_embeddings():
    global _embeddings_model
    if _embeddings_model is None:
        _embeddings_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings_model


def _supported_agent_model_values() -> List[str]:
    return [model["value"] for group in SUPPORTED_AGENT_MODELS for model in group["models"]]


def _default_agent_runtime_model() -> str:
    candidate = (
        os.environ.get("DEFAULT_AGENT_RUNTIME_MODEL")
        or os.environ.get("AGENT_DEFAULT_MODEL")
        or os.environ.get("DEFAULT_AGENT_MODEL")
        or "gpt-4o-mini"
    )
    return _normalize_model_value(candidate, fallback="gpt-4o-mini")


def _normalize_model_value(value: Any, fallback: Optional[str] = None) -> str:
    fallback_value = fallback or "gpt-4o-mini"
    supported_values = _supported_agent_model_values()
    raw_value = str(value or "").strip()
    if not raw_value:
        return fallback_value
    if raw_value in supported_values:
        return raw_value

    normalized = re.sub(r"[^a-z0-9]+", "", raw_value.lower())
    alias_pairs = {
        "gpt4o": "gpt-4o",
        "gpt4omini": "gpt-4o-mini",
        "gpt41": "gpt-4.1",
        "gpt41mini": "gpt-4.1-mini",
        "gpt4turbo": "gpt-4-turbo",
        "gpt35turbo": "gpt-3.5-turbo",
        "o3": "o3",
        "o3mini": "o3-mini",
        "gemini20flash": "gemini/gemini-2.0-flash",
        "gemini25flash": "gemini/gemini-2.5-flash",
        "gemini25pro": "gemini/gemini-2.5-pro",
        "gemini3flashpreview": "gemini/gemini-3-flash-preview",
        "gemini3propreview": "gemini/gemini-3-pro-preview",
        "claude3haiku": "claude-3-haiku-20240307",
        "claude3sonnet": "claude-3-sonnet-20240229",
        "claude3opus": "claude-3-opus-20240229",
        "claude35sonnet": "claude-3-5-sonnet-20241022",
        "claude37sonnet": "claude-3-7-sonnet-latest",
        "llama3370bversatile": "groq/llama-3.3-70b-versatile",
        "llama318binstant": "groq/llama-3.1-8b-instant",
        "mixtral8x7b32768": "groq/mixtral-8x7b-32768",
        "gemma29bit": "groq/gemma2-9b-it",
        "sonar": "perplexity/sonar",
        "sonarpro": "perplexity/sonar-pro",
        "sonarreasoning": "perplexity/sonar-reasoning",
        "customopenai": "custom/openai",
    }
    if normalized in alias_pairs:
        return alias_pairs[normalized]

    canonical_map = {
        re.sub(r"[^a-z0-9]+", "", supported.lower()): supported
        for supported in supported_values
    }
    if normalized in canonical_map:
        return canonical_map[normalized]

    for canonical, supported in canonical_map.items():
        if canonical.endswith(normalized) or normalized.endswith(canonical):
            return supported

    return raw_value if raw_value.startswith(("ollama/", "perplexity/", "gemini/", "groq/")) else fallback_value


def _get_builder_model_name(preferred: Optional[str] = None) -> str:
    return (
        preferred
        or os.environ.get("AGENT_BUILDER_MODEL")
        or os.environ.get("AGENT_FLOW_BUILDER_MODEL")
        or os.environ.get("DEFAULT_AGENT_BUILDER_MODEL")
        or "gemini/gemini-2.5-flash"
    )


def _extract_user_api_key(x_api_key: Optional[str], authorization: Optional[str]) -> Optional[str]:
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token.startswith("ifk_"):
            return token
    return None


class _ApiKeyPrincipal:
    def __init__(self, user_id: str, email: Optional[str], user_metadata: Optional[Dict[str, Any]] = None):
        self.id = user_id
        self.email = email
        self.user_metadata = user_metadata or {}
        self.is_admin = False


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    agent_in: AgentCreate,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    """Create a new agent. workspace_id must be provided in the payload."""
    try:
        if not agent_in.flow_data or not agent_in.flow_data.get("workspace_id"):
            raise HTTPException(status_code=400, detail="workspace_id is required. Please select a workspace.")

        data = agent_in.model_dump()
        flow_data = dict(data.get("flow_data") or {})
        workspace_id = flow_data.pop("workspace_id")
        data["flow_data"] = _sanitize_direct_flow_data(flow_data)
        data["workspace_id"] = workspace_id
        data["created_by"] = current_user.id

        res = db.table("agents").insert(data).execute()
        if not res.data:
            raise Exception("Agent creation did not return data")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=List[AgentResponse])
def get_agents(db: Client = Depends(get_supabase_client_for_request), current_user=Depends(get_current_user)):
    """Get all agents accessible to the current user."""
    try:
        res = db.table("agents").select("*").execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(agent_id: str, db: Client = Depends(get_supabase_client_for_request), current_user=Depends(get_current_user)):
    """Get a single agent by ID."""
    try:
        res = db.table("agents").select("*").eq("id", agent_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{agent_id}", response_model=AgentResponse)
def update_agent(agent_id: str, agent_in: AgentUpdate, db: Client = Depends(get_supabase_client_for_request), current_user=Depends(get_current_user)):
    """Update an existing agent."""
    try:
        data = agent_in.model_dump(exclude_unset=True)

        if "flow_data" in data and data["flow_data"] and "workspace_id" in data["flow_data"]:
            data["workspace_id"] = data["flow_data"].pop("workspace_id")
        if "flow_data" in data:
            data["flow_data"] = _sanitize_direct_flow_data(data.get("flow_data"))

        res = db.table("agents").update(data).eq("id", agent_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Agent not found or could not be updated")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: str,
    db: Client = Depends(get_supabase_client_for_request),
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    """Delete an agent."""
    try:
        try:
            delete_agent_schedules(agent_id)
        except Exception:
            logger.exception("Failed to delete agent schedules for %s", agent_id)
        db.table("agents").delete().eq("id", agent_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _make_short_name(mcp_id: str, tool_name: str) -> str:
    """Create a short, unique function name under 64 chars for OpenAI compatibility."""
    prefix = hashlib.md5(mcp_id.encode()).hexdigest()[:8]
    clean_name = tool_name.replace("-", "_").replace(" ", "_").replace(".", "_")
    return f"mcp_{prefix}_{clean_name}"[:64]


def _make_tool_schema(name, schema_dict):
    props = schema_dict.get("properties", {})
    required = schema_dict.get("required", [])
    fields = {}
    for k, v in props.items():
        # Ensure k is a valid python string identifier
        safe_k = str(k).replace("-", "_").replace(" ", "_").replace(".", "_")
        if not safe_k.isidentifier():
            safe_k = f"param_{safe_k}"
            # Keep only alphanumeric and underscore
            safe_k = re.sub(r'\W|^(?=\d)', '_', safe_k)
            
        t = Any
        if isinstance(v, dict):
            if v.get("type") == "string": t = str
            elif v.get("type") == "integer": t = int
            elif v.get("type") == "boolean": t = bool
            elif v.get("type") == "number": t = float
            description = v.get("description", "")
        else:
            description = ""
            
        if k in required:
            fields[safe_k] = (t, Field(..., description=description))
        else:
            fields[safe_k] = (t, Field(default=None, description=description))
    
    # create_model requires valid python identifiers for keys
    return create_model(f"{name}_Schema", **fields)


def _create_chat_model(flow_data: dict, model_name: str, enable_thinking: bool, *, streaming: bool):
    kwargs = {"temperature": 0, "streaming": streaming}
    if model_name.startswith("gpt-") or model_name.startswith("o3"):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model_name, **kwargs)
    elif model_name.startswith("claude-"):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model_name=model_name, **kwargs)
    elif model_name.startswith("gemini/"):
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        extracted_model = model_name.replace("gemini/", "")
        thinking_params = {}
        if enable_thinking or "thinking" in extracted_model.lower():
            thinking_params["thinking_config"] = {"include_thoughts": True}
        return ChatGoogleGenerativeAI(
            model=extracted_model,
            api_key=api_key,
            **thinking_params,
            **kwargs,
        )
    elif model_name.startswith("groq/"):
        from langchain_groq import ChatGroq
        return ChatGroq(model_name=model_name.replace("groq/", ""), **kwargs)
    elif model_name.startswith("ollama/"):
        from langchain_ollama import ChatOllama
        base_url = os.environ.get("OLLAMA_API_BASE", "http://localhost:11434")
        kwargs_dict = {"model": model_name.replace("ollama/", ""), "base_url": base_url, "temperature": 0}
        kwargs_dict["think"] = enable_thinking
        try:
            return ChatOllama(**kwargs_dict)
        except Exception:
            del kwargs_dict["think"]
            return ChatOllama(**kwargs_dict)
    elif model_name == "custom/openai":
        from langchain_openai import ChatOpenAI
        custom_url = flow_data.get("custom_url")
        custom_model = flow_data.get("custom_model_name", "gpt-3.5-turbo")
        custom_api_key = flow_data.get("custom_api_key")
        kwargs_dict = {"model": custom_model, **kwargs}
        if custom_url:
            kwargs_dict["base_url"] = custom_url
        if custom_api_key:
            kwargs_dict["api_key"] = custom_api_key
        if enable_thinking:
            kwargs_dict["model_kwargs"] = {"extra_body": {"think": True}}
        return ChatOpenAI(**kwargs_dict)
    elif model_name.startswith("perplexity/"):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_name.replace("perplexity/", ""),
            base_url="https://api.perplexity.ai",
            api_key=os.environ.get("PERPLEXITY_API_KEY", ""),
            **kwargs,
        )
    else:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model_name, **kwargs)


def _get_chat_model(flow_data: dict, model_name: str, enable_thinking: bool):
    return _create_chat_model(flow_data, model_name, enable_thinking, streaming=True)


def _get_builder_chat_model(flow_data: dict, model_name: str, enable_thinking: bool):
    return _create_chat_model(flow_data, model_name, enable_thinking, streaming=False)


def _builder_debug_log(event: str, **payload: Any) -> None:
    try:
        log_path = os.environ.get("AGENT_BUILDER_DEBUG_LOG", "/tmp/agent_builder_debug.log")
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "event": event,
            **payload,
        }
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, default=str) + "\n")
    except Exception:
        logger.exception("Failed to write agent builder debug log")


def _extract_reply_and_thinking(reply_content: Any) -> Tuple[str, Optional[str]]:
    thinking_content = None

    if isinstance(reply_content, str):
        if "<think>" in reply_content and "</think>" in reply_content:
            think_match = re.search(r"<think>(.*?)</think>", reply_content, re.DOTALL)
            if think_match:
                thinking_content = think_match.group(1).strip()
                reply_content = re.sub(r"<think>.*?</think>", "", reply_content, flags=re.DOTALL).strip()
        return reply_content, thinking_content

    if isinstance(reply_content, list):
        reply_content_parts = []
        for part in reply_content:
            if isinstance(part, dict) and part.get("type") == "text":
                reply_content_parts.append(part.get("text", ""))
            elif isinstance(part, str):
                reply_content_parts.append(part)
            elif hasattr(part, "text"):
                reply_content_parts.append(str(part.text))
        return "\n".join([part for part in reply_content_parts if part]), thinking_content

    return str(reply_content or ""), thinking_content


def _retrieve_kb_context(db: Client, kb_config: dict, query: str) -> str:
    if not kb_config or not kb_config.get("kb_id"):
        return ""
    
    kb_id = kb_config.get("kb_id")
    chunks = int(kb_config.get("chunks", 5))
    score_threshold = float(kb_config.get("score_threshold", 0.0))
    
    print(f"DEBUG: Retrieving KB context for KB ID: {kb_id}, Query: {query}")
    
    try:
        embeddings_model = get_embeddings()
        query_embedding = embeddings_model.embed_query(query)
        
        rpc_params = {
            "query_embedding": query_embedding,
            "match_threshold": score_threshold,
            "match_count": chunks,
            "knowledge_base_id": kb_id
        }
        
        print(f"DEBUG: Calling match_chunks with score_threshold: {score_threshold}")
        res = db.rpc("match_chunks", rpc_params).execute()
        
        if not res.data:
            print("DEBUG: No chunks found in KB (res.data is empty)")
            return ""
            
        print(f"DEBUG: Found {len(res.data)} relevant chunks")
        context_parts = []
        for match in res.data:
            metadata = match.get("metadata", {})
            source = metadata.get("source", "Unknown Document")
            content = match.get("content", "").strip()
            sim = match.get('similarity')
            print(f"DEBUG: Chunk similarity: {sim} from source: {source}")
            context_parts.append(f"------\nSource: {source}\nContent:\n{content}\n")
            
        return "\n".join(context_parts)
    except Exception as e:
        print(f"DEBUG: EXCEPTION in _retrieve_kb_context: {e}")
        import traceback
        traceback.print_exc()
        return ""


def _create_kb_search_tool(db: Client, kb_config: dict):
    kb_id = kb_config.get("kb_id")
    chunks = int(kb_config.get("chunks", 5))
    score_threshold = float(kb_config.get("score_threshold", 0.0))

    async def search_kb(query: str):
        """Search the connected knowledge base for relevant information."""
        context = _retrieve_kb_context(db, kb_config, query)
        if not context:
            return "No relevant information found in the knowledge base."
        return f"Information from knowledge base:\n{context}"

    return StructuredTool.from_function(
        coroutine=search_kb,
        name="search_knowledge_base",
        description="Connects to the internal knowledge base to retrieve specific information. Use this when you need facts or data from uploaded documents."
    )


def _extract_json_object(raw_text: str) -> Dict[str, Any]:
    raw_text = (raw_text or "").strip()
    if not raw_text:
        raise ValueError("Empty builder response")

    try:
        return json.loads(raw_text)
    except Exception:
        pass

    fenced_match = re.search(r"```json\s*(\{.*\})\s*```", raw_text, flags=re.DOTALL)
    if fenced_match:
        return json.loads(fenced_match.group(1))

    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Builder response did not contain JSON")
    return json.loads(raw_text[start : end + 1])


def _default_feature_flags(features: Optional[Dict[str, Any]] = None) -> Dict[str, bool]:
    base = {
        "knowledge_base": False,
        "data_query": False,
        "scheduler": False,
        "webhook_trigger": False,
        "memory": False,
    }
    if features:
        for key in base:
            if key in features:
                base[key] = bool(features[key])
    return base


def _normalize_kb_type(value: Any) -> str:
    normalized = str(value or "rag").strip().lower()
    if normalized in {"agentic", "agentic_rag"}:
        return "agentic_rag"
    return "rag"


def _normalize_scheduler_config_field(value: Any) -> Optional[Dict[str, Any]]:
    normalized = normalize_schedule_configs(value)
    return flow_scheduler_config_payload(normalized)


def _sanitize_direct_flow_data(flow_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    raw_flow = dict(flow_data or {})
    features = _default_feature_flags(raw_flow.get("features"))

    examples_text, structured_output_text = _normalize_examples_and_structured_output(
        raw_flow.get("examples", ""),
        raw_flow.get("structured_output", ""),
    )

    kb_config = raw_flow.get("kb_config") or {}
    normalized_kb_config = None
    if kb_config and kb_config.get("kb_id"):
        normalized_kb_config = {
            "type": _normalize_kb_type(kb_config.get("type")),
            "kb_id": kb_config.get("kb_id"),
            "chunks": int(kb_config.get("chunks", 5)),
            "retrieval_type": kb_config.get("retrieval_type", "basic"),
            "score_threshold": str(kb_config.get("score_threshold", "0.0")),
        }
    else:
        features["knowledge_base"] = False

    scheduler_config = _normalize_scheduler_config_field(raw_flow.get("scheduler_config"))
    if not scheduler_config:
        features["scheduler"] = False

    return {
        **raw_flow,
        "model": _normalize_model_value(raw_flow.get("model"), fallback=_default_agent_runtime_model()),
        "role": _normalize_text_field(raw_flow.get("role", "")),
        "goal": _normalize_text_field(raw_flow.get("goal", "")),
        "instructions": _normalize_text_field(raw_flow.get("instructions", "")),
        "examples": examples_text,
        "structured_output": structured_output_text,
        "features": features,
        "kb_config": normalized_kb_config,
        "scheduler_config": scheduler_config,
    }


def _normalize_text_field(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [_normalize_text_field(item) for item in value]
        parts = [part for part in parts if part]
        return "\n".join(parts)
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            normalized = _normalize_text_field(item)
            if normalized:
                label = str(key).replace("_", " ").replace("-", " ").strip().title()
                lines.append(f"{label}: {normalized}")
        return "\n".join(lines)
    return str(value).strip()


def _extract_json_candidate(value: Any) -> Optional[Any]:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=re.IGNORECASE)
    if fenced_match:
        candidate = fenced_match.group(1).strip()
        try:
            return json.loads(candidate)
        except Exception:
            return None

    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        try:
            return json.loads(text)
        except Exception:
            return None

    return None


def _normalize_structured_output_field(value: Any) -> str:
    json_candidate = _extract_json_candidate(value)
    if json_candidate is not None:
        return json.dumps(json_candidate, indent=2, ensure_ascii=False)
    return _normalize_text_field(value)


def _normalize_examples_and_structured_output(examples_value: Any, structured_output_value: Any) -> Tuple[str, str]:
    structured_output = _normalize_structured_output_field(structured_output_value)
    examples_json = _extract_json_candidate(examples_value)
    if examples_json is not None:
        if not structured_output:
            structured_output = json.dumps(examples_json, indent=2, ensure_ascii=False)
        # Keep examples for conversational text only; move JSON-like content to structured_output.
        return "", structured_output
    return _normalize_text_field(examples_value), structured_output


def _canonical_tool_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _resolve_provider_for_entry(entry: Dict[str, Any], catalog: List[Any], catalog_by_integration: Dict[str, Any]) -> Tuple[Optional[str], Optional[Any]]:
    raw_candidates = [
        entry.get("mcp_id"),
        entry.get("integration_id"),
        entry.get("provider_id"),
        entry.get("provider_name"),
    ]

    for candidate in raw_candidates:
        if not candidate:
            continue
        as_str = str(candidate).strip()
        provider = catalog_by_integration.get(as_str)
        if provider:
            return provider.integration_id, provider

    alias_map: Dict[str, Any] = {}
    for provider in catalog:
        alias_map[str(provider.integration_id).strip().lower()] = provider
        alias_map[str(provider.provider_id).strip().lower()] = provider
        alias_map[str(provider.provider_name).strip().lower()] = provider

    for candidate in raw_candidates:
        if not candidate:
            continue
        provider = alias_map.get(str(candidate).strip().lower())
        if provider:
            return provider.integration_id, provider

    return None, None


def _normalize_requested_tool_names(raw_tools: Any, allowed_tool_names: List[str]) -> List[str]:
    if raw_tools is None:
        return []

    if isinstance(raw_tools, str):
        raw_items = [raw_tools]
    elif isinstance(raw_tools, list):
        raw_items = raw_tools
    else:
        raw_items = [raw_tools]

    extracted_names: List[str] = []
    for item in raw_items:
        if isinstance(item, str):
            name = item.strip()
        elif isinstance(item, dict):
            name = (
                item.get("name")
                or item.get("tool")
                or item.get("tool_name")
                or item.get("id")
                or ""
            )
            name = str(name).strip()
        else:
            name = str(item).strip()
        if name:
            extracted_names.append(name)

    if not extracted_names:
        return []

    if not allowed_tool_names:
        dedup_fallback: List[str] = []
        seen_fallback = set()
        for name in extracted_names:
            key = name.lower()
            if key in seen_fallback:
                continue
            seen_fallback.add(key)
            dedup_fallback.append(name)
        return dedup_fallback

    allowed_canonical_to_name: Dict[str, str] = {}
    for allowed in allowed_tool_names:
        canonical = _canonical_tool_name(allowed)
        if canonical and canonical not in allowed_canonical_to_name:
            allowed_canonical_to_name[canonical] = allowed

    matched_names: List[str] = []
    seen = set()

    for raw_name in extracted_names:
        direct = next((allowed for allowed in allowed_tool_names if allowed == raw_name), None)
        if direct:
            key = direct.lower()
            if key not in seen:
                seen.add(key)
                matched_names.append(direct)
            continue

        candidate_variants = {raw_name}
        for splitter in [":", "/", ".", "|"]:
            if splitter in raw_name:
                candidate_variants.add(raw_name.split(splitter)[-1].strip())

        resolved = None
        for variant in candidate_variants:
            canonical = _canonical_tool_name(variant)
            resolved = allowed_canonical_to_name.get(canonical)
            if resolved:
                break

        if not resolved:
            base_canonical = _canonical_tool_name(raw_name)
            fuzzy_matches = [
                allowed
                for canonical, allowed in allowed_canonical_to_name.items()
                if canonical.endswith(base_canonical) or base_canonical.endswith(canonical)
            ]
            if len(fuzzy_matches) == 1:
                resolved = fuzzy_matches[0]

        if resolved:
            resolved_key = resolved.lower()
            if resolved_key not in seen:
                seen.add(resolved_key)
                matched_names.append(resolved)

    return matched_names


def _extract_requested_tools_from_entry(entry: Dict[str, Any]) -> Any:
    if "tools" in entry:
        return entry.get("tools")
    if "tool_names" in entry:
        return entry.get("tool_names")
    if "selected_tools" in entry:
        return entry.get("selected_tools")
    if "tool_name" in entry:
        return [entry.get("tool_name")]
    if "tool" in entry:
        return [entry.get("tool")]
    return []


def _extract_tool_settings_from_entry(
    entry: Dict[str, Any],
    allowed_tool_names: List[str],
    provider: Any,
) -> List[Dict[str, Any]]:
    raw_settings = (
        entry.get("tool_settings")
        or entry.get("tool_configs")
        or entry.get("tool_parameters")
        or []
    )
    if isinstance(raw_settings, dict):
        raw_settings = [
            {"tool_name": tool_name, "arguments": arguments}
            for tool_name, arguments in raw_settings.items()
        ]
    if not isinstance(raw_settings, list):
        return []

    allowed_name_map = {_canonical_tool_name(name): name for name in allowed_tool_names}
    provider_tools_by_name = {
        tool.name: getattr(tool, "input_schema", None) or {}
        for tool in getattr(provider, "tools", []) or []
    }
    sanitized_settings: List[Dict[str, Any]] = []

    for raw_setting in raw_settings:
        if not isinstance(raw_setting, dict):
            continue

        raw_tool_name = raw_setting.get("tool_name") or raw_setting.get("name") or raw_setting.get("tool")
        canonical_tool_name = _canonical_tool_name(raw_tool_name)
        tool_name = allowed_name_map.get(canonical_tool_name)
        if not tool_name:
            continue

        input_schema = provider_tools_by_name.get(tool_name) or {}
        properties = input_schema.get("properties") or {}
        raw_arguments = raw_setting.get("arguments") or raw_setting.get("params") or {}
        if not isinstance(raw_arguments, dict):
            continue

        sanitized_arguments: Dict[str, Dict[str, Any]] = {}
        for arg_name, binding in raw_arguments.items():
            if arg_name not in properties:
                continue

            if isinstance(binding, dict):
                mode = str(binding.get("mode") or "manual").strip().lower()
                value = binding.get("value")
            else:
                mode = "manual"
                value = binding

            if mode != "manual":
                continue
            if value is None:
                continue

            sanitized_arguments[arg_name] = {
                "mode": "manual",
                "value": value,
            }

        if sanitized_arguments:
            sanitized_settings.append(
                {
                    "tool_name": tool_name,
                    "arguments": sanitized_arguments,
                }
            )

    return sanitized_settings


def _merge_tool_settings(
    current_entry: Dict[str, Any],
    existing_entry: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if not existing_entry:
        return current_entry

    selected_tools = current_entry.get("tools") or []
    current_settings = current_entry.get("tool_settings") or []
    existing_settings = existing_entry.get("tool_settings") or []

    current_settings_by_tool = {
        str(setting.get("tool_name")): setting
        for setting in current_settings
        if isinstance(setting, dict) and setting.get("tool_name")
    }
    existing_settings_by_tool = {
        str(setting.get("tool_name")): setting
        for setting in existing_settings
        if isinstance(setting, dict) and setting.get("tool_name")
    }

    merged_settings: List[Dict[str, Any]] = []
    for tool_name in selected_tools:
        merged = current_settings_by_tool.get(tool_name) or existing_settings_by_tool.get(tool_name)
        if merged and merged.get("arguments"):
            merged_settings.append(merged)

    if merged_settings:
        return {**current_entry, "tool_settings": merged_settings}
    return {key: value for key, value in current_entry.items() if key != "tool_settings"}


def _coerce_configured_tool_value(value: Any, schema: Dict[str, Any]) -> Any:
    schema_type = (schema or {}).get("type")
    if value is None:
        return None

    if schema_type == "boolean":
        if isinstance(value, bool):
            return value
        lowered = str(value).strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
        return value

    if schema_type == "integer":
        try:
            return int(value)
        except Exception:
            return value

    if schema_type == "number":
        try:
            return float(value)
        except Exception:
            return value

    if schema_type in {"array", "object"}:
        if isinstance(value, (list, dict)):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return value
        return value

    return str(value) if not isinstance(value, str) else value


def _apply_tool_argument_bindings(
    provided_kwargs: Dict[str, Any],
    tool_config_entry: Dict[str, Any],
    tool_name: str,
    input_schema: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    merged_kwargs = dict(provided_kwargs or {})
    settings = tool_config_entry.get("tool_settings") or []
    target_setting = next(
        (
            item
            for item in settings
            if isinstance(item, dict) and str(item.get("tool_name")) == tool_name
        ),
        None,
    )
    if not target_setting:
        return merged_kwargs

    properties = (input_schema or {}).get("properties") or {}
    for arg_name, binding in (target_setting.get("arguments") or {}).items():
        if not isinstance(binding, dict):
            continue
        if str(binding.get("mode") or "").lower() != "manual":
            continue
        merged_kwargs[arg_name] = _coerce_configured_tool_value(
            binding.get("value"),
            properties.get(arg_name) or {},
        )

    return merged_kwargs


def _sanitize_generated_flow_data(
    generated: Dict[str, Any],
    catalog: List[Any],
    knowledge_bases: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    generated = generated or {}
    flow_data = generated.get("flow_data") or {}
    worker_blueprints = generated.get("worker_agent_blueprints") or []

    catalog_by_integration = {provider.integration_id: provider for provider in catalog}
    valid_kb_ids = {kb["id"] for kb in knowledge_bases}

    examples_text, structured_output_text = _normalize_examples_and_structured_output(
        flow_data.get("examples", generated.get("examples", "")),
        flow_data.get("structured_output", generated.get("structured_output", "")),
    )

    clean_flow = {
        "model": _normalize_model_value(
            flow_data.get("model", generated.get("model", _default_agent_runtime_model())),
            fallback=_default_agent_runtime_model(),
        ),
        "role": _normalize_text_field(flow_data.get("role", generated.get("role", ""))),
        "goal": _normalize_text_field(flow_data.get("goal", generated.get("goal", ""))),
        "instructions": _normalize_text_field(flow_data.get("instructions", generated.get("instructions", ""))),
        "examples": examples_text,
        "structured_output": structured_output_text,
        "is_manager_agent": bool(flow_data.get("is_manager_agent", False)),
        "enable_thinking": bool(flow_data.get("enable_thinking", False)),
        "features": _default_feature_flags(flow_data.get("features")),
        "mcp_tools": [],
        "worker_agents": flow_data.get("worker_agents", []),
        "custom_url": flow_data.get("custom_url", ""),
        "custom_model_name": flow_data.get("custom_model_name", ""),
        "custom_api_key": flow_data.get("custom_api_key", ""),
        "kb_config": None,
        "scheduler_config": None,
    }

    raw_mcp_tools = flow_data.get("mcp_tools") or []
    if isinstance(raw_mcp_tools, dict):
        raw_mcp_tools = [raw_mcp_tools]
    for entry in raw_mcp_tools:
        if not isinstance(entry, dict):
            continue
        mcp_id, provider = _resolve_provider_for_entry(entry, catalog, catalog_by_integration)
        if not provider:
            continue
        allowed_tool_names = [tool.name for tool in provider.tools]
        requested_tools = _extract_requested_tools_from_entry(entry)
        tools = _normalize_requested_tool_names(requested_tools, allowed_tool_names)
        if requested_tools and not tools:
            _builder_debug_log(
                "tool_selection_dropped",
                integration_id=mcp_id,
                requested_tools=requested_tools,
                allowed_tool_names=allowed_tool_names[:30],
            )
        if tools:
            clean_entry: Dict[str, Any] = {"mcp_id": mcp_id, "tools": tools}
            tool_settings = _extract_tool_settings_from_entry(entry, tools, provider)
            if tool_settings:
                clean_entry["tool_settings"] = tool_settings
            clean_flow["mcp_tools"].append(clean_entry)

    kb_config = flow_data.get("kb_config") or {}
    kb_id = kb_config.get("kb_id")
    if clean_flow["features"]["knowledge_base"] and kb_id in valid_kb_ids:
        clean_flow["kb_config"] = {
            "type": _normalize_kb_type(kb_config.get("type")),
            "kb_id": kb_id,
            "chunks": int(kb_config.get("chunks", 5)),
            "retrieval_type": kb_config.get("retrieval_type", "basic"),
            "score_threshold": str(kb_config.get("score_threshold", "0.0")),
        }
    else:
        clean_flow["features"]["knowledge_base"] = False

    scheduler_config = _normalize_scheduler_config_field(flow_data.get("scheduler_config"))
    if clean_flow["features"]["scheduler"] and scheduler_config:
        clean_flow["scheduler_config"] = scheduler_config
    else:
        clean_flow["features"]["scheduler"] = False

    if not clean_flow["is_manager_agent"]:
        clean_flow["worker_agents"] = []
        worker_blueprints = []

    return clean_flow, worker_blueprints


def _shape_worker_payload(worker: Dict[str, Any]) -> Dict[str, Any]:
    flow_data = worker.get("flow_data") or {}
    examples_text, structured_output_text = _normalize_examples_and_structured_output(
        flow_data.get("examples", ""),
        flow_data.get("structured_output", ""),
    )
    return {
        "name": worker.get("name", "Worker Agent"),
        "description": worker.get("description", ""),
        "is_published": False,
        "flow_data": {
            "model": _normalize_model_value(flow_data.get("model"), fallback=_default_agent_runtime_model()),
            "role": _normalize_text_field(flow_data.get("role", "")),
            "goal": _normalize_text_field(flow_data.get("goal", "")),
            "instructions": _normalize_text_field(flow_data.get("instructions", "")),
            "examples": examples_text,
            "structured_output": structured_output_text,
            "is_manager_agent": False,
            "enable_thinking": bool(flow_data.get("enable_thinking", False)),
            "features": _default_feature_flags(flow_data.get("features")),
            "mcp_tools": flow_data.get("mcp_tools", []),
            "worker_agents": [],
            "custom_url": flow_data.get("custom_url", ""),
            "custom_model_name": flow_data.get("custom_model_name", ""),
            "custom_api_key": flow_data.get("custom_api_key", ""),
            "kb_config": flow_data.get("kb_config"),
            "scheduler_config": flow_data.get("scheduler_config"),
        },
    }


def _sanitize_manual_agent_payload(
    payload: Dict[str, Any],
    catalog: List[Any],
    knowledge_bases: List[Dict[str, Any]],
    *,
    force_subagent: bool = False,
    existing_agent: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    clean_flow, _ = _sanitize_generated_flow_data(
        {"flow_data": payload.get("flow_data") or {}},
        catalog,
        knowledge_bases,
    )
    if existing_agent:
        existing_flow = existing_agent.get("flow_data") or {}
        if not clean_flow["mcp_tools"] and existing_flow.get("mcp_tools"):
            clean_flow["mcp_tools"] = existing_flow.get("mcp_tools") or []
        elif clean_flow["mcp_tools"] and existing_flow.get("mcp_tools"):
            existing_by_mcp = {
                item.get("mcp_id"): item
                for item in (existing_flow.get("mcp_tools") or [])
                if isinstance(item, dict) and item.get("mcp_id")
            }
            clean_flow["mcp_tools"] = [
                _merge_tool_settings(entry, existing_by_mcp.get(entry.get("mcp_id")))
                for entry in clean_flow["mcp_tools"]
            ]
        if not clean_flow["structured_output"] and existing_flow.get("structured_output"):
            clean_flow["structured_output"] = existing_flow.get("structured_output") or ""
        if not clean_flow["examples"] and existing_flow.get("examples"):
            clean_flow["examples"] = existing_flow.get("examples") or ""
        if not clean_flow.get("scheduler_config") and existing_flow.get("scheduler_config"):
            clean_flow["scheduler_config"] = existing_flow.get("scheduler_config")
            if (existing_flow.get("features") or {}).get("scheduler"):
                clean_flow["features"]["scheduler"] = True
    if force_subagent:
        clean_flow["is_manager_agent"] = False
        clean_flow["worker_agents"] = []

    return {
        "name": _normalize_text_field(payload.get("name", "Generated Agent")),
        "description": _normalize_text_field(payload.get("description", "")),
        "is_published": bool(payload.get("is_published", False)),
        "flow_data": clean_flow,
    }


def _agent_tool_count(agent: Dict[str, Any]) -> int:
    flow_data = agent.get("flow_data") or {}
    configured_tools = flow_data.get("mcp_tools") or []
    return sum(len(item.get("tools", [])) for item in configured_tools)


def _build_agent_graph(root_agent: Optional[Dict[str, Any]], sub_agents: List[Dict[str, Any]]) -> AgentBuilderGraph:
    if not root_agent:
        return AgentBuilderGraph()

    nodes = [
        AgentBuilderGraphNode(
            id=root_agent["id"],
            type="root",
            label=root_agent.get("name", "Root Agent"),
            role=(root_agent.get("flow_data") or {}).get("role"),
            tool_count=_agent_tool_count(root_agent),
        )
    ]
    edges: List[AgentBuilderGraphEdge] = []

    worker_links = (root_agent.get("flow_data") or {}).get("worker_agents") or []
    sub_map = {agent["id"]: agent for agent in sub_agents}
    for link in worker_links:
        worker_id = link.get("agent_id")
        worker = sub_map.get(worker_id)
        if not worker:
            continue
        nodes.append(
            AgentBuilderGraphNode(
                id=worker["id"],
                type="worker",
                label=worker.get("name", "Worker Agent"),
                role=(worker.get("flow_data") or {}).get("role"),
                tool_count=_agent_tool_count(worker),
            )
        )
        edges.append(
            AgentBuilderGraphEdge(
                id=f"{root_agent['id']}-{worker['id']}",
                source=root_agent["id"],
                target=worker["id"],
                label=link.get("description") or None,
            )
        )

    return AgentBuilderGraph(nodes=nodes, edges=edges)


def _build_agent_system_prompt(db: Client, flow_data: Dict[str, Any], user_message: str) -> Tuple[str, Dict[str, Any], Dict[str, Any], bool]:
    role = flow_data.get("role", "You are a helpful AI assistant.")
    goal = flow_data.get("goal", "")
    instructions = flow_data.get("instructions", "")
    examples = flow_data.get("examples", "")
    structured_output = flow_data.get("structured_output", "")

    system_prompt = f"{role}\n"
    if goal:
        system_prompt += f"\nYour goal: {goal}\n"
    if instructions:
        system_prompt += f"\nInstructions:\n{instructions}\n"
    if examples:
        system_prompt += f"\nExamples:\n{examples}\n"

    features = flow_data.get("features") or {}
    kb_config = flow_data.get("kb_config") or {}
    is_agentic_rag = _normalize_kb_type(kb_config.get("type")) == "agentic_rag"

    if features.get("knowledge_base") and not is_agentic_rag:
        context = _retrieve_kb_context(db, kb_config, user_message)
        if context:
            system_prompt += f"\n--- RELEVANT KNOWLEDGE BASE CONTEXT ---\n{context}\n---------------------------------------\n"
            system_prompt += "\nPlease use the provided context to answer the user's question if it is relevant.\n"

    if structured_output:
        if isinstance(structured_output, str) and structured_output.strip() and structured_output != "true":
            system_prompt += f"\nYou MUST return your answer in valid JSON format ONLY following this schema exact format:\n{structured_output}\nDo not wrap in markdown.\n"
        else:
            system_prompt += "\nYou MUST return your answer in valid JSON format ONLY. Do not wrap in markdown.\n"

    return system_prompt, features, kb_config, is_agentic_rag


def _build_lc_messages(system_prompt: str, history: List[Dict[str, str]], message: str) -> List[Any]:
    lc_messages = [SystemMessage(content=system_prompt)]
    for msg in history or []:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))
    lc_messages.append(HumanMessage(content=message))
    return lc_messages


async def _create_agent_lc_tools(
    db: Client,
    flow_data: Dict[str, Any],
    stack: AsyncExitStack,
) -> List[StructuredTool]:
    lc_tools: List[StructuredTool] = []
    features = flow_data.get("features") or {}
    kb_config = flow_data.get("kb_config") or {}
    is_agentic_rag = _normalize_kb_type(kb_config.get("type")) == "agentic_rag"
    configured_mcp = flow_data.get("mcp_tools", [])
    worker_agents_config = flow_data.get("worker_agents", [])
    is_manager_agent = flow_data.get("is_manager_agent", False)

    if features.get("knowledge_base") and is_agentic_rag:
        lc_tools.append(_create_kb_search_tool(db, kb_config))

    for conf in configured_mcp:
        mcp_id = conf.get("mcp_id")
        allowed_tools = conf.get("tools", [])

        m_res = db.table("mcp_integrations").select("*").eq("id", mcp_id).execute()
        if not m_res.data:
            logger.warning("MCP integration %s not found in DB, skipping", mcp_id)
            continue

        cfg = m_res.data[0].get("config") or {}
        integration_type = m_res.data[0].get("integration_type", "custom")

        if integration_type == "openapi":
            from app.utils.openapi import execute_openapi_tool, parse_openapi_to_tools

            openapi_schema = cfg.get("openapi_schema", {})
            parsed_tools = parse_openapi_to_tools(openapi_schema)
            for parsed_tool in parsed_tools:
                if allowed_tools and parsed_tool["name"] not in allowed_tools:
                    continue

                short_name = _make_short_name(mcp_id, parsed_tool["name"])

                def make_openapi_callable(t_info, c, tool_entry):
                    async def _run(**kwargs):
                        clean_kwargs = {k: v for k, v in kwargs.items() if v is not None}
                        final_kwargs = _apply_tool_argument_bindings(
                            clean_kwargs,
                            tool_entry,
                            t_info["name"],
                            t_info.get("inputSchema") or {},
                        )
                        return await execute_openapi_tool(t_info, c, final_kwargs)

                    return _run

                args_schema = None
                try:
                    args_schema = _make_tool_schema(short_name, parsed_tool["inputSchema"])
                except Exception as exc:
                    logger.warning("Could not generate schema for openapi tool %s: %s", parsed_tool.get("name"), exc)

                lc_tools.append(
                    StructuredTool.from_function(
                        coroutine=make_openapi_callable(parsed_tool, cfg, conf),
                        name=short_name,
                        description=parsed_tool["description"] or f"API Tool {parsed_tool['name']}",
                        args_schema=args_schema,
                    )
                )
            continue

        transport_type = cfg.get("transport_type", "stdio")
        url = cfg.get("url")

        if transport_type in ["sse", "http"] or (transport_type == "stdio" and url):
            try:
                headers = cfg.get("headers", {})
                try:
                    http_client = await stack.enter_async_context(httpx.AsyncClient(headers=headers, timeout=60.0))
                    transport_data = await stack.enter_async_context(streamable_http_client(url, http_client=http_client))
                    read, write = transport_data[0], transport_data[1]
                    session = await stack.enter_async_context(ClientSession(read, write))
                except Exception as exc:
                    logger.info("Streamable HTTP connection failed for %s, trying legacy SSE: %s", mcp_id, exc)
                    transport_data = await stack.enter_async_context(sse_client(url=url, headers=headers))
                    read, write = transport_data[0], transport_data[1]
                    session = await stack.enter_async_context(ClientSession(read, write))

                await session.initialize()
                m_tools_resp = await session.list_tools()

                for tool_info in m_tools_resp.tools:
                    if allowed_tools and tool_info.name not in allowed_tools:
                        continue
                    short_name = _make_short_name(mcp_id, tool_info.name)

                    def make_callable(s, tname, input_schema, tool_entry):
                        async def _run(**kwargs):
                            clean_kwargs = {k: v for k, v in kwargs.items() if v is not None}
                            final_kwargs = _apply_tool_argument_bindings(
                                clean_kwargs,
                                tool_entry,
                                tname,
                                input_schema,
                            )
                            res = await s.call_tool(tname, arguments=final_kwargs)
                            return "\n".join([c.text for c in res.content if hasattr(c, "text")])

                        return _run

                    args_schema = _make_tool_schema(short_name, tool_info.inputSchema)
                    lc_tools.append(
                        StructuredTool.from_function(
                            coroutine=make_callable(session, tool_info.name, tool_info.inputSchema, conf),
                            name=short_name,
                            description=tool_info.description or f"Tool {tool_info.name}",
                            args_schema=args_schema,
                        )
                    )
            except Exception as exc:
                logger.error("Failed to connect MCP HTTP/SSE server %s: %s", mcp_id, exc)
            continue

        if not cfg.get("command"):
            continue

        server_params = StdioServerParameters(
            command=cfg["command"],
            args=cfg.get("args", []),
            env=cfg.get("env") or None,
        )
        try:
            read, write = await stack.enter_async_context(stdio_client(server_params))
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
            m_tools_resp = await session.list_tools()

            for tool_info in m_tools_resp.tools:
                if allowed_tools and tool_info.name not in allowed_tools:
                    continue

                short_name = _make_short_name(mcp_id, tool_info.name)

                def make_callable(s, tname, input_schema, tool_entry):
                    async def _run(**kwargs):
                        clean_kwargs = {k: v for k, v in kwargs.items() if v is not None}
                        final_kwargs = _apply_tool_argument_bindings(
                            clean_kwargs,
                            tool_entry,
                            tname,
                            input_schema,
                        )
                        res = await s.call_tool(tname, arguments=final_kwargs)
                        return "\n".join([c.text for c in res.content if hasattr(c, "text")])

                    return _run

                args_schema = None
                try:
                    args_schema = _make_tool_schema(short_name, tool_info.inputSchema)
                except Exception as exc:
                    logger.warning("Could not generate schema for tool %s: %s", tool_info.name, exc)

                lc_tools.append(
                    StructuredTool.from_function(
                        coroutine=make_callable(session, tool_info.name, tool_info.inputSchema, conf),
                        name=short_name,
                        description=tool_info.description or f"Tool {tool_info.name}",
                        args_schema=args_schema,
                    )
                )
        except Exception as exc:
            logger.error("Failed to connect MCP server %s: %s", mcp_id, exc)

    if is_manager_agent and worker_agents_config:
        for worker_conf in worker_agents_config:
            worker_id = worker_conf.get("agent_id")
            worker_desc = worker_conf.get("description")
            if not worker_id:
                continue

            worker_res = db.table("agents").select("name").eq("id", worker_id).execute()
            if not worker_res.data:
                continue
            worker_name = worker_res.data[0]["name"]

            def make_worker_tool(target_id, target_name, target_desc):
                async def call_worker(query: str):
                    try:
                        result = await execute_agent_internal(db, target_id, query, [])
                        return result.get("reply", "No response from agent.")
                    except Exception as exc:
                        return f"Error calling worker {target_name}: {str(exc)}"

                clean_name = re.sub(r"[^a-zA-Z0-9_-]", "_", target_name.lower())
                return StructuredTool.from_function(
                    coroutine=call_worker,
                    name=f"ask_{clean_name}",
                    description=target_desc or f"Send a query to the {target_name} agent which specialized in its own domain.",
                )

            lc_tools.append(make_worker_tool(worker_id, worker_name, worker_desc))

    return lc_tools


async def _run_agent_non_streaming(
    db: Client,
    agent: Dict[str, Any],
    message: str,
    history: List[Dict[str, str]],
    *,
    enable_thinking_override: Optional[bool] = None,
) -> Dict[str, Any]:
    flow_data = agent.get("flow_data") or {}
    model_name = _normalize_model_value(flow_data.get("model"), fallback=_default_agent_runtime_model())
    system_prompt = _build_agent_system_prompt(db, flow_data, message)[0]
    lc_messages = _build_lc_messages(system_prompt, history or [], message)
    enable_thinking = flow_data.get("enable_thinking", False) if enable_thinking_override is None else enable_thinking_override
    chat_model = _get_builder_chat_model(flow_data, model_name, enable_thinking)

    async with AsyncExitStack() as stack:
        lc_tools = await _create_agent_lc_tools(db, flow_data, stack)
        if lc_tools:
            agent_executor = create_react_agent(chat_model, tools=lc_tools)
            final_state = await agent_executor.ainvoke({"messages": lc_messages})
            final_message = final_state["messages"][-1]
            reply_content = final_message.content
        else:
            final_message = await chat_model.ainvoke(lc_messages)
            reply_content = final_message.content

    reply_text, thinking_content = _extract_reply_and_thinking(reply_content)
    return {"reply": reply_text, "model_used": model_name, "thinking": thinking_content}


class BuilderFinalize(Exception):
    def __init__(self, reply: str):
        super().__init__(reply)
        self.reply = reply


def _build_builder_finalize_reply(state: Dict[str, Any], root_agent: Optional[Dict[str, Any]]) -> str:
    events = state.get("mutation_events") or []
    if root_agent:
        tool_count = _agent_tool_count(root_agent)
        worker_count = len(((root_agent.get("flow_data") or {}).get("worker_agents") or []))
        details = []
        if tool_count:
            details.append(f"{tool_count} tool{'s' if tool_count != 1 else ''} connected")
        if worker_count:
            details.append(f"{worker_count} worker agent{'s' if worker_count != 1 else ''} linked")
        suffix = f" {'; '.join(details)}." if details else "."
        return f"Saved updates to {root_agent.get('name', 'the agent')}.{suffix}"
    if events:
        return "Saved the latest builder changes."
    return "Builder changes were saved."


@router.post("/builder/chat", response_model=AgentBuilderChatResponse)
async def chat_with_builder(
    build_in: AgentBuilderChatRequest,
    user_db: Client = Depends(get_supabase_client_for_request),
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    phase = "init"
    _builder_debug_log(
        "request_started",
        workspace_id=build_in.workspace_id,
        root_agent_id=build_in.root_agent_id,
        selected_agent_id=build_in.selected_agent_id,
        message=build_in.message[:500],
        history_length=len(build_in.history or []),
    )
    try:
        phase = "load_tool_catalog"
        catalog = await get_tool_catalog(build_in.workspace_id, user_db, admin_db, discover_tools=False)
        _builder_debug_log("phase_complete", phase=phase, provider_count=len(catalog))
        phase = "load_knowledge_bases"
        kb_res = user_db.table("knowledge_bases").select("id,name,description").eq("workspace_id", build_in.workspace_id).execute()
        knowledge_bases = kb_res.data or []
        _builder_debug_log("phase_complete", phase=phase, knowledge_base_count=len(knowledge_bases))

        phase = "initialize_state"
        state: Dict[str, Any] = {
            "root_agent_id": build_in.root_agent_id,
            "selected_agent_id": build_in.selected_agent_id or build_in.root_agent_id,
            "worker_key_map": {},
            "touched_agent_ids": set(),
            "mutation_events": [],
            "update_counts": {},
        }

        if build_in.root_agent_id:
            phase = "load_existing_root"
            existing_root_res = user_db.table("agents").select("*").eq("id", build_in.root_agent_id).execute()
            if existing_root_res.data:
                existing_root = existing_root_res.data[0]
                auto_builder = ((existing_root.get("flow_data") or {}).get("auto_builder")) or {}
                for item in auto_builder.get("managed_workers", []):
                    key = item.get("key")
                    agent_id = item.get("agent_id")
                    if key and agent_id:
                        state["worker_key_map"][key] = agent_id

        phase = "load_workspace_agents"
        workspace_agents_res = user_db.table("agents").select("*").eq("workspace_id", build_in.workspace_id).execute()
        workspace_agents = workspace_agents_res.data or []
        catalog_by_integration = {provider.integration_id: provider for provider in catalog}
        supported_models_json = json.dumps(SUPPORTED_AGENT_MODELS)

        async def _ensure_provider_tools(integration_id: str):
            provider = catalog_by_integration.get(integration_id)
            if not provider:
                _builder_debug_log("tool_inventory_missing", integration_id=integration_id, reason="provider_missing")
                return None
            if not provider.tools:
                provider.discovery_error = provider.discovery_error or "No cached tool inventory. Refresh the integration from the Tools page."
                _builder_debug_log("tool_inventory_missing", integration_id=integration_id, reason=provider.discovery_error)
            else:
                _builder_debug_log("tool_inventory_available", integration_id=integration_id, tool_count=len(provider.tools))
            return provider

        async def _prime_catalog_for_payload(payload: Dict[str, Any]):
            flow_data = payload.get("flow_data") or {}
            mcp_ids = {
                entry.get("mcp_id")
                for entry in (flow_data.get("mcp_tools") or [])
                if entry.get("mcp_id")
            }
            for mcp_id in mcp_ids:
                await _ensure_provider_tools(mcp_id)

        def _read_agent(agent_id: str) -> Dict[str, Any]:
            res = user_db.table("agents").select("*").eq("id", agent_id).execute()
            if not res.data:
                raise ValueError(f"Agent {agent_id} not found")
            return res.data[0]

        def _record_builder_mutation(tool_name: str, agent_id: str, payload: Dict[str, Any]) -> None:
            flow_data = payload.get("flow_data") or {}
            event = {
                "tool": tool_name,
                "agent_id": agent_id,
                "name": payload.get("name", ""),
                "tool_count": sum(len(item.get("tools", [])) for item in (flow_data.get("mcp_tools") or [])),
                "worker_count": len(flow_data.get("worker_agents") or []),
            }
            state["mutation_events"].append(event)
            if tool_name.startswith("update_"):
                update_counts = state["update_counts"]
                next_count = int(update_counts.get(agent_id, 0)) + 1
                update_counts[agent_id] = next_count
                if next_count >= 2:
                    current_root = _read_agent(state["root_agent_id"]) if state.get("root_agent_id") else None
                    reply = _build_builder_finalize_reply(state, current_root)
                    _builder_debug_log(
                        "builder_finalize_triggered",
                        reason="repeated_update_loop",
                        agent_id=agent_id,
                        update_count=next_count,
                        reply=reply,
                    )
                    raise BuilderFinalize(reply)

        def _insert_agent(payload: Dict[str, Any]) -> Dict[str, Any]:
            insert_res = user_db.table("agents").insert(
                {
                    "name": payload["name"],
                    "description": payload["description"],
                    "is_published": payload["is_published"],
                    "flow_data": payload["flow_data"],
                    "workspace_id": build_in.workspace_id,
                    "created_by": current_user.id,
                }
            ).execute()
            if not insert_res.data:
                raise ValueError("Failed to create agent")
            created = insert_res.data[0]
            state["touched_agent_ids"].add(created["id"])
            return created

        def _update_agent_row(agent_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
            update_res = user_db.table("agents").update(
                {
                    "name": payload["name"],
                    "description": payload["description"],
                    "is_published": payload["is_published"],
                    "flow_data": payload["flow_data"],
                    "workspace_id": build_in.workspace_id,
                }
            ).eq("id", agent_id).execute()
            if not update_res.data:
                raise ValueError(f"Failed to update agent {agent_id}")
            updated = update_res.data[0]
            state["touched_agent_ids"].add(updated["id"])
            return updated

        def _serialize_agent_list(agents: List[Dict[str, Any]]) -> str:
            return json.dumps(
                [
                    {
                        "id": agent["id"],
                        "name": agent.get("name"),
                        "description": agent.get("description"),
                        "is_manager_agent": bool((agent.get("flow_data") or {}).get("is_manager_agent", False)),
                    }
                    for agent in agents
                ]
            )

        def list_workspace_mcp_integrations() -> str:
            return json.dumps(
                [
                    {
                        "integration_id": provider.integration_id,
                        "provider_name": provider.provider_name,
                        "integration_type": provider.integration_type,
                        "tool_count": provider.tool_count,
                        "tool_names": [tool.name for tool in provider.tools],
                        "tools_loaded": bool(provider.tools),
                        "discovery_error": provider.discovery_error,
                    }
                    for provider in catalog
                ]
            )

        async def list_workspace_mcp_tools(integration_id: str) -> str:
            _builder_debug_log("tool_called", tool="list_workspace_mcp_tools", integration_id=integration_id)
            provider = await _ensure_provider_tools(integration_id)
            if not provider:
                return json.dumps([])
            if provider.discovery_error:
                _builder_debug_log(
                    "tool_result",
                    tool="list_workspace_mcp_tools",
                    integration_id=integration_id,
                    discovery_error=provider.discovery_error,
                )
                return json.dumps(
                    {
                        "integration_id": integration_id,
                        "error": provider.discovery_error,
                    }
                )
            provider = catalog_by_integration.get(integration_id)
            return json.dumps(
                [
                    {
                        "name": tool.name,
                        "description": tool.description,
                    }
                    for tool in provider.tools
                ]
            )

        def list_workspace_knowledge_bases() -> str:
            return json.dumps(knowledge_bases)

        def list_supported_models() -> str:
            return json.dumps(SUPPORTED_AGENT_MODELS)

        def list_existing_agents() -> str:
            return _serialize_agent_list(workspace_agents)

        def get_agent_json(agent_id: str) -> str:
            _builder_debug_log("tool_called", tool="get_agent_json", agent_id=agent_id)
            agent = _read_agent(agent_id)
            return json.dumps(agent)

        async def create_agent_from_manual_schema(payload_json: str) -> str:
            _builder_debug_log("tool_called", tool="create_agent_from_manual_schema")
            payload = _extract_json_object(payload_json)
            await _prime_catalog_for_payload(payload)
            clean_payload = _sanitize_manual_agent_payload(payload, catalog, knowledge_bases)
            _builder_debug_log(
                "tool_payload_sanitized",
                tool="create_agent_from_manual_schema",
                mcp_tools=clean_payload.get("flow_data", {}).get("mcp_tools", []),
                structured_output=bool(clean_payload.get("flow_data", {}).get("structured_output")),
                examples_preview=(clean_payload.get("flow_data", {}).get("examples", "")[:120]),
            )
            created = _insert_agent(clean_payload)
            schedule_payload = ((clean_payload.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or []
            if schedule_payload or ((clean_payload.get("flow_data") or {}).get("features") or {}).get("scheduler"):
                sync_agent_schedules(created, schedule_payload)
            _record_builder_mutation("create_agent_from_manual_schema", created["id"], clean_payload)
            if not state["root_agent_id"]:
                state["root_agent_id"] = created["id"]
            state["selected_agent_id"] = created["id"]
            workspace_agents.append(created)
            return json.dumps(created)

        async def update_agent_from_manual_schema(agent_id: str, payload_json: str) -> str:
            _builder_debug_log("tool_called", tool="update_agent_from_manual_schema", agent_id=agent_id)
            payload = _extract_json_object(payload_json)
            await _prime_catalog_for_payload(payload)
            existing_agent = _read_agent(agent_id)
            clean_payload = _sanitize_manual_agent_payload(payload, catalog, knowledge_bases, existing_agent=existing_agent)
            _builder_debug_log(
                "tool_payload_sanitized",
                tool="update_agent_from_manual_schema",
                agent_id=agent_id,
                mcp_tools=clean_payload.get("flow_data", {}).get("mcp_tools", []),
                structured_output=bool(clean_payload.get("flow_data", {}).get("structured_output")),
                examples_preview=(clean_payload.get("flow_data", {}).get("examples", "")[:120]),
            )
            updated = _update_agent_row(agent_id, clean_payload)
            schedule_payload = ((clean_payload.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or []
            existing_scheduler = (((existing_agent.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or [])
            if schedule_payload or existing_scheduler or ((clean_payload.get("flow_data") or {}).get("features") or {}).get("scheduler"):
                sync_agent_schedules(updated, schedule_payload)
            _record_builder_mutation("update_agent_from_manual_schema", agent_id, clean_payload)
            if state["root_agent_id"] == agent_id or not state["root_agent_id"]:
                state["root_agent_id"] = agent_id
            state["selected_agent_id"] = agent_id
            for index, agent in enumerate(workspace_agents):
                if agent["id"] == agent_id:
                    workspace_agents[index] = updated
                    break
            return json.dumps(updated)

        async def create_subagent_from_manual_schema(worker_key: str, payload_json: str) -> str:
            _builder_debug_log("tool_called", tool="create_subagent_from_manual_schema", worker_key=worker_key)
            payload = _extract_json_object(payload_json)
            await _prime_catalog_for_payload(payload)
            clean_payload = _sanitize_manual_agent_payload(payload, catalog, knowledge_bases, force_subagent=True)
            _builder_debug_log(
                "tool_payload_sanitized",
                tool="create_subagent_from_manual_schema",
                worker_key=worker_key,
                mcp_tools=clean_payload.get("flow_data", {}).get("mcp_tools", []),
            )
            created = _insert_agent(clean_payload)
            schedule_payload = ((clean_payload.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or []
            if schedule_payload or ((clean_payload.get("flow_data") or {}).get("features") or {}).get("scheduler"):
                sync_agent_schedules(created, schedule_payload)
            _record_builder_mutation("create_subagent_from_manual_schema", created["id"], clean_payload)
            state["worker_key_map"][worker_key] = created["id"]
            state["selected_agent_id"] = created["id"]
            workspace_agents.append(created)
            return json.dumps(created)

        async def update_subagent_from_manual_schema(agent_id: str, payload_json: str) -> str:
            _builder_debug_log("tool_called", tool="update_subagent_from_manual_schema", agent_id=agent_id)
            payload = _extract_json_object(payload_json)
            await _prime_catalog_for_payload(payload)
            existing_agent = _read_agent(agent_id)
            clean_payload = _sanitize_manual_agent_payload(
                payload,
                catalog,
                knowledge_bases,
                force_subagent=True,
                existing_agent=existing_agent,
            )
            _builder_debug_log(
                "tool_payload_sanitized",
                tool="update_subagent_from_manual_schema",
                agent_id=agent_id,
                mcp_tools=clean_payload.get("flow_data", {}).get("mcp_tools", []),
            )
            updated = _update_agent_row(agent_id, clean_payload)
            schedule_payload = ((clean_payload.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or []
            existing_scheduler = (((existing_agent.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or [])
            if schedule_payload or existing_scheduler or ((clean_payload.get("flow_data") or {}).get("features") or {}).get("scheduler"):
                sync_agent_schedules(updated, schedule_payload)
            _record_builder_mutation("update_subagent_from_manual_schema", agent_id, clean_payload)
            state["selected_agent_id"] = agent_id
            for index, agent in enumerate(workspace_agents):
                if agent["id"] == agent_id:
                    workspace_agents[index] = updated
                    break
            return json.dumps(updated)

        def link_manager_to_workers(manager_agent_id: str, worker_links_json: str) -> str:
            _builder_debug_log("tool_called", tool="link_manager_to_workers", manager_agent_id=manager_agent_id)
            worker_links = json.loads(worker_links_json)
            manager = _read_agent(manager_agent_id)
            flow_data = manager.get("flow_data") or {}
            managed_workers = []
            normalized_links = []
            for link in worker_links:
                agent_id = link.get("agent_id")
                if not agent_id:
                    key = link.get("key")
                    agent_id = state["worker_key_map"].get(key)
                if not agent_id:
                    continue
                normalized_links.append(
                    {
                        "agent_id": agent_id,
                        "description": link.get("description", ""),
                    }
                )
                worker_agent = _read_agent(agent_id)
                managed_workers.append(
                    {
                        "key": link.get("key") or worker_agent.get("name", agent_id),
                        "agent_id": agent_id,
                        "name": worker_agent.get("name", ""),
                    }
                )

            flow_data["is_manager_agent"] = bool(normalized_links)
            flow_data["worker_agents"] = normalized_links
            flow_data["auto_builder"] = {
                "managed_workers": managed_workers,
                "last_message": build_in.message,
            }
            updated = _update_agent_row(
                manager_agent_id,
                {
                    "name": manager.get("name", "Manager Agent"),
                    "description": manager.get("description", ""),
                    "is_published": manager.get("is_published", False),
                    "flow_data": flow_data,
                },
            )
            _record_builder_mutation(
                "link_manager_to_workers",
                manager_agent_id,
                {
                    "name": updated.get("name", "Manager Agent"),
                    "flow_data": updated.get("flow_data") or {},
                },
            )
            state["root_agent_id"] = manager_agent_id
            state["selected_agent_id"] = manager_agent_id
            for index, agent in enumerate(workspace_agents):
                if agent["id"] == manager_agent_id:
                    workspace_agents[index] = updated
                    break
            return json.dumps(updated)

        def unlink_worker_from_manager(manager_agent_id: str, worker_agent_id: str) -> str:
            _builder_debug_log(
                "tool_called",
                tool="unlink_worker_from_manager",
                manager_agent_id=manager_agent_id,
                worker_agent_id=worker_agent_id,
            )
            manager = _read_agent(manager_agent_id)
            flow_data = manager.get("flow_data") or {}
            flow_data["worker_agents"] = [
                link for link in (flow_data.get("worker_agents") or []) if link.get("agent_id") != worker_agent_id
            ]
            if not flow_data["worker_agents"]:
                flow_data["is_manager_agent"] = False
            auto_builder = flow_data.get("auto_builder") or {}
            auto_builder["managed_workers"] = [
                item for item in auto_builder.get("managed_workers", []) if item.get("agent_id") != worker_agent_id
            ]
            flow_data["auto_builder"] = auto_builder
            updated = _update_agent_row(
                manager_agent_id,
                {
                    "name": manager.get("name", "Manager Agent"),
                    "description": manager.get("description", ""),
                    "is_published": manager.get("is_published", False),
                    "flow_data": flow_data,
                },
            )
            _record_builder_mutation(
                "unlink_worker_from_manager",
                manager_agent_id,
                {
                    "name": updated.get("name", "Manager Agent"),
                    "flow_data": updated.get("flow_data") or {},
                },
            )
            state["selected_agent_id"] = manager_agent_id
            return json.dumps(updated)

        lc_tools = [
            StructuredTool.from_function(list_workspace_mcp_integrations, name="list_workspace_mcp_integrations", description="List available MCP/OpenAPI integrations in the workspace."),
            StructuredTool.from_function(coroutine=list_workspace_mcp_tools, name="list_workspace_mcp_tools", description="List available tools for a specific integration_id."),
            StructuredTool.from_function(list_workspace_knowledge_bases, name="list_workspace_knowledge_bases", description="List available knowledge bases in the workspace."),
            StructuredTool.from_function(list_supported_models, name="list_supported_models", description="List supported runtime models. Use these exact values for flow_data.model."),
            StructuredTool.from_function(list_existing_agents, name="list_existing_agents", description="List existing agents in the workspace."),
            StructuredTool.from_function(get_agent_json, name="get_agent_json", description="Read the full saved JSON for an agent."),
            StructuredTool.from_function(coroutine=create_agent_from_manual_schema, name="create_agent_from_manual_schema", description="Create the main/root agent using a JSON string in the manual agent schema."),
            StructuredTool.from_function(coroutine=update_agent_from_manual_schema, name="update_agent_from_manual_schema", description="Update an existing main/root agent using a JSON string in the manual agent schema."),
            StructuredTool.from_function(coroutine=create_subagent_from_manual_schema, name="create_subagent_from_manual_schema", description="Create a worker/sub agent using a JSON string in the manual agent schema."),
            StructuredTool.from_function(coroutine=update_subagent_from_manual_schema, name="update_subagent_from_manual_schema", description="Update an existing worker/sub agent using a JSON string in the manual agent schema."),
            StructuredTool.from_function(link_manager_to_workers, name="link_manager_to_workers", description="Enable manager mode on the main agent and link saved worker agents. Input worker_links_json as a JSON array of {key?, agent_id?, description}."),
            StructuredTool.from_function(unlink_worker_from_manager, name="unlink_worker_from_manager", description="Remove a saved worker link from a manager agent."),
        ]

        builder_prompt = f"""
You are the internal Agent Flow Builder for this product.
Use tools to inspect available MCP tools, knowledge bases, and existing agents, then create or update real agent rows.

Rules:
- Persist only using the provided tools.
- The saved schema must match the manual agent editor schema exactly.
- Never send partial agent payloads. Every create/update call must include a complete flow_data object with:
  model, role, goal, instructions, examples, structured_output, is_manager_agent,
  enable_thinking, features, mcp_tools, worker_agents, custom_url, custom_model_name,
  custom_api_key, kb_config, scheduler_config.
- role, goal, and instructions must never be blank.
- Keep flow_data.examples as normal plain text examples only.
- Put any JSON schema/object output format in flow_data.structured_output, not in examples.
- For multi-agent requests, create or update worker agents first, then link them to the manager agent.
- Do not invent integration IDs, tool names, knowledge base IDs, or agent IDs.
- Keep flows representable by one root agent plus linked worker agents.
- Use flow_data.model only from the supported runtime model values below, or call list_supported_models if unsure.
- Default runtime agents to {_default_agent_runtime_model()} unless the user explicitly asks for another supported model value.
- If the user asks for recurring or timed execution, set features.scheduler=true and include flow_data.scheduler_config in this exact shape:
  {{"schedules":[{{"name":"Weekly Summary","prompt":"...","timezone":"Asia/Kolkata","is_active":true,"frequency":"weekly","time_of_day":"09:00","weekdays":[1]}}]}}
- For interval schedules use:
  {{"name":"Check Leads","prompt":"...","timezone":"UTC","is_active":true,"frequency":"interval","time_of_day":"09:00","interval_value":2,"interval_unit":"hours"}}
- Do not ask for more steps or defer the task. Persist the agent changes in this turn.
- End with a concise plain-language summary of what you changed.

Supported runtime models:
{supported_models_json}
""".strip()

        builder_messages = [SystemMessage(content=builder_prompt)]
        for message in build_in.history or []:
            role = message.get("role", "user")
            content = message.get("content", "")
            if role == "assistant":
                builder_messages.append(AIMessage(content=content))
            else:
                builder_messages.append(HumanMessage(content=content))
        builder_messages.append(HumanMessage(content=build_in.message))

        phase = "initialize_builder_model"
        builder_model = _get_builder_model_name()
        builder_llm = _get_builder_chat_model({"model": builder_model}, builder_model, False)
        _builder_debug_log("phase_complete", phase=phase, builder_model=builder_model)
        reply = ""
        phase = "create_react_agent"
        agent_executor = create_react_agent(builder_llm, tools=lc_tools)
        _builder_debug_log("phase_complete", phase=phase)
        async def _run_builder_turn(
            messages: List[Any],
            *,
            attempt: str,
            recursion_limit: int,
            timeout_seconds: int,
        ) -> Tuple[Dict[str, Any], str]:
            _builder_debug_log(
                "phase_started",
                phase="invoke_react_agent",
                attempt=attempt,
                recursion_limit=recursion_limit,
                timeout_seconds=timeout_seconds,
            )
            result = await asyncio.wait_for(
                agent_executor.ainvoke(
                    {"messages": messages},
                    config={"recursion_limit": recursion_limit},
                ),
                timeout=timeout_seconds,
            )
            _builder_debug_log("phase_complete", phase="invoke_react_agent", attempt=attempt)
            final_messages = result.get("messages", [])
            if not final_messages:
                return result, ""
            final_content = final_messages[-1].content
            if isinstance(final_content, list):
                reply_text = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in final_content)
            else:
                reply_text = str(final_content)
            return result, reply_text

        phase = "invoke_react_agent"
        recursion_limit = int(os.environ.get("AGENT_BUILDER_RECURSION_LIMIT", "20"))
        timeout_seconds = int(os.environ.get("AGENT_BUILDER_TIMEOUT_SECONDS", "60"))
        try:
            agent_result, reply = await _run_builder_turn(
                builder_messages,
                attempt="primary",
                recursion_limit=recursion_limit,
                timeout_seconds=timeout_seconds,
            )

            phase = "retry_incomplete_builder_turn"
            if not state.get("root_agent_id") and len(state.get("touched_agent_ids", set())) == 0:
                _builder_debug_log(
                    "phase_started",
                    phase=phase,
                    reason="no_persisted_changes",
                    previous_reply=reply[:300] if reply else "",
                )
                retry_messages = [
                    *builder_messages,
                    AIMessage(content=reply or "Continue and finalize the build."),
                    HumanMessage(
                        content=(
                            "Complete this request in this turn. You must persist an agent now by calling "
                            "create_agent_from_manual_schema or update_agent_from_manual_schema with full flow_data including scheduler_config when needed, "
                            "then provide a concise summary of what you changed."
                        )
                    ),
                ]
                retry_recursion_limit = max(recursion_limit + 8, 28)
                retry_timeout_seconds = max(timeout_seconds + 15, 75)
                agent_result, reply = await _run_builder_turn(
                    retry_messages,
                    attempt="forced_completion",
                    recursion_limit=retry_recursion_limit,
                    timeout_seconds=retry_timeout_seconds,
                )
                _builder_debug_log(
                    "phase_complete",
                    phase=phase,
                    root_agent_id=state.get("root_agent_id"),
                    touched_count=len(state.get("touched_agent_ids", set())),
                )
        except BuilderFinalize as finalize:
            reply = finalize.reply
            _builder_debug_log(
                "phase_complete",
                phase="invoke_react_agent",
                attempt="finalized_early",
                root_agent_id=state.get("root_agent_id"),
                touched_count=len(state.get("touched_agent_ids", set())),
            )

        phase = "load_persisted_root_agent"
        root_agent = _read_agent(state["root_agent_id"]) if state.get("root_agent_id") else None

        phase = "load_sub_agents"
        sub_agents: List[Dict[str, Any]] = []
        if root_agent:
            worker_links = (root_agent.get("flow_data") or {}).get("worker_agents") or []
            for link in worker_links:
                worker_id = link.get("agent_id")
                if not worker_id:
                    continue
                try:
                    sub_agents.append(_read_agent(worker_id))
                except Exception:
                    continue

        phase = "build_response"
        selected_agent_id = state.get("selected_agent_id") or (root_agent["id"] if root_agent else None)
        _builder_debug_log(
            "request_completed",
            root_agent_id=root_agent.get("id") if root_agent else None,
            selected_agent_id=selected_agent_id,
            sub_agent_count=len(sub_agents),
        )
        return AgentBuilderChatResponse(
            reply=reply or "Agent flow updated.",
            root_agent=root_agent,
            sub_agents=sub_agents,
            selected_agent_id=selected_agent_id,
            graph=_build_agent_graph(root_agent, sub_agents),
        )
    except asyncio.TimeoutError as e:
        error_detail = {
            "phase": phase,
            "type": type(e).__name__,
            "error": f"Builder timed out after {os.environ.get('AGENT_BUILDER_TIMEOUT_SECONDS', '45')} seconds",
            "traceback": traceback.format_exc(),
            "debug_log": os.environ.get("AGENT_BUILDER_DEBUG_LOG", "/tmp/agent_builder_debug.log"),
        }
        _builder_debug_log("request_failed", **error_detail)
        logger.exception("Agent builder chat timed out during phase=%s", phase)
        raise HTTPException(status_code=504, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        error_detail = {
            "phase": phase,
            "type": type(e).__name__,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "debug_log": os.environ.get("AGENT_BUILDER_DEBUG_LOG", "/tmp/agent_builder_debug.log"),
        }
        _builder_debug_log("request_failed", **error_detail)
        logger.exception("Agent builder chat failed during phase=%s", phase)
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/auto-build", response_model=AgentAutoBuildResponse)
async def auto_build_agent(
    build_in: AgentAutoBuildRequest,
    user_db: Client = Depends(get_supabase_client_for_request),
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    try:
        catalog = await get_tool_catalog(build_in.workspace_id, user_db, admin_db, discover_tools=False)
        kb_res = user_db.table("knowledge_bases").select("id,name,description").eq("workspace_id", build_in.workspace_id).execute()
        knowledge_bases = kb_res.data or []

        existing_agent = None
        if build_in.agent_id:
            existing_res = user_db.table("agents").select("*").eq("id", build_in.agent_id).execute()
            if existing_res.data:
                existing_agent = existing_res.data[0]

        current_config = build_in.current_config or {}
        builder_model = _get_builder_model_name(build_in.model or current_config.get("model"))
        builder_llm = _get_chat_model({"model": builder_model}, builder_model, False)

        catalog_summary = []
        for provider in catalog:
            tool_names = [tool.name for tool in provider.tools[:20]]
            catalog_summary.append(
                {
                    "integration_id": provider.integration_id,
                    "provider_name": provider.provider_name,
                    "tools": tool_names,
                    "credentials": [field.key for field in provider.credentials],
                }
            )

        supported_models_json = json.dumps(SUPPORTED_AGENT_MODELS)

        builder_system = """
You are an expert agent architect for this exact product.
Return JSON only. Do not wrap in markdown.

You must generate a real agent payload matching this application's working schema:
- main agent: name, description, is_published, flow_data
- optional worker_agent_blueprints for manager-agent setups
- main flow_data.worker_agents should use temporary worker keys before persistence, e.g. [{"key":"researcher","description":"Use for ..."}]

Rules:
- Use only provided integration IDs, knowledge base IDs, and tool names.
- Use flow_data.model only from the supported runtime model values listed below.
- If a tool provider is selected, include exact tool names under flow_data.mcp_tools.
- Keep examples as plain text only; if JSON output format is needed, put it in structured_output.
- Enable knowledge_base only if a valid kb_id is selected.
- If the user wants recurring execution, set features.scheduler=true and include flow_data.scheduler_config with a schedules array.
- Use is_manager_agent=true only when the user clearly asked for manager + worker or multi-agent behavior.
- Keep config practical and minimal.
- Prefer __DEFAULT_RUNTIME_MODEL__ unless the user explicitly asks for another supported model value.
- worker_agent_blueprints must be fully runnable agents using the same flow_data structure, but with is_manager_agent=false.

Supported runtime models:
__SUPPORTED_MODELS__

Return shape:
{
  "reply": "short summary of what changed",
  "agent": {
    "name": "...",
    "description": "...",
    "is_published": false,
    "flow_data": {
      "model": "__DEFAULT_RUNTIME_MODEL__",
      "role": "...",
      "goal": "...",
      "instructions": "...",
      "examples": "",
      "structured_output": "",
      "is_manager_agent": false,
      "enable_thinking": false,
      "features": {
        "knowledge_base": false,
        "data_query": false,
        "scheduler": false,
        "webhook_trigger": false,
        "memory": false
      },
      "mcp_tools": [{"mcp_id":"...", "tools":["tool_name"]}],
      "worker_agents": [{"key":"worker_key","description":"..."}],
      "custom_url": "",
      "custom_model_name": "",
      "custom_api_key": "",
      "kb_config": null,
      "scheduler_config": null
    }
  },
  "worker_agent_blueprints": [
    {
      "key":"worker_key",
      "name":"...",
      "description":"...",
      "flow_data": {
        "model":"__DEFAULT_RUNTIME_MODEL__",
        "role":"...",
        "goal":"...",
        "instructions":"...",
        "examples":"",
        "structured_output":"",
        "is_manager_agent": false,
        "enable_thinking": false,
        "features": {
          "knowledge_base": false,
          "data_query": false,
          "scheduler": false,
          "webhook_trigger": false,
          "memory": false
        },
        "mcp_tools": [],
        "worker_agents": [],
        "custom_url": "",
        "custom_model_name": "",
        "custom_api_key": "",
        "kb_config": null,
        "scheduler_config": null
      }
    }
  ]
}
""".strip().replace("__DEFAULT_RUNTIME_MODEL__", _default_agent_runtime_model()).replace("__SUPPORTED_MODELS__", supported_models_json)

        history_lines = []
        for msg in build_in.history or []:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_lines.append(f"{role.upper()}: {content}")

        builder_user = json.dumps(
            {
                "prompt": build_in.prompt,
                "current_config": current_config,
                "existing_agent": existing_agent,
                "available_integrations": catalog_summary,
                "available_knowledge_bases": knowledge_bases,
                "available_models": SUPPORTED_AGENT_MODELS,
                "builder_history": history_lines,
            }
        )

        response = await builder_llm.ainvoke(
            [
                SystemMessage(content=builder_system),
                HumanMessage(content=builder_user),
            ]
        )
        parsed = _extract_json_object(response.content if hasattr(response, "content") else str(response))

        generated_agent = parsed.get("agent") or {}
        clean_flow, worker_blueprints = _sanitize_generated_flow_data(generated_agent, catalog, knowledge_bases)
        generated_config = {
            "name": generated_agent.get("name", existing_agent.get("name") if existing_agent else "Generated Agent"),
            "description": generated_agent.get("description", existing_agent.get("description") if existing_agent else ""),
            "is_published": bool(generated_agent.get("is_published", False)),
            "flow_data": {
                **clean_flow,
                "workspace_id": build_in.workspace_id,
            },
        }

        existing_worker_map = {}
        if existing_agent:
            auto_builder_meta = ((existing_agent.get("flow_data") or {}).get("auto_builder")) or {}
            for item in auto_builder_meta.get("managed_workers", []):
                if item.get("key") and item.get("agent_id"):
                    existing_worker_map[item["key"]] = item["agent_id"]

        persisted_workers = []
        worker_refs = []
        managed_workers = []

        for worker in worker_blueprints:
            worker_key = worker.get("key")
            if not worker_key:
                continue
            worker_payload = _shape_worker_payload(worker)
            worker_payload["flow_data"]["workspace_id"] = build_in.workspace_id

            worker_id = existing_worker_map.get(worker_key)
            if worker_id:
                worker_res = user_db.table("agents").update(worker_payload).eq("id", worker_id).execute()
                persisted_worker = worker_res.data[0] if worker_res.data else None
            else:
                worker_payload["created_by"] = current_user.id
                create_res = user_db.table("agents").insert(
                    {
                        "name": worker_payload["name"],
                        "description": worker_payload["description"],
                        "is_published": worker_payload["is_published"],
                        "flow_data": {k: v for k, v in worker_payload["flow_data"].items() if k != "workspace_id"},
                        "workspace_id": build_in.workspace_id,
                        "created_by": current_user.id,
                    }
                ).execute()
                persisted_worker = create_res.data[0] if create_res.data else None

            if persisted_worker:
                worker_schedule_payload = (((worker_payload.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or [])
                if worker_schedule_payload or (((worker_payload.get("flow_data") or {}).get("features") or {}).get("scheduler")):
                    sync_agent_schedules(persisted_worker, worker_schedule_payload)
                persisted_workers.append(persisted_worker)
                worker_refs.append(
                    {
                        "agent_id": persisted_worker["id"],
                        "description": next(
                            (item.get("description", "") for item in clean_flow.get("worker_agents", []) if item.get("key") == worker_key),
                            worker.get("description", ""),
                        ),
                    }
                )
                managed_workers.append(
                    {
                        "key": worker_key,
                        "agent_id": persisted_worker["id"],
                        "name": persisted_worker["name"],
                    }
                )

        generated_config["flow_data"]["worker_agents"] = worker_refs if clean_flow["is_manager_agent"] else []
        generated_config["flow_data"]["auto_builder"] = {
            "managed_workers": managed_workers,
            "last_prompt": build_in.prompt,
        }

        if existing_agent:
            main_res = user_db.table("agents").update(
                {
                    "name": generated_config["name"],
                    "description": generated_config["description"],
                    "is_published": generated_config["is_published"],
                    "flow_data": {k: v for k, v in generated_config["flow_data"].items() if k != "workspace_id"},
                    "workspace_id": build_in.workspace_id,
                }
            ).eq("id", existing_agent["id"]).execute()
            persisted_agent = main_res.data[0]
        else:
            create_main = user_db.table("agents").insert(
                {
                    "name": generated_config["name"],
                    "description": generated_config["description"],
                    "is_published": generated_config["is_published"],
                    "flow_data": {k: v for k, v in generated_config["flow_data"].items() if k != "workspace_id"},
                    "workspace_id": build_in.workspace_id,
                    "created_by": current_user.id,
                }
            ).execute()
            persisted_agent = create_main.data[0]

        root_schedule_payload = (((generated_config.get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or [])
        existing_root_scheduler = ((((existing_agent or {}).get("flow_data") or {}).get("scheduler_config") or {}).get("schedules") or [])
        if root_schedule_payload or existing_root_scheduler or (((generated_config.get("flow_data") or {}).get("features") or {}).get("scheduler")):
            sync_agent_schedules(persisted_agent, root_schedule_payload)

        return AgentAutoBuildResponse(
            reply=parsed.get("reply", "Agent configuration generated and saved."),
            agent=persisted_agent,
            worker_agents=persisted_workers,
            generated_config=generated_config,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Agent auto-build failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{agent_id}/invoke")
async def invoke_agent_with_api_key(
    agent_id: str,
    chat_in: ChatRequest,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    admin_db: Client = Depends(get_admin_db),
):
    """
    Invoke an agent using a user API key instead of a Supabase session token.
    Accepted forms:
    - X-API-Key: ifk_<user_id>_<secret>
    - Authorization: Bearer ifk_<user_id>_<secret>
    """
    raw_api_key = _extract_user_api_key(x_api_key, authorization)
    if not raw_api_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    validated_user = validate_user_api_key(admin_db, raw_api_key)
    if not validated_user or not validated_user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid API key")

    principal = _ApiKeyPrincipal(
        user_id=str(validated_user["id"]),
        email=validated_user.get("email"),
        user_metadata=validated_user.get("user_metadata") or {},
    )
    return await chat_with_agent(agent_id=agent_id, chat_in=chat_in, db=admin_db, current_user=principal)


@router.post("/{agent_id}/chat")
async def chat_with_agent(
    agent_id: str,
    chat_in: ChatRequest,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    print(f"BREADCRUMB: chat_with_agent called for agent_id={agent_id}")
    """Chat with an agent using LangGraph."""
    try:
        res = db.table("agents").select("*").eq("id", agent_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Agent not found")

        agent = res.data[0]
        if str(agent.get("created_by") or "") != str(current_user.id):
            raise HTTPException(status_code=403, detail="You do not have access to this agent")
        flow_data = agent.get("flow_data") or {}
        print(f"DEBUG: Chat request for agent {agent_id}. Flow data keys: {list(flow_data.keys())}")
        if "kb_config" in flow_data:
             print(f"DEBUG: kb_config: {flow_data['kb_config']}")
        if "features" in flow_data:
             print(f"DEBUG: features: {flow_data['features']}")

        model_name = _normalize_model_value(flow_data.get("model"), fallback=_default_agent_runtime_model())
        print(f"DEBUG: Using model: {model_name}")
        system_prompt, features, kb_config, is_agentic_rag = _build_agent_system_prompt(db, flow_data, chat_in.message)
        print(f"DEBUG: Features: {features}")
        print(f"DEBUG: KB Config: {kb_config}")
        print(f"DEBUG: Final system prompt length: {len(system_prompt)}")
        lc_messages = _build_lc_messages(system_prompt, chat_in.history or [], chat_in.message)

        enable_thinking = chat_in.enable_thinking or flow_data.get("enable_thinking", False)
        chat_model = _get_chat_model(flow_data, model_name, enable_thinking)


        # ── STREAMING MODE ────────────────────────────────────────
        if chat_in.stream:
            logger.info(f"Langgraph Streaming chat model={model_name} thinking={enable_thinking}")

            async def stream_generator():
                queue = asyncio.Queue()

                async def produce():
                    try:
                        has_tooling = bool(
                            flow_data.get("mcp_tools")
                            or (features.get("knowledge_base") and is_agentic_rag)
                            or (flow_data.get("is_manager_agent") and flow_data.get("worker_agents"))
                        )

                        if has_tooling:
                            buffered_response = await _run_agent_non_streaming(
                                db,
                                agent,
                                chat_in.message,
                                chat_in.history or [],
                                enable_thinking_override=enable_thinking,
                            )
                            reply_text = buffered_response.get("reply", "")
                            thinking_content = buffered_response.get("thinking")
                            if thinking_content:
                                await queue.put(f"data: {json.dumps({'type': 'thinking', 'content': thinking_content})}\n\n")
                            if reply_text:
                                await queue.put(f"data: {json.dumps({'type': 'content', 'content': reply_text})}\n\n")
                            await queue.put(
                                f"data: {json.dumps({'type': 'done', 'model_used': model_name, 'thinking': thinking_content})}\n\n"
                            )
                        else:
                            thinking_buf = ""
                            in_thinking = False
                            async for chunk in chat_model.astream(lc_messages):
                                reasoning_part = ""
                                if hasattr(chunk, "additional_kwargs"):
                                    reasoning_part = chunk.additional_kwargs.get("reasoning_content", "") or chunk.additional_kwargs.get("thinking", "")
                                if hasattr(chunk, "response_metadata") and not reasoning_part:
                                    reasoning_part = chunk.response_metadata.get("thinking", "")
                                if not reasoning_part and hasattr(chunk, "message") and hasattr(chunk.message, "thinking"):
                                    reasoning_part = chunk.message.thinking

                                if reasoning_part:
                                    in_thinking = True
                                    thinking_buf += reasoning_part
                                    await queue.put(f"data: {json.dumps({'type': 'thinking', 'content': reasoning_part})}\n\n")

                                content = chunk.content
                                if isinstance(content, list):
                                    for c in content:
                                        if isinstance(c, dict) and c.get("type") == "text":
                                            await queue.put(f"data: {json.dumps({'type': 'content', 'content': c['text']})}\n\n")
                                elif isinstance(content, str):
                                    text = content
                                    if "<think>" in text:
                                        in_thinking = True
                                        text = text.replace("<think>", "")
                                    if "</think>" in text:
                                        in_thinking = False
                                        text = text.replace("</think>", "")
                                        if thinking_buf:
                                            await queue.put(f"data: {json.dumps({'type': 'thinking_done'})}\n\n")
                                        continue

                                    if in_thinking and not reasoning_part:
                                        thinking_buf += text
                                        await queue.put(f"data: {json.dumps({'type': 'thinking', 'content': text})}\n\n")
                                    elif text and not reasoning_part:
                                        await queue.put(f"data: {json.dumps({'type': 'content', 'content': text})}\n\n")

                            await queue.put(f"data: {json.dumps({'type': 'done', 'model_used': model_name, 'thinking': thinking_buf if thinking_buf else None})}\n\n")

                    except Exception as e:
                        def _unwrap_local(exc):
                            if hasattr(exc, "exceptions"):
                                return ", ".join(_unwrap_local(x) for x in exc.exceptions)
                            return str(exc)
                        err_msg = _unwrap_local(e)
                        logger.exception(f"Streaming error: {err_msg}")
                        await queue.put(f"data: {json.dumps({'type': 'error', 'content': err_msg})}\n\n")
                    finally:
                        await queue.put(None)

                task = asyncio.create_task(produce())
                try:
                    while True:
                        item = await queue.get()
                        if item is None:
                            break
                        yield item
                finally:
                    task.cancel()

            return StreamingResponse(
                stream_generator(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
            )

        # ── NON-STREAMING MODE ────────────────────────────────────
        return await _run_agent_non_streaming(
            db,
            agent,
            chat_in.message,
            chat_in.history or [],
            enable_thinking_override=enable_thinking,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Chat endpoint error: {e}")
        def _unwrap(exc):
            if hasattr(exc, "exceptions"):
                return ", ".join(_unwrap(x) for x in exc.exceptions)
            return str(exc)
        raise HTTPException(status_code=500, detail=f"Inference Error: {_unwrap(e)}")


async def execute_agent_internal(db: Client, agent_id: str, message: str, history: List[Dict[str, str]]):
    """Internal core logic for agent execution to allow recursive manager-worker calls."""
    res = db.table("agents").select("*").eq("id", agent_id).execute()
    if not res.data:
        raise ValueError("Agent not found")

    agent = res.data[0]
    return await _run_agent_non_streaming(
        db,
        agent,
        message,
        history or [],
        enable_thinking_override=agent.get("flow_data", {}).get("enable_thinking", False),
    )


def _serialize_schedule_response(schedule: Dict[str, Any]) -> Dict[str, Any]:
    return (schedule.get("config") or {}) | {
        "id": schedule.get("id"),
        "cron_expression": schedule.get("cron_expression"),
        "last_run_at": schedule.get("last_run_at"),
        "last_status": schedule.get("last_status"),
        "last_response": schedule.get("last_response"),
    }


@router.get("/{agent_id}/schedules", response_model=List[AgentScheduleConfig])
def get_agent_schedules(
    agent_id: str,
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    try:
        agent_res = admin_db.table("agents").select("id,created_by").eq("id", agent_id).execute()
        if not agent_res.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent = agent_res.data[0]
        if str(agent.get("created_by") or "") != str(current_user.id):
            raise HTTPException(status_code=403, detail="You do not have access to this agent")
        schedules = list_agent_schedules(agent_id)
        return [_serialize_schedule_response(schedule) for schedule in schedules]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load agent schedules")
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{agent_id}/schedules", response_model=List[AgentScheduleConfig])
def update_agent_schedules(
    agent_id: str,
    schedule_payload: AgentScheduleConfigPayload,
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    try:
        agent_res = admin_db.table("agents").select("*").eq("id", agent_id).execute()
        if not agent_res.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent = agent_res.data[0]
        if str(agent.get("created_by") or "") != str(current_user.id):
            raise HTTPException(status_code=403, detail="You do not have access to this agent")

        synced = sync_agent_schedules(agent, [item.model_dump() for item in schedule_payload.schedules])
        return [_serialize_schedule_response(schedule) for schedule in synced]
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to sync agent schedules")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{agent_id}/schedules/{schedule_id}", response_model=List[AgentScheduleConfig])
def remove_agent_schedule(
    agent_id: str,
    schedule_id: str,
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    try:
        agent_res = admin_db.table("agents").select("id,created_by").eq("id", agent_id).execute()
        if not agent_res.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent = agent_res.data[0]
        if str(agent.get("created_by") or "") != str(current_user.id):
            raise HTTPException(status_code=403, detail="You do not have access to this agent")
        existing = list_agent_schedules(agent_id)
        remaining = [schedule.get("config") | {"id": schedule.get("id")} for schedule in existing if schedule.get("id") != schedule_id]
        synced = sync_agent_schedules({"id": agent_id, **agent}, remaining)
        return [_serialize_schedule_response(schedule) for schedule in synced]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to remove agent schedule")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/scheduled/overview")
def get_scheduled_task_overview(current_user=Depends(get_current_user)):
    try:
        return get_user_schedule_overview(str(current_user.id))
    except Exception as exc:
        logger.exception("Failed to load scheduled task overview")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/scheduled/tasks")
def get_scheduled_tasks(current_user=Depends(get_current_user)):
    try:
        return {
            "tasks": list_user_scheduled_tasks(str(current_user.id)),
            "recent_runs": list_user_schedule_runs(str(current_user.id), limit=25),
        }
    except Exception as exc:
        logger.exception("Failed to load scheduled tasks")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/scheduled/tasks/{schedule_id}/toggle")
def toggle_scheduled_task(
    schedule_id: str,
    is_active: bool,
    current_user=Depends(get_current_user),
):
    try:
        schedule = get_agent_schedule(schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Scheduled run not found")
        if str(schedule.get("created_by") or "") != str(current_user.id):
            raise HTTPException(status_code=403, detail="You do not have access to this scheduled run")

        updated = set_schedule_active_state(schedule_id, is_active)
        if not updated:
            raise HTTPException(status_code=404, detail="Scheduled run not found")
        return _serialize_schedule_response(updated)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to toggle scheduled task")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/scheduled/tasks/{schedule_id}")
def delete_scheduled_task(
    schedule_id: str,
    current_user=Depends(get_current_user),
):
    try:
        schedule = get_agent_schedule(schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail="Scheduled run not found")
        if str(schedule.get("created_by") or "") != str(current_user.id):
            raise HTTPException(status_code=403, detail="You do not have access to this scheduled run")

        agent_id = delete_schedule_by_id(schedule_id)
        return {"deleted": True, "agent_id": agent_id, "schedule_id": schedule_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete scheduled task")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/scheduled/{schedule_id}/run", response_model=AgentScheduledRunResponse)
async def run_agent_from_schedule(
    schedule_id: str,
    x_schedule_token: Optional[str] = Header(default=None, alias="X-Infynd-Schedule-Token"),
    admin_db: Client = Depends(get_admin_db),
):
    schedule = get_agent_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Scheduled run not found")
    if not schedule.get("is_active"):
        raise HTTPException(status_code=409, detail="Scheduled run is inactive")
    if str(schedule.get("trigger_token") or "") != str(x_schedule_token or ""):
        raise HTTPException(status_code=401, detail="Invalid schedule trigger token")

    agent_id = schedule.get("agent_id")
    agent_res = admin_db.table("agents").select("*").eq("id", agent_id).execute()
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Agent not found for scheduled run")

    run_id: Optional[str] = None
    try:
        run_id = mark_schedule_running(schedule_id)
        result = await execute_agent_internal(
            admin_db,
            agent_id,
            schedule.get("prompt") or "",
            [],
        )
        record_schedule_result(schedule_id, "success", result, run_id=run_id)
        return AgentScheduledRunResponse(
            schedule_id=schedule_id,
            agent_id=agent_id,
            reply=result.get("reply", ""),
            model_used=result.get("model_used", ""),
            thinking=result.get("thinking"),
        )
    except HTTPException as exc:
        record_schedule_result(schedule_id, "failed", {"error": str(exc.detail)}, run_id=run_id, error_message=str(exc.detail))
        raise
    except Exception as exc:
        logger.exception("Scheduled agent execution failed")
        record_schedule_result(schedule_id, "failed", {"error": str(exc)}, run_id=run_id, error_message=str(exc))
        raise HTTPException(status_code=500, detail=f"Scheduled execution failed: {str(exc)}")

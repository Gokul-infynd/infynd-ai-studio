from dotenv import load_dotenv
load_dotenv()  # Load ALL .env vars into os.environ (needed for LiteLLM API keys)

import os
import sys

# Add the Langflow backend source to the system path
SERVICES_PATH = os.path.join(os.getcwd(), "..", "services", "workflow-builder", "src", "backend", "base")
sys.path.append(SERVICES_PATH)

# Configure Langflow to use our Supabase Postgres connection exactly as Infynd does
db_url = os.environ.get("DATABASE_URL")
print(f"DEBUG: Using DATABASE_URL={db_url}")
os.environ["LANGFLOW_DATABASE_URL"] = db_url
# Auto-login disables the Langflow specific auth screen so it can be seamlessly embedded
os.environ["LANGFLOW_AUTO_LOGIN"] = "false"
os.environ["LANGFLOW_SKIP_AUTH_AUTO_LOGIN"] = "false"
# Configure cookies for development/proxied environment
os.environ["LANGFLOW_ACCESS_SAME_SITE"] = "lax"
os.environ["LANGFLOW_ACCESS_SECURE"] = "false"
os.environ["LANGFLOW_COOKIE_DOMAIN"] = ""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.supabase import supabase

from langflow.main import setup_app as setup_langflow_app

# Mount the Langflow engine to /lf 
# This leverages the native langflow ecosystem directly on our FastAPI process
# We use setup_app to serve both the API and the pre-built React frontend correctly
import warnings
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    # We define it globally so the lifespan can find it
    try:
        # Tries to serve both the API and the compiled React frontend
        lf_app = setup_langflow_app(backend_only=False)
    except Exception:
        # Fallback to backend API only
        lf_app = setup_langflow_app(backend_only=True)

# NOW we can safely import our API router which might use Langflow models
from app.api.v1.api import api_router

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # This is where we trigger the Langflow sub-app's lifespan
    # Langflow uses its own specialized lifespan context manager
    if hasattr(lf_app, "router") and lf_app.router.lifespan_context:
        async with lf_app.router.lifespan_context(lf_app):
            yield
    else:
        yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    description="Backend API for Infynd AI Studio with Supabase Authentication.",
    lifespan=lifespan
)

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.middleware("http")
async def log_auth_header(request: Request, call_next):
    if request.url.path.startswith("/api/v1/"):
        auth = request.headers.get("authorization")
        print(f"DEBUG: Request to {request.method} {request.url.path} - Auth: {'Present' if auth else 'MISSING'}")
    response = await call_next(request)
    return response

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "message": "Welcome to Infynd AI Studio API", 
        "docs": "/docs"
    }

@app.get("/health_check")
def health_check():
    return {"status": "ok"}

@app.get("/todos")
def get_todos():
    """
    Sample route using Supabase Python SDK (REST).
    """
    try:
        response = supabase.table('todos').select("*").execute()
        return response.data
    except Exception as e:
        return {"error": str(e)}

app.mount("/lf", lf_app)

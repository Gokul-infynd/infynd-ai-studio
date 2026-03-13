#!/bin/bash
source .venv/bin/activate
export LANGFLOW_LOG_LEVEL=debug
uvicorn app.main:app --reload --port 8000

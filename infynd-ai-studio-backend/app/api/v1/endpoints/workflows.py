from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Any, Optional
import json
import logging
import asyncio
from datetime import datetime

from supabase import Client
from app.schemas.workflow import WorkflowCreate, WorkflowUpdate, WorkflowResponse, WorkflowExecuteRequest, WorkflowExecuteResponse
from app.api.deps import get_current_user, get_supabase_client_for_request
from fastapi.security.api_key import APIKeyHeader

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
def create_workflow(
    workflow_in: WorkflowCreate,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    """Create a new visual workflow."""
    try:
        data = workflow_in.model_dump()
        data["created_by"] = current_user.id
        
        res = db.table("workflows").insert(data).execute()
        if not res.data:
            raise Exception("Workflow creation did not return data")
        return res.data[0]
    except Exception as e:
        logger.exception(f"Create workflow error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[WorkflowResponse])
def get_workflows(
    workspace_id: str,
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Get all workflows for a workspace."""
    try:
        res = db.table("workflows").select("*").eq("workspace_id", workspace_id).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: str, 
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Get a single workflow by ID."""
    try:
        res = db.table("workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: str, 
    workflow_in: WorkflowUpdate, 
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Update an existing workflow."""
    try:
        data = workflow_in.model_dump(exclude_unset=True)
        data["updated_at"] = datetime.utcnow().isoformat()
        
        res = db.table("workflows").update(data).eq("id", workflow_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Workflow not found or could not be updated")
            
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{workflow_id}")
def delete_workflow(
    workflow_id: str, 
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Delete a workflow."""
    try:
        res = db.table("workflows").delete().eq("id", workflow_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Placeholder execution dependency since API key integration isn't fully detailed in the prompt, 
# using the standard auth requirement for now, but keeping the path open.
@router.post("/{workflow_id}/execute", response_model=WorkflowExecuteResponse)
async def execute_workflow(
    workflow_id: str,
    exec_req: WorkflowExecuteRequest,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    """Execute a workflow via API."""
    try:
        # 1. Fetch the workflow data
        res = db.table("workflows").select("*").eq("id", workflow_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow = res.data[0]
        
        # 2. Log run creation
        run_data = {
            "workflow_id": workflow["id"],
            "workspace_id": workflow["workspace_id"],
            "created_by": current_user.id,
            "inputs": exec_req.inputs,
            "status": "running"
        }
        
        run_res = db.table("workflow_runs").insert(run_data).execute()
        run_id = run_res.data[0]["id"]
        
        # 3. Execution logic proxy
        # Since the builder is an isolated microservice, we will simulate execution or pass it via API here later.
        # For now, we mock the execution result so the frontend can work safely.
        await asyncio.sleep(1) # Simulated delay
        
        outputs = {"status": "success", "message": "Workflow executed (simulated proxy)"}
        
        # 4. Update run record
        db.table("workflow_runs").update({
            "status": "completed", 
            "outputs": outputs,
            "completed_at": datetime.utcnow().isoformat()
        }).eq("id", run_id).execute()
        
        return WorkflowExecuteResponse(
            run_id=run_id,
            status="completed",
            outputs=outputs
        )
        
    except Exception as e:
        logger.exception(f"Execution error: {e}")
        # Mark as failed if we have a run_id
        if 'run_id' in locals():
            db.table("workflow_runs").update({
                "status": "failed", 
                "error_message": str(e),
                "completed_at": datetime.utcnow().isoformat()
            }).eq("id", run_id).execute()
            
        raise HTTPException(status_code=500, detail=str(e))

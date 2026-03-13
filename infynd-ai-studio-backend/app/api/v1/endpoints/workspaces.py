from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from supabase import Client

from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse
from app.api.deps import get_current_user, get_supabase_client_for_request

router = APIRouter()


@router.get("", response_model=List[WorkspaceResponse])
def get_workspaces(
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    """Get all workspaces the current user belongs to."""
    try:
        # Get workspace IDs from membership
        membership_res = db.table("workspace_members").select("workspace_id").eq("user_id", current_user.id).execute()
        
        if not membership_res.data:
            return []
        
        ws_ids = [m["workspace_id"] for m in membership_res.data]
        
        # Fetch workspace details
        res = db.table("workspaces").select("*").in_("id", ws_ids).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    ws_in: WorkspaceCreate,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    """Create a new workspace and add the current user as owner."""
    try:
        # Ensure profile exists
        db.table("profiles").upsert({
            "id": current_user.id,
            "full_name": current_user.user_metadata.get("full_name", "") if current_user.user_metadata else "",
        }).execute()
        
        # Create workspace
        ws_res = db.table("workspaces").insert({"name": ws_in.name}).execute()
        if not ws_res.data:
            raise Exception("Could not create workspace")
        
        ws_id = ws_res.data[0]["id"]
        
        # Add user as owner
        db.table("workspace_members").insert({
            "workspace_id": ws_id,
            "user_id": current_user.id,
            "role": "owner",
        }).execute()
        
        return ws_res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

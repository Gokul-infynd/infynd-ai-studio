from fastapi import APIRouter, HTTPException, Depends, status
from app.schemas.user import UserCreate, UserLogin, PasswordReset, PasswordUpdate, TokenResponse, UserResponse
from app.db.supabase import supabase  # The public/anon singleton client for signup/login
from app.api.deps import get_supabase_client_for_request, get_current_user, get_admin_db
from supabase import Client
from app.utils.langflow_sync import ensure_langflow_user, get_langflow_tokens
from fastapi.responses import Response
from app.utils.user_api_keys import (
    get_user_api_key_metadata,
    revoke_user_api_key,
    rotate_user_api_key,
)

router = APIRouter()

@router.post("/signup", response_model=dict, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate):
    """
    Register a new user using Supabase Authentication.
    A confirmation email will be sent automatically by Supabase 
    (if email confirmations are enabled in Supabase project settings).
    """
    try:
        if not supabase:
            raise ValueError("Supabase client is not configured. Missing URL or KEY.")
        res = supabase.auth.sign_up({
            "email": user_in.email,
            "password": user_in.password,
            "options": {
                "data": {
                    "full_name": user_in.full_name
                }
            }
        })
        return {
            "message": "User created successfully. Please check your email to verify your account.",
            "user_id": res.user.id if res.user else None
        }
    except Exception as e:
         raise HTTPException(
             status_code=status.HTTP_400_BAD_REQUEST, 
             detail=f"Signup failed: {str(e)}"
         )

@router.post("/login", response_model=TokenResponse)
async def login(user_in: UserLogin):
    """
    Authenticate a user and return the Supabase JWT session (Access Token).
    """
    try:
        if not supabase:
            raise ValueError("Supabase client is not configured. Missing URL or KEY.")
        res = supabase.auth.sign_in_with_password({
            "email": user_in.email,
            "password": user_in.password
        })
        
        user_data = None
        if res.user:
            user_data = {
                "id": res.user.id,
                "email": res.user.email,
                "full_name": res.user.user_metadata.get("full_name") if res.user.user_metadata else None
            }
            # Ensure Langflow shadow user exists for multi-tenancy
            try:
                await ensure_langflow_user(res.user.id, res.user.email, user_data["full_name"])
            except Exception as e:
                # Log error but don't block login
                print(f"Warning: Langflow user sync failed: {e}")
        
        return {
            "access_token": res.session.access_token if res.session else None,
            "token_type": res.session.token_type if res.session else "Bearer",
            "user": user_data
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=f"Login failed: Incorrect email or password. Error: {str(e)}"
        )

@router.post("/reset-password")
def reset_password(payload: PasswordReset):
    """
    Send a password reset email using Supabase.
    User will click the link in the email, which redirects them to the frontend with an access token, 
    so they can then call update-password.
    """
    try:
        if not supabase:
            raise ValueError("Supabase client is not configured. Missing URL or KEY.")
        # Note: You may want to configure your redirect_to url depending on your frontend
        # e.g., supabase.auth.reset_password_email(payload.email, {"redirect_to": "http://localhost:3000/update-password"})
        res = supabase.auth.reset_password_email(payload.email)
        return {"message": "If that email exists, a password reset link has been sent."}
    except Exception as e:
        raise HTTPException(
             status_code=status.HTTP_400_BAD_REQUEST, 
             detail=str(e)
        )

@router.post("/update-password")
def update_password(payload: PasswordUpdate, client: Client = Depends(get_supabase_client_for_request)):
    """
    Update user's password. 
    Requires the access token obtained from the reset link (sent inside Authorization Bearer header).
    """
    try:
        res = client.auth.update_user({
            "password": payload.new_password
        })
        return {"message": "Password updated successfully."}
    except Exception as e:
        raise HTTPException(
             status_code=status.HTTP_400_BAD_REQUEST, 
             detail=f"Failed to update password: {str(e)}"
        )

@router.get("/me", response_model=UserResponse)
def get_me(current_user=Depends(get_current_user)):
    """
    Get the details of the currently authenticated user.
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.user_metadata.get("full_name") if current_user.user_metadata else None
    }

@router.get("/langflow-token")
async def get_langflow_token(response: Response, current_user=Depends(get_current_user)):
    """
    Returns a short-lived access token for Langflow and sets the 'access_token_lf' cookie
    to enable seamless iframe embedding for the current multifancy user.
    """
    try:
        # Just-in-case sync
        await ensure_langflow_user(current_user.id, current_user.email, current_user.user_metadata.get("full_name"))
        
        # Get the Langflow JWTs
        access_token, refresh_token = await get_langflow_tokens(current_user.id)
        if not access_token:
            raise HTTPException(status_code=500, detail="Failed to generate Langflow tokens")
            
        # Set cookies for the iframe to load a full session
        # Use SameSite=lax so cookies are sent when the iframe loads from localhost:3000 -> localhost:8000
        common_opts = {
            "httponly": True,
            "samesite": "lax",
            "secure": False, # Set to True in production with HTTPS
            "path": "/"
        }
        
        response.set_cookie(key="access_token_lf", value=access_token, **common_opts)
        response.set_cookie(key="refresh_token_lf", value=refresh_token, **common_opts)
        
        return {"access_token": access_token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Langflow auth failed: {str(e)}")


@router.get("/api-key")
def get_agent_api_key_status(
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    """Get API key status for the currently authenticated user."""
    try:
        return get_user_api_key_metadata(admin_db, current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get API key status: {str(e)}")


@router.post("/api-key/rotate")
def rotate_agent_api_key(
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    """Rotate (create/regenerate) the user's API key and return the new plain key once."""
    try:
        return rotate_user_api_key(admin_db, current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rotate API key: {str(e)}")


@router.delete("/api-key")
def revoke_agent_api_key(
    admin_db: Client = Depends(get_admin_db),
    current_user=Depends(get_current_user),
):
    """Revoke the user's API key."""
    try:
        revoke_user_api_key(admin_db, current_user.id)
        return {"message": "API key revoked"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke API key: {str(e)}")

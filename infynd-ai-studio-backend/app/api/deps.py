from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client, create_client
from app.core.config import settings
import jwt
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()

# Reuse a single base Supabase client (connection pooling)
_base_client: Client | None = None
_verify_client: Client | None = None

def _get_base_client() -> Client:
    global _base_client
    if _base_client is None:
        _base_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _base_client


def _get_verify_client() -> Client:
    global _verify_client
    if _verify_client is None:
        _verify_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY,
        )
    return _verify_client


def _is_probable_token_error(error: Exception) -> bool:
    message = str(error).lower()
    token_markers = [
        "invalid jwt",
        "jwt expired",
        "expired",
        "invalid token",
        "token is invalid",
        "token has expired",
        "could not validate credentials",
        "user from sub claim",
        "unauthorized",
    ]
    return any(marker in message for marker in token_markers)


def get_supabase_client_for_request(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Client:
    """
    Creates a dedicated Supabase client for an authenticated request,
    configured with the user's JWT so RLS policies are satisfied.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Supabase credentials are not configured"
        )
    
    token = credentials.credentials
    
    # Create a fresh client with the user's JWT for RLS
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    client.postgrest.auth(token)
    return client


def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Get the current authenticated user by verifying the token with Supabase.
    Uses the service role key for verification to ensure reliability.
    """
    token = credentials.credentials
    
    verify_client = _get_verify_client()
    
    try:
        # verify the JWT with Supabase
        logger.info(f"Verifying token: {token[:10]}...")
        res = verify_client.auth.get_user(token)
        user = res.user
        
        if not user:
            logger.warning("Supabase returned no user for token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Return a standardized user object
        user_id = user.id
        logger.info(f"Authenticated user: {user_id}")
        
        # Check database for additional user flags (like is_admin column)
        is_admin_from_db = False
        try:
            db_res = verify_client.table("user").select("is_admin").eq("id", user_id).execute()
            if db_res.data:
                is_admin_from_db = db_res.data[0].get("is_admin", False)
        except Exception as db_err:
            logger.warning(f"Failed to check is_admin in DB: {str(db_err)}")

        class SimpleUser:
            def __init__(self, id, email, user_metadata, is_admin_db):
                self.id = id
                self.email = email
                self.user_metadata = user_metadata or {}
                self.is_admin = self.user_metadata.get("is_admin", False) or is_admin_db
        
        return SimpleUser(
            id=user.id, 
            email=user.email, 
            user_metadata=user.user_metadata,
            is_admin_db=is_admin_from_db
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth verification failed for token {token[:10]}...: {str(e)}")
        if _is_probable_token_error(e):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable. Please retry.",
        )

def get_current_admin(current_user=Depends(get_current_user)):
    """
    Verifies that the current user has admin privileges.
    Checks user_metadata and database for is_admin: true.
    """
    if not current_user.is_admin:
        # Fallback for main dev email
        if current_user.email == "gokulakrishnan74@gmail.com":
            return current_user
            
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user does not have enough privileges"
        )
    return current_user

def get_admin_db() -> Client:
    """
    Returns a Supabase client with service role privileges.
    Bypasses RLS. Should only be used for system-wide operations like fetching global tools.
    """
    return create_client(
        settings.SUPABASE_URL, 
        settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
    )

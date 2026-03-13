from uuid import UUID
from datetime import timedelta
import os
from sqlmodel import select
from langflow.services.deps import get_auth_service, session_scope

async def ensure_langflow_user(user_id: str, email: str, full_name: str = None):
    """
    Ensures that a shadow user exists in Langflow for the given Infynd user.
    Returns their long-lived API key.
    """
    auth_service = get_auth_service()
    uid = UUID(user_id)
    
    from langflow.services.database.models.user.crud import get_user_by_id
    from langflow.services.database.models.user.model import User
    from langflow.services.database.models.api_key.model import ApiKey

    async with session_scope() as session:
        # Check if user exists in Langflow
        # Langflow and Infynd share the same DB but different tables (user vs auth.users in Supabase)
        # However, Langflow manages its own 'user' table.
        user = await get_user_by_id(session, uid)
        if not user:
            # Create shadow user
            # We use the same UUID from Supabase to keep mapping simple
            user = User(
                id=uid,
                username=email,
                password=auth_service.get_password_hash(os.urandom(24).hex()), # Random password they won't use
                is_active=True,
                is_superuser=False
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
        
        # Ensure they have an API key in the Langflow api_key table
        stmt = select(ApiKey).where(ApiKey.user_id == uid)
        api_keys = (await session.exec(stmt)).all()
        
        if not api_keys:
            # Create an API key
            # Langflow API keys are JWT tokens with payload type='api_key'
            # They are stored in the database for verification by Langflow's check_key()
            new_key_jwt = auth_service.create_token(
                data={"sub": str(uid), "type": "api_key"},
                expires_delta=timedelta(days=365 * 2)
            )
            
            api_key_obj = ApiKey(
                name="Infynd Auto-generated Key",
                api_key=new_key_jwt,
                user_id=uid
            )
            session.add(api_key_obj)
            await session.commit()
            return new_key_jwt
        
        return api_keys[0].api_key

async def get_langflow_tokens(user_id: str):
    """
    Generates short-lived access and refresh tokens for the Langflow UI.
    """
    auth_service = get_auth_service()
    uid = UUID(user_id)
    
    from langflow.services.database.models.user.crud import get_user_by_id

    async with session_scope() as session:
        user = await get_user_by_id(session, uid)
        if not user:
            # Should already be created via ensure_langflow_user
            return None, None
            
        # create_user_tokens generates access and refresh tokens
        tokens = await auth_service.create_user_tokens(uid, session, update_last_login=True)
        return tokens["access_token"], tokens["refresh_token"]

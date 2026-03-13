
import os
from supabase import create_client, Client
from app.core.config import settings

def get_supabase() -> Client:
    """
    Creates and returns a Supabase client using the settings.
    This client uses HTTPS (REST) and does not require port 5432.
    """
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_KEY
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment")
    return create_client(url, key)

# Create a singleton instance for convenience
supabase: Client = get_supabase()

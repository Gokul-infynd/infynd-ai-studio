from supabase import create_client, Client
from app.core.config import settings
from typing import Optional

def get_supabase_client() -> Client:
    """
    Initializes and returns a new Supabase client instance.
    The client relies on SUPABASE_URL and SUPABASE_KEY from environment variables.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        # Return None to avoid crashing the server on startup due to missing environment vars
        print("Warning: SUPABASE_URL or SUPABASE_KEY is missing. Supabase auth will not work.")
        return None
    
    # We initialize the client with the anon key or service role key based on what's set as SUPABASE_KEY
    url: str = settings.SUPABASE_URL
    key: str = settings.SUPABASE_KEY
    return create_client(url, key)

# Create a singleton client to be used for server-side non-auth DB queries or admin tasks
# WARNING: Do not use this singleton for user-specific authenticated queries
# if the client maintains session state. 
# Depending on supabase-py version, we might want to initiate per-request clients.
supabase: Optional[Client] = get_supabase_client()

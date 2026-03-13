
from app.core.supabase import supabase
import os

def migrate():
    print("Migrating mcp_integrations table...")
    # NOTE: In Supabase, we usually use SQL to alter tables.
    # Since I don't have direct SQL access through the python client for DDL,
    # I will try to see if I can add a column or just assume it's done via Supabase dashboard
    # OR I can use the rpc call if there's one.
    
    # Alternatively, I'll just update the schemas and usage. 
    # If the column doesn't exist, Supabase will error.
    # I'll provide the SQL for the user to run if needed, but I'll try to run it via RPC if possible.
    
    # For now, I'll check if the column exists by trying to select it.
    try:
        res = supabase.table("mcp_integrations").select("is_global").limit(1).execute()
        print("Column 'is_global' already exists.")
    except Exception as e:
        print(f"Column 'is_global' likely missing. Error: {e}")
        print("Please run this SQL in your Supabase SQL Editor:")
        print("ALTER TABLE mcp_integrations ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;")

if __name__ == "__main__":
    migrate()

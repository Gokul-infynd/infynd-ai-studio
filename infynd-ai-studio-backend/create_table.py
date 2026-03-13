import psycopg2
import sys
import os

# use the direct connection for admin tasks
conn_str = "postgresql://postgres:KdUMwOTYRI66Vf1I@[2406:da14:271:9902:e5a3:a50:5591:1a45]:5432/postgres"

# SQL to harmonize Langflow users with Infynd users (Supabase Auth)
# 1. Sync existing users
# 2. Add a trigger to handle future signups
sql = """
-- First, ensure all existing Auth users have a shadow record in the Langflow table
INSERT INTO public.user (id, username, password, is_active, is_superuser, create_at, updated_at)
SELECT 
    id, 
    email, 
    '$2b$12$K.zW6/1e07S9e3r9Z6rE.O19A.G.G.G.G.G.G.G.G.G.G.G.G.G.G', -- Placeholder hashed password
    true, 
    false, 
    COALESCE(created_at, now()), 
    now()
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Function to handle future user synchronization
CREATE OR REPLACE FUNCTION public.handle_new_langflow_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user (id, username, password, is_active, is_superuser, create_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        '$2b$12$K.zW6/1e07S9e3r9Z6rE.O19A.G.G.G.G.G.G.G.G.G.G.G.G.G.G', -- Placeholder
        true,
        false,
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function on new user creation in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_sync_langflow ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_langflow
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_langflow_user();

-- Ensure profile exists for existing users too (bridging Infynd logic)
INSERT INTO public.profiles (id, full_name, created_at, updated_at)
SELECT 
    id, 
    raw_user_meta_data->>'full_name', 
    created_at, 
    updated_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;
"""

try:
    print("Connecting to Supabase Postgres...")
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    print("Executing synchronization and trigger setup...")
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("User Sync and Multi-tenancy Triggers established successfully")
except Exception as e:
    print("Error during SQL execution:", e)
    sys.exit(1)

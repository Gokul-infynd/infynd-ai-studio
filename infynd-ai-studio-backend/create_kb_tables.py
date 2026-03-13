import psycopg2
import sys
import os

from dotenv import load_dotenv

load_dotenv()
conn_str = os.environ.get("DATABASE_URL")
if not conn_str:
    print("DATABASE_URL not found")
    sys.exit(1)

# Ensure string works for psycopg2 if there's connection pooling issues, 
# although Supabase direct connection usually works fine format.
if "pooler" in conn_str and "?pgbouncer=true" not in conn_str:
    pass

sql = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    chunk_size INTEGER DEFAULT 1000,
    chunk_overlap INTEGER DEFAULT 100,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    created_by UUID
);

CREATE TABLE IF NOT EXISTS public.knowledge_base_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kb_id UUID REFERENCES public.knowledge_bases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.knowledge_base_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES public.knowledge_base_files(id) ON DELETE CASCADE,
    content TEXT,
    metadata JSONB,
    embedding VECTOR(384)
);

-- pgvector index (HNSW requires pgvector 0.5+)
CREATE INDEX IF NOT EXISTS kh_chunks_embedding_idx ON public.knowledge_base_chunks USING hnsw (embedding vector_cosine_ops);
"""

try:
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("Tables created successfully")
except Exception as e:
    print("Error:", e)
    sys.exit(1)

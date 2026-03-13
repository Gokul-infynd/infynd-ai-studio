import psycopg2
import sys
import os
from dotenv import load_dotenv

load_dotenv()
conn_str = os.environ.get("DATABASE_URL")

sql = """
CREATE OR REPLACE FUNCTION match_chunks (
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  knowledge_base_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbc.id,
    kbc.content,
    kbc.metadata,
    1 - (kbc.embedding <=> query_embedding) AS similarity
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base_files kbf ON kbf.id = kbc.file_id
  WHERE kbf.kb_id = knowledge_base_id
    AND 1 - (kbc.embedding <=> query_embedding) > match_threshold
  ORDER BY kbc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
"""

try:
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("Function match_chunks added successfully")
except Exception as e:
    print("Error:", e)
    sys.exit(1)

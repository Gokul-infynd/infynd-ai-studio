import psycopg2
import sys
import os
from dotenv import load_dotenv

load_dotenv()
conn_str = os.environ.get("DATABASE_URL")
if not conn_str:
    print("DATABASE_URL not found")
    sys.exit(1)

sql = """
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS chunk_size INTEGER DEFAULT 1000;
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS chunk_overlap INTEGER DEFAULT 100;
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.knowledge_base_files ADD COLUMN IF NOT EXISTS metadata JSONB;
"""

try:
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("Columns added successfully")
except Exception as e:
    print("Error:", e)
    sys.exit(1)

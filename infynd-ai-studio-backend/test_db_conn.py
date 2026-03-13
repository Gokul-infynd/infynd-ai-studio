import psycopg2
import sys

# Testing the pooler with project-ref suffix
conn_str = "postgresql://postgres.zfhbootnugrplxsznbvj:TwDE7PRbfxDPjRFj@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

try:
    print("Testing connection...")
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute("SELECT 1")
    print("Result:", cur.fetchone())
    cur.close()
    conn.close()
    print("Connection successful!")
except Exception as e:
    print("Connection failed:", e)
    sys.exit(1)

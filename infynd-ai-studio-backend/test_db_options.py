import psycopg2
import sys

# Testing pooler with project options
conn_str = "postgresql://postgres:TwDE7PRbfxDPjRFj@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?options=project%3Dzfhbootnugrplxsznbvj"

try:
    print("Testing connection with options...")
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute("SELECT 1")
    print("Result:", cur.fetchone())
    cur.close()
    conn.close()
    print("Connection successful with options!")
except Exception as e:
    print("Connection failed:", e)
    sys.exit(1)

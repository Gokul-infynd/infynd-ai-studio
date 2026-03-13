import psycopg2
import sys

# Testing direct IPv6
conn_str = "postgresql://postgres:TwDE7PRbfxDPjRFj@[2406:da14:271:9902:e5a3:a50:5591:1a45]:5432/postgres"

try:
    print("Testing connection with direct IPv6...")
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute("SELECT 1")
    print("Result:", cur.fetchone())
    cur.close()
    conn.close()
    print("Connection successful with direct IPv6!")
except Exception as e:
    print("Connection failed:", e)
    sys.exit(1)

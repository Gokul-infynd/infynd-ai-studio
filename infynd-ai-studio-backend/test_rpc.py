import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

def test_match_chunks():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    supabase = create_client(url, key)

    # Empty embedding for testing (384 dimensions)
    dummy_embedding = [0.0] * 384
    
    # We need a valid KB ID. Let's find one.
    res = supabase.table("knowledge_bases").select("id").limit(1).execute()
    if not res.data:
        print("No KBs found")
        return
    kb_id = res.data[0]["id"]
    print(f"Testing with KB ID: {kb_id}")

    rpc_params = {
        "query_embedding": dummy_embedding,
        "match_threshold": 0.0,
        "match_count": 5,
        "knowledge_base_id": kb_id
    }

    try:
        res = supabase.rpc("match_chunks", rpc_params).execute()
        print("RPC Result:", json.dumps(res.data, indent=2))
        print("Successfully called match_chunks")
    except Exception as e:
        print("RPC Error:", e)

if __name__ == "__main__":
    test_match_chunks()

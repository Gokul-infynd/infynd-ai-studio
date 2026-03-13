from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Form, BackgroundTasks
from typing import List, Optional
import uuid
import os
import shutil
from pathlib import Path

from supabase import Client

from app.schemas.knowledge_base import (
    KnowledgeBaseCreate, 
    KnowledgeBaseResponse, 
    KnowledgeBaseFileResponse,
    TextUploadConfig,
    WebsiteCrawlConfig
)
from app.api.deps import get_current_user, get_supabase_client_for_request

router = APIRouter()
UPLOAD_DIR = Path("/tmp/infynd_kb_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Helper for processing in background
def process_file_background(file_path: str, file_id: str, kb_id: str, chunk_size: int, chunk_overlap: int, db_url: str):
    import os
    import sys
    
    # Use a background script to process, to avoid blocking or memory leak in main thread
    # Ideally use a task queue like Celery, but here we can just spawn a process or do it locally
    import subprocess
    script_path = os.path.join(os.path.dirname(__file__), "../../../../process_kb.py")
    
    # We will pass db_url as ENV
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    if os.environ.get("SUPABASE_URL"):
        env["SUPABASE_URL"] = os.environ.get("SUPABASE_URL")
    if os.environ.get("SUPABASE_KEY"):
        env["SUPABASE_KEY"] = os.environ.get("SUPABASE_KEY")
    
    subprocess.Popen([
        sys.executable, script_path, 
        "--file-path", file_path, 
        "--file-id", str(file_id), 
        "--kb-id", str(kb_id),
        "--chunk-size", str(chunk_size),
        "--chunk-overlap", str(chunk_overlap)
    ], env=env)

def process_text_background(text_content: str, file_id: str, kb_id: str, chunk_size: int, chunk_overlap: int, db_url: str):
    import os
    import sys
    import subprocess
    import tempfile
    
    tmp_path = tempfile.mktemp(suffix=".txt", dir=UPLOAD_DIR)
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(text_content)
        
    script_path = os.path.join(os.path.dirname(__file__), "../../../../process_kb.py")
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    if os.environ.get("SUPABASE_URL"):
        env["SUPABASE_URL"] = os.environ.get("SUPABASE_URL")
    if os.environ.get("SUPABASE_KEY"):
        env["SUPABASE_KEY"] = os.environ.get("SUPABASE_KEY")
    
    subprocess.Popen([
        sys.executable, script_path, 
        "--file-path", tmp_path, 
        "--file-id", str(file_id), 
        "--kb-id", str(kb_id),
        "--chunk-size", str(chunk_size),
        "--chunk-overlap", str(chunk_overlap),
        "--is-text", "true"
    ], env=env)

def process_website_background(url: str, file_id: str, kb_id: str, config: WebsiteCrawlConfig, db_url: str):
    import os
    import sys
    import subprocess
    
    script_path = os.path.join(os.path.dirname(__file__), "../../../../process_kb.py")
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    if os.environ.get("SUPABASE_URL"):
        env["SUPABASE_URL"] = os.environ.get("SUPABASE_URL")
    if os.environ.get("SUPABASE_KEY"):
        env["SUPABASE_KEY"] = os.environ.get("SUPABASE_KEY")
    
    cmd = [
        sys.executable, script_path,
        "--file-path", url,
        "--file-id", str(file_id),
        "--kb-id", str(kb_id),
        "--chunk-size", str(config.chunk_size),
        "--chunk-overlap", str(config.chunk_overlap),
        "--is-website", "true",
        "--crawl-depth", str(config.crawl_depth),
        "--max-urls", str(config.max_urls),
        "--workers", str(config.workers),
        "--headless-timeout", str(config.headless_timeout),
        "--enable-headless", str(config.enable_headless).lower(),
        "--wait-for-js", str(config.wait_for_js).lower(),
        "--request-delay", str(config.request_delay),
        "--enable-sitemap", str(config.enable_sitemap).lower()
    ]
    subprocess.Popen(cmd, env=env)

@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
def create_knowledge_base(
    kb_in: KnowledgeBaseCreate,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user),
):
    """Create a new knowledge base."""
    data = kb_in.model_dump()
    data["created_by"] = current_user.id
    
    try:
        res = db.table("knowledge_bases").insert(data).execute()
        if not res.data:
            raise Exception("Creation did not return data")
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[KnowledgeBaseResponse])
def get_knowledge_bases(
    workspace_id: str,
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Get all knowledge bases for workspace."""
    try:
        res = db.table("knowledge_bases").select("*").eq("workspace_id", workspace_id).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    kb_id: str, 
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Get a single knowledge base by ID."""
    try:
        res = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Knowledge Base not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge_base(
    kb_id: str, 
    db: Client = Depends(get_supabase_client_for_request), 
    current_user=Depends(get_current_user)
):
    """Delete a knowledge base."""
    try:
        # 1. Delete chunks (join with files)
        # Note: Join is not supported in delete, so we do it in steps or rely on cascades
        # For safety let's find file ids first
        files_res = db.table("knowledge_base_files").select("id").eq("kb_id", kb_id).execute()
        file_ids = [f["id"] for f in files_res.data]
        
        if file_ids:
            db.table("knowledge_base_chunks").delete().in_("file_id", file_ids).execute()
            db.table("knowledge_base_files").delete().in_("id", file_ids).execute()

        db.table("knowledge_bases").delete().eq("id", kb_id).execute()
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{kb_id}/documents/upload", response_model=KnowledgeBaseFileResponse)
async def upload_document(
    kb_id: str,
    file: UploadFile = File(...),
    chunk_size: int = Form(1000),
    chunk_overlap: int = Form(100),
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user)
):
    """Upload a file to a knowledge base."""
    try:
        # verify kb exists
        kb_res = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
        if not kb_res.data:
            raise HTTPException(status_code=404, detail="KB not found")
            
        file_path = UPLOAD_DIR / f"{uuid.uuid4()}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # upload to supabase bucket
        bucket_name = "kb-files"
        try:
            db.storage.get_bucket(bucket_name)
        except Exception:
            try:
                db.storage.create_bucket(bucket_name, public=True)
            except:
                pass

        file_path_in_bucket = f"{kb_id}/{file_path.name}"
        try:
            db.storage.from_(bucket_name).upload(file_path_in_bucket, str(file_path))
        except Exception as e:
            print(f"Bucket upload warning: {e}")

        # create file record
        file_data = {
            "kb_id": kb_id,
            "file_name": file.filename,
            "status": "processing"
        }
        f_res = db.table("knowledge_base_files").insert(file_data).execute()
        file_id = f_res.data[0]["id"]
        
        # update KB config with latest preferences (or maybe ignore to keep simple)
        db.table("knowledge_bases").update({"chunk_size": chunk_size, "chunk_overlap": chunk_overlap}).eq("id", kb_id).execute()
        
        db_url = os.environ.get("DATABASE_URL")
        process_file_background(str(file_path), file_id, kb_id, chunk_size, chunk_overlap, db_url)
        
        return f_res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{kb_id}/documents/text", response_model=KnowledgeBaseFileResponse)
async def upload_text(
    kb_id: str,
    text_config: TextUploadConfig,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user)
):
    """Upload raw text to a knowledge base."""
    try:
        kb_res = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
        if not kb_res.data:
            raise HTTPException(status_code=404, detail="KB not found")
            
        # create file record
        file_data = {
            "kb_id": kb_id,
            "file_name": f"Raw Text - {uuid.uuid4().hex[:8]}",
            "status": "processing"
        }
        f_res = db.table("knowledge_base_files").insert(file_data).execute()
        file_id = f_res.data[0]["id"]
        
        db.table("knowledge_bases").update({
            "chunk_size": text_config.chunk_size, 
            "chunk_overlap": text_config.chunk_overlap
        }).eq("id", kb_id).execute()
        
        db_url = os.environ.get("DATABASE_URL")
        process_text_background(text_config.text, file_id, kb_id, text_config.chunk_size, text_config.chunk_overlap, db_url)
        
        return f_res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{kb_id}/documents/website", response_model=KnowledgeBaseFileResponse)
async def upload_website(
    kb_id: str,
    crawl_config: WebsiteCrawlConfig,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user)
):
    """Crawl a website and add content to knowledge base."""
    try:
        kb_res = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
        if not kb_res.data:
            raise HTTPException(status_code=404, detail="KB not found")
            
        # create file record
        file_data = {
            "kb_id": kb_id,
            "file_name": crawl_config.url,
            "status": "processing"
        }
        f_res = db.table("knowledge_base_files").insert(file_data).execute()
        file_id = f_res.data[0]["id"]
        
        db.table("knowledge_bases").update({
            "chunk_size": crawl_config.chunk_size, 
            "chunk_overlap": crawl_config.chunk_overlap
        }).eq("id", kb_id).execute()
        
        db_url = os.environ.get("DATABASE_URL")
        process_website_background(crawl_config.url, file_id, kb_id, crawl_config, db_url)
        
        return f_res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{kb_id}/documents", response_model=List[KnowledgeBaseFileResponse])
def get_documents(
    kb_id: str,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user)
):
    """Get all documents in a knowledge base."""
    try:
        res = db.table("knowledge_base_files").select("*").eq("kb_id", kb_id).execute()
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{kb_id}/documents/{file_id}/content")
def get_document_content(
    kb_id: str,
    file_id: str,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user)
):
    """Fetch content chunks for a specific document."""
    try:
        res = db.table("knowledge_base_chunks").select("content").eq("file_id", file_id).order("id").execute()
        full_content = "\n".join([c["content"] for c in res.data])
        return {"content": full_content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{kb_id}/documents/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    kb_id: str,
    file_id: str,
    db: Client = Depends(get_supabase_client_for_request),
    current_user=Depends(get_current_user)
):
    """Delete a document and its chunks."""
    try:
        # Optional: delete from storage bucket if we tracked the path
        # For now just clear DB
        db.table("knowledge_base_chunks").delete().eq("file_id", file_id).execute()
        db.table("knowledge_base_files").delete().eq("id", file_id).execute()
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

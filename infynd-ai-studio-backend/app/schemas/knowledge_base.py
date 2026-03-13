from pydantic import BaseModel, HttpUrl
from typing import Optional, List, Any
from datetime import datetime
import uuid

class KnowledgeBaseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    workspace_id: str

class KnowledgeBaseResponse(BaseModel):
    id: str | uuid.UUID
    workspace_id: str | uuid.UUID
    name: str
    description: Optional[str] = None
    chunk_size: Optional[int] = 1000
    chunk_overlap: Optional[int] = 100
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str | uuid.UUID] = None

class FileUploadConfig(BaseModel):
    chunk_size: int = 1000
    chunk_overlap: int = 100

class WebsiteCrawlConfig(BaseModel):
    url: str
    chunk_size: int = 1000
    chunk_overlap: int = 100
    # Advanced options from image
    crawl_depth: int = 2
    max_urls: int = 1000
    workers: int = 10
    request_delay: str = "200ms"
    headless_timeout: int = 30
    enable_headless: bool = False
    enable_html_extraction: bool = True
    enable_sitemap: bool = True
    wait_for_js: bool = True

class TextUploadConfig(BaseModel):
    text: str
    chunk_size: int = 1000
    chunk_overlap: int = 100

class KnowledgeBaseFileResponse(BaseModel):
    id: str | uuid.UUID
    kb_id: str | uuid.UUID
    file_name: str
    status: Optional[str] = None
    created_at: Optional[datetime] = None

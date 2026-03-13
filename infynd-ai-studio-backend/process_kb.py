import sys
import argparse
import os
import psycopg2
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

from langchain_community.document_loaders import PyPDFLoader, TextLoader, PyMuPDFLoader, AsyncHtmlLoader, Docx2txtLoader
from langchain_community.document_transformers import Html2TextTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
import re
import requests
from urllib.parse import urljoin, urlparse
import time
import asyncio
from playwright.sync_api import sync_playwright

def clean_text(text: str) -> str:
    """
    Cleans text by removing hyphenation at line ends and replacing single 
    line breaks with spaces while preserving paragraphs.
    """
    # 1. Remove hyphenation at end of lines (e.g. "knowl-\nedge" -> "knowledge")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    
    # 2. Preserving double line breaks (paragraphs) but cleaning single ones
    paragraphs = re.split(r'\n\s*\n', text)
    cleaned_paragraphs = []
    for p in paragraphs:
        # Replace remaining single newlines with space
        p = p.replace('\n', ' ')
        # Collapse multiple spaces into one
        p = re.sub(r'\s+', ' ', p).strip()
        if p:
            cleaned_paragraphs.append(p)
    
    return '\n\n'.join(cleaned_paragraphs)

def process_file(file_path, file_id, kb_id, chunk_size, chunk_overlap, db_url, is_text=False):
    try:
        from supabase import create_client
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL or SUPABASE_KEY not set")

        supabase = create_client(supabase_url, supabase_key)

        # Update status to processing
        supabase.table("knowledge_base_files").update({"status": "processing"}).eq("id", file_id).execute()

        docs = []
        if is_text or file_path.endswith('.txt'):
            loader = TextLoader(file_path, encoding='utf-8')
            docs = loader.load()
        elif file_path.endswith('.pdf'):
            loader = PyPDFLoader(file_path)
            docs = loader.load()
        elif file_path.endswith('.docx'):
            loader = Docx2txtLoader(file_path)
            docs = loader.load()
        else:
            raise ValueError(f"Unsupported file type for file: {file_path}")

        # Pre-process text across all documents
        for doc in docs:
            doc.page_content = clean_text(doc.page_content)

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ".", "?", "!", " ", ""]
        )
        chunks = text_splitter.split_documents(docs)

        # Initialize HuggingFace embeddings
        embeddings_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

        embeddings = embeddings_model.embed_documents([chunk.page_content for chunk in chunks])

        insert_data = []
        for i, chunk in enumerate(chunks):
            embedding = embeddings[i]
            # Replace null bytes which postgres text fields hate
            content = chunk.page_content.replace('\x00', '')
            
            insert_data.append({
                "file_id": file_id,
                "content": content,
                "metadata": {"source": file_path, "chunk_index": i},
                "embedding": embedding
            })

        # Insert chunks to supabase vector DB
        # batch insert size of 100 to avoid request timeouts
        for i in range(0, len(insert_data), 100):
            batch = insert_data[i:i+100]
            supabase.table("knowledge_base_chunks").insert(batch).execute()

        # Update status
        supabase.table("knowledge_base_files").update({"status": "completed"}).eq("id", file_id).execute()

    except Exception as e:
        print(f"Error processing file {file_path}: {e}")
        try:
            from supabase import create_client
            supabase_url = os.environ.get("SUPABASE_URL")
            supabase_key = os.environ.get("SUPABASE_KEY")
            supabase = create_client(supabase_url, supabase_key)
            error_message = f"failed: {str(e)[:200]}"
            supabase.table("knowledge_base_files").update({"status": error_message}).eq("id", file_id).execute()
        except:
            pass

import concurrent.futures
from threading import Lock

def crawl_website(url, crawl_depth, max_urls, headless, wait_for_js, timeout_sec, request_delay_ms=200, enable_sitemap=True, num_workers=10):
    visited = set()
    to_visit = { (url, 0) }
    all_text = []
    domain = urlparse(url).netloc
    delay_sec = request_delay_ms / 1000.0
    visited_lock = Lock()
    content_lock = Lock()
    
    # Try sitemap first
    if enable_sitemap:
        try:
            sitemap_url = f"{urlparse(url).scheme}://{domain}/sitemap.xml"
            resp = requests.get(sitemap_url, timeout=5)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'xml')
                for loc in soup.find_all('loc'):
                    to_visit.add((loc.text, 0))
        except:
            pass

    def index_url(current_url, depth):
        nonlocal to_visit
        with visited_lock:
            if current_url in visited or len(visited) >= max_urls:
                return
            visited.add(current_url)

        print(f"DEBUG [Worker]: Indexing {current_url} (depth {depth})")
        
        try:
            # Delay
            if delay_sec > 0:
                time.sleep(delay_sec)

            html = ""
            if headless or wait_for_js:
                with sync_playwright() as p:
                    # Launch a separate browser instance for each worker
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page()
                    page.goto(current_url, timeout=timeout_sec * 1000)
                    if wait_for_js:
                        time.sleep(2)
                    html = page.content()
                    browser.close()
            else:
                resp = requests.get(current_url, timeout=timeout_sec)
                html = resp.text

            soup = BeautifulSoup(html, 'html.parser')
            for script in soup(["script", "style"]):
                script.decompose()

            content = soup.get_text(separator=' ', strip=True)
            if content.strip():
                with content_lock:
                    all_text.append(f"URL: {current_url}\n{content}")

            # Find more links
            if depth < crawl_depth:
                new_links = []
                for a in soup.find_all('a', href=True):
                    link = urljoin(current_url, a['href']).split('#')[0]
                    if urlparse(link).netloc == domain:
                        new_links.append(link)
                return new_links
        except Exception as e:
            print(f"Warning: Worker failed on {current_url}: {e}")
        return []

    # Simple concurrent BFS
    current_depth = 0
    while current_depth <= crawl_depth and len(visited) < max_urls and to_visit:
        next_to_visit = set()
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            future_to_url = {executor.submit(index_url, u, current_depth): u for u, d in to_visit}
            for future in concurrent.futures.as_completed(future_to_url):
                found_links = future.result()
                if found_links:
                    for link in found_links:
                        with visited_lock:
                            if link not in visited:
                                next_to_visit.add((link, current_depth + 1))
        
        to_visit = { (u, d) for u, d in next_to_visit if len(visited) < max_urls }
        current_depth += 1

    return "\n\n".join(all_text)

def process_website(url, file_id, kb_id, chunk_size, chunk_overlap, crawl_depth, max_urls, headless, wait_for_js, timeout_sec, request_delay, enable_sitemap, num_workers=10):
    try:
        from supabase import create_client
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_KEY")
        supabase = create_client(supabase_url, supabase_key)

        supabase.table("knowledge_base_files").update({"status": "processing"}).eq("id", file_id).execute()

        # Parse request delay (e.g. "200ms" -> 200)
        delay_ms = 200
        if isinstance(request_delay, str) and "ms" in request_delay:
            delay_ms = int(request_delay.replace("ms", ""))
        elif isinstance(request_delay, (int, float)):
            delay_ms = int(request_delay)

        content = crawl_website(url, crawl_depth, max_urls, headless, wait_for_js, timeout_sec, delay_ms, enable_sitemap, num_workers)
        
        if not content.strip():
            raise ValueError("No content could be extracted from the website.")

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ".", "?", "!", " ", ""]
        )
        
        # Clean text first
        cleaned_content = clean_text(content)
        chunks = text_splitter.split_text(cleaned_content)

        embeddings_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        embeddings = embeddings_model.embed_documents(chunks)

        insert_data = []
        for i, chunk_text in enumerate(chunks):
            embedding = embeddings[i]
            insert_data.append({
                "file_id": file_id,
                "content": chunk_text.replace('\x00', ''),
                "metadata": {"source": url, "chunk_index": i, "is_website": True, "processed_at": time.time()},
                "embedding": embedding
            })

        for i in range(0, len(insert_data), 100):
            batch = insert_data[i:i+100]
            supabase.table("knowledge_base_chunks").insert(batch).execute()

        supabase.table("knowledge_base_files").update({"status": "completed"}).eq("id", file_id).execute()

    except Exception as e:
        print(f"Error processing website {url}: {e}")
        try:
            from supabase import create_client
            supabase_url = os.environ.get("SUPABASE_URL")
            supabase_key = os.environ.get("SUPABASE_KEY")
            supabase = create_client(supabase_url, supabase_key)
            supabase.table("knowledge_base_files").update({"status": f"failed: {str(e)[:200]}"}).eq("id", file_id).execute()
        except:
            pass

def str2bool(v):
    if isinstance(v, bool):
        return v
    if v.lower() in ('yes', 'true', 't', 'y', '1'):
        return True
    elif v.lower() in ('no', 'false', 'f', 'n', '0'):
        return False
    else:
        raise argparse.ArgumentTypeError('Boolean value expected.')

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file-path", required=True)
    parser.add_argument("--file-id", required=True)
    parser.add_argument("--kb-id", required=True)
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--chunk-overlap", type=int, default=100)
    parser.add_argument("--is-text", type=str2bool, default=False)
    # Website crawling options
    parser.add_argument("--is-website", type=str2bool, default=False)
    parser.add_argument("--crawl-depth", type=int, default=2)
    parser.add_argument("--max-urls", type=int, default=100)
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument("--headless-timeout", type=int, default=30)
    parser.add_argument("--enable-headless", type=str2bool, default=False)
    parser.add_argument("--wait-for-js", type=str2bool, default=False)
    parser.add_argument("--request-delay", type=str, default="200ms")
    parser.add_argument("--enable-sitemap", type=str2bool, default=True)

    args = parser.parse_args()
    db_url = os.environ.get("DATABASE_URL")
    
    if args.is_website:
        process_website(
            args.file_path, args.file_id, args.kb_id, 
            args.chunk_size, args.chunk_overlap,
            args.crawl_depth, args.max_urls,
            args.enable_headless, args.wait_for_js, args.headless_timeout,
            args.request_delay, args.enable_sitemap, args.workers
        )
    else:
        process_file(args.file_path, args.file_id, args.kb_id, args.chunk_size, args.chunk_overlap, db_url, args.is_text)

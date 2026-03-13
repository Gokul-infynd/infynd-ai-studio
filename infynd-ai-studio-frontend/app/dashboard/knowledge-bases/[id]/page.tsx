"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Code, FileText, Globe, Type, UploadCloud, Search, MoreVertical, X, Check, Loader2, Trash2, Eye } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogTrigger } from "@/components/ui/dialog";

interface FileItem {
    id: string;
    file_name: string;
    status: string;
    created_at: string;
}

export default function KnowledgeBaseDetailPage() {
    const router = useRouter();
    const params = useParams();
    const [kb, setKb] = useState<any>(null);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [websiteModalOpen, setWebsiteModalOpen] = useState(false);
    const [textModalOpen, setTextModalOpen] = useState(false);

    // config states
    const [chunkSize, setChunkSize] = useState(1000);
    const [chunkOverlap, setChunkOverlap] = useState(100);

    // Website Crawling states
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [crawlDepth, setCrawlDepth] = useState(2);
    const [maxUrls, setMaxUrls] = useState(100);
    const [workers, setWorkers] = useState(10);
    const [requestDelay, setRequestDelay] = useState("200ms");
    const [headlessTimeout, setHeadlessTimeout] = useState(30);
    const [enableHeadless, setEnableHeadless] = useState(false);
    const [enableHtmlExtraction, setEnableHtmlExtraction] = useState(true);
    const [enableSitemap, setEnableSitemap] = useState(true);
    const [waitForJs, setWaitForJs] = useState(true);

    // Raw Text Data
    const [rawText, setRawText] = useState("");

    const [isUploading, setIsUploading] = useState(false);
    const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
    const [viewContent, setViewContent] = useState("");
    const [isFetchingContent, setIsFetchingContent] = useState(false);
    const [viewModalOpen, setViewModalOpen] = useState(false);

    useEffect(() => {
        if (!params.id) return;
        fetchData();
        const interval = setInterval(() => {
            // Polling for processing status
            fetchFiles(params.id as string, false);
        }, 5000);
        return () => clearInterval(interval);
    }, [params.id]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const kbData = await apiFetch(`/knowledge-bases/${params.id}`);
            setKb(kbData);
            if (kbData.chunk_size) setChunkSize(kbData.chunk_size);
            if (kbData.chunk_overlap) setChunkOverlap(kbData.chunk_overlap);
            await fetchFiles(params.id as string, true);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load Knowledge Base");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchFiles = async (id: string, showLoading = false) => {
        if (showLoading) setIsLoading(true);
        try {
            const fileData = await apiFetch(`/knowledge-bases/${id}/documents`);
            setFiles(fileData || []);
        } catch (error) {
            console.error(error);
        } finally {
            if (showLoading) setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("chunk_size", chunkSize.toString());
        formData.append("chunk_overlap", chunkOverlap.toString());

        setIsUploading(true);
        try {
            await apiFetch(`/knowledge-bases/${params.id}/documents/upload`, {
                method: "POST",
                body: formData,
                headers: {
                    // Remove Content-Type so browser sets boundary for multipart/form-data
                }
            });
            toast.success("File upload started");
            setUploadModalOpen(false);
            fetchFiles(params.id as string, true);
        } catch (error: any) {
            toast.error("Upload failed", { description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    const handleTextUpload = async () => {
        if (!rawText.trim()) return toast.error("Text is required");

        setIsUploading(true);
        try {
            await apiFetch(`/knowledge-bases/${params.id}/documents/text`, {
                method: "POST",
                body: JSON.stringify({
                    text: rawText,
                    chunk_size: chunkSize,
                    chunk_overlap: chunkOverlap
                })
            });
            toast.success("Text extraction started");
            setTextModalOpen(false);
            setRawText("");
            fetchFiles(params.id as string, true);
        } catch (error: any) {
            toast.error("Upload failed", { description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    const handleWebsiteUpload = async () => {
        if (!websiteUrl.trim()) return toast.error("Website URL is required");

        setIsUploading(true);
        try {
            await apiFetch(`/knowledge-bases/${params.id}/documents/website`, {
                method: "POST",
                body: JSON.stringify({
                    url: websiteUrl,
                    chunk_size: chunkSize,
                    chunk_overlap: chunkOverlap,
                    crawl_depth: crawlDepth,
                    max_urls: maxUrls,
                    workers: workers,
                    request_delay: requestDelay,
                    headless_timeout: headlessTimeout,
                    enable_headless: enableHeadless,
                    enable_html_extraction: enableHtmlExtraction,
                    enable_sitemap: enableSitemap,
                    wait_for_js: waitForJs
                })
            });
            toast.success("Website crawling started");
            setWebsiteModalOpen(false);
            setWebsiteUrl("");
            fetchFiles(params.id as string, true);
        } catch (error: any) {
            toast.error("Crawling failed", { description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteFile = async (id: string) => {
        if (!confirm("Are you sure you want to delete this document?")) return;
        try {
            await apiFetch(`/knowledge-bases/${params.id}/documents/${id}`, { method: "DELETE" });
            toast.success("Document deleted");
            fetchFiles(params.id as string, true);
        } catch (error: any) {
            toast.error("Delete failed", { description: error.message });
        }
    };

    const handleViewFile = async (file: FileItem) => {
        setViewingFile(file);
        setViewModalOpen(true);
        setIsFetchingContent(true);
        try {
            const data = await apiFetch(`/knowledge-bases/${params.id}/documents/${file.id}/content`);
            setViewContent(data.content);
        } catch (error: any) {
            toast.error("Failed to load content");
            setViewModalOpen(false);
        } finally {
            setIsFetchingContent(false);
        }
    };

    const handleDeleteKB = async () => {
        if (!confirm("Delete this entire Knowledge Base? All documents and vector embeddings will be lost.")) return;
        try {
            await apiFetch(`/knowledge-bases/${params.id}`, { method: "DELETE" });
            toast.success("Knowledge Base deleted");
            router.push('/dashboard/knowledge-bases');
        } catch (error) {
            toast.error("Failed to delete Knowledge Base");
        }
    };

    return (
        <div className="flex flex-col h-full bg-background w-full text-foreground">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/knowledge-bases')} className="text-muted-foreground hover:text-foreground hover:bg-accent">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-2xl font-semibold">{kb?.name || "Loading..."}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="border-border text-foreground hover:bg-accent text-sm font-medium">
                        <Code className="w-4 h-4 mr-2" /> Knowledge Base API
                    </Button>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-accent">
                                <MoreVertical className="w-5 h-5" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card border-border text-foreground sm:max-w-xs">
                            <Button variant="ghost" onClick={handleDeleteKB} className="w-full text-destructive hover:text-destructive/80 hover:bg-destructive/10 justify-start">
                                <X className="w-4 h-4 mr-2" /> Delete Base
                            </Button>
                        </DialogContent>
                    </Dialog>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel */}
                <div className="w-[60%] border-r border-border flex flex-col p-6 bg-accent/5">
                    <div className="flex gap-2 border-b border-border pb-4 mb-4">
                        <Button
                            variant="outline"
                            className="bg-transparent hover:bg-accent border-border text-foreground"
                            onClick={() => setUploadModalOpen(true)}
                        >
                            <FileText className="w-4 h-4 mr-2" /> Add File
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-transparent hover:bg-accent border-border opacity-60 tooltip-trigger text-foreground"
                            title="Coming soon"
                            onClick={() => setWebsiteModalOpen(true)}
                        >
                            <Globe className="w-4 h-4 mr-2" /> Add Website
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-transparent hover:bg-accent border-border text-foreground"
                            onClick={() => setTextModalOpen(true)}
                        >
                            <Type className="w-4 h-4 mr-2" /> Add Text
                        </Button>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input placeholder="Search files..." className="pl-9 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1" />
                        </div>
                    </div>

                    <div className="flex-1 border border-border rounded-lg overflow-y-auto bg-card shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="py-3 px-4 text-left font-medium">File name</th>
                                    <th className="py-3 px-4 text-left font-medium w-32">Status</th>
                                    <th className="py-3 px-4 text-left font-medium w-32">Date</th>
                                    <th className="py-3 px-4 text-right font-medium w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={3} className="py-8 text-center text-muted-foreground">Loading files...</td>
                                    </tr>
                                ) : files.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="py-20 text-center">
                                            <div className="mx-auto flex flex-col items-center opacity-50">
                                                <UploadCloud className="w-12 h-12 text-muted-foreground mb-2" />
                                                <p className="text-muted-foreground">Nothing to display.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    files.map(file => (
                                        <tr key={file.id} className="border-b border-border hover:bg-accent/50">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-4 h-4 text-primary" />
                                                    <span className="font-medium text-foreground">{file.file_name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-xs font-medium">
                                                {file.status === 'processing' ? (
                                                    <span className="flex items-center text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-1 rounded w-max"><Loader2 className="w-3 h-3 animate-spin mr-1" /> Processing</span>
                                                ) : file.status === 'completed' ? (
                                                    <span className="flex items-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded w-max"><Check className="w-3 h-3 mr-1" /> Completed</span>
                                                ) : (
                                                    <span className="text-destructive text-[10px] break-words">{file.status}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleViewFile(file)} className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent" title="View Content">
                                                        <Search className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteFile(file.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="flex-1 bg-background flex items-center justify-center p-8">
                    <div className="text-center max-w-sm">
                        <div className="w-16 h-16 rounded-full bg-accent/50 flex items-center justify-center mx-auto mb-6 shadow-inner border border-border">
                            <Search className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2 text-foreground">No Files to Search</h2>
                        <p className="text-muted-foreground text-sm">Upload files to your knowledge base to start searching through them.</p>
                    </div>
                </div>
            </div>

            {/* Modals */}

            {/* Upload File Modal */}
            <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
                <DialogContent className="bg-card text-foreground sm:max-w-[600px] border border-border shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-medium">Upload Files</DialogTitle>
                        <p className="text-sm text-muted-foreground">Upload your documents (PDF, TXT, DOCX) for analysis.</p>
                    </DialogHeader>

                    <div className="my-4">
                        <p className="text-sm font-medium mb-2 text-muted-foreground">File Upload (.pdf, .docx, .txt)</p>
                        <div className="border border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center bg-accent/10 text-center relative hover:bg-accent/20 transition-colors cursor-pointer">
                            <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.txt,.docx" onChange={handleFileUpload} disabled={isUploading} />
                            <div className="w-10 h-10 bg-primary/10 rounded flex flex-col items-center justify-center text-primary mb-4 shadow-sm border border-primary/20">
                                <FileText className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-foreground">Drag & drop up to 5 files here</h3>
                            <p className="text-muted-foreground text-sm mt-1 mb-2">or click to select files</p>
                            <p className="text-xs text-muted-foreground/60">Supports PDF, DOCX, TXT files</p>
                            {isUploading && <p className="text-sm text-blue-400 mt-2 font-medium flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-semibold mb-1">Chunk Size</Label>
                            <Input type="number" value={chunkSize} onChange={(e) => setChunkSize(parseInt(e.target.value))} className="border-border bg-background text-foreground" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-semibold mb-1">Chunk Overlap</Label>
                            <Input type="number" value={chunkOverlap} onChange={(e) => setChunkOverlap(parseInt(e.target.value))} className="border-border bg-background text-foreground" />
                        </div>
                    </div>

                    <div className="text-[10px] text-gray-500 leading-relaxed mb-4">
                        By uploading documents to Lyzr, you confirm that you have the right to share the information contained within them. You must not upload any documents that contain sensitive personal data (such as health records, financial information, government IDs) unless you have obtained the necessary consents and comply with all applicable data protection laws.
                    </div>

                    <DialogFooter>
                        <Button variant="outline" className="w-full sm:w-auto border-border hover:bg-accent text-foreground" onClick={() => setUploadModalOpen(false)}>Cancel</Button>
                        <Button className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setUploadModalOpen(false)}>Continue →</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Upload Text Modal */}
            <Dialog open={textModalOpen} onOpenChange={setTextModalOpen}>
                <DialogContent className="bg-card text-foreground sm:max-w-[600px] border border-border shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-medium">Add Raw Text</DialogTitle>
                        <p className="text-sm text-muted-foreground">Provide direct text content for the knowledge base.</p>
                    </DialogHeader>

                    <div className="my-2">
                        <Label className="text-sm font-medium mb-2 text-muted-foreground block">Raw Text</Label>
                        <Textarea
                            rows={8}
                            placeholder="Enter the text content here..."
                            value={rawText}
                            onChange={(e: any) => setRawText(e.target.value)}
                            className="bg-background border-border rounded-lg text-sm w-full font-mono resize-none focus-visible:ring-1 focus-visible:ring-primary/20 relative placeholder:text-muted-foreground text-foreground"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-2">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-semibold mb-1">Chunk Size</Label>
                            <Input type="number" value={chunkSize} onChange={(e) => setChunkSize(parseInt(e.target.value))} className="border-border bg-background text-foreground" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-semibold mb-1">Chunk Overlap</Label>
                            <Input type="number" value={chunkOverlap} onChange={(e) => setChunkOverlap(parseInt(e.target.value))} className="border-border bg-background text-foreground" />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" className="border-border hover:bg-accent text-foreground" onClick={() => setTextModalOpen(false)}>Cancel</Button>
                        <Button className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90" disabled={isUploading} onClick={handleTextUpload}>
                            {isUploading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing...</> : "Submit Text →"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Website Crawling Modal */}
            <Dialog open={websiteModalOpen} onOpenChange={setWebsiteModalOpen}>
                <DialogContent className="bg-card text-foreground sm:max-w-[700px] border border-border shadow-2xl max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-medium">Website Crawling</DialogTitle>
                        <p className="text-sm text-muted-foreground">Provide a website URL to crawl and extract content.</p>
                    </DialogHeader>

                    <div className="my-4">
                        <Label className="text-sm font-medium mb-1 text-muted-foreground block">Website URL <span className="text-destructive">*</span></Label>
                        <Input placeholder="https://example.com" value={websiteUrl} onChange={(e: any) => setWebsiteUrl(e.target.value)} className="border-border bg-background text-foreground" />
                        <p className="text-[10px] text-muted-foreground mt-1">* Due to site-level restrictions, certain content may not be retrievable.</p>
                    </div>

                    <div className="border border-border rounded-lg p-5 bg-accent/5 mb-4">
                        <h4 className="flex items-center gap-2 text-sm font-semibold mb-6 text-foreground uppercase tracking-tight opacity-80">
                            ⚙ Advance Crawling Options
                        </h4>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-5 mb-6">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Crawl Depth</Label>
                                <Input type="number" value={crawlDepth} onChange={(e: any) => setCrawlDepth(parseInt(e.target.value))} className="bg-background border-border text-foreground h-9" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Max URLs</Label>
                                <Input type="number" value={maxUrls} onChange={(e: any) => setMaxUrls(parseInt(e.target.value))} className="bg-background border-border text-foreground h-9" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Workers</Label>
                                <Input type="number" value={workers} onChange={(e: any) => setWorkers(parseInt(e.target.value))} className="bg-background border-border text-foreground h-9" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Request Delay</Label>
                                <select value={requestDelay} onChange={(e: any) => setRequestDelay(e.target.value)} className="bg-background border-border text-foreground h-9 rounded-md px-3 text-sm outline-none focus:ring-1 focus:ring-primary/20">
                                    <option value="200ms">200ms</option>
                                    <option value="500ms">500ms</option>
                                    <option value="1000ms">1000ms</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Headless Timeout (s)</Label>
                                <Input type="number" value={headlessTimeout} onChange={(e: any) => setHeadlessTimeout(parseInt(e.target.value))} className="bg-background border-border text-foreground h-9" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Chunk size</Label>
                                <Input type="number" value={chunkSize} onChange={(e) => setChunkSize(parseInt(e.target.value))} className="bg-background border-border text-foreground h-9" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs text-muted-foreground font-medium">Chunk overlap</Label>
                                <Input type="number" value={chunkOverlap} onChange={(e) => setChunkOverlap(parseInt(e.target.value))} className="bg-background border-border text-foreground h-9" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={enableHeadless} onChange={(e) => setEnableHeadless(e.target.checked)} className="w-4 h-4 rounded border-border bg-background checked:bg-primary transition-all" />
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Enable Headless Browser</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={enableHtmlExtraction} onChange={(e) => setEnableHtmlExtraction(e.target.checked)} className="w-4 h-4 rounded border-border bg-background checked:bg-primary transition-all" />
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Enable HTML Extraction</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={enableSitemap} onChange={(e) => setEnableSitemap(e.target.checked)} className="w-4 h-4 rounded border-border bg-background checked:bg-primary transition-all" />
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Enable Sitemap Discovery</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={waitForJs} onChange={(e) => setWaitForJs(e.target.checked)} className="w-4 h-4 rounded border-border bg-background checked:bg-primary transition-all" />
                                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Wait for JavaScript</span>
                            </label>
                        </div>

                        <div className="mt-8 space-y-2 border-t border-border pt-6">
                            <h5 className="text-[11px] font-bold text-foreground uppercase tracking-widest opacity-60">Advanced Crawling Options</h5>
                            <ul className="text-[10px] text-muted-foreground space-y-1 ml-1 font-medium">
                                <li>• Depth: How many link levels to follow from the starting URL</li>
                                <li>• Workers: More workers = faster crawling but higher resource usage</li>
                                <li>• Delay: Time between requests to avoid overwhelming the server</li>
                                <li>• Headless Browser: Required for JavaScript-heavy sites</li>
                                <li>• Sitemap: Uses sitemap.xml to discover pages more efficiently</li>
                            </ul>
                        </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground italic mb-6 leading-relaxed opacity-80">
                        By uploading documents to InFynd, you confirm that you have the right to share the information within them...
                    </div>

                    <DialogFooter>
                        <Button className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 shadow-md" onClick={handleWebsiteUpload} disabled={isUploading}>
                            {isUploading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Indexing...</> : "Continue →"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Content Modal */}
            <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
                <DialogContent className="bg-card text-foreground sm:max-w-[800px] border border-border shadow-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b border-border">
                        <DialogTitle className="text-xl font-medium flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            {viewingFile?.file_name}
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground">Viewing extracted content chunks</p>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 bg-accent/5">
                        {isFetchingContent ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground italic">Fetching content...</p>
                            </div>
                        ) : (
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground antialiased">
                                {viewContent || "No content extracted for this document."}
                            </pre>
                        )}
                    </div>

                    <DialogFooter className="p-4 border-t border-border bg-card">
                        <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-accent" onClick={() => setViewModalOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, FolderPlus, Grid, List as ListIcon, Trash2, Database } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface KnowledgeBase {
    id: string;
    name: string;
    description: string;
    created_at: string;
}

export default function KnowledgeBasesPage() {
    const router = useRouter();
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("all");
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");

    // Create Modal
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newKbName, setNewKbName] = useState("");
    const [newKbDesc, setNewKbDesc] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        apiFetch("/workspaces")
            .then((data: any[]) => {
                if (data && data.length > 0) {
                    setActiveWorkspaceId(data[0].id);
                    fetchKbs(data[0].id);
                } else {
                    setIsLoading(false);
                }
            })
            .catch(() => setIsLoading(false));
    }, []);

    const fetchKbs = async (wsId: string) => {
        setIsLoading(true);
        try {
            const data = await apiFetch(`/knowledge-bases/?workspace_id=${wsId}`);
            setKbs(data || []);
        } catch (error) {
            console.error("Failed to fetch KBs", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateKb = async () => {
        if (!activeWorkspaceId) return toast.error("No active workspace found");
        if (!newKbName.trim()) return toast.error("Name is required");

        setIsCreating(true);
        try {
            const res = await apiFetch("/knowledge-bases", {
                method: "POST",
                body: JSON.stringify({
                    name: newKbName,
                    description: newKbDesc,
                    workspace_id: activeWorkspaceId
                })
            });
            toast.success("Knowledge Base Created");
            setKbs([res, ...kbs]);
            setIsCreateModalOpen(false);
            setNewKbName("");
            setNewKbDesc("");
        } catch (err: any) {
            toast.error("Failed to create KB", { description: err.message });
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this Knowledge Base?")) return;
        try {
            await apiFetch(`/knowledge-bases/${id}`, { method: "DELETE" });
            setKbs(kbs.filter(i => i.id !== id));
            toast.success("Deleted");
        } catch (err: any) {
            toast.error("Failed to delete", { description: err.message });
        }
    };

    const filteredKbs = kbs.filter(kb => kb.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <div className="space-y-1">
                    <h1 className="text-4xl font-bold tracking-tight text-gradient">Knowledge Base</h1>
                    <p className="text-muted-foreground text-base">
                        Manage document collections and knowledge sources for AI interactions.
                    </p>
                </div>

                <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20 px-6 h-11 transition-all active:scale-95">
                            <Plus className="mr-2 h-5 w-5 stroke-[3]" /> Create New
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="glass shadow-2xl border-white/5 sm:max-w-[500px] rounded-[2rem]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold">Create Knowledge Base</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-6 py-6">
                            <div className="grid gap-2">
                                <Label htmlFor="name" className="text-xs text-muted-foreground tracking-wider font-bold uppercase ml-1">Name <span className="text-destructive">*</span></Label>
                                <Input id="name" value={newKbName} onChange={(e) => setNewKbName(e.target.value)} placeholder="e.g. Employee Handbook" className="h-12 bg-accent/30 border-border/50 rounded-xl focus-visible:ring-primary/20 transition-all" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="desc" className="text-xs text-muted-foreground tracking-wider font-bold uppercase ml-1">Description</Label>
                                <Textarea id="desc" value={newKbDesc} onChange={(e) => setNewKbDesc(e.target.value)} placeholder="What does this knowledge base contain?" className="bg-accent/30 border-border/50 rounded-xl focus-visible:ring-primary/20 transition-all min-h-[100px]" />
                            </div>
                        </div>
                        <DialogFooter className="gap-3">
                            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl hover:bg-accent/50 text-foreground transition-all">Cancel</Button>
                            <Button onClick={handleCreateKb} disabled={isCreating} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 shadow-lg shadow-primary/20 transition-all active:scale-95">
                                {isCreating ? "Creating..." : "Create"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Tabs */}
            <div className="flex gap-8 border-b border-border/50 mb-8 overflow-x-auto no-scrollbar">
                {[
                    { id: 'all', label: 'All', count: kbs.length },
                    { id: 'kb', label: 'Collections', count: kbs.length },
                    { id: 'kg', label: 'Graphs', count: 0 },
                    { id: 'sm', label: 'Models', count: 0 },
                ].map((tab) => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)} 
                        className={`pb-4 text-[15px] font-medium transition-all relative whitespace-nowrap ${
                            activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-[11px] font-bold">
                                {tab.count}
                            </span>
                        )}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" />
                        )}
                    </button>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-10">
                <div className="relative w-full sm:w-[320px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search knowledge bases..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 bg-accent/30 border-border/50 pl-11 rounded-xl text-sm focus-visible:ring-primary/20 transition-all hover:bg-accent/40"
                    />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                    <Button variant="outline" className="h-11 rounded-xl border-border/50 hover:bg-accent/50 text-foreground transition-all whitespace-nowrap">
                         Select
                    </Button>
                    <Button variant="outline" className="h-11 rounded-xl border-border/50 hover:bg-accent/50 text-foreground transition-all whitespace-nowrap">
                        <FolderPlus className="mr-2 h-4 w-4 text-muted-foreground" /> Create Folder
                    </Button>
                    <div className="flex bg-accent/30 border border-border/50 rounded-xl overflow-hidden h-11">
                        <Button variant="ghost" className="rounded-none bg-primary/10 text-primary w-11 p-0 h-full border-r border-border/50 transition-all"><Grid className="h-4 w-4" /></Button>
                        <Button variant="ghost" className="rounded-none bg-transparent w-11 p-0 h-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-all"><ListIcon className="h-4 w-4" /></Button>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                {isLoading ? (
                    [1, 2, 3, 4].map(n => (
                        <div key={n} className="h-44 rounded-3xl bg-card/40 animate-pulse border border-border/50" />
                    ))
                ) : filteredKbs.length === 0 ? (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-border/40 rounded-[3rem] bg-card/20 transition-all hover:bg-card/30">
                        <div className="w-20 h-20 bg-accent/30 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                            <Database className="w-10 h-10 text-muted-foreground/60" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">No Knowledge Bases Found</h3>
                        <p className="text-muted-foreground">Try adjusting your search or create a new collection.</p>
                    </div>
                ) : (
                    filteredKbs.map((kb) => (
                        <div
                            key={kb.id}
                            onClick={() => router.push(`/dashboard/knowledge-bases/${kb.id}`)}
                            className="glass group h-44 p-6 rounded-3xl shadow-soft hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 relative overflow-hidden flex flex-col cursor-pointer"
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[4rem] group-hover:bg-primary/10 transition-colors -mr-6 -mt-6"></div>
                            
                            <div className="flex justify-between items-start mb-4 relative">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 group-hover:scale-110 transition-transform">
                                    <Database className="w-5 h-5 text-primary" />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                    onClick={(e) => handleDelete(e, kb.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors truncate">
                                {kb.name}
                            </h3>
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                                {kb.description || "Collection of vectorized knowledge for AI context augmentation."}
                            </p>

                            <div className="mt-auto flex justify-between items-center">
                                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                    {new Date(kb.created_at).toLocaleDateString()}
                                </span>
                                <div className="bg-primary/5 px-2 py-0.5 rounded-full text-[10px] font-bold text-primary border border-primary/10">
                                    VECTOR STORE
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}


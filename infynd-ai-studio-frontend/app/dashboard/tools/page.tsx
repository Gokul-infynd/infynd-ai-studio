/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Trash2, Webhook, HardDrive, Search, ExternalLink, ShieldCheck, Trash, RefreshCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useAuth } from "@/lib/auth-provider";
import { Switch } from "@/components/ui/switch";

interface DynamicField {
    key: string;
    value: string;
}

interface MCPIntegration {
    id: string;
    workspace_id?: string;
    name: string;
    integration_type: string;
    config: any;
    is_active: boolean;
    is_global: boolean;
    created_at?: string;
}

const INTEGRATION_NAME_REGEX = /^[a-z]+(?:[_-][a-z]+)*$/;

export default function ToolsPage() {
    const { user } = useAuth();
    const isAdmin = user?.isAdmin || user?.email === "gokulakrishnan74@gmail.com";

    const [integrations, setIntegrations] = useState<MCPIntegration[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<"tools" | "mcp">("tools");

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [toolType, setToolType] = useState<"mcp" | "openapi">("openapi");
    const [mcpTransportType, setMcpTransportType] = useState<"stdio" | "sse" | "json">("stdio");

    // Form inputs
    const [name, setName] = useState("");
    const [isGlobal, setIsGlobal] = useState(false);
    const [command, setCommand] = useState("");
    const [args, setArgs] = useState<string[]>([""]);
    const [envVars, setEnvVars] = useState<DynamicField[]>([{ key: "", value: "" }]);
    const [sseUrl, setSseUrl] = useState("");
    const [sseHeaders, setSseHeaders] = useState<DynamicField[]>([{ key: "", value: "" }]);
    const [rawMcpJson, setRawMcpJson] = useState("{\n  \"command\": \"npx\",\n  \"args\": [\"-y\", \"@modelcontextprotocol/server-sqlite\", \"~/test.db\"],\n  \"env\": {}\n}");
    const [openapiSchema, setOpenapiSchema] = useState("{\n  \"openapi\": \"3.0.0\",\n  \"info\": {\n    \"title\": \"Sample API\",\n    \"version\": \"1.0.0\"\n  },\n  \"paths\": {}\n}");

    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true);
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
    const [refreshingId, setRefreshingId] = useState<string | null>(null);

    useEffect(() => {
        apiFetch("/workspaces")
            .then((data: any[]) => {
                if (data && data.length > 0) {
                    setActiveWorkspaceId(data[0].id);
                    fetchIntegrations(data[0].id);
                } else {
                    // No workspace? Still fetch to see global tools
                    fetchIntegrations("");
                }
            })
            .catch(() => {
                // Fetch failed? Still fetch integrations for global ones
                fetchIntegrations("");
            });
    }, []);

    const fetchIntegrations = async (wsId: string) => {
        setIsLoadingIntegrations(true);
        try {
            const url = wsId ? `/mcp?ws_id=${wsId}` : "/mcp";
            const data = await apiFetch(url);
            setIntegrations(data || []);
        } catch (error) {
            console.error("Failed to fetch integrations", error);
        } finally {
            setIsLoadingIntegrations(false);
        }
    };

    const handleAddField = (setter: any, fields: any[]) => {
        setter([...fields, { key: "", value: "" }]);
    };

    const handleRemoveField = (setter: any, fields: any[], index: number) => {
        setter(fields.filter((_, i) => i !== index));
    };

    const handleFieldChange = (setter: any, fields: any[], index: number, key: string, value: string) => {
        const newFields = [...fields];
        newFields[index] = { key, value };
        setter(newFields);
    };

    const handleSave = async () => {
        const normalizedName = name.trim();
        if (!normalizedName) return toast.error("Name is required");
        if (!INTEGRATION_NAME_REGEX.test(normalizedName)) {
            return toast.error("Name must use lowercase letters only, with optional underscores or hyphens, and no spaces");
        }
        if (!activeWorkspaceId && !isGlobal) return toast.error("No active workspace found");
        setIsSaving(true);

        try {
            let config: any = {};
            if (toolType === "mcp") {
                if (mcpTransportType === "stdio") {
                    config = {
                        transport_type: "stdio",
                        command,
                        args: args.filter(a => a.trim() !== ""),
                        env: envVars.reduce((acc, curr) => {
                            if (curr.key) acc[curr.key] = curr.value;
                            return acc;
                        }, {} as any)
                    };
                } else if (mcpTransportType === "sse") {
                    config = {
                        transport_type: "sse",
                        url: sseUrl,
                        headers: sseHeaders.reduce((acc, curr) => {
                            if (curr.key) acc[curr.key] = curr.value;
                            return acc;
                        }, {} as any)
                    };
                } else {
                    try {
                        config = JSON.parse(rawMcpJson);
                        if (!config.transport_type) config.transport_type = "stdio";
                    } catch (e: any) {
                        toast.error("Invalid JSON configuration", { description: e.message });
                        setIsSaving(false);
                        return;
                    }
                }
            } else {
                config = {
                    openapi_schema: JSON.parse(openapiSchema),
                    command: "noop"
                };
            }

            const res = await apiFetch("/mcp", {
                method: "POST",
                body: JSON.stringify({
                    name: normalizedName,
                    integration_type: toolType === "mcp" ? "custom" : "openapi",
                    workspace_id: isGlobal ? undefined : activeWorkspaceId,
                    is_global: isGlobal,
                    config
                })
            });

            toast.success("Tool added successfully");
            setIntegrations((current) => [res, ...current]);
            setIsAddModalOpen(false);
            resetForm();
        } catch (error: any) {
            toast.error("Failed to add tool", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setName("");
        setIsGlobal(false);
        setCommand("");
        setArgs([""]);
        setEnvVars([{ key: "", value: "" }]);
        setSseUrl("");
        setSseHeaders([{ key: "", value: "" }]);
        setOpenapiSchema("{\n  \"openapi\": \"3.0.0\",\n  \"info\": {\n    \"title\": \"Sample API\",\n    \"version\": \"1.0.0\"\n  },\n  \"paths\": {}\n}");
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            await apiFetch(`/mcp/${id}`, { method: "DELETE" });
            setIntegrations((current) => current.filter((item) => item.id !== id));
            toast.success("Deleted");
        } catch (err: any) {
            toast.error("Delete failed", { description: err.message });
        }
    };

    const handleRefreshTools = async (id: string) => {
        setRefreshingId(id);
        try {
            const updated = await apiFetch(`/mcp/${id}/refresh-tools`, { method: "POST" });
            setIntegrations((current) => current.map((item) => (item.id === id ? updated : item)));
            toast.success("Available tools refreshed");
        } catch (err: any) {
            toast.error("Refresh failed", { description: err.message });
        } finally {
            setRefreshingId(null);
        }
    };

    const filteredTools = useMemo(() => {
        return integrations.filter(i => {
            const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesTab = activeTab === "mcp" ? i.integration_type === "custom" : i.integration_type === "openapi";
            return matchesSearch && matchesTab;
        });
    }, [integrations, searchQuery, activeTab]);

    const inbuiltTools = filteredTools.filter(t => t.is_global);
    const myTools = filteredTools.filter(t => !t.is_global);
    const loadingCards = Array.from({ length: 8 }, (_, index) => index);

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="mb-8 flex shrink-0 items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-2">Tools & Integrations</h1>
                    <p className="text-muted-foreground text-sm">
                        Connect external APIs and MCP servers to empower your agents.
                    </p>
                </div>
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90 shadow-md gap-2">
                            <Plus className="h-4 w-4" /> Add Tool
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[650px] bg-card border-border max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Add New Integration</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6 py-4">
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-2">
                                    <Label>Integration Name *</Label>
                                    <Input value={name} onChange={e => setName(e.target.value.toLowerCase())} placeholder="e.g. github_tools" />
                                    <p className="text-[11px] text-muted-foreground">
                                        Use lowercase letters only. Separate words with `_` or `-`.
                                    </p>
                                </div>
                                {isAdmin && (
                                    <div className="flex flex-col justify-center items-center gap-2 border-l border-border pl-4">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest leading-none">Global</Label>
                                        <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
                                    </div>
                                )}
                            </div>

                            <Tabs value={toolType} onValueChange={(v: any) => setToolType(v)}>
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="openapi">OpenAPI Spec</TabsTrigger>
                                    <TabsTrigger value="mcp">MCP Server</TabsTrigger>
                                </TabsList>

                                <TabsContent value="openapi" className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>OpenAPI Schema (JSON) *</Label>
                                        <Textarea value={openapiSchema} onChange={e => setOpenapiSchema(e.target.value)} className="h-[300px] font-mono text-xs" />
                                    </div>
                                </TabsContent>

                                <TabsContent value="mcp" className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>Transport</Label>
                                        <div className="flex gap-2">
                                            <Button variant={mcpTransportType === "stdio" ? "default" : "outline"} onClick={() => setMcpTransportType("stdio")} className="flex-1 text-xs">STDIO (Local)</Button>
                                            <Button variant={mcpTransportType === "sse" ? "default" : "outline"} onClick={() => setMcpTransportType("sse")} className="flex-1 text-xs">HTTP/SSE (Remote)</Button>
                                            <Button variant={mcpTransportType === "json" ? "default" : "outline"} onClick={() => setMcpTransportType("json")} className="flex-1 text-xs">RAW JSON</Button>
                                        </div>
                                    </div>

                                    {mcpTransportType === "stdio" ? (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Command *</Label>
                                                <Input value={command} onChange={e => setCommand(e.target.value)} placeholder="npx, python, node..." />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="flex justify-between items-center">
                                                    Arguments
                                                    <Button variant="ghost" size="sm" onClick={() => setArgs([...args, ""])} className="h-6 px-2"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                                                </Label>
                                                {args.map((arg, i) => (
                                                    <div key={i} className="flex gap-2">
                                                        <Input value={arg} onChange={e => {
                                                            const n = [...args]; n[i] = e.target.value; setArgs(n);
                                                        }} placeholder={`Arg ${i + 1}`} />
                                                        <Button variant="ghost" size="icon" onClick={() => setArgs(args.filter((_, idx) => idx !== i))}><Trash className="h-4 w-4" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="flex justify-between items-center">
                                                    Environment Variables
                                                    <Button variant="ghost" size="sm" onClick={() => handleAddField(setEnvVars, envVars)} className="h-6 px-2"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                                                </Label>
                                                {envVars.map((v, i) => (
                                                    <div key={i} className="flex gap-2">
                                                        <Input value={v.key} onChange={e => handleFieldChange(setEnvVars, envVars, i, e.target.value, v.value)} placeholder="KEY" />
                                                        <Input value={v.value} onChange={e => handleFieldChange(setEnvVars, envVars, i, v.key, e.target.value)} placeholder="VALUE" />
                                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveField(setEnvVars, envVars, i)}><Trash className="h-4 w-4" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : mcpTransportType === "sse" ? (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Server URL (HTTP or SSE) *</Label>
                                                <Input value={sseUrl} onChange={e => setSseUrl(e.target.value)} placeholder="https://backend.composio.dev/v3/mcp/..." />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="flex justify-between items-center">
                                                    Headers
                                                    <Button variant="ghost" size="sm" onClick={() => handleAddField(setSseHeaders, sseHeaders)} className="h-6 px-2"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                                                </Label>
                                                {sseHeaders.map((v, i) => (
                                                    <div key={i} className="flex gap-2">
                                                        <Input value={v.key} onChange={e => handleFieldChange(setSseHeaders, sseHeaders, i, e.target.value, v.value)} placeholder="Header-Key" />
                                                        <Input value={v.value} onChange={e => handleFieldChange(setSseHeaders, sseHeaders, i, v.key, e.target.value)} placeholder="value" />
                                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveField(setSseHeaders, sseHeaders, i)}><Trash className="h-4 w-4" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Raw MCP JSON Config *</Label>
                                                <Textarea value={rawMcpJson} onChange={e => setRawMcpJson(e.target.value)} className="h-[200px] font-mono text-xs" />
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Adding and syncing..." : "Add Integration"}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="mb-8 flex shrink-0 items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Input placeholder="Search for tools, APIs, or MCP servers..." className="border-none focus-visible:ring-0 bg-transparent h-6" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <TabsList className="mb-8 h-auto w-full shrink-0 justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
                    <TabsTrigger value="tools" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">Tools (OpenAPI)</TabsTrigger>
                    <TabsTrigger value="mcp" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">MCP Servers</TabsTrigger>
                </TabsList>

                <TabsContent value="tools" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-2">
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <h2 className="text-xl font-semibold">My Custom Tools</h2>
                            <span className="text-xs bg-accent px-2 py-0.5 rounded-full">{myTools.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {isLoadingIntegrations ? (
                                loadingCards.map((item) => <ToolCardSkeleton key={`tools-loading-${item}`} index={item} />)
                            ) : (
                                <>
                                    {myTools.map(t => <ToolCard key={t.id} tool={t} onDelete={handleDelete} onRefresh={handleRefreshTools} isRefreshing={refreshingId === t.id} />)}
                                    {myTools.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center bg-accent/20 rounded-xl border border-dashed border-border">No custom tools added yet.</p>}
                                </>
                            )}
                        </div>
                    </section>

                    <section className="mt-12">
                        <div className="flex items-center gap-2 mb-6">
                            <h2 className="text-xl font-semibold">Inbuilt System Tools</h2>
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{inbuiltTools.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {isLoadingIntegrations ? (
                                loadingCards.map((item) => <ToolCardSkeleton key={`system-tools-loading-${item}`} index={item} />)
                            ) : (
                                <>
                                    {inbuiltTools.map(t => <ToolCard key={t.id} tool={t} isStatic onRefresh={handleRefreshTools} isRefreshing={refreshingId === t.id} />)}
                                    {inbuiltTools.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center bg-accent/20 rounded-xl border border-dashed border-border">No global tools configured by admin.</p>}
                                </>
                            )}
                        </div>
                    </section>
                </TabsContent>

                <TabsContent value="mcp" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-2">
                    <section>
                        <div className="flex items-center gap-2 mb-6">
                            <h2 className="text-xl font-semibold">My MCP Servers</h2>
                            <span className="text-xs bg-accent px-2 py-0.5 rounded-full">{myTools.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {isLoadingIntegrations ? (
                                loadingCards.map((item) => <ToolCardSkeleton key={`mcp-loading-${item}`} index={item} />)
                            ) : (
                                <>
                                    {myTools.map(t => <ToolCard key={t.id} tool={t} onDelete={handleDelete} onRefresh={handleRefreshTools} isRefreshing={refreshingId === t.id} />)}
                                    {myTools.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center bg-accent/20 rounded-xl border border-dashed border-border">No MCP servers added yet.</p>}
                                </>
                            )}
                        </div>
                    </section>

                    <section className="mt-12">
                        <div className="flex items-center gap-2 mb-6">
                            <h2 className="text-xl font-semibold">System MCP Servers</h2>
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{inbuiltTools.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {isLoadingIntegrations ? (
                                loadingCards.map((item) => <ToolCardSkeleton key={`system-mcp-loading-${item}`} index={item} />)
                            ) : (
                                inbuiltTools.map(t => <ToolCard key={t.id} tool={t} isStatic onRefresh={handleRefreshTools} isRefreshing={refreshingId === t.id} />)
                            )}
                        </div>
                    </section>
                </TabsContent>
            </Tabs>
        </div >
    );
}

function ToolCard({
    tool,
    onDelete,
    onRefresh,
    isStatic,
    isRefreshing = false,
}: {
    tool: MCPIntegration,
    onDelete?: (id: string) => void,
    onRefresh?: (id: string) => void,
    isStatic?: boolean,
    isRefreshing?: boolean,
}) {
    const isMcp = tool.integration_type === "custom";
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [toolSearch, setToolSearch] = useState("");
    const cachedTools = tool.config?.cached_tools || [];
    const isInventoryLoading = isRefreshing || (!cachedTools.length && !tool.config?.cached_tools_updated_at && !tool.config?.cached_tools_error);
    const filteredTools = !toolSearch.trim()
        ? cachedTools
        : cachedTools.filter((cachedTool: any) => {
            const query = toolSearch.trim().toLowerCase();
            return (
                String(cachedTool.name || "").toLowerCase().includes(query) ||
                String(cachedTool.description || "").toLowerCase().includes(query)
            );
        });

    return (
        <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all group flex flex-col relative shadow-sm hover:shadow-md">
            <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    {isMcp ? <HardDrive className="w-5 h-5" /> : <Webhook className="w-5 h-5" />}
                </div>
                {!isStatic && (
                    <Button variant="ghost" size="icon" onClick={() => onDelete?.(tool.id)} className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
                {isStatic && <ShieldCheck className="h-5 w-5 text-primary opacity-50" />}
            </div>
            <h3 className="text-foreground font-semibold mb-1 truncate">{tool.name}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">
                {isMcp ? `Transport: ${tool.config?.transport_type || 'stdio'}` : `Spec: ${tool.config?.openapi_schema?.info?.title || 'External API'}`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    {isInventoryLoading ? "Syncing tools..." : `${cachedTools.length} available tools`}
                </span>
                {tool.config?.cached_tools_updated_at ? (
                    <span className="text-[10px] text-muted-foreground">
                        Updated {new Date(tool.config.cached_tools_updated_at).toLocaleString()}
                    </span>
                ) : null}
            </div>
            {tool.config?.cached_tools_error ? (
                <p className="mt-2 text-[10px] text-amber-600">Inventory sync issue: {tool.config.cached_tools_error}</p>
            ) : null}
            <div className="mt-8 flex items-center justify-between">
                <span className={`text-[10px] uppercase font-bold tracking-wider ${isStatic ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isStatic ? 'System' : 'Custom'}
                </span>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 group/btn" onClick={() => onRefresh?.(tool.id)}>
                        <RefreshCcw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                    <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 group/btn"
                            onClick={() => {
                                setToolSearch("");
                                setIsViewOpen(true);
                            }}
                        >
                            View <ExternalLink className="h-3 w-3 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                        </Button>
                        <DialogContent className="max-h-[85vh] overflow-hidden border-border bg-card text-foreground sm:max-w-[720px]">
                            <DialogHeader>
                                <DialogTitle>Available Tools</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 overflow-hidden py-4">
                                <div className="rounded-2xl border border-border bg-accent/20 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-foreground">{tool.name}</span>
                                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                                            {isStatic ? "System" : "Custom"}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {cachedTools.length} available
                                            {isMcp ? " · MCP" : " · OpenAPI"}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Search Tools</Label>
                                    <Input
                                        value={toolSearch}
                                        onChange={(event) => setToolSearch(event.target.value)}
                                        placeholder="Search by tool name or description..."
                                        className="h-10 border-border bg-background text-sm text-foreground"
                                    />
                                </div>

                                {isInventoryLoading ? (
                                    <div className="space-y-3">
                                        <Label className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                                            <RefreshCcw className="h-3 w-3 animate-spin text-primary/80" />
                                            Syncing Tool Inventory
                                        </Label>
                                        <InventorySkeletonRows />
                                    </div>
                                ) : cachedTools.length > 0 ? (
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tool Inventory</Label>
                                        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-2">
                                            {filteredTools.map((cachedTool: any) => (
                                                <div key={cachedTool.name} className="rounded-xl border border-border bg-accent/20 px-3 py-3">
                                                    <div className="font-mono text-[11px] text-foreground">{cachedTool.name}</div>
                                                    <div className="mt-1 text-[11px] text-muted-foreground">{cachedTool.description || "No description available."}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-border bg-accent/10 px-3 py-4 text-center text-xs text-muted-foreground">
                                        No tools are available for this source yet. Use refresh to sync the latest inventory.
                                    </div>
                                )}

                                {!isInventoryLoading && cachedTools.length > 0 && filteredTools.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-border bg-accent/10 px-3 py-4 text-center text-xs text-muted-foreground">
                                        No tools matched your search.
                                    </div>
                                ) : null}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsViewOpen(false)}>Close</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </div>
    );
}

function ToolCardSkeleton({ index }: { index: number }) {
    const delay = `${(index % 5) * 120}ms`;
    return (
        <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-accent/20 p-5 shadow-sm">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-10 left-0 h-28 w-full animate-pulse bg-primary/5 blur-2xl" style={{ animationDelay: delay }} />
            </div>
            <div className="relative flex h-full flex-col">
                <div className="mb-4 flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg border border-border bg-accent/40 animate-pulse" style={{ animationDelay: delay }} />
                    <div className="h-7 w-7 rounded-md bg-accent/40 animate-pulse" style={{ animationDelay: `${(index % 5) * 140}ms` }} />
                </div>
                <div className="mb-2 h-4 w-2/3 rounded-md bg-accent/50 animate-pulse" style={{ animationDelay: delay }} />
                <div className="mb-1.5 h-3 w-5/6 rounded-md bg-accent/30 animate-pulse" style={{ animationDelay: `${(index % 5) * 160}ms` }} />
                <div className="mb-4 h-3 w-3/5 rounded-md bg-accent/20 animate-pulse" style={{ animationDelay: `${(index % 5) * 200}ms` }} />
                <div className="mb-6 flex items-center gap-2">
                    <div className="h-5 w-28 rounded-full bg-primary/15 animate-pulse" style={{ animationDelay: delay }} />
                    <div className="h-4 w-24 rounded-full bg-accent/30 animate-pulse" style={{ animationDelay: `${(index % 5) * 140}ms` }} />
                </div>
                <div className="mt-auto flex items-center justify-between">
                    <div className="h-3 w-14 rounded bg-accent/30 animate-pulse" style={{ animationDelay: delay }} />
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-16 rounded-md bg-accent/35 animate-pulse" style={{ animationDelay: `${(index % 5) * 180}ms` }} />
                        <div className="h-7 w-14 rounded-md bg-accent/25 animate-pulse" style={{ animationDelay: `${(index % 5) * 220}ms` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function InventorySkeletonRows() {
    const placeholders = Array.from({ length: 5 }, (_, index) => index);
    return (
        <div className="space-y-2">
            {placeholders.map((item) => (
                <div key={`inventory-skeleton-${item}`} className="rounded-xl border border-border bg-accent/15 px-3 py-3">
                    <div
                        className="mb-2 h-3.5 w-1/2 rounded bg-accent/50 animate-pulse"
                        style={{ animationDelay: `${item * 120}ms` }}
                    />
                    <div
                        className="mb-1.5 h-3 w-11/12 rounded bg-accent/30 animate-pulse"
                        style={{ animationDelay: `${item * 140}ms` }}
                    />
                    <div
                        className="h-3 w-3/4 rounded bg-accent/20 animate-pulse"
                        style={{ animationDelay: `${item * 160}ms` }}
                    />
                </div>
            ))}
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, Settings2, Database, Trash2, Webhook, X, HardDrive, Search, Trash } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DynamicField {
    key: string;
    value: string;
}

export default function AdminToolsPage() {
    const [integrations, setIntegrations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [toolType, setToolType] = useState<"mcp" | "openapi">("mcp");
    const [mcpTransportType, setMcpTransportType] = useState<"stdio" | "sse" | "json">("stdio");

    // Form inputs
    const [name, setName] = useState("");
    const [command, setCommand] = useState("");
    const [args, setArgs] = useState<string[]>([""]);
    const [envVars, setEnvVars] = useState<DynamicField[]>([{ key: "", value: "" }]);
    const [sseUrl, setSseUrl] = useState("");
    const [sseHeaders, setSseHeaders] = useState<DynamicField[]>([{ key: "", value: "" }]);
    const [rawMcpJson, setRawMcpJson] = useState("{\n  \"command\": \"npx\",\n  \"args\": [\"-y\", \"@modelcontextprotocol/server-sqlite\", \"~/test.db\"],\n  \"env\": {}\n}");

    const [openapiSchema, setOpenapiSchema] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchIntegrations();
    }, []);

    const fetchIntegrations = async () => {
        setIsLoading(true);
        try {
            // ws_id null or any will work since get_mcp fetches all, but let's just call it
            const data = await apiFetch("/mcp");
            setIntegrations(data.filter((i: any) => i.is_global) || []);
        } catch (error) {
            console.error("Failed to fetch integrations", error);
        } finally {
            setIsLoading(false);
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
        if (!name) return toast.error("Name is required");
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
                    // Raw JSON
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
                    name,
                    integration_type: toolType === "mcp" ? "custom" : "openapi",
                    is_global: true,
                    config
                })
            });

            toast.success("Global tool added successfully");
            setIntegrations([res, ...integrations]);
            setIsAddModalOpen(false);
            resetForm();
        } catch (error: any) {
            toast.error("Failed to save tool", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setName("");
        setCommand("");
        setArgs([""]);
        setEnvVars([{ key: "", value: "" }]);
        setSseUrl("");
        setSseHeaders([{ key: "", value: "" }]);
        setOpenapiSchema("");
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will remove the tool for ALL users.")) return;
        try {
            await apiFetch(`/mcp/${id}`, { method: "DELETE" });
            setIntegrations(integrations.filter(i => i.id !== id));
            toast.success("Tool removed");
        } catch (error: any) {
            toast.error("Delete failed", { description: error.message });
        }
    };

    const filteredIntegrations = integrations.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Global System Tools</h1>
                    <p className="text-muted-foreground">Manage MCP servers and OpenAPI tools available to all studio users.</p>
                </div>
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" /> Add System Tool
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] bg-card border-border max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Create New System-wide Tool</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6 py-4">
                            <div className="space-y-2">
                                <Label>Tool Name *</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. System SQLite Search" />
                            </div>

                            <Tabs value={toolType} onValueChange={(v: any) => setToolType(v)}>
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="mcp">MCP Server</TabsTrigger>
                                    <TabsTrigger value="openapi">OpenAPI Spec</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mcp" className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>Transport Type</Label>
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
                                                <Input value={command} onChange={e => setCommand(e.target.value)} placeholder="e.g. npx, python, node" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="flex justify-between items-center">
                                                    Arguments
                                                    <Button variant="ghost" size="sm" onClick={() => setArgs([...args, ""])} className="h-6 px-2"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                                                </Label>
                                                {args.map((arg, i) => (
                                                    <div key={i} className="flex gap-2">
                                                        <Input value={arg} onChange={e => {
                                                            const newArgs = [...args];
                                                            newArgs[i] = e.target.value;
                                                            setArgs(newArgs);
                                                        }} placeholder={`arg ${i + 1}`} />
                                                        <Button variant="ghost" size="icon" onClick={() => setArgs(args.filter((_, idx) => idx !== i))}><Trash className="h-4 w-4 text-muted-foreground" /></Button>
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
                                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveField(setEnvVars, envVars, i)}><Trash className="h-4 w-4 text-muted-foreground" /></Button>
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
                                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveField(setSseHeaders, sseHeaders, i)}><Trash className="h-4 w-4 text-muted-foreground" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>MCP JSON Config *</Label>
                                                <Textarea value={rawMcpJson} onChange={e => setRawMcpJson(e.target.value)} className="h-[200px] font-mono text-xs" />
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="openapi" className="space-y-4 pt-4">
                                    <div className="space-y-2">
                                        <Label>OpenAPI JSON Spec *</Label>
                                        <Textarea value={openapiSchema} onChange={e => setOpenapiSchema(e.target.value)} className="h-[300px] font-mono text-xs" placeholder='{ "openapi": "3.0.0", ... }' />
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "Creating..." : "Create Global Tool"}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex items-center gap-4 bg-card p-4 rounded-xl border border-border">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Input placeholder="Search system tools..." className="border-none focus-visible:ring-0" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <div>Loading...</div>
                ) : filteredIntegrations.map((tool: any) => (
                    <div key={tool.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all flex flex-col relative group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                {tool.integration_type === "custom" ? <Webhook className="h-5 w-5" /> : <Database className="h-5 w-5" />}
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(tool.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <h3 className="font-semibold text-lg">{tool.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 mb-4">
                            {tool.integration_type === "custom"
                                ? `Transport: ${tool.config?.transport_type || 'stdio'}`
                                : 'OpenAPI Protocol'}
                        </p>
                        <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/50">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-primary">System Global</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(tool.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

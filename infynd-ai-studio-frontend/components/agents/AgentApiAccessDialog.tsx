"use client";

import { useMemo, useState } from "react";
import { Copy, KeyRound, RefreshCcw, ShieldX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CodeHighlighter } from "@/components/ui/code-highlighter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, buildApiUrl } from "@/lib/api";

interface AgentApiAccessDialogProps {
  agentId: string | null;
  triggerLabel?: string;
  triggerClassName?: string;
}

interface ApiKeyStatus {
  has_key: boolean;
  last4: string | null;
  created_at: string | null;
}

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
}

function formatDate(value?: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function maskApiKey(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 14)}...${value.slice(-8)}`;
}

export function AgentApiAccessDialog({
  agentId,
  triggerLabel = "API",
  triggerClassName,
}: AgentApiAccessDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [status, setStatus] = useState<ApiKeyStatus>({ has_key: false, last4: null, created_at: null });
  const [freshApiKey, setFreshApiKey] = useState<string>("");

  const endpointUrl = useMemo(() => {
    if (!agentId) return "";
    return toAbsoluteUrl(buildApiUrl(`/agents/${agentId}/chat`));
  }, [agentId]);

  const curlExample = useMemo(() => {
    if (!endpointUrl) return "";
    return [
      `curl -X POST "${endpointUrl}" \\`,
      '  -H "X-API-Key: YOUR_INFYND_AGENT_API_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      "  -d '{",
      '    "message": "Summarize the latest sales inbox updates",',
      '    "history": [],',
      '    "stream": false,',
      '    "enable_thinking": false',
      "  }'",
    ].join("\n");
  }, [endpointUrl]);

  const pythonExample = useMemo(() => {
    if (!endpointUrl) return "";
    return [
      "import requests",
      "",
      `url = "${endpointUrl}"`,
      'api_key = "YOUR_INFYND_AGENT_API_KEY"',
      "headers = {",
      '    "X-API-Key": api_key,',
      '    "Content-Type": "application/json",',
      "}",
      "payload = {",
      '    "message": "Summarize the latest sales inbox updates",',
      '    "history": [],',
      '    "stream": False,',
      '    "enable_thinking": False,',
      "}",
      "response = requests.post(url, headers=headers, json=payload, timeout=120)",
      "response.raise_for_status()",
      "print(response.json())",
    ].join("\n");
  }, [endpointUrl]);

  const copyToClipboard = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const data = (await apiFetch("/auth/api-key")) as ApiKeyStatus;
      setStatus({
        has_key: Boolean(data?.has_key),
        last4: data?.last4 || null,
        created_at: data?.created_at || null,
      });
    } catch (error: unknown) {
      toast.error("Failed to load API key status", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsLoading(false);
    }
  };

  const rotateApiKey = async () => {
    setIsRotating(true);
    try {
      const data = (await apiFetch("/auth/api-key/rotate", { method: "POST" })) as {
        api_key: string;
        last4: string;
        created_at: string;
      };
      setFreshApiKey(data.api_key || "");
      setStatus({
        has_key: true,
        last4: data.last4 || null,
        created_at: data.created_at || null,
      });
      toast.success("API key rotated");
    } catch (error: unknown) {
      toast.error("Failed to rotate API key", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsRotating(false);
    }
  };

  const revokeApiKey = async () => {
    if (!status.has_key) return;
    setIsRevoking(true);
    try {
      await apiFetch("/auth/api-key", { method: "DELETE" });
      setStatus({ has_key: false, last4: null, created_at: null });
      setFreshApiKey("");
      toast.success("API key revoked");
    } catch (error: unknown) {
      toast.error("Failed to revoke API key", { description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          loadStatus().catch(() => { });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className={triggerClassName} disabled={!agentId}>
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-scroll border-border bg-card text-foreground sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Agent API Access</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="rounded-xl border border-border bg-accent/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agent Endpoint</div>
            <div className="mt-1 break-all font-mono text-xs text-foreground">{endpointUrl || "Select an agent first."}</div>
          </div>

          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">User API Key</div>
                {/* <div className="mt-1 text-xs text-muted-foreground">
                  Key is user-scoped and validated by backend service key. Rotate when sharing access.
                </div> */}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => loadStatus().catch(() => { })} disabled={isLoading}>
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                  Refresh
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={rotateApiKey} disabled={isRotating}>
                  {status.has_key ? "Rotate Key" : "Generate Key"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={revokeApiKey}
                  disabled={isRevoking || !status.has_key}
                >
                  <ShieldX className="mr-1 h-3.5 w-3.5" />
                  Revoke
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-accent/20 p-2">
                <span className="font-semibold text-foreground">Status:</span> {status.has_key ? "Active" : "Not generated"}
              </div>
              <div className="rounded-lg border border-border bg-accent/20 p-2">
                <span className="font-semibold text-foreground">Last 4:</span> {status.last4 || "N/A"}
              </div>
              <div className="rounded-lg border border-border bg-accent/20 p-2 sm:col-span-2">
                <span className="font-semibold text-foreground">Created:</span> {formatDate(status.created_at)}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-zinc-950 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Latest API Key</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-zinc-200 hover:bg-zinc-900"
                  disabled={!freshApiKey}
                  onClick={() => copyToClipboard("API key", freshApiKey)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <div className="break-all font-mono text-xs text-zinc-100">
                {freshApiKey ? maskApiKey(freshApiKey) : "No key generated yet."}
              </div>
            </div>
          </div>

          <Tabs defaultValue="curl" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="pt-3">
              <div className="mb-2 flex justify-end">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard("cURL", curlExample)} disabled={!curlExample}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy cURL
                </Button>
              </div>
              <CodeHighlighter code={curlExample || "# No agent selected"} language="bash" />
            </TabsContent>
            <TabsContent value="python" className="pt-3">
              <div className="mb-2 flex justify-end">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard("Python", pythonExample)} disabled={!pythonExample}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy Python
                </Button>
              </div>
              <CodeHighlighter code={pythonExample || "# No agent selected"} language="python" />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

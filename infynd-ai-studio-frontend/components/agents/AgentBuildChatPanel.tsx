"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrainCircuit } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BuilderMessage } from "@/components/agents/types";

const BUILDER_MODEL_LABEL =
  process.env.NEXT_PUBLIC_AGENT_BUILDER_MODEL_LABEL ||
  process.env.NEXT_PUBLIC_AGENT_BUILDER_MODEL ||
  "gemini/gemini-2.5-flash";

interface AgentBuildChatPanelProps {
  messages: BuilderMessage[];
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  isBuilding: boolean;
  disabled?: boolean;
}

export function AgentBuildChatPanel({
  messages,
  message,
  onMessageChange,
  onSubmit,
  isBuilding,
  disabled = false,
}: AgentBuildChatPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[28px] border border-border bg-accent/5">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-wide text-foreground">Build Agent With Chat</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Describe the agent or multi-agent flow. The builder will create or update real saved agents.
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {messages.length === 1 ? (
          <div className="m-auto max-w-[340px] space-y-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <BrainCircuit className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-foreground">Real Agent Builder</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The builder uses the same JSON and persistence path as the manual agent module.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                "Build a support agent that uses our product knowledge base and Slack tools.",
                "Create a manager agent with a researcher and a writer worker for market analysis.",
                "Build a sales outreach agent using HubSpot, Gmail, and our pricing docs.",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onMessageChange(suggestion)}
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-left text-[11px] text-muted-foreground transition-all hover:border-primary/20 hover:bg-accent hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8 pb-4">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex flex-col gap-2 ${item.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[90%] text-sm leading-relaxed ${
                    item.role === "user"
                      ? "rounded-2xl rounded-tr-sm border border-primary/10 bg-primary/[0.07] p-4 text-foreground shadow-sm"
                      : "py-1 text-foreground"
                  }`}
                >
                  {item.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none pl-6 leading-9 dark:prose-invert prose-p:leading-relaxed prose-pre:border prose-pre:border-border prose-pre:bg-accent/50">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="font-medium">{item.content}</span>
                  )}
                </div>
              </div>
            ))}
            {isBuilding ? (
              <div className="flex justify-start py-2 pl-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:300ms]" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground animate-pulse">
                    Updating real agent rows...
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background/50 p-4">
        <div className="relative">
          <Textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="Describe the agent you want to build..."
            className="min-h-[44px] max-h-[120px] resize-none rounded-2xl border border-border bg-background py-3 pr-12 text-sm text-foreground transition-all focus-visible:ring-1 focus-visible:ring-primary/20"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onSubmit}
            disabled={disabled || isBuilding || !message.trim()}
            className="absolute right-2 top-2 h-7 w-7 rounded-xl bg-primary text-primary-foreground transition-all active:scale-90 hover:bg-primary/90 disabled:grayscale"
          >
            <BrainCircuit className="h-3 w-3" />
          </Button>
        </div>
        <p className="mt-2.5 flex justify-between px-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">
          <span>↵ Send · ⇧↵ Newline</span>
          <span>{BUILDER_MODEL_LABEL}</span>
        </p>
      </div>
    </div>
  );
}

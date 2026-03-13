"use client";

import { ChevronDown, MessagesSquare, Play, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RuntimeMessage } from "@/components/agents/types";

interface AgentTestChatPanelProps {
  messages: RuntimeMessage[];
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  isChatting: boolean;
  enableStreaming: boolean;
  onStreamingChange: (value: boolean) => void;
  disabled?: boolean;
}

export function AgentTestChatPanel({
  messages,
  message,
  onMessageChange,
  onSubmit,
  isChatting,
  enableStreaming,
  onStreamingChange,
  disabled = false,
}: AgentTestChatPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[28px] border border-border bg-accent/5 backdrop-blur-sm">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background/50 px-4">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
          <Play className="h-3 w-3 fill-green-500 text-green-500" /> Test Agent Inference
        </h2>
        <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-accent/20 px-2 py-1">
          <span className="text-[10px] font-medium text-muted-foreground">Stream</span>
          <Switch checked={enableStreaming} onCheckedChange={onStreamingChange} className="m-0 scale-[0.6]" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="m-auto max-w-[320px] space-y-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <MessagesSquare className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-foreground">Test Your Agent</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Start a conversation to see how the current saved configuration responds.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-8 pb-4">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex flex-col gap-2 ${item.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`flex items-center gap-2 px-1 ${item.role === "user" ? "flex-row-reverse" : ""}`}>
                  <span className="pl-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                    {item.role === "user" ? "User" : "Agent"}
                  </span>
                </div>
                <div
                  className={`max-w-[90%] text-sm leading-relaxed ${
                    item.role === "user"
                      ? "rounded-2xl rounded-tr-sm border border-primary/10 bg-primary/[0.07] p-4 text-foreground shadow-sm"
                      : "py-1 text-foreground"
                  }`}
                >
                  {item.thinking ? (
                    <details
                      className="group mb-6 rounded-lg border border-border bg-accent/5 px-4 py-3 font-mono text-[11px] text-muted-foreground transition-all"
                      open={index === messages.length - 1 && isChatting}
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-foreground/70 hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" /> Reasoning Process
                        <ChevronDown className="ml-auto h-3 w-3 opacity-50 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 max-h-[400px] overflow-y-auto whitespace-pre-wrap border-t border-border pt-3 font-mono text-[10.5px] leading-relaxed">
                        {item.thinking}
                      </div>
                    </details>
                  ) : null}

                  <div className={`${item.role === "assistant" ? "prose prose-sm max-w-none pl-6 leading-9 dark:prose-invert prose-p:leading-relaxed prose-pre:border prose-pre:border-border prose-pre:bg-accent/50" : ""}`}>
                    {item.role === "assistant" ? (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                        {!item.content && item.thinking ? (
                          <span className="flex items-center gap-2 text-xs font-mono italic text-muted-foreground opacity-70">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                            Synthesizing response...
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="font-medium">{item.content}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isChatting && (!messages.length || messages[messages.length - 1].role === "user") ? (
              <div className="flex justify-start py-2 pl-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:300ms]" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground animate-pulse">Running...</span>
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
            placeholder="Type a message to your agent..."
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
            disabled={disabled || isChatting || !message.trim()}
            className="absolute right-2 top-2 h-7 w-7 rounded-xl bg-primary text-primary-foreground transition-all active:scale-90 hover:bg-primary/90 disabled:grayscale"
          >
            <Play className="h-3 w-3" />
          </Button>
        </div>
        <p className="mt-2.5 flex justify-between px-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">
          <span>↵ Send · ⇧↵ Newline</span>
          <span>Powered by LiteLLM</span>
        </p>
      </div>
    </div>
  );
}

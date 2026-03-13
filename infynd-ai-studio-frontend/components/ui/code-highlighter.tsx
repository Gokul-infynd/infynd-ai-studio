"use client";

import { useMemo } from "react";

type SupportedLanguage = "bash" | "python" | "json";
type TokenType = "plain" | "keyword" | "string" | "comment" | "flag" | "variable" | "number";

interface Token {
  text: string;
  type: TokenType;
}

interface CodeHighlighterProps {
  code: string;
  language: SupportedLanguage;
  showLineNumbers?: boolean;
  className?: string;
}

const keywordSets: Record<SupportedLanguage, Set<string>> = {
  bash: new Set(["curl", "python", "import", "requests", "true", "false"]),
  python: new Set([
    "import",
    "from",
    "as",
    "def",
    "class",
    "if",
    "else",
    "elif",
    "return",
    "for",
    "in",
    "True",
    "False",
    "None",
  ]),
  json: new Set(["true", "false", "null"]),
};

function tokenizeLine(line: string, language: SupportedLanguage): Token[] {
  if (!line) return [{ text: "", type: "plain" }];

  const pattern =
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b\d+(?:\.\d+)?\b|\$[A-Za-z_][A-Za-z0-9_]*|--?[A-Za-z0-9_-]+|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  const tokens: Token[] = [];
  let cursor = 0;

  for (const match of line.matchAll(pattern)) {
    const start = match.index ?? 0;
    const value = match[0];
    if (start > cursor) {
      tokens.push({ text: line.slice(cursor, start), type: "plain" });
    }

    let type: TokenType = "plain";
    if (value.startsWith("#")) type = "comment";
    else if (value.startsWith('"') || value.startsWith("'")) type = "string";
    else if (/^\d/.test(value)) type = "number";
    else if (value.startsWith("--") || (value.startsWith("-") && value.length > 1)) type = "flag";
    else if (value.startsWith("$")) type = "variable";
    else if (keywordSets[language].has(value)) type = "keyword";

    tokens.push({ text: value, type });
    cursor = start + value.length;
  }

  if (cursor < line.length) {
    tokens.push({ text: line.slice(cursor), type: "plain" });
  }

  return tokens;
}

function tokenClass(type: TokenType): string {
  switch (type) {
    case "keyword":
      return "text-sky-300";
    case "string":
      return "text-emerald-300";
    case "comment":
      return "text-zinc-500";
    case "flag":
      return "text-violet-300";
    case "variable":
      return "text-amber-300";
    case "number":
      return "text-rose-300";
    default:
      return "text-zinc-100";
  }
}

export function CodeHighlighter({
  code,
  language,
  showLineNumbers = true,
  className = "",
}: CodeHighlighterProps) {
  const lines = useMemo(() => code.split("\n"), [code]);

  return (
    <pre className={`overflow-x-auto rounded-xl border border-border bg-zinc-950 p-0 text-xs ${className}`}>
      <code className="block py-2">
        {lines.map((line, lineIndex) => (
          <div key={`${lineIndex}-${line}`} className="group flex min-h-6 px-3">
            {showLineNumbers ? (
              <span className="w-10 select-none pr-3 text-right text-[10px] text-zinc-500 group-hover:text-zinc-400">
                {lineIndex + 1}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 font-mono">
              {tokenizeLine(line, language).map((token, tokenIndex) => (
                <span key={`${lineIndex}-${tokenIndex}-${token.text}`} className={tokenClass(token.type)}>
                  {token.text}
                </span>
              ))}
              {line.length === 0 ? "\u200B" : null}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}

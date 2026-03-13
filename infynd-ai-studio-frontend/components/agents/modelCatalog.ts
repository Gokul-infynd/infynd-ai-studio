export interface ModelOption {
  value: string;
  label: string;
}

export interface ModelGroup {
  provider: string;
  color: string;
  models: ModelOption[];
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    provider: "OpenAI",
    color: "#10a37f",
    models: [
      { value: "gpt-4.1", label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "gpt-4o", label: "gpt-4o" },
      { value: "gpt-4o-mini", label: "gpt-4o-mini" },
      { value: "gpt-4-turbo", label: "gpt-4-turbo" },
      { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
      { value: "o3", label: "o3" },
      { value: "o3-mini", label: "o3-mini" },
    ],
  },
  {
    provider: "Google",
    color: "#4285f4",
    models: [
      { value: "gemini/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { value: "gemini/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini/gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
      { value: "gemini/gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
    ],
  },
  {
    provider: "Anthropic",
    color: "#d97757",
    models: [
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
      { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    ],
  },
  {
    provider: "Groq",
    color: "#f55036",
    models: [
      { value: "groq/llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { value: "groq/llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { value: "groq/mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { value: "groq/gemma2-9b-it", label: "Gemma 2 9B" },
    ],
  },
  {
    provider: "Perplexity",
    color: "#26b3a8",
    models: [
      { value: "perplexity/sonar", label: "Sonar" },
      { value: "perplexity/sonar-pro", label: "Sonar Pro" },
      { value: "perplexity/sonar-reasoning", label: "Sonar Reasoning" },
    ],
  },
  {
    provider: "Ollama (Local)",
    color: "#888888",
    models: [
      { value: "ollama/llama3", label: "Llama 3" },
      { value: "ollama/llama3.1", label: "Llama 3.1" },
      { value: "ollama/mistral", label: "Mistral" },
      { value: "ollama/gemma2", label: "Gemma 2" },
      { value: "ollama/qwen2.5", label: "Qwen 2.5" },
    ],
  },
  {
    provider: "Custom (OpenAI Compatible)",
    color: "#9ca3af",
    models: [{ value: "custom/openai", label: "Custom Model" }],
  },
];

const MODEL_ALIAS_MAP: Record<string, string> = {
  gpt4o: "gpt-4o",
  gpt4omini: "gpt-4o-mini",
  gpt41: "gpt-4.1",
  gpt41mini: "gpt-4.1-mini",
  gpt4turbo: "gpt-4-turbo",
  gpt35turbo: "gpt-3.5-turbo",
  o3: "o3",
  o3mini: "o3-mini",
  gemini20flash: "gemini/gemini-2.0-flash",
  gemini25flash: "gemini/gemini-2.5-flash",
  gemini25pro: "gemini/gemini-2.5-pro",
  gemini3flashpreview: "gemini/gemini-3-flash-preview",
  gemini3propreview: "gemini/gemini-3-pro-preview",
  claude3haiku: "claude-3-haiku-20240307",
  claude3sonnet: "claude-3-sonnet-20240229",
  claude3opus: "claude-3-opus-20240229",
  claude35sonnet: "claude-3-5-sonnet-20241022",
  claude37sonnet: "claude-3-7-sonnet-latest",
  sonar: "perplexity/sonar",
  sonarpro: "perplexity/sonar-pro",
  sonarreasoning: "perplexity/sonar-reasoning",
  customopenai: "custom/openai",
};

function canonicalizeModelValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeAgentRuntimeModelValue(value?: string | null): string {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "gpt-4o-mini";

  for (const group of MODEL_GROUPS) {
    const exact = group.models.find((model) => model.value === rawValue);
    if (exact) return exact.value;
  }

  const canonical = canonicalizeModelValue(rawValue);
  if (MODEL_ALIAS_MAP[canonical]) return MODEL_ALIAS_MAP[canonical];

  for (const group of MODEL_GROUPS) {
    for (const model of group.models) {
      const modelCanonical = canonicalizeModelValue(model.value);
      if (modelCanonical === canonical || modelCanonical.endsWith(canonical) || canonical.endsWith(modelCanonical)) {
        return model.value;
      }
    }
  }

  return rawValue;
}

export function findModelGroup(value?: string | null): ModelGroup | undefined {
  const normalizedValue = normalizeAgentRuntimeModelValue(value);
  return MODEL_GROUPS.find((group) => group.models.some((model) => model.value === normalizedValue));
}

export function getModelDisplayName(value?: string | null): string {
  const normalizedValue = normalizeAgentRuntimeModelValue(value);
  for (const group of MODEL_GROUPS) {
    const model = group.models.find((item) => item.value === normalizedValue);
    if (model) return `${group.provider} / ${model.label}`;
  }
  return normalizedValue || "Select model";
}

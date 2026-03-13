import { supabase } from "./supabase";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return trimTrailingSlash(
      process.env.NEXT_PUBLIC_INTERNAL_API_URL ||
      process.env.INTERNAL_API_URL ||
      "http://localhost:8000/api/v1",
    );
  }

  const explicitBrowserBase = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_INTERNAL_API_URL;
  if (explicitBrowserBase) {
    return trimTrailingSlash(explicitBrowserBase);
  }

  const host = window.location.hostname;
  // Avoid Next.js dev proxy resets for long-running endpoints in local environments.
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8000/api/v1";
  }

  return "/api/v1";
}

export function buildApiUrl(endpoint: string): string {
  const base = resolveApiBaseUrl();
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

type ApiFetchOptions = RequestInit & {
  skipAuthRetry?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token || null;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
  if (options.forceRefresh) return refreshAccessToken();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) return null;

  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt > 0 && expiresAt - now < 60) {
    return refreshAccessToken();
  }

  return session.access_token;
}

export async function getAuthenticatedHeaders(
  headers: HeadersInit = {},
  options: { forceRefresh?: boolean } = {},
): Promise<Record<string, string>> {
  const token = await getAccessToken({ forceRefresh: options.forceRefresh });
  const normalizedHeaders = { ...(headers as Record<string, string>) };
  if (token) normalizedHeaders.Authorization = `Bearer ${token}`;
  return normalizedHeaders;
}

async function parseApiResponse(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(responseText);
  }

  return responseText;
}

async function readApiError(response: Response): Promise<{ message: string; detail?: unknown }> {
  const errorText = await response.text();
  let errorData: Record<string, unknown> = {};
  try {
    errorData = errorText ? JSON.parse(errorText) : {};
  } catch {
    errorData = {};
  }
  let errorMessage = "API request failed";
  if (errorData.detail) {
    errorMessage =
      typeof errorData.detail === "string"
        ? errorData.detail
        : JSON.stringify(errorData.detail, null, 2);
  } else if (errorText) {
    errorMessage = errorText;
  }
  return { message: errorMessage, detail: errorData.detail };
}

export const apiFetch = async (endpoint: string, options: ApiFetchOptions = {}) => {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  // Only set application/json if we are not sending FormData
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response = await fetch(buildApiUrl(endpoint), {
    ...options,
    headers,
  });

  if (response.status === 401 && !options.skipAuthRetry) {
    const refreshedToken = await getAccessToken({ forceRefresh: true });
    if (refreshedToken) {
      const retryHeaders: Record<string, string> = {
        ...headers,
        Authorization: `Bearer ${refreshedToken}`,
      };
      response = await fetch(buildApiUrl(endpoint), {
        ...options,
        headers: retryHeaders,
      });
    }
  }

  if (!response.ok) {
    const { message } = await readApiError(response);
    if (response.status === 401 && typeof window !== "undefined") {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signOut();
        const nextUrl = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?next=${encodeURIComponent(nextUrl)}`;
      }
    }
    throw new Error(message);
  }

  return parseApiResponse(response);
};

import type { ApiTool, WebSearchConfig } from "./types";
import { isPublicHttpUrl } from "./extract";

/** Tool names must be simple identifiers for every model provider. */
export function safeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/** Build the OpenRouter `tools` array for a client: its live API tools + optional web search. */
export function buildToolDefs(apiTools: ApiTool[], web: WebSearchConfig | undefined): unknown[] {
  const defs: unknown[] = apiTools.map((t) => ({
    type: "function",
    function: {
      name: safeToolName(t.name),
      description: t.description,
      parameters: t.parameters ?? { type: "object", properties: {} },
    },
  }));
  if (web?.enabled) {
    const parameters: Record<string, unknown> = { max_results: web.max_results ?? 5, max_uses: 2 };
    if (web.allowed_domains?.length) parameters.allowed_domains = web.allowed_domains;
    else if (web.excluded_domains?.length) parameters.excluded_domains = web.excluded_domains;
    defs.push({ type: "openrouter:web_search", parameters });
  }
  return defs;
}

/**
 * Replace {{env.TOOL_NAME}} with a server env var so API secrets never need to be stored in the database.
 * Only variables prefixed TOOL_ are readable, so a tool config can never leak the app's own keys.
 */
export function resolveSecrets(value: string, envVars: Record<string, string | undefined> = process.env): string {
  return value.replace(/\{\{\s*env\.([A-Z0-9_]+)\s*\}\}/g, (_, k: string) => (k.startsWith("TOOL_") ? envVars[k] ?? "" : ""));
}

/** Build the HTTP request for a tool call: {param} placeholders fill the URL, the rest go to query/body. */
export function buildRequest(tool: ApiTool, args: Record<string, unknown>, envVars?: Record<string, string | undefined>) {
  const remaining: Record<string, unknown> = { ...args };
  let url = resolveSecrets(tool.url, envVars).replace(/\{(\w+)\}/g, (_, k) => {
    const v = remaining[k];
    delete remaining[k];
    return encodeURIComponent(v === undefined ? "" : String(v));
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  for (const [k, v] of Object.entries(tool.headers ?? {})) headers[k] = resolveSecrets(v, envVars);
  let body: string | undefined;
  if (tool.method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(remaining);
  } else {
    const u = new URL(url);
    for (const [k, v] of Object.entries(remaining)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    url = u.href;
  }
  return { url, method: tool.method, headers, body };
}

export async function runApiTool(tool: ApiTool, rawArgs: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({ error: "Invalid arguments JSON" });
  }
  const req = buildRequest(tool, args);
  if (!isPublicHttpUrl(req.url)) return JSON.stringify({ error: "Tool URL is not allowed" });
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    return JSON.stringify({ status: res.status, body: text.slice(0, 6000) });
  } catch (e) {
    return JSON.stringify({ error: `Request failed: ${String(e).slice(0, 200)}` });
  }
}

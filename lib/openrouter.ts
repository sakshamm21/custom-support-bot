import { env } from "./env";

const BASE = "https://openrouter.ai/api/v1";

function headers() {
  return {
    Authorization: `Bearer ${env.openrouterKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer": env.appUrl() || "https://support-bot.local",
    "X-Title": "Support Bot",
  };
}

async function post<T>(path: string, body: unknown, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (res.ok) return (await res.json()) as T;
    const text = await res.text();
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    throw new Error(`OpenRouter ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

export async function embed(inputs: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += 64) {
    const batch = inputs.slice(i, i + 64).map((s) => s.slice(0, 8000));
    const res = await post<{ data: { embedding: number[]; index: number }[] }>("/embeddings", {
      model: env.embedModel(),
      input: batch,
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    out.push(...sorted.map((d) => d.embedding));
  }
  return out;
}

export type ORMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ORToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ORToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ORAnnotation = { type: string; url_citation?: { url: string; title?: string } };

export type ORResponse = {
  choices: {
    message: { content: string | null; tool_calls?: ORToolCall[]; annotations?: ORAnnotation[] };
    finish_reason: string;
  }[];
  usage?: unknown;
};

export function chat(body: {
  model: string;
  messages: ORMessage[];
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}): Promise<ORResponse> {
  return post<ORResponse>("/chat/completions", body);
}

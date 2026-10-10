/** Return CORS headers if the request origin is allowed for this client (empty list = any origin). */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = !allowed.length || (origin && allowed.some((a) => matchOrigin(origin, a)));
  if (!ok) return {};
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function matchOrigin(origin: string, pattern: string): boolean {
  const o = origin.replace(/\/$/, "").toLowerCase();
  const p = pattern.replace(/\/$/, "").toLowerCase();
  if (p === o) return true;
  if (p.startsWith("*.")) {
    try {
      return new URL(o).hostname.endsWith(p.slice(1));
    } catch {
      return false;
    }
  }
  try {
    return new URL(o).hostname === p || new URL(o).hostname === new URL(p).hostname;
  } catch {
    return false;
  }
}

const hits = new Map<string, number[]>();
/** Best-effort per-instance rate limit: `limit` requests per `windowMs` per key. */
export function rateLimited(key: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

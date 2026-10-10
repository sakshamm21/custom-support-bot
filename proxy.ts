import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

// Only let a client's chat iframe be embedded on that client's allowed websites.
const cache = new Map<string, { at: number; origins: string[] }>();

async function originsFor(slug: string): Promise<string[]> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 60000) return hit.origins;
  const { data } = await db().from("clients").select("allowed_origins").eq("slug", slug).maybeSingle();
  const origins = (data?.allowed_origins as string[]) ?? [];
  cache.set(slug, { at: Date.now(), origins });
  return origins;
}

function toSource(o: string): string {
  if (o.startsWith("*.")) return `https://${o} http://${o}`;
  return /^https?:\/\//.test(o) ? o.replace(/\/$/, "") : `https://${o} http://${o}`;
}

export async function proxy(req: NextRequest) {
  const slug = req.nextUrl.pathname.split("/")[2];
  const res = NextResponse.next();
  if (!slug) return res;
  try {
    const origins = await originsFor(slug);
    const ancestors = origins.length ? `'self' ${origins.map(toSource).join(" ")}` : "*";
    res.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors}`);
  } catch {}
  return res;
}

export const config = { matcher: "/embed/:slug*" };

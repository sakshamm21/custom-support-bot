import { db } from "./db";
import { embed } from "./openrouter";
import { chunkText, rowsToChunks } from "./chunk";
import { htmlToText, isPublicHttpUrl, parseCsv, pdfToText } from "./extract";

type Kind = "text" | "pdf" | "csv" | "url" | "file";

/** Store a source and its chunks (with embeddings). Returns the source id. */
export async function storeSource(
  clientId: string,
  kind: Kind,
  name: string,
  origin: string | null,
  chunks: { content: string; meta?: Record<string, unknown> }[]
): Promise<{ id: string; chunks: number }> {
  const { data: src, error } = await db()
    .from("sources")
    .insert({ client_id: clientId, kind, name, origin, status: "processing" })
    .select("id")
    .single();
  if (error) throw error;
  try {
    const clean = chunks.filter((c) => c.content.trim().length > 20);
    const vectors = await embed(clean.map((c) => c.content));
    const rows = clean.map((c, i) => ({
      client_id: clientId,
      source_id: src.id,
      content: c.content,
      meta: { source: name, ...(origin ? { url: origin } : {}), ...c.meta },
      embedding: vectors[i],
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error: e } = await db().from("chunks").insert(rows.slice(i, i + 200));
      if (e) throw e;
    }
    await db().from("sources").update({ status: "ready", chunk_count: rows.length }).eq("id", src.id);
    return { id: src.id, chunks: rows.length };
  } catch (e) {
    await db().from("sources").update({ status: "error", error: String(e).slice(0, 500) }).eq("id", src.id);
    throw e;
  }
}

/** Turn an uploaded file into chunks based on its type. */
export async function fileToChunks(file: File): Promise<{ kind: Kind; chunks: { content: string; meta?: Record<string, unknown> }[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const text = await pdfToText(await file.arrayBuffer());
    return { kind: "pdf", chunks: chunkText(text).map((content) => ({ content })) };
  }
  if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    const rows = parseCsv(await file.text());
    return { kind: "csv", chunks: rowsToChunks(rows, file.name).map((content) => ({ content })) };
  }
  if (name.endsWith(".json")) {
    const data = JSON.parse(await file.text());
    if (Array.isArray(data) && data.every((r) => r && typeof r === "object")) {
      return { kind: "file", chunks: rowsToChunks(data, file.name).map((content) => ({ content })) };
    }
    return { kind: "file", chunks: chunkText(JSON.stringify(data, null, 2)).map((content) => ({ content })) };
  }
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const { text } = htmlToText(await file.text());
    return { kind: "file", chunks: chunkText(text).map((content) => ({ content })) };
  }
  // .txt, .md and anything text-like
  return { kind: "file", chunks: chunkText(await file.text()).map((content) => ({ content })) };
}

async function fetchText(url: string): Promise<{ html: string; type: string } | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SupportBotCrawler/1.0", Accept: "text/html,application/xhtml+xml,text/plain" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "";
  if (!/text\/|html|xml/.test(type)) return null;
  return { html: await res.text(), type };
}

/**
 * Crawl a website: start URL plus same-site links (and sitemap.xml if present), up to maxPages.
 * pathPrefix limits crawling to e.g. /help/ so you can ingest just a help centre.
 */
export async function crawlSite(startUrl: string, maxPages = 25, pathPrefix?: string) {
  if (!isPublicHttpUrl(startUrl)) throw new Error("Only public http(s) URLs can be crawled");
  const start = new URL(startUrl);
  const prefix = pathPrefix ?? "";
  const queue: string[] = [start.href];
  const seen = new Set<string>();
  const pages: { url: string; title: string; text: string }[] = [];

  // Seed from sitemap when available — finds pages that aren't linked from the homepage.
  if (maxPages > 1) {
    try {
      const sm = await fetchText(`${start.origin}/sitemap.xml`);
      const locs = sm ? [...sm.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]) : [];
      for (const l of locs.slice(0, 500)) if (!l.endsWith(".xml")) queue.push(l);
    } catch {}
  }

  while (queue.length && pages.length < maxPages) {
    const url = canonical(queue.shift()!);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const u = new URL(url);
    if (u.host !== start.host || (prefix && !u.pathname.startsWith(prefix))) continue;
    if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|woff2?)$/i.test(u.pathname)) continue;
    try {
      const page = await fetchText(url);
      if (!page) continue;
      const { title, text, links } = htmlToText(page.html);
      if (text.length > 100) pages.push({ url, title: title || url, text });
      if (maxPages > 1) {
        for (const href of links) {
          try {
            const next = new URL(href, url);
            if (next.host === start.host) queue.push(next.href);
          } catch {}
        }
      }
    } catch {}
  }
  return pages;
}

function canonical(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^fbclid$|^gclid$/.test(k)) u.searchParams.delete(k);
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Ingest every crawled page as its own source so each answer can cite the exact page. */
export async function ingestSite(clientId: string, url: string, maxPages: number, pathPrefix?: string) {
  const pages = await crawlSite(url, maxPages, pathPrefix);
  let total = 0;
  for (const p of pages) {
    const chunks = chunkText(`# ${p.title}\n\n${p.text}`).map((content) => ({ content, meta: { title: p.title } }));
    const r = await storeSource(clientId, "url", p.title, p.url, chunks);
    total += r.chunks;
  }
  return { pages: pages.length, chunks: total };
}

import { db } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/auth";
import { chunkText } from "@/lib/chunk";
import { fileToChunks, ingestSite, storeSource } from "@/lib/ingest";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { data } = await db().from("sources").select("*").eq("client_id", id).order("created_at", { ascending: false });
  return Response.json(data ?? []);
}

/**
 * Add knowledge. multipart/form-data with any of:
 *  - files: one or more files (pdf, csv, tsv, json, md, txt, html)
 *  - text + name: pasted text (FAQs, policies)
 *  - url (+ max_pages, path_prefix): crawl a website
 */
export async function POST(req: Request, ctx: Ctx) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const form = await req.formData();
  const report: string[] = [];
  try {
    for (const f of form.getAll("files")) {
      if (!(f instanceof File) || !f.size) continue;
      if (f.size > 15 * 1024 * 1024) {
        report.push(`${f.name}: skipped (over 15 MB)`);
        continue;
      }
      const { kind, chunks } = await fileToChunks(f);
      const r = await storeSource(id, kind, f.name, f.name, chunks);
      report.push(`${f.name}: ${r.chunks} chunks`);
    }
    const text = String(form.get("text") ?? "").trim();
    if (text) {
      const name = String(form.get("name") ?? "").trim() || "Pasted text";
      const r = await storeSource(id, "text", name, null, chunkText(text).map((content) => ({ content })));
      report.push(`${name}: ${r.chunks} chunks`);
    }
    const url = String(form.get("url") ?? "").trim();
    if (url) {
      const maxPages = Math.min(200, Math.max(1, Number(form.get("max_pages") ?? 25) || 25));
      const prefix = String(form.get("path_prefix") ?? "").trim() || undefined;
      const r = await ingestSite(id, url, maxPages, prefix);
      report.push(`${url}: ${r.pages} pages, ${r.chunks} chunks`);
    }
  } catch (e) {
    report.push(`Error: ${String(e).slice(0, 300)}`);
    return Response.json({ report }, { status: 500 });
  }
  return Response.json({ report });
}

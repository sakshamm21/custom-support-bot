import { db } from "./db";
import { chunkText } from "./chunk";
import { ingestSite, storeSource } from "./ingest";
import type { ClientInput } from "./schema";

export async function ingestKnowledge(clientId: string, k: ClientInput["knowledge"]) {
  const report: string[] = [];
  for (const t of k?.texts ?? []) {
    const r = await storeSource(clientId, "text", t.name, null, chunkText(t.content).map((content) => ({ content })));
    report.push(`${t.name}: ${r.chunks} chunks`);
  }
  for (const u of k?.urls ?? []) {
    try {
      const r = await ingestSite(clientId, u.url, u.max_pages, u.path_prefix);
      report.push(`${u.url}: ${r.pages} pages, ${r.chunks} chunks`);
    } catch (e) {
      report.push(`${u.url}: failed (${String(e).slice(0, 120)})`);
    }
  }
  return report;
}

/** Export a client as portable JSON (no knowledge content; re-add files on import). */
export async function exportClient(id: string) {
  const { data } = await db()
    .from("clients")
    .select("slug,name,context,model,temperature,web_search,tools,widget,allowed_origins,handoff_message,active")
    .eq("id", id)
    .single();
  const { data: urls } = await db().from("sources").select("origin").eq("client_id", id).eq("kind", "url");
  const origins = [...new Set((urls ?? []).map((u) => u.origin as string))];
  return { ...data, knowledge: { urls: origins.map((url) => ({ url, max_pages: 1 })), texts: [] } };
}

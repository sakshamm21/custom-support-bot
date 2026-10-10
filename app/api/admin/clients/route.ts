import { db } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/auth";
import { clientInput } from "@/lib/schema";
import { ingestKnowledge } from "@/lib/admin-clients";

export const maxDuration = 300;

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const { data, error } = await db().from("clients").select("id,slug,name,model,active,created_at").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** Create a client from a form or from an imported JSON config (optionally with knowledge to ingest). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = clientInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const { knowledge, ...fields } = parsed.data;
  const { data, error } = await db().from("clients").insert(fields).select("id").single();
  if (error) return Response.json({ error: error.code === "23505" ? "That slug is already taken" : error.message }, { status: 400 });
  const report = knowledge ? await ingestKnowledge(data.id, knowledge) : [];
  return Response.json({ id: data.id, report });
}

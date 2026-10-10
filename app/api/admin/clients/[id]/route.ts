import { db } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/auth";
import { clientInput } from "@/lib/schema";
import { exportClient } from "@/lib/admin-clients";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  if (new URL(req.url).searchParams.get("export")) {
    const json = await exportClient(id);
    return new Response(JSON.stringify(json, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${json.slug}.json"` },
    });
  }
  const { data, error } = await db().from("clients").select("*").eq("id", id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(req: Request, ctx: Ctx) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const parsed = clientInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const { knowledge: _k, ...fields } = parsed.data;
  const { error } = await db().from("clients").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return Response.json({ error: error.code === "23505" ? "That slug is already taken" : error.message }, { status: 400 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { error } = await db().from("clients").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

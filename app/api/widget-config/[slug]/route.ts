import { getClient } from "@/lib/engine";

/** Public, non-secret settings the widget needs to render. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const client = await getClient((await ctx.params).slug);
  if (!client || !client.active) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(
    { name: client.name, widget: client.widget },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } }
  );
}

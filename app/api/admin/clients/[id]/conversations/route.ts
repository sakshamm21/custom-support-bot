import { db } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/auth";

/** Recent conversations with their messages, newest first. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { data } = await db()
    .from("conversations")
    .select("id,created_at,messages(role,content,created_at)")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return Response.json(data ?? []);
}

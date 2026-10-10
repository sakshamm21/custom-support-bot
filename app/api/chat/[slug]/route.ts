import { z } from "zod";
import { db } from "@/lib/db";
import { answer, getClient } from "@/lib/engine";
import { corsHeaders, rateLimited } from "@/lib/cors";

export const maxDuration = 60;

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(40),
  conversationId: z.string().uuid().optional(),
  visitorId: z.string().max(80).optional(),
});

export async function OPTIONS(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const client = await getClient((await ctx.params).slug);
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin"), client?.allowed_origins ?? []) });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const client = await getClient(slug);
  const origin = req.headers.get("origin");
  if (!client || !client.active) return Response.json({ error: "Bot not found" }, { status: 404 });
  const cors = corsHeaders(origin, client.allowed_origins);
  // Same-origin requests (our own /embed page) have origin == our host; allow them too.
  const sameOrigin = origin && new URL(req.url).origin === origin;
  if (client.allowed_origins.length && !sameOrigin && !cors["Access-Control-Allow-Origin"]) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(`${slug}:${ip}`)) return Response.json({ error: "Too many messages, please wait a moment." }, { status: 429, headers: cors });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers: cors });
  const { messages, visitorId } = parsed.data;
  if (messages[messages.length - 1].role !== "user") return Response.json({ error: "Last message must be from the user" }, { status: 400, headers: cors });

  let conversationId = parsed.data.conversationId;
  try {
    if (!conversationId) {
      const { data } = await db().from("conversations").insert({ client_id: client.id, visitor_id: visitorId ?? null }).select("id").single();
      conversationId = data?.id;
    }
    const result = await answer(client, messages);
    if (conversationId) {
      await db().from("messages").insert([
        { conversation_id: conversationId, role: "user", content: messages[messages.length - 1].content },
        { conversation_id: conversationId, role: "assistant", content: result.reply, meta: { sources: result.sources, tools: result.usedTools } },
      ]);
    }
    return Response.json({ reply: result.reply, sources: result.sources, conversationId }, { headers: cors });
  } catch (e) {
    console.error("chat error", e);
    return Response.json({ reply: client.handoff_message, sources: [], conversationId, error: "temporary_failure" }, { status: 200, headers: cors });
  }
}

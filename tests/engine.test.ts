import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.OPENROUTER_API_KEY = "test";
const rpcCalls: unknown[] = [];
mock.module("../lib/db.ts", {
  namedExports: {
    db: () => ({
      rpc: async (_name: string, args: unknown) => {
        rpcCalls.push(args);
        return { data: [{ id: 1, content: "Refunds take 7 days.", meta: { title: "Refund FAQ", url: "https://acme.com/refunds" }, score: 1 }], error: null };
      },
    }),
  },
});


test("answer runs retrieval, calls a live API tool, and returns cited reply", async () => {
  const bodies: any[] = [];
  let chatCalls = 0;
  mock.method(globalThis, "fetch", async (url: string, init: any) => {
    if (url.endsWith("/embeddings")) return Response.json({ data: [{ index: 0, embedding: [0.1, 0.2] }] });
    if (url.endsWith("/chat/completions")) {
      bodies.push(JSON.parse(init.body));
      chatCalls++;
      if (chatCalls === 1)
        return Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_order", arguments: '{"order_id":"55"}' } }] } }] });
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Order 55 has shipped.", annotations: [{ type: "url_citation", url_citation: { url: "https://carrier.com/x", title: "Carrier" } }] } }] });
    }
    if (url === "https://api.acme.com/orders/55") return new Response('{"status":"shipped"}');
    throw new Error("unexpected fetch " + url);
  });

  const client: any = {
    id: "c", slug: "acme", name: "Acme", context: "Be nice.", model: "openai/gpt-4.1-mini", temperature: 0.2,
    web_search: { enabled: true, allowed_domains: ["acme.com"] },
    tools: [{ name: "get_order", description: "order lookup", method: "GET", url: "https://api.acme.com/orders/{order_id}", parameters: { type: "object", properties: {} } }],
    widget: {}, allowed_origins: [], handoff_message: "Contact us.", active: true,
  };
  const { answer } = await import("../lib/engine.ts");
  const res = await answer(client, [{ role: "user", content: "Where is order 55?" }]);

  assert.equal(res.reply, "Order 55 has shipped.");
  assert.deepEqual(res.usedTools, ["get_order"]);
  assert.deepEqual(res.sources.map((s) => s.url), ["https://acme.com/refunds", "https://carrier.com/x"]);
  // First request carried the knowledge + both tools; second carried the tool result.
  assert.match(bodies[0].messages[0].content, /Refunds take 7 days/);
  assert.equal(bodies[0].tools.length, 2);
  assert.equal(bodies[0].tools[1].type, "openrouter:web_search");
  const toolMsg = bodies[1].messages.find((m: any) => m.role === "tool");
  assert.match(toolMsg.content, /shipped/);
  assert.equal((rpcCalls[0] as any).p_query_text, "Where is order 55?");
});

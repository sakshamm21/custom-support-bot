import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, rowsToChunks } from "../lib/chunk.ts";
import { buildRequest, buildToolDefs, resolveSecrets } from "../lib/tools.ts";
import { matchOrigin, corsHeaders } from "../lib/cors.ts";
import { htmlToText, isPublicHttpUrl } from "../lib/extract.ts";

test("short text is one chunk", () => {
  assert.deepEqual(chunkText("Hello world"), ["Hello world"]);
});

test("long text splits under max size and keeps all content", () => {
  const paras = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ` + "word ".repeat(40));
  const chunks = chunkText(paras.join("\n\n"), 800, 100);
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.length <= 950, `chunk too long: ${c.length}`);
  for (let i = 0; i < 40; i++) assert.ok(chunks.some((c) => c.includes(`Paragraph ${i}.`)), `missing paragraph ${i}`);
});

test("headings are carried into later chunks", () => {
  const text = "# Refunds\n\n" + Array.from({ length: 10 }, () => "Refund details here. ".repeat(10)).join("\n\n");
  const chunks = chunkText(text, 500, 50);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.slice(1).every((c) => c.includes("Refunds")));
});

test("a single giant paragraph is still split", () => {
  const chunks = chunkText("x".repeat(5000), 1000, 100);
  assert.ok(chunks.length >= 5);
});

test("CSV rows become labelled records", () => {
  const chunks = rowsToChunks([{ SKU: "A1", Price: "10", Empty: "" }, { SKU: "B2", Price: "20" }], "products.csv", 1);
  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /\[products\.csv\]\n- SKU: A1; Price: 10$/);
});

test("tool request fills path params, rest into query", () => {
  const r = buildRequest(
    { name: "t", description: "", method: "GET", url: "https://api.x.com/orders/{id}", headers: { Authorization: "Bearer {{env.TOOL_KEY}}" }, parameters: { type: "object", properties: {} } },
    { id: "A 1", email: "a@b.c" },
    { TOOL_KEY: "secret" }
  );
  assert.equal(r.url, "https://api.x.com/orders/A%201?email=a%40b.c");
  assert.equal(r.headers.Authorization, "Bearer secret");
});

test("POST tools send remaining args as JSON", () => {
  const r = buildRequest({ name: "t", description: "", method: "POST", url: "https://api.x.com/book", parameters: { type: "object", properties: {} } }, { date: "2026-01-01" });
  assert.equal(r.body, '{"date":"2026-01-01"}');
});

test("only TOOL_ env vars can be read by tools", () => {
  assert.equal(resolveSecrets("{{env.SUPABASE_SERVICE_ROLE_KEY}}", { SUPABASE_SERVICE_ROLE_KEY: "x" }), "");
  assert.equal(resolveSecrets("{{ env.TOOL_A }}", { TOOL_A: "y" }), "y");
});

test("web search tool added only when enabled, allow-list wins", () => {
  assert.equal(buildToolDefs([], { enabled: false }).length, 0);
  const defs = buildToolDefs([], { enabled: true, allowed_domains: ["a.com"], excluded_domains: ["b.com"] }) as any[];
  assert.equal(defs[0].type, "openrouter:web_search");
  assert.deepEqual(defs[0].parameters.allowed_domains, ["a.com"]);
  assert.equal(defs[0].parameters.excluded_domains, undefined);
});

test("origin matching", () => {
  assert.ok(matchOrigin("https://acme.com", "acme.com"));
  assert.ok(matchOrigin("https://shop.acme.com", "*.acme.com"));
  assert.ok(matchOrigin("https://acme.com", "https://acme.com/"));
  assert.ok(!matchOrigin("https://evil.com", "acme.com"));
  assert.ok(!matchOrigin("https://acme.com.evil.com", "acme.com"));
  assert.deepEqual(corsHeaders("https://evil.com", ["acme.com"]), {});
  assert.equal(corsHeaders("https://x.com", [])["Access-Control-Allow-Origin"], "https://x.com");
});

test("html extraction keeps headings and drops nav/scripts", () => {
  const { title, text, links } = htmlToText(
    `<html><head><title>Help</title><script>evil()</script></head><body><nav>Menu Home</nav><main><h2>Shipping</h2><p>We ship in <b>2 days</b>.</p><ul><li>India</li><li>USA</li></ul><a href="/returns">Returns</a></main></body></html>`
  );
  assert.equal(title, "Help");
  assert.match(text, /## Shipping/);
  assert.match(text, /We ship in 2 days\./);
  assert.match(text, /- India/);
  assert.ok(!text.includes("evil") && !text.includes("Menu"));
  assert.deepEqual(links, ["/returns"]);
});

test("private URLs are blocked", () => {
  assert.ok(isPublicHttpUrl("https://acme.com/help"));
  for (const u of ["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254", "file:///etc/passwd", "http://[::1]/"])
    assert.ok(!isPublicHttpUrl(u), u);
});

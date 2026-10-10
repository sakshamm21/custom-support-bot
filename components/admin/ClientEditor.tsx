"use client";
import { useCallback, useEffect, useState } from "react";

type Tool = { name: string; description: string; method: "GET" | "POST"; url: string; headers?: Record<string, string>; parameters: unknown };
type Client = {
  id: string; slug: string; name: string; context: string; model: string; temperature: number;
  web_search: { enabled: boolean; allowed_domains: string[]; excluded_domains: string[]; max_results: number };
  tools: Tool[];
  widget: { title: string; greeting: string; color: string; position: "left" | "right"; suggestions: string[] };
  allowed_origins: string[]; handoff_message: string; active: boolean;
};
type Source = { id: string; kind: string; name: string; origin: string | null; status: string; error: string | null; chunk_count: number; created_at: string };
type Conversation = { id: string; created_at: string; messages: { role: string; content: string; created_at: string }[] };

const TABS = ["Setup", "Knowledge", "Live APIs", "Web search", "Widget & install", "Test", "Conversations"] as const;
type Tab = (typeof TABS)[number];

const MODELS = [
  // Suggestions only — any model id from openrouter.ai/models works.
  "openai/gpt-6-luna",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
];

const TOOL_EXAMPLE: Tool[] = [
  {
    name: "get_order_status",
    description: "Look up the status, items and tracking link of a customer's order by order number.",
    method: "GET",
    url: "https://api.example-store.com/orders/{order_id}",
    headers: { Authorization: "Bearer {{env.TOOL_EXAMPLE_STORE_KEY}}" },
    parameters: {
      type: "object",
      properties: { order_id: { type: "string", description: "The order number, e.g. 10452" } },
      required: ["order_id"],
    },
  },
];

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function ClientEditor({ id }: { id: string }) {
  const [c, setC] = useState<Client | null>(null);
  const [tab, setTab] = useState<Tab>("Setup");
  const [saved, setSaved] = useState("");
  const [toolsText, setToolsText] = useState("[]");

  useEffect(() => {
    fetch(`/api/admin/clients/${id}`).then((r) => r.json()).then((d: Client) => {
      setC(d);
      setToolsText(JSON.stringify(d.tools ?? [], null, 2));
    });
  }, [id]);

  const update = (patch: Partial<Client>) => setC((prev) => (prev ? { ...prev, ...patch } : prev));

  async function save() {
    if (!c) return;
    let tools: Tool[];
    try {
      tools = JSON.parse(toolsText || "[]");
    } catch {
      setSaved("Live APIs JSON is invalid — fix it before saving.");
      return;
    }
    const { id: _id, ...rest } = c;
    const r = await fetch(`/api/admin/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...strip(rest), tools }),
    });
    const d = await r.json();
    setSaved(r.ok ? "Saved ✓" : d.error || "Save failed");
    if (r.ok) setTimeout(() => setSaved(""), 2500);
  }

  if (!c) return <main className="admin"><p className="muted">Loading…</p></main>;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/widget.js" data-bot="${c.slug}" async></script>`;

  return (
    <main className="admin">
      <header className="topbar">
        <div>
          <a href="/admin" className="muted small">← All clients</a>
          <h1>{c.name}</h1>
        </div>
        <div className="row">
          {saved && <span className={saved.includes("✓") ? "ok" : "error"}>{saved}</span>}
          <a className="ghost button" href={`/api/admin/clients/${id}?export=1`}>Export JSON</a>
          <button className="primary" onClick={save}>Save changes</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      {tab === "Setup" && (
        <section className="card">
          <div className="grid2">
            <label>Company name<input value={c.name} onChange={(e) => update({ name: e.target.value })} /></label>
            <label>Slug<input value={c.slug} onChange={(e) => update({ slug: e.target.value })} /></label>
          </div>
          <label>Context & instructions
            <span className="muted small">Who the company is, tone of voice, policies, what to never say, when to escalate. This is always given to the bot.</span>
            <textarea rows={14} value={c.context} onChange={(e) => update({ context: e.target.value })} />
          </label>
          <div className="grid2">
            <label>Model (any OpenRouter model id)
              <input list="models" value={c.model} onChange={(e) => update({ model: e.target.value })} />
              <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
            <label>Creativity (temperature): {c.temperature}
              <input type="range" min={0} max={1} step={0.1} value={c.temperature} onChange={(e) => update({ temperature: Number(e.target.value) })} />
              <span className="muted small">Some models (e.g. GPT-6 Luna) ignore this setting.</span>
            </label>
          </div>
          <label>Fallback / hand-off message<input value={c.handoff_message} onChange={(e) => update({ handoff_message: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={c.active} onChange={(e) => update({ active: e.target.checked })} /> Bot is live</label>
          <DangerZone id={id} />
        </section>
      )}

      {tab === "Knowledge" && <Knowledge id={id} />}

      {tab === "Live APIs" && (
        <section className="card">
          <p>Let the bot call your client's APIs for live data (order status, bookings, stock). Each tool is a JSON object; the model decides when to call it.</p>
          <ul className="muted small">
            <li><code>{"{param}"}</code> in the URL is filled from the arguments; other arguments go in the query string (GET) or JSON body (POST).</li>
            <li>Keep secrets out of here: write <code>{"{{env.TOOL_SOMETHING}}"}</code> and add <code>TOOL_SOMETHING</code> as an environment variable in Vercel. Only variables starting with <code>TOOL_</code> can be used.</li>
          </ul>
          <textarea className="mono" rows={20} value={toolsText} onChange={(e) => setToolsText(e.target.value)} />
          <div className="row">
            <button className="ghost" onClick={() => setToolsText(JSON.stringify(TOOL_EXAMPLE, null, 2))}>Insert example</button>
            <span className="muted small">Remember to Save.</span>
          </div>
        </section>
      )}

      {tab === "Web search" && (
        <section className="card">
          <label className="check"><input type="checkbox" checked={c.web_search.enabled} onChange={(e) => update({ web_search: { ...c.web_search, enabled: e.target.checked } })} /> Let the bot look things up online when its own knowledge doesn't cover a question</label>
          <p className="muted small">The model decides when to search (at most twice per message). Results are cited in the reply. Costs a little extra per search on OpenRouter.</p>
          <label>Only search these sites (one per line, optional — e.g. the client's site, official docs)
            <textarea rows={5} value={c.web_search.allowed_domains.join("\n")} onChange={(e) => update({ web_search: { ...c.web_search, allowed_domains: lines(e.target.value) } })} placeholder={"acme.com\ndocs.stripe.com"} />
          </label>
          <label>Never use these sites (one per line, used only when the list above is empty)
            <textarea rows={4} value={c.web_search.excluded_domains.join("\n")} onChange={(e) => update({ web_search: { ...c.web_search, excluded_domains: lines(e.target.value) } })} placeholder={"competitor.com\nreddit.com"} />
          </label>
          <label>Results per search
            <input type="number" min={1} max={10} value={c.web_search.max_results} onChange={(e) => update({ web_search: { ...c.web_search, max_results: Number(e.target.value) } })} />
          </label>
        </section>
      )}

      {tab === "Widget & install" && (
        <section className="card">
          <h2>Install</h2>
          <p>Paste this just before <code>&lt;/body&gt;</code> on the client&apos;s website:</p>
          <pre className="snippet">{snippet}</pre>
          <button className="ghost" onClick={() => navigator.clipboard.writeText(snippet)}>Copy</button>
          <p className="muted small">Or share a full-page chat link: <a href={`/embed/${c.slug}?standalone=1`} target="_blank">{origin}/embed/{c.slug}?standalone=1</a></p>

          <h2>Appearance</h2>
          <div className="grid2">
            <label>Title<input value={c.widget.title} onChange={(e) => update({ widget: { ...c.widget, title: e.target.value } })} /></label>
            <label>Brand colour<input type="color" value={c.widget.color} onChange={(e) => update({ widget: { ...c.widget, color: e.target.value } })} /></label>
          </div>
          <label>Greeting<input value={c.widget.greeting} onChange={(e) => update({ widget: { ...c.widget, greeting: e.target.value } })} /></label>
          <label>Suggested questions (one per line, up to 6)
            <textarea rows={4} value={c.widget.suggestions.join("\n")} onChange={(e) => update({ widget: { ...c.widget, suggestions: lines(e.target.value).slice(0, 6) } })} />
          </label>
          <label>Position
            <select value={c.widget.position} onChange={(e) => update({ widget: { ...c.widget, position: e.target.value as "left" | "right" } })}>
              <option value="right">Bottom right</option><option value="left">Bottom left</option>
            </select>
          </label>
          <label>Allowed websites (one per line, e.g. <code>acme.com</code> or <code>*.acme.com</code>). Leave empty to allow any site.
            <textarea rows={3} value={c.allowed_origins.join("\n")} onChange={(e) => update({ allowed_origins: lines(e.target.value) })} />
          </label>
        </section>
      )}

      {tab === "Test" && (
        <section className="card">
          <p className="muted small">This is the live bot. Save changes first, then start a new conversation (↻) to test them.</p>
          <div className="preview"><iframe key={c.slug} src={`/embed/${c.slug}?standalone=1`} title="Bot preview" /></div>
        </section>
      )}

      {tab === "Conversations" && <Conversations id={id} />}
    </main>
  );
}

function strip(c: Omit<Client, "id">) {
  const { slug, name, context, model, temperature, web_search, widget, allowed_origins, handoff_message, active } = c;
  return { slug, name, context, model, temperature, web_search, widget, allowed_origins, handoff_message, active };
}

function Knowledge({ id }: { id: string }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const load = useCallback(() => fetch(`/api/admin/clients/${id}/sources`).then((r) => r.json()).then(setSources), [id]);
  useEffect(() => { load(); }, [load]);

  async function submit(form: FormData) {
    setBusy(true);
    setReport(["Working… large sites and PDFs can take a minute."]);
    const r = await fetch(`/api/admin/clients/${id}/sources`, { method: "POST", body: form });
    const d = await r.json().catch(() => ({ report: ["Request failed or timed out"] }));
    setReport(d.report ?? []);
    setBusy(false);
    load();
  }

  const total = sources?.reduce((n, s) => n + s.chunk_count, 0) ?? 0;

  return (
    <>
      <div className="grid3">
        <form className="card" onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
          <h3>Upload files</h3>
          <p className="muted small">PDF, CSV/TSV (product lists, price sheets), JSON, Markdown, TXT, HTML.</p>
          <input type="file" name="files" multiple accept=".pdf,.csv,.tsv,.json,.md,.txt,.html,.htm" required />
          <button className="primary" disabled={busy}>Add files</button>
        </form>
        <form className="card" onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
          <h3>Add a website</h3>
          <input name="url" type="url" placeholder="https://acme.com/help" required />
          <div className="grid2">
            <label className="small">Max pages<input name="max_pages" type="number" defaultValue={25} min={1} max={200} /></label>
            <label className="small">Only under path<input name="path_prefix" placeholder="/help" /></label>
          </div>
          <button className="primary" disabled={busy}>Crawl</button>
        </form>
        <form className="card" onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
          <h3>Paste text</h3>
          <input name="name" placeholder="Title, e.g. Refund FAQ" />
          <textarea name="text" rows={5} placeholder="Q: How do refunds work?&#10;A: …" required />
          <button className="primary" disabled={busy}>Add text</button>
        </form>
      </div>
      {report.length > 0 && <div className="card report">{report.map((r, i) => <div key={i}>{r}</div>)}</div>}
      <section className="card">
        <h2>Knowledge sources <span className="muted small">({sources?.length ?? 0} sources · {total} chunks)</span></h2>
        {!sources ? <p className="muted">Loading…</p> : sources.length === 0 ? <p className="muted">Nothing yet — add files, a website or text above.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Type</th><th>Chunks</th><th>Status</th><th /></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.origin?.startsWith("http") ? <a href={s.origin} target="_blank">{s.name}</a> : s.name}</td>
                  <td className="muted">{s.kind}</td>
                  <td>{s.chunk_count}</td>
                  <td>{s.status === "ready" ? <span className="pill on">ready</span> : <span className="pill" title={s.error ?? ""}>{s.status}</span>}</td>
                  <td><button className="link danger" onClick={async () => { if (confirm(`Remove "${s.name}"?`)) { await fetch(`/api/admin/sources/${s.id}`, { method: "DELETE" }); load(); } }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Conversations({ id }: { id: string }) {
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  useEffect(() => { fetch(`/api/admin/clients/${id}/conversations`).then((r) => r.json()).then(setConvs); }, [id]);
  if (!convs) return <p className="muted">Loading…</p>;
  if (!convs.length) return <section className="card"><p className="muted">No conversations yet.</p></section>;
  return (
    <>
      {convs.map((cv) => (
        <details key={cv.id} className="card conv">
          <summary>
            <strong>{cv.messages.find((m) => m.role === "user")?.content.slice(0, 90) || "(empty)"}</strong>
            <span className="muted small"> · {new Date(cv.created_at).toLocaleString()} · {cv.messages.length} messages</span>
          </summary>
          {[...cv.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m, i) => (
            <p key={i} className={`log ${m.role}`}><b>{m.role === "user" ? "Customer" : "Bot"}:</b> {m.content}</p>
          ))}
        </details>
      ))}
    </>
  );
}

function DangerZone({ id }: { id: string }) {
  return (
    <div className="danger-zone">
      <button className="link danger" onClick={async () => {
        if (!confirm("Delete this client, all its knowledge and conversations? This can't be undone.")) return;
        await fetch(`/api/admin/clients/${id}`, { method: "DELETE" });
        location.href = "/admin";
      }}>Delete client</button>
    </div>
  );
}

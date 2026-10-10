"use client";
import { useEffect, useState } from "react";
import { TEMPLATES } from "./templates";

type Row = { id: string; slug: string; name: string; model: string; active: boolean; created_at: string };

export function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState("general");
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/admin/clients").then((r) => r.json()).then(setRows);
  useEffect(() => {
    load();
  }, []);

  async function create(payload: unknown) {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(data.error || "Failed");
    location.href = `/admin/c/${data.id}`;
  }

  return (
    <main className="admin">
      <header className="topbar">
        <h1>Support bots</h1>
        <button className="ghost" onClick={async () => { await fetch("/api/admin/login", { method: "DELETE" }); location.reload(); }}>Sign out</button>
      </header>

      <section className="card">
        <h2>Clients</h2>
        {!rows ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No clients yet. Create one below.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Slug</th><th>Model</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => (location.href = `/admin/c/${r.id}`)}>
                  <td><a href={`/admin/c/${r.id}`}>{r.name}</a></td>
                  <td><code>{r.slug}</code></td>
                  <td className="muted">{r.model}</td>
                  <td>{r.active ? <span className="pill on">Live</span> : <span className="pill">Paused</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid2">
        <section className="card">
          <h2>New client</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = TEMPLATES[template];
              create({ ...t.config, name, slug, context: t.config.context.replaceAll("{{name}}", name) });
            }}
          >
            <label>Company name<input value={name} required onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></label>
            <label>Slug (used in the embed code)<input value={slug} required pattern="[a-z0-9-]+" onChange={(e) => setSlug(e.target.value)} /></label>
            <label>Starting template
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </label>
            <p className="muted small">{TEMPLATES[template].hint}</p>
            <button className="primary" disabled={busy}>{busy ? "Creating…" : "Create client"}</button>
          </form>
        </section>

        <section className="card">
          <h2>Import from JSON</h2>
          <p className="muted small">Paste a client config (exported from another client, or written by hand). Any <code>knowledge.urls</code> and <code>knowledge.texts</code> are ingested automatically.</p>
          <textarea className="mono" rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "slug": "acme", "name": "Acme", "context": "...", "knowledge": { "urls": [{ "url": "https://acme.com/help", "max_pages": 30 }] } }' />
          <div className="row">
            <input type="file" accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImportText(await f.text()); }} />
            <button className="primary" disabled={busy || !importText.trim()} onClick={() => { try { create(JSON.parse(importText)); } catch { setMsg("That isn't valid JSON"); } }}>{busy ? "Importing…" : "Import"}</button>
          </div>
        </section>
      </div>
      {msg && <p className="error">{msg}</p>}
    </main>
  );
}

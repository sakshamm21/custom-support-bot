"use client";
import { useState } from "react";

export function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <main className="login">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
          if (r.ok) location.reload();
          else setErr("Wrong password");
        }}
      >
        <h1>Support Bot admin</h1>
        <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Sign in</button>
      </form>
    </main>
  );
}

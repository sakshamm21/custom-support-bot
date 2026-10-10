"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

type Msg = { role: "user" | "assistant"; content: string; sources?: { title: string; url?: string }[] };
type Widget = { title: string; greeting: string; color: string; suggestions: string[] };

export function ChatWindow({ slug, name, widget, embedded = true }: { slug: string; name: string; widget: Widget; embedded?: boolean }) {
  const storeKey = `support-bot:${slug}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Restore the conversation for returning visitors (per browser, best-effort).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || "null");
      if (saved?.messages) {
        setMessages(saved.messages);
        setConversationId(saved.conversationId);
      }
    } catch {}
  }, [storeKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ messages, conversationId }));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, conversationId, storeKey]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), conversationId }),
      });
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages([...next, { role: "assistant", content: data.reply || data.error || "Sorry, something went wrong.", sources: data.sources }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, I couldn't connect. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setConversationId(undefined);
  }

  return (
    <div className="chat" style={{ ["--brand" as string]: widget.color }}>
      <header className="chat-head">
        <div>
          <div className="chat-title">{widget.title || name}</div>
          <div className="chat-sub">Typically replies instantly</div>
        </div>
        <div className="chat-actions">
          {messages.length > 0 && (
            <button onClick={reset} title="Start a new conversation" aria-label="New conversation">↻</button>
          )}
          {embedded && (
            <button onClick={() => window.parent.postMessage("support-bot:close", "*")} aria-label="Close chat">×</button>
          )}
        </div>
      </header>

      <div className="chat-list" ref={listRef}>
        <div className="msg assistant"><div className="bubble"><Markdown text={widget.greeting} /></div></div>
        {messages.length === 0 && widget.suggestions?.length > 0 && (
          <div className="suggestions">
            {widget.suggestions.map((s) => (
              <button key={s} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="bubble">
              {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
              {m.sources && m.sources.length > 0 && (
                <div className="sources">
                  {m.sources.slice(0, 4).map((s, j) =>
                    s.url ? (
                      <a key={j} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                    ) : (
                      <span key={j}>{s.title}</span>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg assistant"><div className="bubble typing"><span /><span /><span /></div></div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Type your message…"
          rows={1}
          maxLength={4000}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">➤</button>
      </form>
    </div>
  );
}

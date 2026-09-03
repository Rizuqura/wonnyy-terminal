"use client";

import { useState } from "react";

export function ChatPanel({ variant = "panel" }: Readonly<{ variant?: "panel" | "floating" }>) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const isFloating = variant === "floating";

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setNotice("Prototype only — connect a model to send messages.");
  };

  return <aside className={`chat-panel${isFloating ? " chat-panel-floating" : ""}`} aria-label="Wonnyy chat prototype">
    <div className="chat-header"><span>WONNYY CHAT</span><span className="chat-prototype">PROTOTYPE</span></div>
    {!isFloating ? <div className="chat-thread">
      <div className="chat-message chat-message-system">Ask about documents, selected files, or a research question. Model access is not connected yet.</div>
    </div> : null}
    <form className="chat-composer" onSubmit={submit}>
      <input value={draft} onChange={(event) => { setDraft(event.target.value); setNotice(""); }} placeholder={isFloating ? "Ask Wonnyy…" : "Ask about this vault…"} aria-label="Chat draft" />
      <button type="submit" aria-label="Send chat prototype message">↑</button>
    </form>
    {notice ? <p className="chat-notice" role="status">{notice}</p> : null}
  </aside>;
}

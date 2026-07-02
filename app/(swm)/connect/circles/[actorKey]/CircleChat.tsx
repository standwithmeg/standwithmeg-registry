"use client";

import { useCallback, useEffect, useState } from "react";
import { GOLD, RED, SURFACE, HAIRLINE, SURFACE_RAISED, GOLD_BORDER, INK } from "../../theme";

type ChatMessage = {
  id: string;
  handle: string;
  body: string;
  created_at: string;
  mine: boolean;
};

const POLL_MS = 10_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function avatarLabel(handle: string): string {
  return handle
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function ChatRule({ text }: { text: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
      {text}
    </div>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
      {text}
    </div>
  );
}

export default function CircleChat({ actorKey }: { actorKey: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [handleDraft, setHandleDraft] = useState("");
  const [handleSet, setHandleSet] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/connect/pseudonym", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.pseudonym?.handle) setHandleSet(true);
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/connect/chat/${actorKey}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.messages) {
        setMessages(data.messages);
        setError("");
      } else if (data?.error) {
        setError(data.error);
      }
    } finally {
      setLoaded(true);
    }
  }, [actorKey]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [load]);

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/connect/pseudonym", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handleDraft }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Could not save that handle.");
      return;
    }
    setHandleSet(true);
    window.dispatchEvent(new CustomEvent("circle-handle-set"));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/connect/chat/${actorKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not send your message.");
        return;
      }
      setDraft("");
      setMessages(prev => [...prev, data.message]);
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/connect/chat/${actorKey}/${id}`, { method: "DELETE" });
    if (res.ok) setMessages(prev => prev.filter(m => m.id !== id));
  }

  return (
    <section className="rounded-2xl p-5 md:p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${GOLD_BORDER}` }}>
      <div className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-start md:justify-between" style={{ borderColor: HAIRLINE }}>
        <div>
          <p className="kicker text-[10px]" style={{ color: RED }}>Handles only</p>
          <h2 className="mt-1 text-2xl font-black md:text-3xl">Room conversation</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/62">
            Use this like a private notes lobby. Keep it general, compare process patterns, and move to email only through double opt-in requests.
          </p>
        </div>
        <div className="grid gap-2 text-[11px] text-[#f4f1ea]/58 sm:grid-cols-3 md:w-[360px] md:grid-cols-1">
          <ChatRule text="Names and emails stay hidden." />
          <ChatRule text="Everyone here reported this person." />
          <ChatRule text="Messages refresh every few seconds." />
        </div>
      </div>

      <div className="mt-5">
        {!loaded && <p className="text-sm text-[#f4f1ea]/50">Loading the conversation…</p>}
        {loaded && messages.length === 0 && (
          <div className="rounded-2xl px-5 py-6" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
            <p className="text-base font-black">No messages yet.</p>
            <p className="mt-2 text-sm leading-relaxed text-[#f4f1ea]/58">
              You are among the first here. A good first post is a general process question, not identifying case details.
            </p>
            <div className="mt-4 grid gap-2 text-xs text-[#f4f1ea]/50 md:grid-cols-3">
              <Suggestion text="Ask what public process others saw." />
              <Suggestion text="Ask if anyone recognizes a pattern." />
              <Suggestion text="Avoid names, filings, and child details." />
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <ol className="space-y-4">
            {messages.map(m => (
              <li key={m.id} className="group flex gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                  style={{
                    backgroundColor: m.mine ? "rgba(212,168,64,0.18)" : "rgba(244,241,234,0.08)",
                    border: `1px solid ${m.mine ? GOLD_BORDER : HAIRLINE}`,
                    color: m.mine ? GOLD : "#f4f1ea",
                  }}
                  aria-hidden="true"
                >
                  {m.mine ? "YOU" : avatarLabel(m.handle)}
                </div>
                <div className="min-w-0 flex-1 border-b pb-4" style={{ borderColor: HAIRLINE }}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-black" style={{ color: m.mine ? GOLD : "#f4f1ea" }}>
                      {m.mine ? "You" : m.handle}
                    </span>
                    <span className="text-[11px] text-[#f4f1ea]/40">{timeLabel(m.created_at)}</span>
                    {m.mine && (
                      <button
                        type="button"
                        onClick={() => void remove(m.id)}
                        className="text-[11px] text-[#f4f1ea]/35 underline underline-offset-2 opacity-100 hover:text-[#f4f1ea]/65 md:opacity-0 md:group-hover:opacity-100"
                      >
                        remove
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#f4f1ea]/85">{m.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {!handleSet ? (
        <form onSubmit={saveHandle} className="mt-5 rounded-2xl p-4" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
          <p className="text-sm text-[#f4f1ea]/75">Pick a handle to join the conversation. Other parents only ever see this — never your name or email.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={handleDraft}
              onChange={e => setHandleDraft(e.target.value)}
              placeholder="e.g. PrairieMom"
              className="min-h-11 w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}
              maxLength={24}
              required
            />
            <button className="min-h-11 shrink-0 rounded-lg px-4 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
              Save handle
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={send} className="mt-5 rounded-2xl p-4" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
            placeholder="Post a general room note..."
            className="min-h-24 w-full resize-y bg-transparent px-1 py-1 text-sm leading-relaxed outline-none"
            maxLength={2000}
          />
          <div className="mt-2 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: HAIRLINE }}>
            <p className="text-[11px] leading-relaxed text-[#f4f1ea]/40">
              Emails and phone numbers are hidden automatically. Use Request to connect for contact info.
            </p>
            <button
              disabled={sending || !draft.trim()}
              className="min-h-10 shrink-0 rounded-lg px-5 py-2.5 text-sm font-black disabled:opacity-50"
              style={{ backgroundColor: RED, color: "white" }}
            >
              {sending ? "Sending..." : "Post comment"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</div>
      )}

      <div className="mt-4 grid gap-3 text-[11px] leading-relaxed text-[#f4f1ea]/45 md:grid-cols-2">
        <p>
          Peer support, not legal advice. Don&apos;t share case numbers, children&apos;s names, or anything from sealed filings.
        </p>
        <p>
          To exchange real contact info, use Request to connect — both sides have to consent.
        </p>
      </div>
    </section>
  );
}

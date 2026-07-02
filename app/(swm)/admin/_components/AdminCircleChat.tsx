"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { colors, shadows } from "../../../../lib/design-tokens";

const GOLD = colors.gold.DEFAULT;
const RED = colors.evidence.DEFAULT;

export type AdminChatMessage = {
  id: string;
  handle: string;
  body: string;
  created_at: string;
  mine: boolean;
  sender_email: string;
};

function parseActorKeyClient(key: string): { name: string; state: string | null; role: string } | null {
  try {
    const normalized = key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4);
    const decoded = atob(normalized);
    const [name, state, role] = decoded.split("|");
    if (!name || !role) return null;
    return { name, state: state || null, role };
  } catch {
    return null;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function avatarInitials(handle: string): string {
  return handle
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function useAdminCircleChat(actorKey: string, enabled = true) {
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/circles-chat/${encodeURIComponent(actorKey)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.messages) {
        setMessages(data.messages);
        setError(null);
      } else {
        setError(data?.error || "Could not load chat.");
      }
    } finally {
      setLoading(false);
    }
  }, [actorKey]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
    const id = setInterval(() => void load(), 10_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [load, enabled]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/circles-chat/${encodeURIComponent(actorKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not send message.");
        return;
      }
      setDraft("");
      setMessages(prev => [...prev, data.message]);
    } finally {
      setSending(false);
    }
  }

  return { messages, draft, setDraft, loading, sending, error, send };
}

export function AdminCircleChatPanel({
  actorKey,
  headerAction,
  readOnly = false,
  demoMessages,
}: {
  actorKey: string;
  headerAction?: React.ReactNode;
  readOnly?: boolean;
  demoMessages?: AdminChatMessage[];
}) {
  const isDemo = Boolean(demoMessages);
  const { messages: liveMessages, draft, setDraft, loading: liveLoading, sending, error, send } = useAdminCircleChat(actorKey, !isDemo);
  const messages = isDemo ? (demoMessages ?? []) : liveMessages;
  const loading = isDemo ? false : liveLoading;
  const actor = parseActorKeyClient(actorKey);
  const headerLabel = isDemo ? "Demo room" : readOnly ? "Member preview" : "Founder chat";

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: colors.ink.light }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5"
        style={{ backgroundColor: colors.ink.card, borderColor: colors.hairline.strong }}
      >
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: RED }}>{headerLabel}</p>
          <h2 className="mt-1 text-xl font-black text-white">
            {actor ? actor.name : "Circle chat"}
          </h2>
          {actor && (
            <p className="mt-1 text-xs text-white/55">
              {actor.role}{actor.state ? ` · ${actor.state}` : ""}
            </p>
          )}
        </div>
        {headerAction}
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {loading && messages.length === 0 && (
          <div className="space-y-4">
            <div className="h-16 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            <div className="h-24 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            <div className="h-16 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: colors.surface.DEFAULT, border: `1px solid ${colors.hairline.subtle}` }}
          >
            <p className="text-sm font-bold text-white/80">No messages in this room yet.</p>
            <p className="mt-2 text-sm text-white/55">
              {readOnly
                ? "A new member sees this empty room until someone posts."
                : "You can post a welcome note as Meg to help families learn how to connect."}
            </p>
          </div>
        )}

        <ol className="space-y-5">
          {messages.map(m => (
            <li key={m.id} className="group flex gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                style={{
                  backgroundColor: m.mine ? "rgba(212,168,64,0.18)" : colors.surface.raised,
                  border: `1px solid ${m.mine ? colors.gold.border : colors.hairline.DEFAULT}`,
                  color: m.mine ? GOLD : colors.paper.DEFAULT,
                }}
                aria-hidden="true"
              >
                {m.mine ? "MEG" : avatarInitials(m.handle)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-black" style={{ color: m.mine ? GOLD : colors.paper.DEFAULT }}>
                    {m.handle}
                  </span>
                  <span className="text-[11px] text-white/40">{fmtTime(m.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">{m.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Composer */}
      <div
        className="shrink-0 border-t px-6 py-5"
        style={{ backgroundColor: colors.ink.card, borderColor: colors.hairline.strong }}
      >
        {(readOnly || isDemo) ? (
          <div className="rounded-xl bg-white/5 px-3 py-3 text-sm text-white/55" style={{ border: `1px solid ${colors.hairline.DEFAULT}` }}>
            {isDemo ? "Demo mode — chat is read-only for the video." : "Preview mode — members would see the message composer here after joining the room."}
          </div>
        ) : (
          <form onSubmit={send}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Post as Meg..."
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none"
              style={{ border: `1px solid ${colors.hairline.DEFAULT}` }}
            />
            <div className="mt-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-[11px] text-white/45">
                Press Enter to send, Shift+Enter for a new line.
              </p>
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-lg px-5 py-2.5 text-sm font-black disabled:opacity-50"
                style={{ backgroundColor: RED, color: "white" }}
              >
                {sending ? "Sending..." : "Send as Meg"}
              </button>
            </div>
          </form>
        )}
        {error && (
          <div className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminCircleChat({ actorKey, onClose }: { actorKey: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        key="panel"
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl border-l"
        style={{
          backgroundColor: colors.ink.light,
          borderColor: colors.hairline.strong,
          boxShadow: shadows["2xl"],
        }}
      >
        <AdminCircleChatPanel
          actorKey={actorKey}
          headerAction={(
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/circles/${encodeURIComponent(actorKey)}`}
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-xs font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                style={{ border: `1px solid ${colors.hairline.strong}` }}
              >
                Open full page
              </Link>
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-xs font-bold transition-colors hover:bg-white/10"
                style={{ border: `1px solid ${colors.hairline.strong}` }}
              >
                Close
              </button>
            </div>
          )}
        />
      </motion.div>
    </AnimatePresence>
  );
}

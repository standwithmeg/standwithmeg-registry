"use client";

import { useEffect, useState } from "react";

const TEMPLATES = ["blog-post", "podcast-questions", "social-fb", "social-ig", "video-script"];

type GmailConfig = {
  source: "GMAIL" | "GOOGLE" | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasRedirectUri: boolean;
  clientIdSuffix: string | null;
  clientIdLooksValid: boolean;
  gmailClientIdSet: boolean;
  gmailClientIdLooksValid: boolean;
  googleClientIdSet: boolean;
  googleClientIdLooksValid: boolean;
  redirectUri: string;
  targetEmail: string | null;
  tokens: { present: boolean; hasRefreshToken: boolean; expiry: string | null; email: string | null };
};

type GmailConfigResponse = {
  configured?: Omit<GmailConfig, "tokens" | "targetEmail">;
  tokens?: GmailConfig["tokens"];
  target_email?: string | null;
  error?: string;
};

type GmailAdminPanelProps = {
  compact?: boolean;
};

function extractHeader(msg: Record<string, unknown>, name: string): string {
  const headers = ((msg.payload as Record<string, unknown>)?.headers ?? []) as { name?: string; value?: string }[];
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64UrlSafe(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  try {
    return decodeURIComponent(
      Array.from(atob(padded))
        .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
  } catch {
    return atob(padded);
  }
}

function decodeBody(msg: Record<string, unknown>): string {
  const parts = ((msg.payload as Record<string, unknown>)?.parts ?? [msg.payload]) as Record<string, unknown>[];
  const html = parts.find(p => p.mimeType === "text/html");
  const text = parts.find(p => p.mimeType === "text/plain");
  const body = (html ?? text)?.body as { data?: string } | undefined;
  if (!body?.data) return (msg.snippet as string) ?? "";
  try {
    return decodeBase64UrlSafe(body.data).slice(0, 200);
  } catch {
    return (msg.snippet as string) ?? "";
  }
}

export function GmailAdminPanel({ compact = false }: GmailAdminPanelProps = {}) {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [drafts, setDrafts] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<GmailConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("blog-post");
  const [variables, setVariables] = useState("{\"name\":\"Meg\",\"state\":\"TX\"}");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [inReplyTo, setInReplyTo] = useState<string | undefined>(undefined);
  const [references, setReferences] = useState<string | undefined>(undefined);
  const [replyMode, setReplyMode] = useState(false);

  async function checkConnection() {
    try {
      const res = await fetch("/api/gmail/messages?max=1");
      if (res.status === 401) return setStatus("disconnected");
      const data = await res.json().catch(() => ({}));
      if (res.ok) return setStatus("connected");
      setStatus("disconnected");
      setError(data?.error || "Could not connect to Gmail.");
    } catch {
      setStatus("disconnected");
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetch("/api/admin/gmail-config");
      const data = (await res.json().catch(() => ({}))) as GmailConfigResponse;
      if (res.ok && data?.configured) {
        setConfig({
          ...data.configured,
          targetEmail: data.target_email ?? null,
          tokens: data.tokens ?? { present: false, hasRefreshToken: false, expiry: null, email: null },
        });
      }
    } catch {
      // ignore diagnostic failures
    }
  }

  async function loadData() {
    setBusy(true);
    setError(null);
    try {
      const [msgRes, draftRes] = await Promise.all([
        fetch("/api/gmail/messages?unread=1&max=10"),
        fetch("/api/gmail/drafts?max=10"),
      ]);
      const msgData = await msgRes.json().catch(() => ({}));
      const draftData = await draftRes.json().catch(() => ({}));
      if (!msgRes.ok) throw new Error(msgData.error || "Could not load messages.");
      if (!draftRes.ok) throw new Error(draftData.error || "Could not load drafts.");
      setMessages(msgData.messages ?? []);
      setDrafts(draftData.drafts ?? []);
      setStatus("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Gmail data.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/gmail/auth");
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url;
      else setError(data.error || "Could not start Gmail auth.");
    } catch {
      setError("Could not start Gmail auth.");
    } finally {
      setBusy(false);
    }
  }

  function startReply(msg: Record<string, unknown>) {
    const from = extractHeader(msg, "from");
    const emailMatch = from.match(/<([^>]+)>/);
    const recipient = emailMatch ? emailMatch[1] : from;
    const originalSubject = extractHeader(msg, "subject") || "";
    const subject = originalSubject.toLowerCase().startsWith("re:") ? originalSubject : `Re: ${originalSubject}`;
    setTo(recipient);
    setSubject(subject);
    setThreadId(msg.threadId as string | undefined);
    setInReplyTo(msg.id as string | undefined);
    setReferences(msg.id as string | undefined);
    setReplyMode(true);
    setTemplate("blog-post");
    setVariables('{"name":""}');
  }

  function resetCompose() {
    setTo("");
    setSubject("");
    setThreadId(undefined);
    setInReplyTo(undefined);
    setReferences(undefined);
    setReplyMode(false);
  }

  async function sendOneClick(send = false) {
    if (!to || !subject) return setError("Recipient and subject are required.");
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        to,
        subject,
        template,
        variables: JSON.parse(variables || "{}"),
        threadId,
        inReplyTo,
        references,
      };
      const res = await fetch(send ? "/api/gmail/send" : "/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed.");
      setError(null);
      setReplyMode(false);
      setThreadId(undefined);
      setInReplyTo(undefined);
      setReferences(undefined);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void checkConnection();
    void fetchConfig();
  }, []);

  useEffect(() => {
    if (status === "connected" && !compact) void loadData();
  }, [compact, status]);

  const RED = "#b91c1c";
  const GOLD = "#c9a227";
  const INK = "#091625";

  return (
    <div className="rounded-[2rem] p-5" style={{ backgroundColor: "#0f1c29", border: "1px solid rgba(201,162,39,0.2)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: RED }}>Gmail integration</p>
          <h2 className="mt-2 text-xl font-black text-white">Gmail</h2>
        </div>
        <div
          className="rounded-full px-3 py-1 text-xs font-black"
          style={{
            backgroundColor: status === "connected" ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.08)",
            color: status === "connected" ? "#4ade80" : "#f4f1ea",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {status === "loading" ? "Checking..." : status === "connected" ? "Connected" : "Not connected"}
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}

      {config && (
        <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-white/60">
            <span>Target inbox: <strong className="text-white/85">{config.targetEmail || "not set"}</strong></span>
            <span>Saved token: <strong className="text-white/85">{config.tokens.present ? `${config.tokens.email ?? "unknown"}` : "none"}</strong></span>
          </div>
        </div>
      )}

      {status === "disconnected" && (
        <>
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="mt-4 rounded-lg px-5 py-3 text-sm font-black disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: INK }}
          >
            {busy ? "Connecting..." : "Connect Gmail"}
          </button>
          {config && (
            <div className="mt-4 rounded-xl p-4 text-xs" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)` }}>
              <p className="font-bold text-white/80">Configuration check</p>
              <ul className="mt-2 space-y-1 text-white/60">
                <li>Active OAuth source: {config.source ? `${config.source}_CLIENT_ID ✓ ends with …${config.clientIdSuffix}` : "none"}</li>
                <li>GMAIL_CLIENT_ID: {config.gmailClientIdSet ? (config.gmailClientIdLooksValid ? "✓ valid" : "set but invalid") : "not set"}</li>
                <li>GOOGLE_CLIENT_ID fallback: {config.googleClientIdSet ? (config.googleClientIdLooksValid ? "✓ valid" : "set but invalid") : "not set"}</li>
                <li>OAuth secret: {config.hasClientSecret ? "✓ set" : "missing"}</li>
                <li>Target inbox: {config.targetEmail || "not set"}</li>
                <li>Redirect URI: {config.redirectUri}</li>
                <li>Saved token: {config.tokens.present ? (config.tokens.hasRefreshToken ? `✓ present for ${config.tokens.email ?? "unknown"}` : "missing refresh token") : "none"}</li>
              </ul>
              {!config.source && !config.hasClientId && (
                <p className="mt-2 text-white/70">Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET, or GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, in Vercel (Production) and redeploy.</p>
              )}
              {!config.source && config.hasClientId && !config.clientIdLooksValid && (
                <p className="mt-2 text-white/70">The configured OAuth Client ID does not match Google&apos;s client ID format. It must end with .apps.googleusercontent.com.</p>
              )}
              {config.source && !config.tokens.present && (
                <p className="mt-2 text-white/70">Credentials look valid. If Google still blocks the connection, add this Redirect URI to that OAuth client in Google Cloud and make sure Gmail API is enabled.</p>
              )}
            </div>
          )}
        </>
      )}

      {status === "connected" && compact && (
        <div className="mt-4 rounded-xl p-3 text-sm text-white/65" style={{ backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.14)" }}>
          Gmail is connected for photo intake. The admin page will scan matching court-actor photo replies in the background without showing your full inbox here.
        </div>
      )}

      {status === "connected" && !compact && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-white/70">Unread ({messages.length})</h3>
              <div className="mt-2 space-y-2">
                {messages.map((m, i) => (
                  <div key={(m.id as string) ?? i} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(245,245,245,0.08)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">{extractHeader(m, "subject") || "(no subject)"}</div>
                        <div className="text-xs text-white/50">{extractHeader(m, "from")}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startReply(m)}
                        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                        style={{ backgroundColor: GOLD, color: INK }}
                      >
                        Reply
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap break-words" style={{ color: "rgba(245,245,245,0.8)" }}>
  {decodeBody(m).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')}
</div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-sm text-white/50">No unread messages.</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-white/70">Drafts ({drafts.length})</h3>
              <div className="mt-2 space-y-2">
                {drafts.map((d, i) => {
                  const msg = (d.message as Record<string, unknown>) ?? d;
                  return (
                    <div key={(d.id as string) ?? i} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(245,245,245,0.08)" }}>
                      <div className="text-sm font-bold text-white">{extractHeader(msg, "subject") || "(no subject)"}</div>
                      <div className="text-xs text-white/50">{extractHeader(msg, "to")}</div>
                    </div>
                  );
                })}
                {drafts.length === 0 && <p className="text-sm text-white/50">No drafts.</p>}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(245,245,245,0.08)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wide text-white/70">{replyMode ? "Reply" : "One-click send"}</h3>
              {replyMode && (
                <button type="button" onClick={resetCompose} className="text-xs text-white/50 underline">New message</button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="Recipient email"
                className="rounded-lg px-3 py-2 text-sm outline-none text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,245,245,0.1)" }}
              />
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="rounded-lg px-3 py-2 text-sm outline-none text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,245,245,0.1)" }}
              />
              <select
                value={template}
                onChange={e => setTemplate(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,245,245,0.1)" }}
              >
                {TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text"
                value={variables}
                onChange={e => setVariables(e.target.value)}
                placeholder='{"name":"...","state":"..."}'
                className="rounded-lg px-3 py-2 text-sm outline-none text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,245,245,0.1)" }}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => sendOneClick(false)}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-xs font-black disabled:opacity-50"
                style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#f4f1ea", border: "1px solid rgba(245,245,245,0.15)" }}
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => sendOneClick(true)}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-xs font-black disabled:opacity-50"
                style={{ backgroundColor: RED, color: "white" }}
              >
                Send now
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

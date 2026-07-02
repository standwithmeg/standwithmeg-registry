"use client";

import { useState } from "react";
import { colors } from "../../../../../lib/design-tokens";
import { SectionCard } from "./SectionCard";
import { RED } from "./shared";

export function InviteParentsSection() {
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendInvites(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const list = emails.split(",").map(s => s.trim()).filter(Boolean);
    if (list.length === 0) {
      setError("Enter at least one email address.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/circles/invite-parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send invites.");
        return;
      }
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? [] });
      setEmails("");
      setNote("");
    } finally {
      setLoading(false);
    }
  }

  const defaultBody = `Hi,

You came to mind because I think Connection Circles could help you find other parents who have been through the same courtroom.

Connection Circles are private rooms for Stand With Meg survey submitters who reported the same court actor. You stay anonymous unless both sides agree to connect.

If you want in:
1. Take the survey (if you haven't yet): ${typeof window !== "undefined" ? window.location.origin : "https://my.standwithmeg.com"}/survey
2. Then log in with that same email: ${typeof window !== "undefined" ? window.location.origin : "https://my.standwithmeg.com"}/connect

No pressure — just wanted you to know this exists.

Meg
Stand With Meg`;

  return (
    <SectionCard id="circles-invite" title="Invite parents by email" className="mt-8">
      <p className="text-sm text-white/60">
        Send a short, personal invite email. Enter one or more emails separated by commas.
      </p>
      <form onSubmit={sendInvites} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-bold text-white/80">Parent emails</label>
          <textarea
            value={emails}
            onChange={e => setEmails(e.target.value)}
            placeholder="parent1@example.com, parent2@example.com"
            rows={3}
            className="mt-2 w-full rounded-lg bg-white/5 px-4 py-3 text-sm text-white outline-none"
            style={{ border: `1px solid ${colors.hairline.subtle}` }}
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-white/80">Personal note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="I saw your story and thought of you..."
            rows={3}
            className="mt-2 w-full rounded-lg bg-white/5 px-4 py-3 text-sm text-white outline-none"
            style={{ border: `1px solid ${colors.hairline.subtle}` }}
          />
        </div>
        <div className="rounded-xl bg-black/20 p-4 text-xs text-white/50">
          <p className="font-bold text-white/70">Email preview:</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{defaultBody.replace("Hi,", note ? `Hi,\n\n${note}` : "Hi,")}</pre>
        </div>
        {error && <div className="rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>}
        {result && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Sent {result.sent} invite{result.sent === 1 ? "" : "s"}.
            {result.failed.length > 0 && ` Failed: ${result.failed.join(", ")}`}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-5 py-2.5 text-sm font-black disabled:opacity-60"
          style={{ backgroundColor: RED, color: "white" }}
        >
          {loading ? "Sending..." : "Send invites"}
        </button>
      </form>
    </SectionCard>
  );
}

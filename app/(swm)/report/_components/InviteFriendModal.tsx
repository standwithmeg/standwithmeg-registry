"use client";

import { useState } from "react";

const GOLD = "#C9A227";

type Props = { onClose: () => void };

export function InviteFriendModal({ onClose }: Props) {
  const [firstName, setFirstName] = useState("");
  const [copied, setCopied] = useState(false);

  const name = firstName.trim() || "friend";
  const message = `Hi ${name},

I want to share something important with you. Stand With Meg is a national advocacy platform documenting what families are experiencing in family court and child welfare systems across the country.

If you've been through the system — or someone you love has — your story can help change things. It takes about 5 minutes and you choose how your story is shared (anonymous, first-name only, full name, or data-only).

Share your story here:
https://my.standwithmeg.com/survey

You're not alone in this.`;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback — most browsers allow this
      const textarea = document.createElement("textarea");
      textarea.value = message;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#0F1E30", border: `1px solid rgba(201,162,39,0.35)` }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid rgba(201,162,39,0.2)`, backgroundColor: "rgba(30,58,95,0.6)" }}>
          <div>
            <div className="font-black text-white text-base leading-none">Invite a Friend</div>
            <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.4)" }}>
              Share a personal message inviting someone to document their experience.
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(245,245,245,0.8)" }}>
              Their first name <span className="text-xs font-normal" style={{ color: "rgba(245,245,245,0.4)" }}>(optional)</span>
            </label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              placeholder="Jenny"
              className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(245,245,245,0.8)" }}>
              Your message (preview)
            </label>
            <div className="rounded-lg px-4 py-3 text-sm whitespace-pre-wrap"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(245,245,245,0.75)", maxHeight: "260px", overflowY: "auto" }}>
              {message}
            </div>
          </div>

          <button onClick={copyMessage}
            className="w-full py-3.5 rounded-lg font-bold text-sm tracking-wide transition-colors"
            style={{
              backgroundColor: copied ? "rgba(74,222,128,0.2)" : "#B91C1C",
              color: copied ? "rgb(134,239,172)" : "white",
              border: copied ? "1px solid rgba(74,222,128,0.4)" : "none",
            }}>
            {copied ? "✓ Copied! Paste it in a text, email, or DM" : "Copy Message to Share"}
          </button>

          <p className="text-xs text-center" style={{ color: "rgba(245,245,245,0.3)" }}>
            Then paste into iMessage, WhatsApp, email, Messenger, or anywhere else.
          </p>
        </div>
      </div>
    </div>
  );
}

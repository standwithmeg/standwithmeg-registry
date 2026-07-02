"use client";

import Link from "next/link";
import { useState } from "react";
import { GOLD, NAVY, RED } from "../theme";


type TagPermission = "tag" | "first_name" | "anonymous";

function permissionLabel(p: TagPermission): string {
  if (p === "tag") return "Tag my social account";
  if (p === "first_name") return "Use my first name";
  return "Keep me anonymous";
}

export default function SponsorPoolPage() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("25");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tagPermission, setTagPermission] = useState<TagPermission>("anonymous");
  const [sponsorName, setSponsorName] = useState("");
  const [socialHandle, setSocialHandle] = useState("");

  async function checkout(kind: string, extra: Record<string, unknown> = {}) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/connect/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          sponsor_email: email,
          tag_permission: tagPermission,
          sponsor_name: sponsorName,
          social_handle: socialHandle,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Checkout is not configured yet.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="px-6 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl p-8" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(212,168,64,0.22)" }}>
        <p className="kicker text-xs" style={{ color: RED }}>Stand With Meg</p>
        <h1 className="mt-2 text-3xl font-black">Sponsor parent access</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#f4f1ea]/70">
          Help a parent join Connection Circles when they cannot pay. Sponsorship never reveals a parent&apos;s identity,
          court actor, case details, survey, email, phone, or story.
        </p>
        <section className="mt-5 space-y-3 rounded-xl p-4 text-sm leading-relaxed text-[#f4f1ea]/70" style={{ backgroundColor: "rgba(244,241,234,0.055)", border: "1px solid rgba(244,241,234,0.14)" }}>
          <h2 className="text-base font-black text-[#f4f1ea]">What sponsorship covers</h2>
          <p>
            A sponsorship funds protected access for families who already submitted to the Stand With Meg registry but
            cannot pay for Connection Circles. It supports the matching layer, private request workflow, and access
            checks that let parents find repeated court-actor patterns without turning the registry into an open social
            network.
          </p>
          <p>
            Sponsors do not choose a specific recipient unless a parent sends them a private sponsor link. Pool
            sponsorships are assigned without revealing the parent&apos;s name, email, county, case details, actor list,
            or story. This keeps support separate from case exposure.
          </p>
          <p>
            Families can use sponsored access to review possible matches, send or withdraw connection requests, and
            decide whether to share contact information only after both sides consent. The tool is for peer support,
            organizing, and documentation; it is not legal advice or emergency help.
          </p>
        </section>
        <label htmlFor="sponsor-email" className="mt-6 block text-sm font-bold text-[#f4f1ea]/80">Email for receipt, optional</label>
        <input
          id="sponsor-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="mt-2 w-full rounded-lg px-4 py-3 text-[#f4f1ea] outline-none"
          style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
          placeholder="you@example.com"
        />

        <fieldset className="mt-6">
          <legend className="text-sm font-bold text-[#f4f1ea]/80">Can we thank you publicly?</legend>
          <div className="mt-3 space-y-3">
            {(["tag", "first_name", "anonymous"] as TagPermission[]).map(p => (
              <label key={p} className="flex cursor-pointer items-start gap-3 rounded-lg p-3" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(244,241,234,0.12)" }}>
                <input
                  type="radio"
                  name="tag_permission"
                  value={p}
                  checked={tagPermission === p}
                  onChange={() => setTagPermission(p)}
                  className="mt-1"
                />
                <span className="text-sm text-[#f4f1ea]/80">
                  <span className="font-bold">{permissionLabel(p)}</span>
                  {p === "tag" && <span className="block text-xs text-[#f4f1ea]/50">e.g. &quot;Thank you @handle for covering a seat.&quot;</span>}
                  {p === "first_name" && <span className="block text-xs text-[#f4f1ea]/50">e.g. &quot;Thank you Sarah for covering a seat.&quot;</span>}
                  {p === "anonymous" && <span className="block text-xs text-[#f4f1ea]/50">We&apos;ll say &quot;a friend of Stand With Meg&quot;.</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {tagPermission === "first_name" && (
          <label htmlFor="sponsor-name" className="mt-4 block text-sm font-bold text-[#f4f1ea]/80">
            First name
            <input
              id="sponsor-name"
              type="text"
              value={sponsorName}
              onChange={e => setSponsorName(e.target.value)}
              className="mt-2 w-full rounded-lg px-4 py-3 text-[#f4f1ea] outline-none"
              style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
              placeholder="Sarah"
            />
          </label>
        )}

        {tagPermission === "tag" && (
          <label htmlFor="social-handle" className="mt-4 block text-sm font-bold text-[#f4f1ea]/80">
            Social handle
            <input
              id="social-handle"
              type="text"
              value={socialHandle}
              onChange={e => setSocialHandle(e.target.value)}
              className="mt-2 w-full rounded-lg px-4 py-3 text-[#f4f1ea] outline-none"
              style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
              placeholder="@username"
            />
          </label>
        )}

        {error && <div className="mt-4 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button disabled={loading} onClick={() => checkout("sponsor_pool_month")} className="rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: RED, color: "white" }}>
            Sponsor 1 month - $6
          </button>
          <button disabled={loading} onClick={() => checkout("sponsor_pool_year")} className="rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: GOLD, color: NAVY }}>
            Sponsor 1 year - $50
          </button>
        </div>
        <div className="mt-5 rounded-xl bg-black/20 p-4">
          <label htmlFor="custom-amount" className="block text-sm font-bold text-[#f4f1ea]/80">Custom amount</label>
          <div className="mt-2 flex gap-2">
            <input
              id="custom-amount"
              type="number"
              min="1"
              max="5000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="min-w-0 flex-1 rounded-lg px-4 py-3 text-[#f4f1ea] outline-none"
              style={{ backgroundColor: "rgba(244,241,234,0.07)", border: "1px solid rgba(244,241,234,0.18)" }}
            />
            <button disabled={loading} onClick={() => checkout("sponsor_pool_custom", { amount_dollars: amount })} className="rounded-lg px-5 py-3 font-black disabled:opacity-60" style={{ backgroundColor: "rgba(244,241,234,0.12)" }}>
              Give
            </button>
          </div>
        </div>
        <nav className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-[#f4f1ea]/45">
          <Link href="/connect" className="hover:text-[#f4f1ea]/75">Connection Circles</Link>
          <Link href="/report" className="hover:text-[#f4f1ea]/75">Report</Link>
          <Link href="/survey" className="hover:text-[#f4f1ea]/75">Take the Survey</Link>
          <Link href="/actors" className="hover:text-[#f4f1ea]/75">Actors</Link>
          <Link href="/privacy" className="hover:text-[#f4f1ea]/75">Privacy</Link>
          <Link href="/contact" className="hover:text-[#f4f1ea]/75">Contact</Link>
        </nav>
      </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GOLD, NAVY, RED } from "../../theme";


type SponsorLinkResponse = {
  valid: boolean;
  link?: {
    token: string;
    requester_note: string | null;
    expires_at: string;
  };
  error?: string;
};

type TagPermission = "tag" | "first_name" | "anonymous";

function permissionLabel(p: TagPermission): string {
  if (p === "tag") return "Tag my social account";
  if (p === "first_name") return "Use my first name";
  return "Keep me anonymous";
}

export default function DirectSponsorPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [link, setLink] = useState<SponsorLinkResponse | null>(null);
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tagPermission, setTagPermission] = useState<TagPermission>("anonymous");
  const [sponsorName, setSponsorName] = useState("");
  const [socialHandle, setSocialHandle] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/connect/sponsor/${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(setLink)
      .catch(() => setLink({ valid: false, error: "Could not load sponsor link." }));
  }, [token]);

  async function checkout(kind: "sponsor_direct_month" | "sponsor_direct_year") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/connect/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          token,
          sponsor_email: sponsorEmail,
          tag_permission: tagPermission,
          sponsor_name: sponsorName,
          social_handle: socialHandle,
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
        <h1 className="mt-2 text-3xl font-black">Sponsor one parent&apos;s access</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#f4f1ea]/70">
          Your sponsorship helps one verified parent access Connection Circles. You will not see their court actor,
          case details, survey response, email, phone, or private story.
        </p>

        {!link ? (
          <div className="mt-6 text-[#f4f1ea]/50">Loading sponsor link...</div>
        ) : !link.valid ? (
          <div className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">
            This sponsor link is no longer active.
          </div>
        ) : (
          <>
            {link.link?.requester_note && (
              <div className="mt-6 rounded-lg bg-black/25 p-4 text-sm text-[#f4f1ea]/75">
                <div className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>Optional note from parent</div>
                {link.link.requester_note}
              </div>
            )}
            <label htmlFor="sponsor-email" className="mt-6 block text-sm font-bold text-[#f4f1ea]/80">
              Email for receipt, optional
            </label>
            <input
              id="sponsor-email"
              type="email"
              value={sponsorEmail}
              onChange={e => setSponsorEmail(e.target.value)}
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
                      {p === "tag" && <span className="block text-xs text-[#f4f1ea]/50">e.g. &quot;Thank you @handle for covering this parent&apos;s seat.&quot;</span>}
                      {p === "first_name" && <span className="block text-xs text-[#f4f1ea]/50">e.g. &quot;Thank you Sarah for covering this parent&apos;s seat.&quot;</span>}
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
              <button disabled={loading} onClick={() => checkout("sponsor_direct_month")} className="rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: RED, color: "white" }}>
                Sponsor 1 month - $6
              </button>
              <button disabled={loading} onClick={() => checkout("sponsor_direct_year")} className="rounded-lg px-4 py-3 font-black disabled:opacity-60" style={{ backgroundColor: GOLD, color: NAVY }}>
                Sponsor 1 year - $50
              </button>
            </div>
          </>
        )}
      </div>
      </section>
    </main>
  );
}

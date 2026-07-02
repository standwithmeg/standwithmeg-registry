"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GOLD, HAIRLINE, INK, NAVY, RED, SURFACE, SURFACE_RAISED } from "../theme";

type AccessRow = {
  id: string;
  access_type: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
};

type MeResponse = {
  authenticated: boolean;
  email?: string;
  first_name?: string;
  submitter?: boolean;
  access?: AccessRow[];
  has_full_access?: boolean;
  can_manage_billing?: boolean;
  hardship_request?: { id: string; status: string; requested_at: string } | null;
};

type Pseudonym = { id: string; email: string; handle: string; created_at: string };

type Match = {
  actor_key: string;
  actor: { name: string; state: string | null; role: string };
  other_parents_count: number;
};

function accessLabel(row: AccessRow): string {
  const labels: Record<string, string> = {
    supporter_monthly: "Paid monthly supporter",
    supporter_annual: "Paid annual supporter",
    hardship: "Sponsored hardship access",
    sponsored_month: "Sponsored month",
    sponsored_year: "Sponsored year",
    sponsor_pool: "Sponsor pool access",
  };
  return labels[row.access_type] ?? row.access_type;
}

export default function ConnectAccountPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [pseudonym, setPseudonym] = useState<Pseudonym | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [draftHandle, setDraftHandle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState(false);
  const [leavingKey, setLeavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meRes, pseudoRes, matchesRes] = await Promise.all([
        fetch("/api/connect/me", { cache: "no-store" }),
        fetch("/api/connect/pseudonym", { cache: "no-store" }),
        fetch("/api/connect/matches", { cache: "no-store" }),
      ]);

      const meData = await meRes.json().catch(() => null);
      setMe(meData);
      if (!meRes.ok || meData?.authenticated === false) {
        setError(meData?.error || "Please log in with your survey email first.");
        return;
      }

      const pseudoData = await pseudoRes.json().catch(() => null);
      if (pseudoRes.ok) {
        setPseudonym(pseudoData?.pseudonym ?? null);
        setDraftHandle(pseudoData?.pseudonym?.handle ?? "");
      }

      const matchesData = await matchesRes.json().catch(() => null);
      if (matchesRes.ok) setMatches(Array.isArray(matchesData?.matches) ? matchesData.matches : []);
    } catch {
      setError("Could not load your Circle account.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const access = me?.access ?? [];
  const activeAccess = access[0] ?? null;
  const currentHandle = pseudonym?.handle || "No handle set yet";
  const canUseCircles = Boolean(me?.has_full_access);
  const billingText = useMemo(() => {
    if (me?.can_manage_billing) return "Open Stripe to update payment method, see invoices, or cancel your subscription.";
    if (activeAccess?.access_type?.startsWith("sponsored") || activeAccess?.access_type === "hardship") {
      return "This access was sponsored, so there is no subscription for you to cancel.";
    }
    return "No self-paid subscription is attached to this account.";
  }, [activeAccess, me?.can_manage_billing]);

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connect/pseudonym", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: draftHandle }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not save your handle.");
        return;
      }
      setPseudonym(data.pseudonym);
      setDraftHandle(data.pseudonym.handle);
      setMessage("Handle updated. Other parents will see the new handle on future page loads.");
    } finally {
      setSaving(false);
    }
  }

  async function manageBilling() {
    setBilling(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connect/billing-portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not open subscription management.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBilling(false);
    }
  }

  async function leaveRoom(match: Match) {
    const ok = window.confirm(`Leave the ${match.actor.name} circle? It will be hidden from your circle list.`);
    if (!ok) return;
    setLeavingKey(match.actor_key);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/connect/matches/${match.actor_key}/leave`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not leave this room.");
        return;
      }
      setMatches(prev => prev.filter(row => row.actor_key !== match.actor_key));
      setMessage(`You left the ${match.actor.name} circle.`);
    } finally {
      setLeavingKey(null);
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="kicker text-xs" style={{ color: RED }}>Connection Circles</p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">Manage access</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/70">
              Manage your subscription, private handle, and the court-actor rooms you appear in.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/connect/circles" className="rounded-lg px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${HAIRLINE}` }}>
              Back to circles
            </Link>
            <Link href="/connect/requests" className="rounded-lg px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${HAIRLINE}` }}>
              Requests
            </Link>
          </div>
        </div>

        {loading && <p className="mt-10 text-[#f4f1ea]/60">Loading account...</p>}
        {message && <div className="mt-6 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
        {error && <div className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>}

        {!loading && !me?.authenticated && (
          <div className="mt-8 rounded-2xl p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
            <h2 className="text-xl font-black">Log in first</h2>
            <p className="mt-2 text-sm text-[#f4f1ea]/70">Use your survey email to manage Connection Circles.</p>
            <Link href="/connect" className="mt-5 inline-block rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: GOLD, color: INK }}>
              Log in
            </Link>
          </div>
        )}

        {!loading && me?.authenticated && (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#f4f1ea]/50">Survey email</p>
                  <p className="mt-1 break-all text-lg font-black">{me.email}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/45">This is private. Other parents do not see it unless you both accept a connection request.</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#f4f1ea]/50">Current handle</p>
                  <p className="mt-1 text-lg font-black" style={{ color: GOLD }}>{currentHandle}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/45">This is what other Circle members see.</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#f4f1ea]/50">Access</p>
                  <p className="mt-1 text-lg font-black">{activeAccess ? accessLabel(activeAccess) : "No active access"}</p>
                  {activeAccess?.expires_at && <p className="mt-2 text-xs text-[#f4f1ea]/45">Through {new Date(activeAccess.expires_at).toLocaleDateString()}</p>}
                </div>
              </div>
            </section>

            <section className="rounded-2xl p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Subscription</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/70">{billingText}</p>
                </div>
                <button
                  type="button"
                  onClick={manageBilling}
                  disabled={!me.can_manage_billing || billing}
                  className="rounded-lg px-5 py-3 text-sm font-black disabled:opacity-50"
                  style={{ backgroundColor: me.can_manage_billing ? GOLD : SURFACE_RAISED, color: me.can_manage_billing ? INK : "#f4f1ea" }}
                >
                  {billing ? "Opening..." : "Manage or cancel"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <h2 className="text-xl font-black">Profile</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/70">
                Change your private Circle handle. Do not use your legal name or anything that identifies your child, case, address, or employer.
              </p>
              <form onSubmit={saveHandle} className="mt-5 flex flex-col gap-3 md:flex-row">
                <input
                  value={draftHandle}
                  onChange={e => setDraftHandle(e.target.value)}
                  placeholder="Private handle"
                  className="min-h-12 w-full rounded-lg px-4 py-3 text-[#f4f1ea] outline-none focus:ring-1 focus:ring-amber-300/50 md:max-w-md"
                  style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}
                  maxLength={24}
                  required
                />
                <button type="submit" disabled={saving} className="rounded-lg px-5 py-3 text-sm font-black disabled:opacity-60" style={{ backgroundColor: GOLD, color: INK }}>
                  {saving ? "Saving..." : "Save handle"}
                </button>
              </form>
              <p className="mt-2 text-xs text-[#f4f1ea]/45">3-24 characters. Letters, numbers, spaces, . _ - allowed. Must start with a letter.</p>
            </section>

            <section className="rounded-2xl p-6" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Court-actor chat rooms</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/70">
                    Leaving hides the room from your circle list. It does not delete messages you already posted, survey records, or connection-request audit history.
                  </p>
                </div>
                <span className="rounded-lg px-3 py-2 text-xs font-bold" style={{ backgroundColor: SURFACE_RAISED, color: GOLD }}>
                  {matches.length} active {matches.length === 1 ? "room" : "rooms"}
                </span>
              </div>

              {canUseCircles && matches.length === 0 && (
                <div className="mt-5 rounded-xl p-4 text-sm text-[#f4f1ea]/60" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                  No active rooms are showing right now.
                </div>
              )}
              {!canUseCircles && (
                <div className="mt-5 rounded-xl p-4 text-sm text-[#f4f1ea]/70" style={{ backgroundColor: "rgba(198,61,47,0.12)", border: "1px solid rgba(198,61,47,0.35)" }}>
                  You need active Circle access before rooms can be managed.
                </div>
              )}

              {matches.length > 0 && (
                <div className="mt-5 space-y-3">
                  {matches.map(match => (
                    <div key={match.actor_key} className="flex flex-col gap-4 rounded-xl p-4 md:flex-row md:items-center md:justify-between" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                      <div>
                        <p className="text-xs uppercase tracking-wider" style={{ color: GOLD }}>{match.actor.role}</p>
                        <p className="mt-1 text-lg font-black">{match.actor.name}</p>
                        <p className="mt-1 text-xs text-[#f4f1ea]/50">
                          {match.actor.state ?? "Unknown state"} · {match.other_parents_count} other {match.other_parents_count === 1 ? "parent" : "parents"}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Link href={`/connect/circles/${match.actor_key}`} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${HAIRLINE}` }}>
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => void leaveRoom(match)}
                          disabled={leavingKey === match.actor_key}
                          className="rounded-lg px-4 py-2 text-sm font-black disabled:opacity-50"
                          style={{ backgroundColor: RED, color: "white" }}
                        >
                          {leavingKey === match.actor_key ? "Leaving..." : "Leave room"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

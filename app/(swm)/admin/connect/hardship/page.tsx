"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

type HardshipRequest = {
  id: string;
  email: string;
  request_note: string | null;
  status: "pending" | "fulfilled" | "declined" | "cancelled";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  fulfilled_access_id: string | null;
  state_code: string | null;
  court_actor_count: number;
  submission_id: string | null;
  survey_url: string | null;
};

type Contribution = {
  id: string;
  contribution_type: string;
  sponsor_email: string | null;
  sponsor_name: string | null;
  tag_permission: "tag" | "first_name" | "anonymous" | null;
  social_handle: string | null;
  amount_cents: number;
  currency: string;
  created_at: string;
};

type WaitlistResponse = {
  requests: HardshipRequest[];
  sponsor_pool: {
    recent_total_cents: number;
    recent_count: number;
    recent_contributions: Contribution[];
  };
};

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function donorDisplayName(c: Contribution): string {
  if (c.tag_permission === "tag" && c.social_handle) return c.social_handle;
  if (c.tag_permission === "first_name" && c.sponsor_name) return c.sponsor_name;
  if (c.sponsor_name) return c.sponsor_name;
  return c.sponsor_email ?? "Anonymous";
}

function donorPermissionLabel(c: Contribution): string {
  if (c.tag_permission === "tag") return "OK to tag";
  if (c.tag_permission === "first_name") return "First name only";
  return "Anonymous";
}

export default function ConnectHardshipAdminPage() {
  const [data, setData] = useState<WaitlistResponse | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [grantingAll, setGrantingAll] = useState(false);

  async function load() {
    setError("");
    const res = await fetch("/api/admin/connect/hardship-requests", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error || "Could not load the waitlist.");
      return;
    }
    setData(json);
  }

  useEffect(() => {
    void load();
  }, []);

  const pending = useMemo(() => (data?.requests ?? []).filter(row => row.status === "pending"), [data]);
  const decided = useMemo(() => (data?.requests ?? []).filter(row => row.status !== "pending"), [data]);

  async function act(id: string, action: "grant" | "decline") {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/connect/hardship-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Could not update request.");
        return;
      }
      setMessage(action === "grant" ? "Access granted for 30 days." : "Request declined.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function grantAllPending() {
    if (!confirm(`Grant 30 days of Circle access to all ${pending.length} pending request(s)?`)) return;
    setGrantingAll(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/connect/hardship-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant-all" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Could not grant all requests.");
        return;
      }
      setMessage(`Granted ${json.granted ?? 0} request(s) for 30 days.${json.failed?.length ? ` ${json.failed.length} failed — check the console.` : ""}`);
      await load();
    } finally {
      setGrantingAll(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10 text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>Connection Circles</p>
            <h1 className="mt-2 text-4xl font-black">Sponsored-access waitlist</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
              Parents who cannot pay are held here until sponsor funds are available. Granting a request gives that survey email 30 days of Circle access.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin" className="rounded-lg px-4 py-2 text-sm font-bold text-white/80" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>
              Back to admin
            </Link>
            <Link href="/admin/circles" className="rounded-lg px-4 py-2 text-sm font-bold text-white/80" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>
              Back to Circles admin
            </Link>
          </div>
        </div>

        {message && <div className="mt-6 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
        {error && <div className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="text-3xl font-black">{pending.length}</div>
            <div className="mt-1 text-sm text-white/60">Pending requests</div>
          </div>
          <div className="rounded-xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="text-3xl font-black">{data?.sponsor_pool.recent_count ?? 0}</div>
            <div className="mt-1 text-sm text-white/60">Recent pool donations</div>
          </div>
          <div className="rounded-xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="text-3xl font-black">{dollars(data?.sponsor_pool.recent_total_cents ?? 0)}</div>
            <div className="mt-1 text-sm text-white/60">Recent pool total</div>
          </div>
        </div>

        {(data?.sponsor_pool.recent_contributions?.length ?? 0) > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-black">Recent pool donations</h2>
            <div className="mt-3 space-y-2">
              {data!.sponsor_pool.recent_contributions.map(c => (
                <div key={c.id} className="flex flex-col gap-1 rounded-xl p-4 text-sm sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <div>
                    <span className="font-bold">{donorDisplayName(c)}</span>
                    <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/70" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>{donorPermissionLabel(c)}</span>
                    <span className="ml-2 block text-white/50 sm:inline">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="font-black" style={{ color: GOLD }}>{dollars(c.amount_cents)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-black">Pending</h2>
            {pending.length > 0 && (
              <button
                type="button"
                onClick={grantAllPending}
                disabled={grantingAll}
                className="rounded-lg px-4 py-2 text-sm font-black disabled:opacity-60"
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                {grantingAll ? "Granting all..." : `Grant all ${pending.length} pending 30 days`}
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {pending.length === 0 && (
              <div className="rounded-xl p-5 text-sm text-white/60" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
                No pending sponsored-access requests.
              </div>
            )}
            {pending.map(row => (
              <div key={row.id} className="rounded-xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-black">{row.email}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
                      <span>Requested {new Date(row.requested_at).toLocaleString()}</span>
                      {row.state_code && <span className="rounded px-1.5 py-0.5 text-white/70" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>{row.state_code}</span>}
                      <span>{row.court_actor_count} court actor{row.court_actor_count === 1 ? "" : "s"}</span>
                    </div>
                    {row.request_note && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">{row.request_note}</p>}
                    {row.survey_url ? (
                      <Link
                        href={row.survey_url}
                        className="mt-3 inline-block text-xs font-bold hover:underline"
                        style={{ color: GOLD }}
                      >
                        View survey →
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/survey-lookup?email=${encodeURIComponent(row.email)}`}
                        className="mt-3 inline-block text-xs font-bold hover:underline"
                        style={{ color: GOLD }}
                      >
                        Look up survey by email →
                      </Link>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busyId === row.id || grantingAll}
                      onClick={() => act(row.id, "grant")}
                      className="rounded-lg px-4 py-2 text-sm font-black disabled:opacity-60"
                      style={{ backgroundColor: GOLD, color: NAVY }}
                    >
                      Grant 30 days
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || grantingAll}
                      onClick={() => act(row.id, "decline")}
                      className="rounded-lg px-4 py-2 text-sm font-bold text-white/80 disabled:opacity-60"
                      style={{ border: "1px solid rgba(255,255,255,0.18)" }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-black">Recent decisions</h2>
          <div className="mt-4 space-y-3">
            {decided.slice(0, 20).map(row => (
              <div key={row.id} className="rounded-xl p-4 text-sm" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <span className="font-bold">{row.email}</span>
                  <span className="text-white/55">{row.status} {row.decided_at ? `on ${new Date(row.decided_at).toLocaleString()}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

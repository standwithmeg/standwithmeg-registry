"use client";

import { useState, useEffect } from "react";
import { colors } from "../../../../../lib/design-tokens";
import { SectionCard } from "./SectionCard";
import { fmtAgo, StatusBadge } from "./shared";

type PromoRequestRow = {
  id: string;
  email: string;
  code: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  access_id: string | null;
};

export function PromoRequestsSection() {
  const [requests, setRequests] = useState<PromoRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo-requests", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load promo requests.");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load promo requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, action: "approve" | "deny") {
    setWorking(prev => ({ ...prev, [id]: true }));
    setError(null);
    try {
      const res = await fetch("/api/admin/promo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not ${action} request.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} request.`);
    } finally {
      setWorking(prev => ({ ...prev, [id]: false }));
    }
  }

  const pending = requests.filter(r => r.status === "pending");
  const decided = requests.filter(r => r.status !== "pending").slice(0, 10);

  return (
    <SectionCard
      title="Pending promo requests"
      className="mt-8"
      action={
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-bold hover:underline"
          style={{ color: "rgba(244,241,234,0.6)" }}
        >
          Refresh
        </button>
      }
    >
      {error && <p className="mb-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}

      {loading ? (
        <p className="text-sm text-white/50">Loading promo requests...</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-white/50">No pending promo requests. {decided.length > 0 && "Recent decisions are shown below."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ color: "rgba(244,241,234,0.45)" }}>
                <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
                <th className="pb-3 font-bold uppercase text-xs tracking-wide">Code</th>
                <th className="pb-3 font-bold uppercase text-xs tracking-wide">Requested</th>
                <th className="pb-3 font-bold uppercase text-xs tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr
                  key={row.id}
                  className="border-t"
                  style={{ borderColor: colors.hairline.subtle }}
                >
                  <td className="py-3" style={{ color: "rgba(244,241,234,0.85)" }}>{row.email}</td>
                  <td className="py-3 text-white">{row.code}</td>
                  <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtAgo(row.requested_at)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={working[row.id]}
                        onClick={() => void act(row.id, "approve")}
                        className="rounded-md px-3 py-1.5 text-xs font-black disabled:opacity-50"
                        style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.35)" }}
                      >
                        {working[row.id] ? "..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={working[row.id]}
                        onClick={() => void act(row.id, "deny")}
                        className="rounded-md px-3 py-1.5 text-xs font-black disabled:opacity-50"
                        style={{ backgroundColor: "rgba(185,28,28,0.15)", color: "#fca5a5", border: "1px solid rgba(185,28,28,0.35)" }}
                      >
                        Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {decided.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <p className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: "rgba(244,241,234,0.45)" }}>Recent decisions</p>
          <table className="w-full text-left text-sm">
            <tbody>
              {decided.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t"
                    style={{ borderColor: colors.hairline.subtle }}
                  >
                    <td className="py-2" style={{ color: "rgba(244,241,234,0.7)" }}>{row.email}</td>
                    <td className="py-2 text-white">{row.code}</td>
                    <td className="py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2" style={{ color: "rgba(244,241,234,0.5)" }}>{fmtAgo(row.decided_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

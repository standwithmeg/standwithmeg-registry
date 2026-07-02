"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const GOLD = "#C9A227";

type CoachingRow = {
  id: string;
  name: string;
  email: string;
  state: string | null;
  interest_type: string;
  message: string | null;
  status: string;
  created_at: string;
};

type QaRow = {
  id: string;
  email: string;
  question: string;
  answer: string;
  created_at: string;
};

type KitRow = {
  id: string;
  email: string;
  status: string;
  granted_at: string;
};

export function ShawnLeeAdminPanel() {
  const [coaching, setCoaching] = useState<CoachingRow[]>([]);
  const [qa, setQa] = useState<QaRow[]>([]);
  const [kits, setKits] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shawn-lee-leads", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      setCoaching(data.coaching ?? []);
      setQa(data.qa ?? []);
      setKits(data.reportKit ?? []);
      if (data.tablesReady === false) {
        setError("Run migration 055_shawn_lee_platform.sql in Supabase first.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    const res = await fetch("/api/admin/shawn-lee-leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) void load();
  }

  return (
    <main className="min-h-screen bg-[#0F1E30] px-5 py-10 text-[#f4f1ea]">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-bold hover:underline" style={{ color: GOLD }}>
          ← Admin
        </Link>
        <h1 className="mt-4 text-3xl font-black text-white">Shawn Lee Report Leads</h1>
        <p className="mt-2 text-sm text-white/60">Coaching inquiries, Q&amp;A log, Report Kit purchases</p>

        {loading && <p className="mt-8 text-sm text-white/50">Loading…</p>}
        {error && <p className="mt-8 text-sm text-red-300">{error}</p>}

        {!loading && (
          <>
            <section className="mt-10">
              <h2 className="text-xl font-black" style={{ color: GOLD }}>
                Coaching inquiries ({coaching.length})
              </h2>
              <div className="mt-4 space-y-3">
                {coaching.length === 0 ? (
                  <p className="text-sm text-white/50">No inquiries yet.</p>
                ) : (
                  coaching.map(row => (
                    <div key={row.id} className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-white">
                          {row.name} · {row.email}
                        </div>
                        <select
                          value={row.status}
                          onChange={e => void setStatus(row.id, e.target.value)}
                          className="rounded border border-white/20 bg-[#0F1E30] px-2 py-1 text-xs"
                        >
                          <option value="new">new</option>
                          <option value="contacted">contacted</option>
                          <option value="scheduled">scheduled</option>
                          <option value="won">won</option>
                          <option value="passed">passed</option>
                        </select>
                      </div>
                      <div className="mt-1 text-white/60">
                        {row.interest_type}
                        {row.state ? ` · ${row.state}` : ""} · {new Date(row.created_at).toLocaleString()}
                      </div>
                      {row.message && <p className="mt-2 text-white/80">{row.message}</p>}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-xl font-black" style={{ color: GOLD }}>
                Q&amp;A log ({qa.length})
              </h2>
              <div className="mt-4 space-y-3">
                {qa.map(row => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                    <div className="text-white/55">
                      {row.email} · {new Date(row.created_at).toLocaleString()}
                    </div>
                    <p className="mt-2 font-semibold text-white">Q: {row.question}</p>
                    <p className="mt-2 text-white/75 line-clamp-4">A: {row.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-xl font-black" style={{ color: GOLD }}>
                Report Kit access ({kits.length})
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-white/50">
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Granted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kits.map(row => (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="py-2 pr-4">{row.email}</td>
                        <td className="py-2 pr-4">{row.status}</td>
                        <td className="py-2">{new Date(row.granted_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
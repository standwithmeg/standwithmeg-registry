"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GOLD, INK, PAPER, RED } from "../theme";

type Stats = {
  connected_families: number;
  handles_created: number;
  total_messages: number;
  messages_today: number;
  new_signups_this_week: number;
  top_states: { state: string; count: number }[];
  weekly_growth: { label: string; families: number }[];
};

export default function CircleStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/circle-stats", { cache: "no-store" })
      .then(res => res.json().catch(() => null))
      .then(data => {
        if (!data || typeof data.connected_families !== "number") {
          throw new Error("Could not load stats.");
        }
        setStats(data as Stats);
      })
      .catch(err => setError(err instanceof Error ? err.message : "Could not load stats."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: RED }} />

      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-16">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>
            Connection Circles
          </p>
          <h1 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
            The movement is <em style={{ color: GOLD, fontStyle: "normal" }}>growing</em>.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/60 md:text-base">
            Real-time stats from Stand With Meg&apos;s private community of verified families. Auto-updating, screenshot-ready, and free to share.
          </p>
        </div>

        {loading && (
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 animate-pulse rounded-2xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        )}

        {error && (
          <div className="mx-auto mt-12 max-w-md rounded-2xl p-6 text-center" style={{ backgroundColor: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.35)" }}>
            <p className="text-sm text-red-100">{error}</p>
          </div>
        )}

        {stats && (
          <>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <BigStat value={stats.connected_families} label="Families connected" accent="red" />
              <BigStat value={stats.total_messages} label="Messages sent" accent="gold" />
              <BigStat value={stats.new_signups_this_week} label="New this week" accent="green" />
              <BigStat value={stats.messages_today} label="Messages today" accent="blue" />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
              <div
                className="rounded-2xl p-5 md:p-6"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black">Weekly growth</h2>
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/40">Last 8 weeks</span>
                </div>
                <div className="mt-6">
                  <GrowthChart data={stats.weekly_growth} />
                </div>
              </div>

              <div
                className="rounded-2xl p-5 md:p-6"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <h2 className="text-lg font-black">Top states</h2>
                <p className="mt-1 text-xs text-white/50">Most active circles by state</p>
                <div className="mt-5 space-y-3">
                  {stats.top_states.length === 0 && (
                    <p className="text-sm text-white/50">No state activity yet.</p>
                  )}
                  {stats.top_states.map((s, i) => (
                    <div key={s.state} className="flex items-center gap-3">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black"
                        style={{ backgroundColor: i === 0 ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.08)", color: i === 0 ? GOLD : "white" }}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span>{s.state}</span>
                          <span style={{ color: i === 0 ? GOLD : "white" }}>{s.count.toLocaleString()}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(5, (s.count / Math.max(...stats.top_states.map(x => x.count), 1)) * 100)}%`,
                              backgroundColor: i === 0 ? GOLD : RED,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl p-6 md:flex-row md:p-8"
              style={{ background: "linear-gradient(135deg, rgba(198,61,47,0.18), rgba(201,162,39,0.10))", border: "1px solid rgba(198,61,47,0.30)" }}
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: RED }}>Powered by Stand With Meg</p>
                <p className="mt-1 text-lg font-black">Connection Circles</p>
                <p className="text-sm text-white/60">Verified families. Private handles. Real support.</p>
              </div>
              <Link
                href="/connect"
                className="rounded-xl px-6 py-3 text-sm font-black transition-opacity hover:opacity-90"
                style={{ backgroundColor: RED, color: "white" }}
              >
                Join the community →
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function BigStat({ value, label, accent }: { value: number; label: string; accent: "red" | "gold" | "green" | "blue" }) {
  const colors = {
    red: { text: "#f87171", bg: "rgba(198,61,47,0.10)", border: "rgba(198,61,47,0.30)" },
    gold: { text: GOLD, bg: "rgba(201,162,39,0.10)", border: "rgba(201,162,39,0.25)" },
    green: { text: "#4ade80", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.25)" },
    blue: { text: "#60a5fa", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)" },
  };
  const c = colors[accent];
  return (
    <div
      className="rounded-2xl p-5 text-center md:p-6"
      style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
    >
      <div className="text-4xl font-black tracking-tight md:text-5xl" style={{ color: c.text }}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{label}</div>
    </div>
  );
}

function GrowthChart({ data }: { data: { label: string; families: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.families));
  return (
    <div className="flex h-48 items-end gap-2 md:h-56 md:gap-3">
      {data.map((d, i) => {
        const height = Math.max(4, (d.families / max) * 100);
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="group relative w-full flex-1 rounded-t-lg bg-white/5">
              <div
                className="absolute bottom-0 w-full rounded-t-lg transition-all"
                style={{ height: `${height}%`, backgroundColor: i === data.length - 1 ? RED : GOLD }}
              />
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] font-black opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "white" }}>
                {d.families}
              </div>
            </div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-white/45 md:text-[10px]">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

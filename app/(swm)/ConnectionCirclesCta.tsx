"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GOLD, INK, RED } from "./connect/theme";

type Placement = "report" | "state" | "actors";

type Props = {
  placement?: Placement;
  stateName?: string;
  className?: string;
};

const headlineByPlacement: Record<Placement, string> = {
  report: "Join the private, anonymous community of verified families.",
  state: "Find the families behind the data in your state.",
  actors: "Someone on your case too? Connect without exposing your identity.",
};

type CircleStats = {
  connected_families: number;
  handles_created: number;
  total_messages: number;
  messages_today: number;
};

export function ConnectionCirclesCta({ placement = "report", stateName, className = "" }: Props) {
  const [stats, setStats] = useState<CircleStats>({
    connected_families: 0,
    handles_created: 0,
    total_messages: 0,
    messages_today: 0,
  });

  useEffect(() => {
    fetch("/api/public/circle-stats", { cache: "no-store" })
      .then(res => res.json().catch(() => ({ connected_families: 0 })))
      .then(data =>
        setStats({
          connected_families: typeof data.connected_families === "number" ? data.connected_families : 0,
          handles_created: typeof data.handles_created === "number" ? data.handles_created : 0,
          total_messages: typeof data.total_messages === "number" ? data.total_messages : 0,
          messages_today: typeof data.messages_today === "number" ? data.messages_today : 0,
        })
      )
      .catch(() => setStats(s => s));
  }, []);

  const statItems = [
    { value: stats.connected_families, label: stateName ? `${stateName} families` : "connected" },
    { value: stats.handles_created, label: "handles" },
    { value: stats.messages_today, label: "messages today" },
  ];

  return (
    <section
      className={`overflow-hidden rounded-2xl ${className}`}
      style={{
        border: `1px solid rgba(198,61,47,0.45)`,
        background:
          "linear-gradient(135deg, rgba(198,61,47,0.22) 0%, rgba(201,162,39,0.12) 50%, rgba(15,30,48,0.98) 100%)",
        boxShadow: "0 16px 50px rgba(0,0,0,0.28)",
      }}
    >
      <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]"
              style={{ backgroundColor: "rgba(198,61,47,0.18)", color: RED, border: "1px solid rgba(198,61,47,0.35)" }}
            >
              Connection Circles
            </span>
            <span className="text-[11px] font-bold" style={{ color: "rgba(244,241,234,0.55)" }}>
              Private · Verified · Handle-first
            </span>
          </div>

          <h2 className="mt-3 max-w-2xl text-xl font-black leading-tight text-white md:text-2xl">
            {headlineByPlacement[placement]}
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-snug text-white/72">
            A Facebook-like space for family-court parents. Use a private handle, find others who reported the same court actor, and chat anonymously.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {statItems.map((item, idx) => (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                style={{ backgroundColor: "rgba(0,0,0,0.22)", border: `1px solid rgba(255,255,255,${idx === 0 ? "0.14" : "0.08"})` }}
              >
                <span className="text-base font-black" style={{ color: idx === 0 ? RED : GOLD }}>
                  {item.value.toLocaleString()}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/60">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href="/connect"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-black transition-opacity hover:opacity-90"
              style={{ backgroundColor: RED, color: "white" }}
            >
              Join Connection Circles ↗
            </Link>
            <Link
              href="/survey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-xs font-bold text-white/80 transition-colors hover:text-white"
              style={{ border: "1px solid rgba(255,255,255,0.16)" }}
            >
              Take the survey first
            </Link>
          </div>
        </div>

        <div
          className="hidden items-center justify-center border-t border-white/10 p-5 lg:flex lg:border-l lg:border-t-0"
          style={{ backgroundColor: INK }}
        >
          <div className="w-full rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Preview</div>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black" style={{ backgroundColor: "rgba(198,61,47,0.20)", color: RED }}>
                  H1
                </div>
                <div>
                  <div className="text-xs font-bold text-white">HopefulMom_2024</div>
                  <div className="text-[10px] text-white/45">Shared Judge · TX</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black" style={{ backgroundColor: "rgba(201,162,39,0.18)", color: GOLD }}>
                  D2
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Dad_in_Ohio</div>
                  <div className="text-[10px] text-white/45">Shared GAL · OH</div>
                </div>
              </div>
              <div className="rounded-md p-2 text-[11px] leading-relaxed text-white/60" style={{ backgroundColor: "rgba(0,0,0,0.22)" }}>
                &ldquo;We compared timelines and realized the same evaluator appeared in both cases.&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

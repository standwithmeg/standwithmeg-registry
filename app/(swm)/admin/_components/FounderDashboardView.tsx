"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { colors, shadows } from "../../../../lib/design-tokens";
import type { FounderDashboardData } from "../../../../lib/admin-metrics";

const GOLD = colors.gold.DEFAULT;
const INK = colors.ink.DEFAULT;
const PAPER = colors.paper.DEFAULT;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MetricCard({
  label,
  value,
  sub,
  tone = "gold",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "gold" | "red" | "blue" | "green";
}) {
  const toneMap = {
    gold: { border: `rgba(201,162,39,0.35)`, bg: `rgba(201,162,39,0.08)`, text: GOLD },
    red: { border: `rgba(185,28,28,0.35)`, bg: `rgba(185,28,28,0.08)`, text: "#ef4444" },
    blue: { border: `rgba(59,130,246,0.35)`, bg: `rgba(59,130,246,0.08)`, text: "#60a5fa" },
    green: { border: `rgba(34,197,94,0.35)`, bg: `rgba(34,197,94,0.08)`, text: "#4ade80" },
  };
  const t = toneMap[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        backgroundColor: colors.surface.raised,
        border: `1px solid ${t.border}`,
        boxShadow: shadows.md,
      }}
    >
      <div className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "rgba(244,241,234,0.45)" }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-black" style={{ color: t.text }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>{sub}</div>}
    </motion.div>
  );
}

function SectionCard({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        backgroundColor: colors.surface.DEFAULT,
        border: `1px solid ${colors.hairline.DEFAULT}`,
        boxShadow: shadows.md,
      }}
    >
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: colors.hairline.subtle, backgroundColor: "rgba(30,58,95,0.35)" }}
      >
        <h2 className="font-black text-white text-base tracking-wide">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

export function FounderDashboardView({ data }: { data: FounderDashboardData }) {
  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: GOLD }} />
      <section className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>
              Stand With Meg
            </p>
            <h1 className="mt-2 text-4xl md:text-5xl font-black">Founder Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "rgba(244,241,234,0.6)" }}>
              Real-time view of users, reports, and Connection Circles. Only accessible to the founder account.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/operations"
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.strong}`, color: PAPER }}
            >
              Operations →
            </Link>
            <Link
              href="/admin/connect/hardship"
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.strong}`, color: PAPER }}
            >
              Hardship →
            </Link>
            <Link
              href="/report"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: GOLD, color: colors.ink.DEFAULT }}
            >
              Public Report ↗
            </Link>
          </div>
        </div>

        {/* Users */}
        <div className="mt-10">
          <h2 className="text-lg font-black tracking-wide">Users</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total users" value={data.users.total.toLocaleString()} tone="blue" />
            <MetricCard label="New this week" value={data.users.newThisWeek.toLocaleString()} tone="green" />
            <MetricCard label="New this month" value={data.users.newThisMonth.toLocaleString()} tone="gold" />
            <MetricCard label="Active today" value={data.users.activeToday.toLocaleString()} tone="red" />
          </div>
        </div>

        {/* Reports + Circles */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Reports"
            action={
              <Link href="/admin/operations" className="text-xs font-bold hover:underline" style={{ color: GOLD }}>
                Review in operations →
              </Link>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Total submissions" value={data.reports.total.toLocaleString()} tone="gold" />
              <MetricCard label="Pending approval" value={data.reports.pendingApprovals.toLocaleString()} tone="red" sub="Awaiting admin review" />
              <MetricCard label="This week" value={data.reports.thisWeek.toLocaleString()} tone="blue" />
              <MetricCard label="This month" value={data.reports.thisMonth.toLocaleString()} tone="green" />
            </div>
          </SectionCard>

          <SectionCard
            title="Connection Circles"
            action={
              <Link href="/admin/connect/hardship" className="text-xs font-bold hover:underline" style={{ color: GOLD }}>
                Manage access →
              </Link>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Active access" value={data.circles.activeAccess.toLocaleString()} tone="green" />
              <MetricCard label="Expiring soon" value={data.circles.expiringSoon.toLocaleString()} tone="red" sub="Next 7 days" />
              <MetricCard label="Pseudonyms" value={data.circles.pseudonyms.toLocaleString()} tone="blue" sub="Members with handles" />
              <MetricCard label="Messages this week" value={data.circles.messagesThisWeek.toLocaleString()} tone="gold" />
              <MetricCard label="Pending requests" value={data.circles.pendingRequests.toLocaleString()} tone="blue" />
              <MetricCard label="Accepted intros" value={data.circles.acceptedRequests.toLocaleString()} tone="green" />
            </div>
          </SectionCard>
        </div>

        {/* Recent users */}
        <SectionCard
          title="Recent users"
          action={<span className="text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>Last 50 sign-ups</span>}
          className="mt-8"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: "rgba(244,241,234,0.45)" }}>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Name</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Plan</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">State</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Joined</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {data.users.recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center" style={{ color: "rgba(244,241,234,0.5)" }}>
                      No users yet.
                    </td>
                  </tr>
                )}
                {data.users.recent.map((u, i) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-t"
                    style={{ borderColor: colors.hairline.subtle }}
                  >
                    <td className="py-3 font-semibold text-white">
                      {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="py-3" style={{ color: "rgba(244,241,234,0.7)" }}>{u.email || "—"}</td>
                    <td className="py-3">
                      <span
                        className="inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
                        style={{
                          backgroundColor: u.plan === "basic" ? "rgba(244,241,234,0.08)" : "rgba(201,162,39,0.15)",
                          color: u.plan === "basic" ? "rgba(244,241,234,0.6)" : GOLD,
                        }}
                      >
                        {u.plan || "basic"}
                      </span>
                    </td>
                    <td className="py-3" style={{ color: "rgba(244,241,234,0.7)" }}>{u.state || "—"}</td>
                    <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtDate(u.created_at)}</td>
                    <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtDate(u.last_sign_in_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>
    </main>
  );
}

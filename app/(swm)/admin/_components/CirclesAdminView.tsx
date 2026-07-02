"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { colors, shadows } from "../../../../lib/design-tokens";
import type { CirclesDashboardData, CirclesAccessDetailRow, CircleMember, TopReferrer, PromoStat, CircleMessage, ConnectionRequest, InviteLinkDetail, PromoUsage } from "../../../../lib/admin-metrics";
import type { CircleUserProfile } from "../../../../lib/circle-user-profile";
import { GmailAdminPanel } from "./GmailAdminPanel";
import { AdminCircleChat } from "./AdminCircleChat";

const GOLD = colors.gold.DEFAULT;
const RED = colors.evidence.DEFAULT;
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

function fmtCents(cents: number) {
  return "$" + (cents / 100).toFixed(0);
}

function fmtAgo(iso: string | null) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

function parseActorKeyClient(key: string): { name: string; state: string | null; role: string } | null {
  try {
    const normalized = key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4);
    const decoded = atob(normalized);
    const [name, state, role] = decoded.split("|");
    if (!name || !role) return null;
    return { name, state: state || null, role };
  } catch {
    return null;
  }
}

function MetricCard({
  label,
  value,
  sub,
  accent = "red",
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "red" | "gold" | "green" | "blue";
  onClick?: () => void;
}) {
  const accentMap = {
    red: { border: `rgba(198,61,47,0.45)`, bg: `rgba(198,61,47,0.10)`, text: RED },
    gold: { border: `rgba(201,162,39,0.35)`, bg: `rgba(201,162,39,0.08)`, text: GOLD },
    green: { border: `rgba(34,197,94,0.35)`, bg: `rgba(34,197,94,0.08)`, text: "#4ade80" },
    blue: { border: `rgba(59,130,246,0.35)`, bg: `rgba(59,130,246,0.08)`, text: "#60a5fa" },
  };
  const a = accentMap[accent];
  const isClickable = Boolean(onClick);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`rounded-2xl p-5 ${isClickable ? "cursor-pointer transition-transform hover:scale-[1.02]" : ""}`}
      style={{
        backgroundColor: a.bg,
        border: `1px solid ${a.border}`,
        boxShadow: shadows.md,
      }}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "rgba(244,241,234,0.55)" }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-black" style={{ color: a.text }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>{sub}</div>}
    </motion.div>
  );
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SectionCard({
  title,
  children,
  action,
  className = "",
  id,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.div
      id={id}
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
        style={{ borderColor: colors.hairline.subtle, backgroundColor: "rgba(198,61,47,0.10)" }}
      >
        <h2 className="font-black text-white text-base tracking-wide">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </motion.div>
  );
}

function accessTypeLabel(type: string) {
  const labels: Record<string, string> = {
    supporter_monthly: "Paid $6/mo",
    supporter_annual: "Paid $50/yr",
    hardship: "Hardship (free)",
    sponsored_month: "Sponsored (donation)",
    sponsored_year: "Sponsored (donation)",
    sponsor_pool: "Sponsor pool (donation)",
    promo: "Promo (free)",
  };
  return labels[type] || type;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "fulfilled") {
    return { label: status, color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)" };
  }
  if (s === "pending") {
    return { label: status, color: GOLD, bg: "rgba(201,162,39,0.12)", border: "rgba(201,162,39,0.28)" };
  }
  return { label: status, color: "#fca5a5", bg: "rgba(185,28,28,0.15)", border: "rgba(185,28,28,0.35)" };
}

function memberToDetailRow(member: CircleMember): CirclesAccessDetailRow {
  return {
    id: member.id,
    email: member.email,
    access_type: member.access_type,
    status: member.status,
    granted_at: member.granted_at,
    expires_at: member.expires_at,
    state: member.state,
    handle: member.handle,
    messages_sent: member.messages_sent,
    last_active: member.last_active,
    rooms_active: member.rooms_active,
    room_keys: [],
  };
}

function exportMembersCSV(members: CircleMember[]) {
  const headers = ["Email", "Name", "State", "Access Type", "Status", "Join Date", "Last Active", "Payment Status", "Free Reason"];
  const rows = members.map(m => [
    m.email,
    m.name ?? "",
    m.state ?? "",
    m.access_label,
    m.status,
    fmtDate(m.granted_at),
    fmtDate(m.last_active),
    m.payment_status ?? "",
    m.free_reason ?? "",
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `swm-circle-members-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CirclesAdminView({ data }: { data: CirclesDashboardData }) {
  const [selected, setSelected] = useState<CirclesAccessDetailRow | null>(null);
  const [chatActorKey, setChatActorKey] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [memberSearch, setMemberSearch] = useState("");

  const accessTypeOptions = Array.from(new Set(data.members.map(m => m.access_label))).sort();

  const filteredMembers = data.members.filter(m => {
    const matchesType = memberFilter === "all" || m.access_label === memberFilter;
    const q = memberSearch.trim().toLowerCase();
    const matchesSearch = !q || m.email.toLowerCase().includes(q) || (m.handle ?? "").toLowerCase().includes(q) || (m.state ?? "").toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>
              Stand With Meg — Connection Circles
            </p>
            <h1 className="mt-2 text-4xl md:text-5xl font-black">Circles Admin</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "rgba(244,241,234,0.6)" }}>
              Real-time view of Connection Circles membership, rooms, invites, payments, and sponsored access.
              Founder access only.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.strong}`, color: PAPER }}
            >
              Main Admin →
            </Link>
            <Link
              href="/admin/connect/hardship"
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: RED, color: "white" }}
            >
              Hardship Queue →
            </Link>
          </div>
        </div>

        {/* Users */}
        <div id="circles-users" className="mt-10">
          <h2 className="text-lg font-black tracking-wide" style={{ color: RED }}>Users</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Total Circle users" value={data.users.totalCircleUsers.toLocaleString()} accent="red" onClick={() => scrollToId("circles-users")} />
            <MetricCard label="New signups today" value={data.users.newSignupsToday.toLocaleString()} accent="gold" onClick={() => scrollToId("circles-users")} />
            <MetricCard label="Active access" value={data.users.activeAccess.toLocaleString()} accent="green" onClick={() => scrollToId("circles-users")} />
          </div>
        </div>

        {/* Rooms + Requests */}
        <div id="circles-rooms" className="mt-8 grid gap-6 lg:grid-cols-2">
          <SectionCard title="Rooms & Chat">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Active rooms (30d)" value={data.rooms.activeRooms.toLocaleString()} accent="blue" onClick={() => scrollToId("circles-rooms")} />
              <MetricCard label="Total messages" value={data.rooms.totalMessages.toLocaleString()} accent="gold" onClick={() => scrollToId("circles-messages")} />
              <MetricCard label="Messages (24h)" value={data.rooms.messages24h.toLocaleString()} accent="red" onClick={() => scrollToId("circles-messages")} />
              <MetricCard label="Messages (7d)" value={data.rooms.messages7d.toLocaleString()} accent="green" onClick={() => scrollToId("circles-messages")} />
            </div>
          </SectionCard>

          <SectionCard id="circles-requests" title="Invites & Sponsored Access">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Pending invites" value={data.requests.pendingInvites.toLocaleString()} accent="gold" onClick={() => scrollToId("circles-requests")} />
              <MetricCard label="Accepted intros" value={data.requests.acceptedInvites.toLocaleString()} accent="green" onClick={() => scrollToId("circles-requests")} />
              <MetricCard label="Pending hardship" value={data.requests.pendingHardship.toLocaleString()} accent="red" onClick={() => scrollToId("circles-hardship")} />
              <MetricCard label="Fulfilled hardship" value={data.requests.fulfilledHardship.toLocaleString()} accent="blue" onClick={() => scrollToId("circles-hardship")} />
            </div>
          </SectionCard>
        </div>

        {/* Payments */}
        <SectionCard id="circles-payments" title="Payments" className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard label="$6/month" value={data.payments.monthly.toLocaleString()} accent="red" onClick={() => scrollToId("circles-payments")} />
            <MetricCard label="$50/year" value={data.payments.annual.toLocaleString()} accent="gold" onClick={() => scrollToId("circles-payments")} />
            <MetricCard label="Hardship" value={data.payments.hardship.toLocaleString()} accent="blue" onClick={() => scrollToId("circles-hardship")} />
            <MetricCard label="Sponsored" value={data.payments.sponsored.toLocaleString()} accent="green" onClick={() => scrollToId("circles-payments")} />
            <MetricCard label="Promo" value={data.payments.promo.toLocaleString()} accent="gold" onClick={() => scrollToId("circles-promos")} />
            <MetricCard label="Est. MRR" value={fmtCents(data.payments.mrrCents)} accent="red" sub="monthly recurring" onClick={() => scrollToId("circles-payments")} />
          </div>
        </SectionCard>

        {/* Referrals */}
        <SectionCard id="circles-referrals" title="Referrals" className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Total referrals" value={data.referrals.total.toLocaleString()} accent="red" onClick={() => scrollToId("circles-referrals")} />
            <MetricCard label="Pending" value={data.referrals.pending.toLocaleString()} accent="gold" onClick={() => scrollToId("circles-referrals")} />
            <MetricCard label="Paid & rewarded" value={data.referrals.rewarded.toLocaleString()} accent="green" onClick={() => scrollToId("circles-referrals")} />
            <MetricCard label="Conversion rate" value={`${data.referrals.conversionRate}%`} accent="blue" onClick={() => scrollToId("circles-referrals")} />
            <MetricCard label="Free months earned" value={data.referrals.monthsRewarded.toLocaleString()} accent="gold" sub="by referrers" onClick={() => scrollToId("circles-referrals")} />
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-black uppercase tracking-wide text-white/70">Top referrers</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: "rgba(244,241,234,0.45)" }}>
                    <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
                    <th className="pb-3 font-bold uppercase text-xs tracking-wide">Referrals</th>
                    <th className="pb-3 font-bold uppercase text-xs tracking-wide">Rewarded</th>
                    <th className="pb-3 font-bold uppercase text-xs tracking-wide">Months earned</th>
                    <th className="pb-3 font-bold uppercase text-xs tracking-wide">Last referral</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.topReferrers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center" style={{ color: "rgba(244,241,234,0.5)" }}>
                        No referrals yet.
                      </td>
                    </tr>
                  )}
                  {data.referrals.topReferrers.map((row: TopReferrer, i: number) => (
                    <motion.tr
                      key={row.email}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-t"
                      style={{ borderColor: colors.hairline.subtle }}
                    >
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.7)" }}>{row.email}</td>
                      <td className="py-3 text-white">{row.referrals}</td>
                      <td className="py-3 text-white">{row.rewarded}</td>
                      <td className="py-3 text-white">{row.monthsEarned}</td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtAgo(row.lastReferralAt)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        {/* Promo codes */}
        <SectionCard id="circles-promos" title="Promo codes" className="mt-8">
          <div className="space-y-3">
            {data.promos.length === 0 && (
              <p className="text-sm text-white/50">No promo codes yet.</p>
            )}
            {data.promos.map((promo: PromoStat) => (
              <div key={promo.code} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-white">{promo.code}</div>
                    {promo.requiresApproval && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid ${GOLD}` }}>Approval required</span>
                    )}
                  </div>
                  <div className="text-xs text-white/50">
                    {promo.active ? "Active" : "Inactive"}
                    {promo.expiresAt ? ` · expires ${fmtDate(promo.expiresAt)}` : ""}
                    {promo.disabled ? " · disabled" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black" style={{ color: GOLD }}>{promo.uses}</div>
                  <div className="text-[10px] text-white/45">uses</div>
                </div>
              </div>
            ))}
          </div>
          {data.promos.some(p => p.code.toUpperCase() === "MEGSQUAD") && (
            <div className="mt-4 text-xs text-white/50">
              Share: <code className="text-white/70">https://my.standwithmeg.com/connect/promo?code=MEGSQUAD</code>
            </div>
          )}
        </SectionCard>

        {/* Pending promo requests */}
        <PromoRequestsSection />

        {/* Messages */}
        <div id="circles-messages">
          <MessagesSection messages={data.recentMessages} onOpenChat={setChatActorKey} />
        </div>

        {/* Connection requests */}
        <div id="circles-requests">
          <ConnectionRequestsSection requests={data.connectionRequests} />
        </div>

        {/* Invite links */}
        <div id="circles-invite-links">
          <InviteLinksSection links={data.inviteLinks} />
        </div>

        {/* Promo usage detail */}
        <PromoUsageSection usages={data.promoUsages} />

        {/* Gmail */}
        <GmailAdminPanel />

        {/* Invite parents by email */}
        <InviteParentsSection />

        {/* All Circle Members */}
        <SectionCard
          id="circles-members"
          title="All Circle Members"
          className="mt-8"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search email, handle, state"
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
              />
              <select
                value={memberFilter}
                onChange={e => setMemberFilter(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
              >
                <option value="all">All types</option>
                {accessTypeOptions.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => exportMembersCSV(filteredMembers)}
                className="rounded-lg px-3 py-1.5 text-xs font-black"
                style={{ backgroundColor: GOLD, color: INK }}
              >
                Export CSV
              </button>
            </div>
          }
        >
          <div className="mb-3 text-xs text-white/50">
            Showing {filteredMembers.length.toLocaleString()} of {data.members.length.toLocaleString()} member records
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: "rgba(244,241,234,0.45)" }}>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">State</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Handle</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Access Type</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Status</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Join Date</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center" style={{ color: "rgba(244,241,234,0.5)" }}>
                      No members match this filter.
                    </td>
                  </tr>
                )}
                {filteredMembers.map((row, i) => {
                  const badge = statusBadge(row.status);
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-t cursor-pointer transition-colors hover:bg-white/5"
                      style={{ borderColor: colors.hairline.subtle }}
                      onClick={() => setSelected(memberToDetailRow(row))}
                    >
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.85)" }}>{row.email}</td>
                      <td className="py-3">
                        {row.state ? (
                          <span className="text-white">{row.state}</span>
                        ) : (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "#fca5a5", border: "1px solid rgba(185,28,28,0.35)" }}>
                            No state / survey
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-white">{row.handle ?? "—"}</td>
                      <td className="py-3 text-white">{row.access_label}</td>
                      <td className="py-3">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
                          style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtDate(row.granted_at)}</td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtAgo(row.last_active)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Recent access */}
        <SectionCard
          title="Recent access grants"
          action={<span className="text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>Click a row for details · Last 25</span>}
          className="mt-8"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: "rgba(244,241,234,0.45)" }}>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">State</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Type</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Status</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Granted</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Expires</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAccess.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center" style={{ color: "rgba(244,241,234,0.5)" }}>
                      No access records yet.
                    </td>
                  </tr>
                )}
                {data.recentAccess.map((row, i) => {
                  const badge = statusBadge(row.status);
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-t cursor-pointer transition-colors hover:bg-white/5"
                      style={{ borderColor: colors.hairline.subtle }}
                      onClick={() => setSelected(row)}
                    >
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.7)" }}>{row.email}</td>
                      <td className="py-3 text-white">{row.state ?? "—"}</td>
                      <td className="py-3 text-white">{accessTypeLabel(row.access_type)}</td>
                      <td className="py-3">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
                          style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtDate(row.granted_at)}</td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtDate(row.expires_at)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Recent hardship */}
        <SectionCard
          title="Hardship requests"
          action={
            <Link href="/admin/connect/hardship" className="text-xs font-bold hover:underline" style={{ color: RED }}>
              Manage →
            </Link>
          }
          className="mt-8"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: "rgba(244,241,234,0.45)" }}>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Note</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Status</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Requested</th>
                  <th className="pb-3 font-bold uppercase text-xs tracking-wide">Decided</th>
                </tr>
              </thead>
              <tbody>
                {data.recentHardship.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center" style={{ color: "rgba(244,241,234,0.5)" }}>
                      No hardship requests yet.
                    </td>
                  </tr>
                )}
                {data.recentHardship.map((row, i) => {
                  const badge = statusBadge(row.status);
                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-t"
                      style={{ borderColor: colors.hairline.subtle }}
                    >
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.7)" }}>{row.email}</td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{row.request_note || "—"}</td>
                      <td className="py-3">
                        <span
                          className="inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
                          style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>{fmtDate(row.requested_at)}</td>
                      <td className="py-3" style={{ color: "rgba(244,241,234,0.6)" }}>
                        {row.decided_at ? fmtDate(row.decided_at) : "—"}
                        {row.decided_by && <span className="ml-1 text-xs">by {row.decided_by}</span>}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>

      <AnimatePresence>
        {selected && (
          <AccessDetailPanel row={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      {chatActorKey && (
        <AdminCircleChat actorKey={chatActorKey} onClose={() => setChatActorKey(null)} />
      )}
    </main>
  );
}

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

function InviteParentsSection() {
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendInvites(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const list = emails.split(",").map(s => s.trim()).filter(Boolean);
    if (list.length === 0) {
      setError("Enter at least one email address.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/circles/invite-parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send invites.");
        return;
      }
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? [] });
      setEmails("");
      setNote("");
    } finally {
      setLoading(false);
    }
  }

  const defaultBody = `Hi,

You came to mind because I think Connection Circles could help you find other parents who have been through the same courtroom.

Connection Circles are private rooms for Stand With Meg survey submitters who reported the same court actor. You stay anonymous unless both sides agree to connect.

If you want in:
1. Take the survey (if you haven't yet): https://my.standwithmeg.com/survey
2. Then log in with that same email: https://my.standwithmeg.com/connect

No pressure — just wanted you to know this exists.

Meg
Stand With Meg`;

  return (
    <SectionCard id="circles-invite" title="Invite parents by email" className="mt-8">
      <p className="text-sm text-white/60">
        Send a short, personal invite email. Enter one or more emails separated by commas.
      </p>
      <form onSubmit={sendInvites} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-bold text-white/80">Parent emails</label>
          <textarea
            value={emails}
            onChange={e => setEmails(e.target.value)}
            placeholder="parent1@example.com, parent2@example.com"
            rows={3}
            className="mt-2 w-full rounded-lg bg-white/5 px-4 py-3 text-sm text-white outline-none"
            style={{ border: `1px solid ${colors.hairline.subtle}` }}
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-white/80">Personal note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="I saw your story and thought of you..."
            rows={3}
            className="mt-2 w-full rounded-lg bg-white/5 px-4 py-3 text-sm text-white outline-none"
            style={{ border: `1px solid ${colors.hairline.subtle}` }}
          />
        </div>
        <div className="rounded-xl bg-black/20 p-4 text-xs text-white/50">
          <p className="font-bold text-white/70">Email preview:</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{defaultBody.replace("Hi,", note ? `Hi,\n\n${note}` : "Hi,")}</pre>
        </div>
        {error && <div className="rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>}
        {result && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Sent {result.sent} invite{result.sent === 1 ? "" : "s"}.
            {result.failed.length > 0 && ` Failed: ${result.failed.join(", ")}`}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-5 py-2.5 text-sm font-black disabled:opacity-60"
          style={{ backgroundColor: RED, color: "white" }}
        >
          {loading ? "Sending..." : "Send invites"}
        </button>
      </form>
    </SectionCard>
  );
}

function PromoRequestsSection() {
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
              {pending.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
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
                </motion.tr>
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
              {decided.map((row, i) => {
                const badge = statusBadge(row.status);
                return (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-t"
                    style={{ borderColor: colors.hairline.subtle }}
                  >
                    <td className="py-2" style={{ color: "rgba(244,241,234,0.7)" }}>{row.email}</td>
                    <td className="py-2 text-white">{row.code}</td>
                    <td className="py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2" style={{ color: "rgba(244,241,234,0.5)" }}>{fmtAgo(row.decided_at)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function MessagesSection({ messages, onOpenChat }: { messages: CircleMessage[]; onOpenChat: (actorKey: string) => void }) {
  const [filter, setFilter] = useState<"all" | "active" | "deleted">("all");
  const [roomFilter, setRoomFilter] = useState("");

  const filtered = messages.filter(m => {
    if (filter === "active" && m.deleted_at) return false;
    if (filter === "deleted" && !m.deleted_at) return false;
    if (!roomFilter.trim()) return true;
    const q = roomFilter.toLowerCase();
    const room = parseActorKeyClient(m.actor_key);
    const roomText = room ? `${room.name} ${room.state ?? ""} ${room.role}`.toLowerCase() : m.actor_key.toLowerCase();
    return roomText.includes(q) || m.actor_key.toLowerCase().includes(q);
  });

  return (
    <SectionCard
      title={`Messages · ${messages.length} recent`}
      className="mt-8"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            placeholder="Filter room/actor"
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as "all" | "active" | "deleted")}
            className="rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      }
    >
      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-white/50">No messages match this filter.</p>}
        {filtered.map((m, i) => {
          const room = parseActorKeyClient(m.actor_key);
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.01 }}
              onClick={() => onOpenChat(m.actor_key)}
              className="cursor-pointer rounded-xl p-3 transition-colors hover:bg-white/[0.07]"
              style={{
                backgroundColor: m.deleted_at ? "rgba(185,28,28,0.08)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${m.deleted_at ? "rgba(185,28,28,0.25)" : colors.hairline.subtle}`,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "rgba(244,241,234,0.5)" }}>
                <span className="font-bold text-white/80">{m.sender_handle ?? m.sender_email}</span>
                <span>{room ? `${room.name} · ${room.role}${room.state ? ` · ${room.state}` : ""}` : m.actor_key}</span>
                <span>{fmtAgo(m.created_at)}</span>
              </div>
              <p className={`mt-2 text-sm whitespace-pre-wrap ${m.deleted_at ? "text-white/50 line-through" : "text-white/90"}`}>{m.body}</p>
              {m.deleted_at && (
                <p className="mt-1 text-xs text-red-300">
                  Deleted by {m.deleted_by || "unknown"} · {fmtAgo(m.deleted_at)}
                </p>
              )}
              <div className="mt-2 flex items-center justify-end gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/40">Click to open side chat</span>
                <Link
                  href={`/admin/circles/${encodeURIComponent(m.actor_key)}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] font-bold uppercase tracking-wide text-amber-300/80 hover:text-amber-300"
                >
                  Open full page →
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ConnectionRequestsSection({ requests }: { requests: ConnectionRequest[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const statusCounts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filtered = statusFilter === "all" ? requests : requests.filter(r => r.status === statusFilter);

  return (
    <SectionCard
      title={`Connection requests · ${requests.length}`}
      className="mt-8"
      action={
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
        >
          {["all", "pending", "accepted", "declined", "withdrawn", "expired"].map(s => (
            <option key={s} value={s}>
              {s} ({statusCounts[s] ?? 0})
            </option>
          ))}
        </select>
      }
    >
      <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-white/50">No requests match this filter.</p>}
        {filtered.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.01 }}
            className="rounded-xl p-3"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">
                {r.requester_handle} → {r.recipient_handle}
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-1 text-xs text-white/50">
              {r.actor_name} · {r.actor_role}{r.actor_state ? ` · ${r.actor_state}` : ""}
            </div>
            {r.requester_message && (
              <p className="mt-2 rounded-lg bg-black/20 p-2 text-sm text-white/75">&ldquo;{r.requester_message}&rdquo;</p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/40">
              <span>{fmtAgo(r.created_at)}</span>
              {r.decided_at && <span>Decided {fmtAgo(r.decided_at)}</span>}
              {r.intro_sent_at && <span>Intro email sent {fmtAgo(r.intro_sent_at)}</span>}
            </div>
          </motion.div>
        ))}
      </div>
    </SectionCard>
  );
}

function InviteLinksSection({ links }: { links: InviteLinkDetail[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filtered = statusFilter === "all" ? links : links.filter(l => l.status === statusFilter);

  return (
    <SectionCard
      title={`Invite links · ${links.length}`}
      className="mt-8"
      action={
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "rgba(244,241,234,0.45)" }}>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Inviter</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Token</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Used</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Remaining</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Status</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Created</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-white/50">No invite links match.</td>
              </tr>
            )}
            {filtered.map((l, i) => (
              <motion.tr
                key={l.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="border-t"
                style={{ borderColor: colors.hairline.subtle }}
              >
                <td className="py-3 text-white/80">{l.inviter_email}</td>
                <td className="py-3 font-mono text-xs text-white/60">{l.token.slice(0, 16)}…</td>
                <td className="py-3 text-white">{l.used_count}</td>
                <td className="py-3 text-white">{l.remaining_uses == null ? "∞" : l.remaining_uses}</td>
                <td className="py-3"><StatusBadge status={l.status} /></td>
                <td className="py-3 text-white/50">{fmtDate(l.created_at)}</td>
                <td className="py-3 text-white/50">{fmtDate(l.expires_at)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function PromoUsageSection({ usages }: { usages: PromoUsage[] }) {
  const [codeFilter, setCodeFilter] = useState<string>("all");
  const codes = Array.from(new Set(usages.map(u => u.promo_code.toUpperCase()))).sort();
  const filtered = codeFilter === "all" ? usages : usages.filter(u => u.promo_code.toUpperCase() === codeFilter);

  return (
    <SectionCard
      title={`Promo code usage · ${usages.length} redemptions`}
      className="mt-8"
      action={
        <select
          value={codeFilter}
          onChange={e => setCodeFilter(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
        >
          <option value="all">All codes</option>
          {codes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: "rgba(244,241,234,0.45)" }}>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Email</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Code</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Access type</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Granted</th>
              <th className="pb-3 font-bold uppercase text-xs tracking-wide">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-white/50">No promo redemptions match.</td>
              </tr>
            )}
            {filtered.map((u, i) => (
              <motion.tr
                key={`${u.email}-${u.granted_at}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                className="border-t"
                style={{ borderColor: colors.hairline.subtle }}
              >
                <td className="py-3 text-white/80">{u.email}</td>
                <td className="py-3 font-bold" style={{ color: GOLD }}>{u.promo_code.toUpperCase()}</td>
                <td className="py-3 text-white/70">{accessTypeLabel(u.access_type)}</td>
                <td className="py-3 text-white/50">{fmtDate(u.granted_at)}</td>
                <td className="py-3 text-white/50">{fmtDate(u.expires_at)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function AccessDetailPanel({ row, onClose }: { row: CirclesAccessDetailRow; onClose: () => void }) {
  const [profile, setProfile] = useState<CircleUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "activity" | "messages" | "survey" | "financial" | "invites" | "referrals" | "audit" | "moderation">("overview");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/circle-user/${encodeURIComponent(row.email)}`, { cache: "no-store" })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Could not load profile.");
        return data as CircleUserProfile;
      })
      .then(data => {
        if (cancelled) return;
        setProfile(data);
        setNote(data.moderation.admin_note || "");
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [row.email]);

  async function saveNote() {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/circle-user/${encodeURIComponent(row.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Save failed");
      setProfile(prev => prev ? { ...prev, moderation: { ...prev.moderation, admin_note: note } } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingNote(false);
    }
  }

  function exportData() {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swm-user-${profile.email.replace(/[^a-z0-9]/gi, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-5xl overflow-y-auto border-l"
        style={{
          backgroundColor: colors.surface.DEFAULT,
          borderColor: colors.hairline.strong,
        }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-6 py-5" style={{ backgroundColor: colors.surface.DEFAULT, borderColor: colors.hairline.strong }}>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: RED }}>Member CRM profile</p>
            <h2 className="mt-1 break-all text-2xl font-black text-white">{row.email}</h2>
            {!loading && !error && profile && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/55">
                  {profile.state ?? "No state"} · Joined {fmtDate(profile.join_date)} · {accessTypeLabel(profile.access.current_type || "—")}
                </span>
                {profile.surveys.length === 0 && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "#fca5a5", border: "1px solid rgba(185,28,28,0.35)" }}>
                    No survey on file
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={exportData}
              disabled={!profile}
              className="rounded-lg px-3 py-2 text-xs font-black disabled:opacity-40"
              style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.35)` }}
            >
              Export user data
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs font-bold transition-colors hover:bg-white/10"
              style={{ border: `1px solid ${colors.hairline.strong}` }}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b px-6 py-3" style={{ borderColor: colors.hairline.subtle, backgroundColor: "rgba(0,0,0,0.15)" }}>
          {(["overview", "activity", "messages", "survey", "financial", "invites", "referrals", "audit", "moderation"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-lg px-3 py-1.5 text-xs font-black capitalize transition-colors"
              style={{
                backgroundColor: tab === t ? RED : "transparent",
                color: tab === t ? "white" : "rgba(244,241,234,0.65)",
                border: `1px solid ${tab === t ? RED : colors.hairline.subtle}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-6 py-6">
          {loading && (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              <div className="h-48 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            </div>
          )}

          {error && (
            <div className="rounded-xl p-5" style={{ backgroundColor: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.35)" }}>
              <p className="text-sm text-red-100">{error}</p>
            </div>
          )}

          {!loading && !error && profile && (
            <>
              {tab === "overview" && <OverviewTab profile={profile} />}
              {tab === "activity" && <ActivityTab profile={profile} />}
              {tab === "messages" && <UserMessagesTab profile={profile} />}
              {tab === "survey" && <SurveyTab profile={profile} />}
              {tab === "financial" && <FinancialTab profile={profile} />}
              {tab === "invites" && <InvitesTab profile={profile} />}
              {tab === "referrals" && <ReferralsTab profile={profile} />}
              {tab === "audit" && <AuditTab profile={profile} />}
              {tab === "moderation" && (
                <ModerationTab
                  profile={profile}
                  note={note}
                  setNote={setNote}
                  savingNote={savingNote}
                  onSave={saveNote}
                />
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${colors.hairline.subtle}` }}>
      <h3 className="text-sm font-black uppercase tracking-wide text-white/90">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function KVGrid({ items }: { items: { label: string; value: React.ReactNode; accent?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(item => (
        <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
          <div className="text-[10px] font-black uppercase tracking-wider text-white/45">{item.label}</div>
          <div className="mt-1 text-sm font-bold" style={{ color: (item.accent as string) || "#f4f1ea" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const b = statusBadge(status);
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ backgroundColor: b.bg, color: b.color, border: `1px solid ${b.border}` }}>
      {b.label}
    </span>
  );
}

function OverviewTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Basic info">
        <KVGrid items={[
          { label: "Email", value: profile.email },
          { label: "State", value: profile.state ?? "—" },
          { label: "Handle", value: profile.handle ?? "—" },
          { label: "Join date", value: fmtDate(profile.join_date) },
          { label: "Access type", value: accessTypeLabel(profile.access.current_type || "—") },
          { label: "Payment status", value: profile.subscription
            ? <a href={profile.subscription.dashboard_url} target="_blank" rel="noreferrer" className="underline" style={{ color: GOLD }}>{profile.subscription.status}</a>
            : <StatusBadge status={profile.access.status || "—"} />
          },
          { label: "Next billing", value: profile.subscription?.next_billing_date ? fmtDate(profile.subscription.next_billing_date) : "—" },
          { label: "Free months earned", value: profile.referrals.months_earned },
          { label: "Expires", value: profile.access.expires_at ? fmtDate(profile.access.expires_at) : "Never" },
        ]} />
      </Section>
      <Section title="Engagement snapshot">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatBox value={profile.activity.total_messages.toLocaleString()} label="Messages sent" accent="gold" />
          <StatBox value={profile.activity.active_days.toLocaleString()} label="Active days" accent="red" />
          <StatBox value={profile.activity.rooms.length.toLocaleString()} label="Rooms active" accent="blue" />
          <StatBox value={fmtAgo(profile.activity.last_active)} label="Last active" accent="green" />
        </div>
      </Section>
      <Section title="Recent access history">
        <div className="space-y-2">
          {profile.access.history.slice(0, 5).map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">{accessTypeLabel(a.access_type)}</div>
                <div className="text-xs text-white/50">{fmtDate(a.granted_at)} · {a.expires_at ? `expires ${fmtDate(a.expires_at)}` : "no expiry"}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
          {profile.access.history.length === 0 && <p className="text-sm text-white/50">No access records.</p>}
        </div>
      </Section>
    </>
  );
}

function ActivityTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Activity & engagement">
        <KVGrid items={[
          { label: "Total messages", value: profile.activity.total_messages.toLocaleString() },
          { label: "Last active", value: profile.activity.last_active ? fmtDate(profile.activity.last_active) : "—" },
          { label: "Active days", value: profile.activity.active_days.toLocaleString() },
          { label: "Rooms active", value: profile.activity.rooms.length.toLocaleString() },
        ]} />
      </Section>
      <Section title="Rooms they're active in">
        <div className="space-y-2">
          {profile.activity.rooms.map(room => (
            <div key={room.actor_key} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">{room.name}</div>
                <div className="text-xs text-white/50">{room.role} · {room.state ?? "Unknown state"}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black" style={{ color: GOLD }}>{room.messages}</div>
                <div className="text-[10px] text-white/45">msgs · {fmtAgo(room.last_active)}</div>
              </div>
            </div>
          ))}
          {profile.activity.rooms.length === 0 && <p className="text-sm text-white/50">No room activity yet.</p>}
        </div>
      </Section>
    </>
  );
}

function SurveyTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      {profile.surveys.map(survey => (
        <Section key={survey.id} title={`Survey submission · ${fmtDate(survey.created_at)}`}>
          <KVGrid items={[
            { label: "Name", value: `${survey.first_name || ""} ${survey.last_name || ""}`.trim() || "—" },
            { label: "State / jurisdiction", value: survey.state_of_occurrence ?? "—" },
            { label: "County", value: survey.county ?? "—" },
            { label: "Case year", value: survey.case_year ?? "—" },
          ]} />
          <div className="mt-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-white/55">Court actors reported</h4>
            <div className="mt-2 space-y-2">
              {survey.court_actors.map((actor, i) => (
                <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
                  <div className="text-sm font-bold text-white">{actor.name}</div>
                  <div className="text-xs text-white/50">{actor.role} · {actor.state ?? "Unknown state"}{actor.county ? ` · ${actor.county}` : ""}</div>
                </div>
              ))}
              {survey.court_actors.length === 0 && <p className="text-sm text-white/50">No court actors recorded.</p>}
            </div>
          </div>
        </Section>
      ))}
      {profile.surveys.length === 0 && (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${colors.hairline.subtle}` }}>
          <p className="text-sm text-white/50">No survey submissions found for this email.</p>
        </div>
      )}
    </>
  );
}

function FinancialTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <Section title="Financial history">
      <div className="space-y-2">
        {profile.financial.map(f => (
          <div key={`${f.kind}-${f.id}`} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
            <div>
              <div className="text-sm font-bold text-white">{f.description}</div>
              <div className="text-xs text-white/50">{fmtDate(f.date)} · {f.kind}</div>
            </div>
            <div className="text-right">
              {f.amount_cents != null ? (
                <div className="text-sm font-black" style={{ color: GOLD }}>${(f.amount_cents / 100).toFixed(0)}</div>
              ) : (
                <div className="text-xs text-white/45">No amount</div>
              )}
            </div>
          </div>
        ))}
        {profile.financial.length === 0 && <p className="text-sm text-white/50">No financial records.</p>}
      </div>
    </Section>
  );
}

function InvitesTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Referral summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox value={profile.invites.generated.length.toLocaleString()} label="Links generated" accent="red" />
          <StatBox value={profile.invites.total_uses.toLocaleString()} label="Link uses" accent="gold" />
          <StatBox value={profile.invites.accepted_count.toLocaleString()} label="Paid & rewarded" accent="green" />
        </div>
      </Section>
      <Section title="Rewards earned">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox value={profile.invites.pending.toLocaleString()} label="Pending referrals" accent="gold" />
          <StatBox value={profile.invites.rewarded.toLocaleString()} label="Rewarded referrals" accent="green" />
          <StatBox value={profile.invites.months_earned.toLocaleString()} label="Free months earned" accent="blue" />
        </div>
      </Section>
      <Section title="Invite links">
        <div className="space-y-2">
          {profile.invites.generated.map(link => (
            <div key={link.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white font-mono text-xs">{link.token.slice(0, 16)}…</div>
                <div className="text-xs text-white/50">Created {fmtDate(link.created_at)} · Expires {fmtDate(link.expires_at)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black" style={{ color: GOLD }}>
                  {link.remaining_uses == null ? `${link.used_count} used` : `${link.used_count}/${link.used_count + link.remaining_uses}`}
                </div>
                <div className="text-[10px] text-white/45">{link.remaining_uses == null ? "unlimited" : "used"}</div>
              </div>
            </div>
          ))}
          {profile.invites.generated.length === 0 && <p className="text-sm text-white/50">No invite links generated yet.</p>}
        </div>
      </Section>
    </>
  );
}

function ModerationTab({ profile, note, setNote, savingNote, onSave }: {
  profile: CircleUserProfile;
  note: string;
  setNote: (v: string) => void;
  savingNote: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <Section title="Admin notes">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={5}
          className="w-full rounded-xl bg-white/5 p-3 text-sm text-white outline-none"
          style={{ border: `1px solid ${colors.hairline.subtle}` }}
          placeholder="Private founder-only notes about this member..."
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={savingNote}
            className="rounded-lg px-4 py-2 text-xs font-black disabled:opacity-50"
            style={{ backgroundColor: RED, color: "white" }}
          >
            {savingNote ? "Saving..." : "Save note"}
          </button>
          {profile.moderation.admin_note && <span className="text-xs text-white/50">Last saved note loaded</span>}
        </div>
      </Section>
      <Section title="Removed / deleted messages">
        <div className="space-y-2">
          {profile.moderation.deleted_messages.map(m => (
            <div key={m.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(185,28,28,0.08)", border: "1px solid rgba(185,28,28,0.25)" }}>
              <p className="text-sm text-white/80">{m.body}</p>
              <p className="mt-1 text-xs text-white/45">Deleted {fmtDate(m.deleted_at)} by {m.deleted_by || "system"}</p>
            </div>
          ))}
          {profile.moderation.deleted_messages.length === 0 && <p className="text-sm text-white/50">No deleted messages.</p>}
        </div>
      </Section>
      <Section title="Reports">
        <p className="text-sm text-white/50">No reports recorded for this member.</p>
      </Section>
    </>
  );
}

function ReferralsTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Referral summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox value={profile.referrals.made.length.toLocaleString()} label="Referrals made" accent="red" />
          <StatBox value={profile.referrals.received.length.toLocaleString()} label="Referrals received" accent="gold" />
          <StatBox value={profile.referrals.months_earned.toLocaleString()} label="Free months earned" accent="green" />
        </div>
      </Section>
      <Section title="Referrals made">
        <div className="space-y-2">
          {profile.referrals.made.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">{r.other_email}</div>
                <div className="text-xs text-white/50">Created {fmtDate(r.created_at)}</div>
              </div>
              <div className="text-right">
                <StatusBadge status={r.status} />
                {r.rewarded_at && <div className="mt-1 text-[10px] text-white/45">Rewarded {fmtDate(r.rewarded_at)}</div>}
              </div>
            </div>
          ))}
          {profile.referrals.made.length === 0 && <p className="text-sm text-white/50">No referrals made yet.</p>}
        </div>
      </Section>
      <Section title="Referrals received">
        <div className="space-y-2">
          {profile.referrals.received.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">From {r.other_email}</div>
                <div className="text-xs text-white/50">Created {fmtDate(r.created_at)}</div>
              </div>
              <div className="text-right">
                <StatusBadge status={r.status} />
                {r.completed_at && <div className="mt-1 text-[10px] text-white/45">Completed {fmtDate(r.completed_at)}</div>}
              </div>
            </div>
          ))}
          {profile.referrals.received.length === 0 && <p className="text-sm text-white/50">No referrals received yet.</p>}
        </div>
      </Section>
    </>
  );
}

function UserMessagesTab({ profile }: { profile: CircleUserProfile }) {
  const [roomFilter, setRoomFilter] = useState("");
  const messages = profile.activity.messages;
  const filtered = messages.filter(m => {
    if (!roomFilter.trim()) return true;
    const room = parseActorKeyClient(m.actor_key);
    const text = room ? `${room.name} ${room.state ?? ""} ${room.role}`.toLowerCase() : m.actor_key.toLowerCase();
    return text.includes(roomFilter.toLowerCase());
  });

  return (
    <>
      <Section title="Recent messages">
        <input
          type="text"
          value={roomFilter}
          onChange={e => setRoomFilter(e.target.value)}
          placeholder="Filter by room/actor"
          className="mb-4 w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
        />
        <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="text-sm text-white/50">No messages.</p>}
          {filtered.map(m => {
            const room = parseActorKeyClient(m.actor_key);
            return (
              <div key={m.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-white/50">
                  <span>{room ? `${room.name} · ${room.role}${room.state ? ` · ${room.state}` : ""}` : m.actor_key}</span>
                  <span>{fmtAgo(m.created_at)}</span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap text-white/90">{m.body}</p>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function AuditTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <Section title="Audit log">
      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
        {profile.audit.length === 0 && <p className="text-sm text-white/50">No audit events.</p>}
        {profile.audit.map(a => (
          <div key={a.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-white/50">
              <span className="font-bold text-white/80">{a.event}</span>
              <span>{fmtAgo(a.created_at)}</span>
            </div>
            {a.detail && Object.keys(a.detail).length > 0 && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 text-xs text-white/70">{JSON.stringify(a.detail, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function StatBox({ value, label, accent }: { value: string | number; label: string; accent: "red" | "gold" | "green" | "blue" }) {
  const map = {
    red: { text: "#f87171", bg: "rgba(198,61,47,0.10)", border: "rgba(198,61,47,0.30)" },
    gold: { text: GOLD, bg: "rgba(201,162,39,0.10)", border: "rgba(201,162,39,0.25)" },
    green: { text: "#4ade80", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.25)" },
    blue: { text: "#60a5fa", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)" },
  };
  const c = map[accent];
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
      <div className="text-2xl font-black" style={{ color: c.text }}>{value}</div>
      <div className="text-[10px] font-black uppercase tracking-wider text-white/55">{label}</div>
    </div>
  );
}


"use client";

import { useState } from "react";
import { colors } from "../../../../../lib/design-tokens";
import type { InviteLinkDetail } from "../../../../../lib/admin-metrics";
import { SectionCard } from "./SectionCard";
import { fmtDate, StatusBadge } from "./shared";

export function InviteLinksSection({ links }: { links: InviteLinkDetail[] }) {
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
            {filtered.map((l) => (
              <tr
                key={l.id}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

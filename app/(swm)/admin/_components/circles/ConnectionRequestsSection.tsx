"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { colors } from "../../../../../lib/design-tokens";
import type { ConnectionRequest } from "../../../../../lib/admin-metrics";
import { SectionCard } from "./SectionCard";
import { fmtAgo, StatusBadge } from "./shared";

export function ConnectionRequestsSection({ requests }: { requests: ConnectionRequest[] }) {
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

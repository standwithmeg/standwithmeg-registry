"use client";

import { useState } from "react";
import { colors } from "../../../../../lib/design-tokens";
import type { PromoUsage } from "../../../../../lib/admin-metrics";
import { SectionCard } from "./SectionCard";
import { accessTypeLabel, fmtDate, GOLD } from "./shared";

export function PromoUsageSection({ usages }: { usages: PromoUsage[] }) {
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
            {filtered.map((u) => (
              <tr
                key={`${u.email}-${u.granted_at}`}
                className="border-t"
                style={{ borderColor: colors.hairline.subtle }}
              >
                <td className="py-3 text-white/80">{u.email}</td>
                <td className="py-3 font-bold" style={{ color: GOLD }}>{u.promo_code.toUpperCase()}</td>
                <td className="py-3 text-white/70">{accessTypeLabel(u.access_type)}</td>
                <td className="py-3 text-white/50">{fmtDate(u.granted_at)}</td>
                <td className="py-3 text-white/50">{fmtDate(u.expires_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

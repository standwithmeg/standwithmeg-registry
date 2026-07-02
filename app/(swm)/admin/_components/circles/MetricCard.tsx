"use client";

import { motion } from "framer-motion";
import { shadows } from "../../../../../lib/design-tokens";
import { RED, GOLD } from "./shared";

export function MetricCard({
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
      onKeyDown={e => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
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

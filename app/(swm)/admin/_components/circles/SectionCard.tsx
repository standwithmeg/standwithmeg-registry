"use client";

import { motion } from "framer-motion";
import { colors, shadows } from "../../../../../lib/design-tokens";

export function SectionCard({
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

"use client";

import { type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { colors } from "@/lib/design-tokens";

// ============================================================================
// Types
// ============================================================================

export type BadgeVariant = "default" | "success" | "warning" | "error" | "gold";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  /** Badge variant/color */
  variant?: BadgeVariant;
  /** Badge size */
  size?: BadgeSize;
  /** Badge content */
  children: ReactNode;
  /** Show pulsing live indicator dot */
  live?: boolean;
  /** Additional class names */
  className?: string;
  /** Custom inline styles */
  style?: CSSProperties;
}

// ============================================================================
// Color mappings
// ============================================================================

const variantColors: Record<
  BadgeVariant,
  { bg: string; text: string; dot: string; border: string }
> = {
  default: {
    bg: colors.surface.DEFAULT,
    text: colors.paper.DEFAULT,
    dot: colors.paper.muted,
    border: colors.hairline.DEFAULT,
  },
  success: {
    bg: colors.success.wash,
    text: colors.success.DEFAULT,
    dot: colors.success.DEFAULT,
    border: "transparent",
  },
  warning: {
    bg: colors.warning.wash,
    text: colors.warning.DEFAULT,
    dot: colors.warning.DEFAULT,
    border: "transparent",
  },
  error: {
    bg: colors.evidence.wash,
    text: colors.evidence.DEFAULT,
    dot: colors.evidence.DEFAULT,
    border: "transparent",
  },
  gold: {
    bg: colors.gold.wash,
    text: colors.gold.DEFAULT,
    dot: colors.gold.DEFAULT,
    border: colors.gold.border,
  },
};

const sizeStyles: Record<BadgeSize, { padding: string; fontSize: string; dotSize: string }> = {
  sm: {
    padding: "0.125rem 0.5rem",
    fontSize: "0.75rem",
    dotSize: "0.375rem",
  },
  md: {
    padding: "0.25rem 0.75rem",
    fontSize: "0.875rem",
    dotSize: "0.5rem",
  },
};

// ============================================================================
// Pulsing Dot Component
// ============================================================================

const PulsingDot = ({ color, size }: { color: string; size: string }) => (
  <span className="relative flex items-center justify-center">
    {/* Ping animation */}
    <motion.span
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
      }}
      animate={{
        scale: [1, 1.5, 1.5],
        opacity: [0.75, 0, 0],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
    {/* Static dot */}
    <span
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
      }}
    />
  </span>
);

// ============================================================================
// Badge Component
// ============================================================================

export function Badge({
  variant = "default",
  size = "md",
  children,
  live = false,
  className = "",
  style,
}: BadgeProps) {
  const colorConfig = variantColors[variant];
  const sizeConfig = sizeStyles[size];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-medium rounded-full
        whitespace-nowrap
        ${className}
      `}
      style={{
        backgroundColor: colorConfig.bg,
        color: colorConfig.text,
        padding: sizeConfig.padding,
        fontSize: sizeConfig.fontSize,
        border: `1px solid ${colorConfig.border}`,
        ...style,
      }}
      role="status"
    >
      {live && <PulsingDot color={colorConfig.dot} size={sizeConfig.dotSize} />}
      {children}
    </span>
  );
}

// ============================================================================
// Preset Badge Components
// ============================================================================

export interface StatusBadgeProps {
  status: "online" | "offline" | "busy" | "away";
  showLabel?: boolean;
  size?: BadgeSize;
  className?: string;
}

export function StatusBadge({
  status,
  showLabel = true,
  size = "sm",
  className,
}: StatusBadgeProps) {
  const statusConfig: Record<
    StatusBadgeProps["status"],
    { variant: BadgeVariant; label: string; live: boolean }
  > = {
    online: { variant: "success", label: "Online", live: true },
    offline: { variant: "default", label: "Offline", live: false },
    busy: { variant: "error", label: "Busy", live: true },
    away: { variant: "warning", label: "Away", live: false },
  };

  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      size={size}
      live={config.live}
      className={className}
    >
      {showLabel ? config.label : null}
    </Badge>
  );
}

export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export function CountBadge({
  count,
  max = 99,
  variant = "gold",
  size = "sm",
  className,
}: CountBadgeProps) {
  const displayCount = count > max ? `${max}+` : count.toString();

  return (
    <Badge variant={variant} size={size} className={className}>
      {displayCount}
    </Badge>
  );
}

export default Badge;

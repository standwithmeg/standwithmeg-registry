"use client";

import { type CSSProperties } from "react";
import { colors } from "@/lib/design-tokens";

// ============================================================================
// Types
// ============================================================================

export type SkeletonVariant = "text" | "circular" | "rectangular";

export interface SkeletonProps {
  /** Shape variant */
  variant?: SkeletonVariant;
  /** Width - can be number (px) or string (any CSS value) */
  width?: number | string;
  /** Height - can be number (px) or string (any CSS value) */
  height?: number | string;
  /** For circular variant - diameter */
  size?: number | string;
  /** Number of text lines to render */
  lines?: number;
  /** Additional class names */
  className?: string;
  /** Custom inline styles */
  style?: CSSProperties;
  /** Animation enabled */
  animated?: boolean;
}

// ============================================================================
// Skeleton Component
// ============================================================================

export function Skeleton({
  variant = "rectangular",
  width,
  height,
  size,
  lines = 1,
  className = "",
  style,
  animated = true,
}: SkeletonProps) {
  // Base shimmer styles
  const shimmerStyles: CSSProperties = {
    background: `linear-gradient(
      90deg,
      ${colors.surface.DEFAULT} 25%,
      ${colors.surface.elevated} 50%,
      ${colors.surface.DEFAULT} 75%
    )`,
    backgroundSize: "200% 100%",
    animation: animated ? "shimmer 1.5s infinite" : "none",
  };

  // Render multiple text lines
  if (variant === "text" && lines > 1) {
    return (
      <div className={`flex flex-col gap-2 ${className}`} style={style}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="rounded"
            style={{
              ...shimmerStyles,
              width: index === lines - 1 ? "75%" : width || "100%",
              height: height || "1rem",
            }}
            role="presentation"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  // Single skeleton element
  const getStyles = (): CSSProperties => {
    switch (variant) {
      case "text":
        return {
          ...shimmerStyles,
          width: width || "100%",
          height: height || "1rem",
          borderRadius: "0.25rem",
        };
      case "circular":
        const diameter = size || width || 40;
        return {
          ...shimmerStyles,
          width: diameter,
          height: diameter,
          borderRadius: "9999px",
        };
      case "rectangular":
      default:
        return {
          ...shimmerStyles,
          width: width || "100%",
          height: height || "100px",
          borderRadius: "0.5rem",
        };
    }
  };

  return (
    <div
      className={className}
      style={{
        ...getStyles(),
        ...style,
      }}
      role="presentation"
      aria-hidden="true"
    />
  );
}

// ============================================================================
// Preset Skeleton Components
// ============================================================================

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return <Skeleton variant="text" lines={lines} className={className} />;
}

export interface SkeletonAvatarProps {
  size?: number | string;
  className?: string;
}

export function SkeletonAvatar({ size = 40, className }: SkeletonAvatarProps) {
  return <Skeleton variant="circular" size={size} className={className} />;
}

export interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={`p-6 rounded-xl ${className}`}
      style={{
        backgroundColor: colors.ink.card,
        border: `1px solid ${colors.hairline.DEFAULT}`,
      }}
    >
      <div className="flex items-center gap-4 mb-4">
        <SkeletonAvatar size={48} />
        <div className="flex-1">
          <Skeleton variant="text" width="60%" height="1.125rem" />
          <Skeleton
            variant="text"
            width="40%"
            height="0.875rem"
            className="mt-2"
          />
        </div>
      </div>
      <SkeletonText lines={3} />
      <div className="flex gap-3 mt-4 pt-4" style={{ borderTop: `1px solid ${colors.hairline.DEFAULT}` }}>
        <Skeleton variant="rectangular" width={80} height={32} />
        <Skeleton variant="rectangular" width={80} height={32} />
      </div>
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: SkeletonTableProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex gap-4 pb-3" style={{ borderBottom: `1px solid ${colors.hairline.DEFAULT}` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" width="25%" height="0.875rem" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              width={colIndex === 0 ? "20%" : "25%"}
              height="1rem"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;

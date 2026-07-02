"use client";

import { type ReactNode, type CSSProperties } from "react";
import { motion, type Variants, type Transition } from "framer-motion";
import { colors } from "@/lib/design-tokens";
import { Button } from "./Button";

// ============================================================================
// Types
// ============================================================================

export type EmptyStateSize = "sm" | "md" | "lg";
export type IllustrationPreset =
  | "noResults"
  | "noData"
  | "noConnections"
  | "noActors"
  | "error";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
}

export interface EmptyStateProps {
  /** Built-in illustration preset or custom SVG element */
  illustration?: IllustrationPreset | ReactNode;
  /** Title text (required) */
  title: string;
  /** Description text */
  description?: string;
  /** CTA button action */
  action?: EmptyStateAction;
  /** Secondary action */
  secondaryAction?: EmptyStateAction;
  /** Size variant */
  size?: EmptyStateSize;
  /** Additional class names */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

// ============================================================================
// Size Configuration
// ============================================================================

const sizeConfig: Record<
  EmptyStateSize,
  {
    container: string;
    illustration: number;
    title: string;
    description: string;
    gap: string;
  }
> = {
  sm: {
    container: "py-8 px-4",
    illustration: 80,
    title: "text-base font-semibold",
    description: "text-sm",
    gap: "gap-3",
  },
  md: {
    container: "py-12 px-6",
    illustration: 120,
    title: "text-xl font-semibold",
    description: "text-base",
    gap: "gap-4",
  },
  lg: {
    container: "py-16 px-8",
    illustration: 160,
    title: "text-2xl font-bold",
    description: "text-lg",
    gap: "gap-5",
  },
};

// ============================================================================
// Animation Variants
// ============================================================================

const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    } as Transition,
  },
};

// Floating animation for illustrations
const floatTransition: Transition = {
  duration: 3,
  repeat: Infinity,
  ease: "easeInOut",
};

// Pulse animation for accents
const pulseTransition: Transition = {
  duration: 2,
  repeat: Infinity,
  ease: "easeInOut",
};

// ============================================================================
// Illustration Components
// ============================================================================

interface IllustrationProps {
  size: number;
}

const NoResultsIllustration = ({ size }: IllustrationProps) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    animate={{ y: [0, -8, 0] }}
    transition={floatTransition}
  >
    {/* Background circle */}
    <motion.circle
      cx="60"
      cy="60"
      r="50"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.08"
      animate={{ scale: [1, 1.05, 1], opacity: [0.06, 0.1, 0.06] }}
      transition={pulseTransition}
    />

    {/* Magnifying glass handle */}
    <motion.rect
      x="75"
      y="75"
      width="8"
      height="28"
      rx="4"
      transform="rotate(45 75 75)"
      fill={colors.gold.DEFAULT}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    />

    {/* Magnifying glass circle */}
    <motion.circle
      cx="50"
      cy="50"
      r="28"
      stroke={colors.gold.DEFAULT}
      strokeWidth="6"
      fill="none"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />

    {/* Empty center */}
    <motion.circle
      cx="50"
      cy="50"
      r="18"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.05"
    />

    {/* Question mark */}
    <motion.text
      x="50"
      y="56"
      textAnchor="middle"
      fontSize="20"
      fontWeight="600"
      fill={colors.paper.muted}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 0.5, scale: 1 }}
      transition={{ delay: 0.5, type: "spring" }}
    >
      ?
    </motion.text>

    {/* Decorative dots */}
    <motion.circle
      cx="20"
      cy="30"
      r="3"
      fill={colors.gold.DEFAULT}
      fillOpacity="0.4"
      animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, delay: 0.2 }}
    />
    <motion.circle
      cx="95"
      cy="25"
      r="2"
      fill={colors.gold.DEFAULT}
      fillOpacity="0.3"
      animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
    />
  </motion.svg>
);

const NoDataIllustration = ({ size }: IllustrationProps) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    animate={{ y: [0, -8, 0] }}
    transition={floatTransition}
  >
    {/* Background circle */}
    <motion.circle
      cx="60"
      cy="60"
      r="50"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.08"
      animate={{ scale: [1, 1.05, 1], opacity: [0.06, 0.1, 0.06] }}
      transition={pulseTransition}
    />

    {/* Document shape */}
    <motion.path
      d="M35 25h35l15 15v55a5 5 0 01-5 5H35a5 5 0 01-5-5V30a5 5 0 015-5z"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.1"
      stroke={colors.gold.DEFAULT}
      strokeWidth="3"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.8 }}
    />

    {/* Folded corner */}
    <motion.path
      d="M70 25v15h15"
      stroke={colors.gold.DEFAULT}
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    />

    {/* Empty chart bars placeholder */}
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
      <rect x="42" y="75" width="8" height="12" rx="2" fill={colors.paper.DEFAULT} fillOpacity="0.15" />
      <rect x="54" y="65" width="8" height="22" rx="2" fill={colors.paper.DEFAULT} fillOpacity="0.15" />
      <rect x="66" y="70" width="8" height="17" rx="2" fill={colors.paper.DEFAULT} fillOpacity="0.15" />
    </motion.g>

    {/* Dashed lines for empty content */}
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.4 }}
      transition={{ delay: 0.4 }}
    >
      <line x1="42" y1="48" x2="75" y2="48" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="4 4" />
      <line x1="42" y1="56" x2="65" y2="56" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="4 4" />
    </motion.g>

    {/* Decorative sparkle */}
    <motion.circle
      cx="95"
      cy="35"
      r="3"
      fill={colors.gold.DEFAULT}
      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity }}
    />
  </motion.svg>
);

const NoConnectionsIllustration = ({ size }: IllustrationProps) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    animate={{ y: [0, -8, 0] }}
    transition={floatTransition}
  >
    {/* Background circle */}
    <motion.circle
      cx="60"
      cy="60"
      r="50"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.08"
      animate={{ scale: [1, 1.05, 1], opacity: [0.06, 0.1, 0.06] }}
      transition={pulseTransition}
    />

    {/* Connection lines (dashed/broken) */}
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.3 }}
      transition={{ delay: 0.3 }}
    >
      <line x1="40" y1="45" x2="60" y2="60" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="4 4" />
      <line x1="80" y1="45" x2="60" y2="60" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="4 4" />
      <line x1="60" y1="60" x2="60" y2="85" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="4 4" />
    </motion.g>

    {/* Person 1 (top left) */}
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2, type: "spring" }}
    >
      <circle cx="35" cy="35" r="12" stroke={colors.gold.DEFAULT} strokeWidth="3" fill={colors.paper.DEFAULT} fillOpacity="0.1" />
      <circle cx="35" cy="32" r="4" fill={colors.paper.DEFAULT} fillOpacity="0.3" />
      <path d="M28 42a7 7 0 0114 0" stroke={colors.paper.DEFAULT} strokeWidth="2" strokeOpacity="0.3" fill="none" />
    </motion.g>

    {/* Person 2 (top right) */}
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, type: "spring" }}
    >
      <circle cx="85" cy="35" r="12" stroke={colors.gold.DEFAULT} strokeWidth="3" fill={colors.paper.DEFAULT} fillOpacity="0.1" />
      <circle cx="85" cy="32" r="4" fill={colors.paper.DEFAULT} fillOpacity="0.3" />
      <path d="M78 42a7 7 0 0114 0" stroke={colors.paper.DEFAULT} strokeWidth="2" strokeOpacity="0.3" fill="none" />
    </motion.g>

    {/* Person 3 (bottom center) - empty/outlined */}
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 0.5, scale: 1 }}
      transition={{ delay: 0.4, type: "spring" }}
    >
      <circle cx="60" cy="90" r="12" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="4 4" fill="none" />
      <text x="60" y="94" textAnchor="middle" fontSize="12" fill={colors.paper.muted}>?</text>
    </motion.g>

    {/* Central node */}
    <motion.circle
      cx="60"
      cy="60"
      r="8"
      fill={colors.gold.DEFAULT}
      fillOpacity="0.3"
      stroke={colors.gold.DEFAULT}
      strokeWidth="2"
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    />
  </motion.svg>
);

const NoActorsIllustration = ({ size }: IllustrationProps) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    animate={{ y: [0, -8, 0] }}
    transition={floatTransition}
  >
    {/* Background circle */}
    <motion.circle
      cx="60"
      cy="60"
      r="50"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.08"
      animate={{ scale: [1, 1.05, 1], opacity: [0.06, 0.1, 0.06] }}
      transition={pulseTransition}
    />

    {/* Courthouse/gavel base */}
    <motion.path
      d="M25 85h70v8H25z"
      fill={colors.gold.DEFAULT}
      fillOpacity="0.3"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.5 }}
    />

    {/* Pillars */}
    <motion.g
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      style={{ transformOrigin: "bottom" }}
    >
      <rect x="32" y="50" width="8" height="35" fill={colors.paper.DEFAULT} fillOpacity="0.15" rx="2" />
      <rect x="56" y="50" width="8" height="35" fill={colors.paper.DEFAULT} fillOpacity="0.15" rx="2" />
      <rect x="80" y="50" width="8" height="35" fill={colors.paper.DEFAULT} fillOpacity="0.15" rx="2" />
    </motion.g>

    {/* Roof/pediment */}
    <motion.path
      d="M20 50l40-25 40 25H20z"
      stroke={colors.gold.DEFAULT}
      strokeWidth="3"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.1"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.8 }}
    />

    {/* Empty person placeholder in center */}
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.5 }}
      transition={{ delay: 0.6 }}
    >
      <circle cx="60" cy="68" r="8" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="3 3" fill="none" />
      <path d="M50 82c0-5 4-9 10-9s10 4 10 9" stroke={colors.paper.muted} strokeWidth="2" strokeDasharray="3 3" fill="none" />
    </motion.g>

    {/* Scale of justice icon */}
    <motion.g
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, type: "spring" }}
    >
      <line x1="60" y1="30" x2="60" y2="40" stroke={colors.gold.DEFAULT} strokeWidth="2" />
      <line x1="48" y1="35" x2="72" y2="35" stroke={colors.gold.DEFAULT} strokeWidth="2" />
      <motion.circle
        cx="48"
        cy="38"
        r="4"
        stroke={colors.gold.DEFAULT}
        strokeWidth="1.5"
        fill="none"
        animate={{ y: [0, 2, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
      <motion.circle
        cx="72"
        cy="38"
        r="4"
        stroke={colors.gold.DEFAULT}
        strokeWidth="1.5"
        fill="none"
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
    </motion.g>
  </motion.svg>
);

const ErrorIllustration = ({ size }: IllustrationProps) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    animate={{ y: [0, -8, 0] }}
    transition={floatTransition}
  >
    {/* Background circle with error color */}
    <motion.circle
      cx="60"
      cy="60"
      r="50"
      fill={colors.evidence.DEFAULT}
      fillOpacity="0.08"
      animate={{
        scale: [1, 1.03, 1],
        opacity: [0.08, 0.12, 0.08],
      }}
      transition={{ duration: 2, repeat: Infinity }}
    />

    {/* Warning triangle */}
    <motion.path
      d="M60 25L95 85H25L60 25z"
      stroke={colors.evidence.DEFAULT}
      strokeWidth="4"
      strokeLinejoin="round"
      fill={colors.paper.DEFAULT}
      fillOpacity="0.05"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />

    {/* Exclamation mark */}
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
    >
      <rect x="56" y="45" width="8" height="20" rx="4" fill={colors.evidence.DEFAULT} />
      <circle cx="60" cy="73" r="4" fill={colors.evidence.DEFAULT} />
    </motion.g>

    {/* Decorative error sparks */}
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
    >
      <motion.line
        x1="20"
        y1="40"
        x2="28"
        y2="48"
        stroke={colors.evidence.DEFAULT}
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <motion.line
        x1="100"
        y1="40"
        x2="92"
        y2="48"
        stroke={colors.evidence.DEFAULT}
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
      />
      <motion.circle
        cx="25"
        cy="70"
        r="3"
        fill={colors.evidence.DEFAULT}
        fillOpacity="0.4"
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.circle
        cx="95"
        cy="75"
        r="2"
        fill={colors.evidence.DEFAULT}
        fillOpacity="0.3"
        animate={{ scale: [1, 1.4, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, delay: 0.5 }}
      />
    </motion.g>
  </motion.svg>
);

// Illustration preset mapping
const illustrationPresets: Record<IllustrationPreset, React.FC<IllustrationProps>> = {
  noResults: NoResultsIllustration,
  noData: NoDataIllustration,
  noConnections: NoConnectionsIllustration,
  noActors: NoActorsIllustration,
  error: ErrorIllustration,
};

// ============================================================================
// EmptyState Component
// ============================================================================

export function EmptyState({
  illustration = "noData",
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className = "",
  style,
}: EmptyStateProps) {
  const config = sizeConfig[size];

  // Determine if illustration is a preset or custom ReactNode
  const renderIllustration = () => {
    if (typeof illustration === "string" && illustration in illustrationPresets) {
      const IllustrationComponent = illustrationPresets[illustration as IllustrationPreset];
      return <IllustrationComponent size={config.illustration} />;
    }
    // Custom ReactNode illustration
    return illustration;
  };

  return (
    <motion.div
      className={`
        flex flex-col items-center justify-center text-center
        ${config.container}
        ${config.gap}
        ${className}
      `}
      style={style}
      variants={containerVariants}
      initial="initial"
      animate="animate"
    >
      {/* Illustration */}
      {illustration && (
        <motion.div variants={itemVariants} className="mb-2">
          {renderIllustration()}
        </motion.div>
      )}

      {/* Title */}
      <motion.h3
        variants={itemVariants}
        className={config.title}
        style={{ color: colors.paper.DEFAULT }}
      >
        {title}
      </motion.h3>

      {/* Description */}
      {description && (
        <motion.p
          variants={itemVariants}
          className={`${config.description} max-w-md`}
          style={{ color: colors.paper.muted }}
        >
          {description}
        </motion.p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-3 mt-2"
        >
          {action && (
            <Button
              variant={action.variant || "primary"}
              size={size === "lg" ? "md" : "sm"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || "ghost"}
              size={size === "lg" ? "md" : "sm"}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Standalone Illustration Exports
// ============================================================================

export {
  NoResultsIllustration,
  NoDataIllustration,
  NoConnectionsIllustration,
  NoActorsIllustration,
  ErrorIllustration,
};

export default EmptyState;

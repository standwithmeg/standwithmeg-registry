/**
 * Stand With Meg Design System — Centralized Design Tokens
 * 
 * This file is the single source of truth for all design values.
 * Import from here instead of hardcoding colors, spacing, etc.
 */

// ============================================================================
// COLORS
// ============================================================================

export const colors = {
  // Primary brand colors
  gold: {
    DEFAULT: "#C9A227",
    soft: "#e8c25e",
    muted: "#d4a840",
    border: "rgba(201, 162, 39, 0.3)",
    wash: "rgba(201, 162, 39, 0.1)",
    glow: "rgba(201, 162, 39, 0.4)",
  },

  // Dark backgrounds
  ink: {
    DEFAULT: "#0a0f1a",
    light: "#0F1E30",
    lighter: "#1a2a3f",
    card: "#0d1520",
  },

  // Light backgrounds
  paper: {
    DEFAULT: "#f4f1ea",
    muted: "#f7f5f0",
    warm: "#faf8f3",
    white: "#ffffff",
  },

  // Action/alert color
  evidence: {
    DEFAULT: "#c63d2f",
    hot: "#e84a37",
    muted: "#b53a2d",
    border: "rgba(198, 61, 47, 0.4)",
    wash: "rgba(198, 61, 47, 0.12)",
    glow: "rgba(198, 61, 47, 0.5)",
  },

  // Surface colors (for cards, modals on dark bg)
  surface: {
    DEFAULT: "rgba(244, 241, 234, 0.04)",
    raised: "rgba(244, 241, 234, 0.07)",
    elevated: "rgba(244, 241, 234, 0.10)",
  },

  // Border/divider colors
  hairline: {
    DEFAULT: "rgba(244, 241, 234, 0.10)",
    strong: "rgba(244, 241, 234, 0.18)",
    subtle: "rgba(244, 241, 234, 0.06)",
  },

  // Semantic colors
  success: {
    DEFAULT: "#22c55e",
    muted: "#16a34a",
    wash: "rgba(34, 197, 94, 0.12)",
  },
  warning: {
    DEFAULT: "#f59e0b",
    muted: "#d97706",
    wash: "rgba(245, 158, 11, 0.12)",
  },
  info: {
    DEFAULT: "#3b82f6",
    muted: "#2563eb",
    wash: "rgba(59, 130, 246, 0.12)",
  },
} as const;

// Legacy aliases (for backward compatibility during migration)
export const GOLD = colors.gold.DEFAULT;
export const GOLD_SOFT = colors.gold.soft;
export const INK = colors.ink.DEFAULT;
export const NAVY = colors.ink.light;
export const NAVY_DEEP = colors.ink.DEFAULT;
export const BG = colors.ink.light;
export const PAPER = colors.paper.DEFAULT;
export const RED = colors.evidence.DEFAULT;
export const EVIDENCE = colors.evidence.DEFAULT;
export const EVIDENCE_HOT = colors.evidence.hot;
export const HAIRLINE = colors.hairline.DEFAULT;
export const HAIRLINE_STRONG = colors.hairline.strong;
export const SURFACE = colors.surface.DEFAULT;
export const SURFACE_RAISED = colors.surface.raised;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const fonts = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Newsreader, Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
} as const;

export const fontSizes = {
  xs: "0.75rem",    // 12px
  sm: "0.875rem",   // 14px
  base: "1rem",     // 16px
  lg: "1.125rem",   // 18px
  xl: "1.25rem",    // 20px
  "2xl": "1.5rem",  // 24px
  "3xl": "1.875rem", // 30px
  "4xl": "2.25rem", // 36px
  "5xl": "3rem",    // 48px
  "6xl": "3.75rem", // 60px
} as const;

export const fontWeights = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  black: "900",
} as const;

// ============================================================================
// SPACING
// ============================================================================

export const spacing = {
  px: "1px",
  0: "0",
  0.5: "0.125rem",  // 2px
  1: "0.25rem",     // 4px
  1.5: "0.375rem",  // 6px
  2: "0.5rem",      // 8px
  2.5: "0.625rem",  // 10px
  3: "0.75rem",     // 12px
  3.5: "0.875rem",  // 14px
  4: "1rem",        // 16px
  5: "1.25rem",     // 20px
  6: "1.5rem",      // 24px
  7: "1.75rem",     // 28px
  8: "2rem",        // 32px
  9: "2.25rem",     // 36px
  10: "2.5rem",     // 40px
  12: "3rem",       // 48px
  14: "3.5rem",     // 56px
  16: "4rem",       // 64px
  20: "5rem",       // 80px
  24: "6rem",       // 96px
} as const;

// ============================================================================
// BORDERS & RADIUS
// ============================================================================

export const borderRadius = {
  none: "0",
  sm: "0.25rem",    // 4px
  DEFAULT: "0.5rem", // 8px
  md: "0.5rem",     // 8px
  lg: "0.75rem",    // 12px
  xl: "1rem",       // 16px
  "2xl": "1.5rem",  // 24px
  "3xl": "2rem",    // 32px
  full: "9999px",
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  DEFAULT: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)",
  // Premium glow shadows
  goldGlow: `0 0 20px ${colors.gold.glow}`,
  evidenceGlow: `0 0 20px ${colors.evidence.glow}`,
  cardHover: "0 20px 40px -15px rgba(0, 0, 0, 0.3)",
} as const;

// ============================================================================
// ANIMATIONS
// ============================================================================

export const transitions = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  DEFAULT: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
  slower: "500ms cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export const easings = {
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

// Framer Motion animation presets
export const motionPresets = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.3 },
  },
  fadeInDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2 },
  },
  slideInRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3 },
  },
  slideInLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3 },
  },
  // For staggered children
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  },
  staggerItem: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  },
} as const;

// ============================================================================
// Z-INDEX SCALE
// ============================================================================

export const zIndex = {
  behind: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
  max: 9999,
} as const;

// ============================================================================
// BREAKPOINTS (for reference, Tailwind handles these)
// ============================================================================

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

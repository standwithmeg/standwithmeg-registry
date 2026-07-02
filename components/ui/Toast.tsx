"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  colors,
  borderRadius,
  shadows,
  fonts,
  fontSizes,
} from "@/lib/design-tokens";
import type { ToastVariant } from "@/lib/toast-context";

// ============================================================================
// TYPES
// ============================================================================

interface ToastProps {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  onDismiss: (id: string) => void;
}

// ============================================================================
// VARIANT CONFIGURATIONS
// ============================================================================

const variantConfig: Record<
  ToastVariant,
  {
    icon: React.ReactNode;
    bgColor: string;
    borderColor: string;
    textColor: string;
    progressColor: string;
  }
> = {
  success: {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M16.667 5L7.5 14.167 3.333 10"
          stroke={colors.success.DEFAULT}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    bgColor: colors.ink.card,
    borderColor: colors.success.DEFAULT,
    textColor: colors.paper.DEFAULT,
    progressColor: colors.success.DEFAULT,
  },
  error: {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M15 5L5 15M5 5l10 10"
          stroke={colors.evidence.DEFAULT}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    bgColor: colors.ink.card,
    borderColor: colors.evidence.DEFAULT,
    textColor: colors.paper.DEFAULT,
    progressColor: colors.evidence.DEFAULT,
  },
  warning: {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 6.667v3.333M10 13.333h.008M8.575 3.217L1.517 15.4a1.667 1.667 0 001.425 2.5h14.116a1.667 1.667 0 001.425-2.5L11.425 3.217a1.667 1.667 0 00-2.85 0z"
          stroke={colors.gold.DEFAULT}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    bgColor: colors.ink.card,
    borderColor: colors.gold.DEFAULT,
    textColor: colors.paper.DEFAULT,
    progressColor: colors.gold.DEFAULT,
  },
  info: {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke={colors.info.DEFAULT}
          strokeWidth="1.5"
        />
        <path
          d="M10 9v4M10 7h.01"
          stroke={colors.info.DEFAULT}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    bgColor: colors.ink.card,
    borderColor: colors.info.DEFAULT,
    textColor: colors.paper.DEFAULT,
    progressColor: colors.info.DEFAULT,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function Toast({ id, message, variant, duration, onDismiss }: ToastProps) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const config = variantConfig[variant];

  // Handle auto-dismiss with progress bar
  useEffect(() => {
    if (isPaused) return;

    const interval = 50; // Update every 50ms for smooth animation
    const decrement = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - decrement;
        if (next <= 0) {
          clearInterval(timer);
          onDismiss(id);
          return 0;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [id, duration, onDismiss, isPaused]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: "320px",
        maxWidth: "420px",
        backgroundColor: config.bgColor,
        borderRadius: borderRadius.xl,
        boxShadow: shadows.xl,
        border: `1px solid ${config.borderColor}`,
        overflow: "hidden",
        pointerEvents: "auto",
        fontFamily: fonts.sans,
      }}
    >
      {/* Main Content */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "1rem",
          gap: "0.75rem",
        }}
      >
        {/* Icon */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: borderRadius.lg,
            backgroundColor: `${config.borderColor}20`,
          }}
        >
          {config.icon}
        </div>

        {/* Message */}
        <p
          style={{
            flex: 1,
            margin: 0,
            color: config.textColor,
            fontSize: fontSizes.sm,
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        {/* Close Button */}
        <button
          onClick={() => onDismiss(id)}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: borderRadius.md,
            border: "none",
            backgroundColor: "transparent",
            cursor: "pointer",
            color: colors.paper.muted,
            transition: "background-color 150ms ease, color 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.surface.raised;
            e.currentTarget.style.color = colors.paper.DEFAULT;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = colors.paper.muted;
          }}
          aria-label="Dismiss notification"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          height: "3px",
          backgroundColor: colors.hairline.DEFAULT,
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.05, ease: "linear" }}
          style={{
            height: "100%",
            backgroundColor: config.progressColor,
          }}
        />
      </div>
    </motion.div>
  );
}

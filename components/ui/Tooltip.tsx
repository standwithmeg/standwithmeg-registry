"use client";

import {
  useState,
  useRef,
  type ReactNode,
  type CSSProperties,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { colors, zIndex } from "@/lib/design-tokens";

// ============================================================================
// Types
// ============================================================================

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Element that triggers the tooltip */
  children: ReactNode;
  /** Position of the tooltip relative to trigger */
  position?: TooltipPosition;
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /** Max width of tooltip content */
  maxWidth?: number | string;
  /** Additional class names for tooltip */
  className?: string;
  /** Disable the tooltip */
  disabled?: boolean;
}

// ============================================================================
// Position calculations
// ============================================================================

const getPositionStyles = (
  position: TooltipPosition
): { tooltip: CSSProperties; arrow: CSSProperties } => {
  const arrowSize = 6;

  switch (position) {
    case "top":
      return {
        tooltip: {
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginBottom: arrowSize + 4,
        },
        arrow: {
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderTop: `${arrowSize}px solid ${colors.ink.lighter}`,
        },
      };
    case "bottom":
      return {
        tooltip: {
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          marginTop: arrowSize + 4,
        },
        arrow: {
          bottom: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          borderLeft: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid ${colors.ink.lighter}`,
        },
      };
    case "left":
      return {
        tooltip: {
          right: "100%",
          top: "50%",
          transform: "translateY(-50%)",
          marginRight: arrowSize + 4,
        },
        arrow: {
          left: "100%",
          top: "50%",
          transform: "translateY(-50%)",
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderLeft: `${arrowSize}px solid ${colors.ink.lighter}`,
        },
      };
    case "right":
      return {
        tooltip: {
          left: "100%",
          top: "50%",
          transform: "translateY(-50%)",
          marginLeft: arrowSize + 4,
        },
        arrow: {
          right: "100%",
          top: "50%",
          transform: "translateY(-50%)",
          borderTop: `${arrowSize}px solid transparent`,
          borderBottom: `${arrowSize}px solid transparent`,
          borderRight: `${arrowSize}px solid ${colors.ink.lighter}`,
        },
      };
  }
};

// Animation variants based on position
const getAnimationVariants = (position: TooltipPosition) => {
  const offset = 8;

  const directions: Record<TooltipPosition, { x: number; y: number }> = {
    top: { x: 0, y: offset },
    bottom: { x: 0, y: -offset },
    left: { x: offset, y: 0 },
    right: { x: -offset, y: 0 },
  };

  const dir = directions[position];

  return {
    initial: { opacity: 0, x: dir.x, y: dir.y, scale: 0.95 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0, x: dir.x, y: dir.y, scale: 0.95 },
  };
};

// ============================================================================
// Tooltip Component
// ============================================================================

export function Tooltip({
  content,
  children,
  position = "top",
  delay = 200,
  maxWidth = 250,
  className = "",
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const positionStyles = getPositionStyles(position);
  const animationVariants = getAnimationVariants(position);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {/* Trigger element */}
      {children}

      {/* Tooltip */}
      <AnimatePresence>
        {isVisible && !disabled && (
          <motion.div
            role="tooltip"
            className={`
              absolute whitespace-normal
              px-3 py-2
              text-sm font-medium
              rounded-lg
              shadow-lg
              pointer-events-none
              ${className}
            `}
            style={{
              ...positionStyles.tooltip,
              maxWidth,
              backgroundColor: colors.ink.lighter,
              color: colors.paper.DEFAULT,
              border: `1px solid ${colors.hairline.strong}`,
              zIndex: zIndex.tooltip,
            }}
            variants={animationVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{
              duration: 0.15,
              ease: "easeOut",
            }}
          >
            {content}

            {/* Arrow */}
            <span
              className="absolute w-0 h-0"
              style={positionStyles.arrow}
              aria-hidden="true"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Info Tooltip (common pattern)
// ============================================================================

export interface InfoTooltipProps {
  content: ReactNode;
  position?: TooltipPosition;
  className?: string;
}

export function InfoTooltip({
  content,
  position = "top",
  className,
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} position={position} className={className}>
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{
          backgroundColor: colors.surface.raised,
          color: colors.paper.muted,
        }}
        aria-label="More information"
      >
        ?
      </button>
    </Tooltip>
  );
}

export default Tooltip;

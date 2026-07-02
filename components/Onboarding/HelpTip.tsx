"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { colors, zIndex, shadows } from "@/lib/design-tokens";

type HelpTipProps = {
  content: React.ReactNode;
  title?: string;
  position?: "top" | "bottom" | "left" | "right";
  trigger?: "hover" | "click" | "both";
  size?: "sm" | "md";
  className?: string;
};

type Position = {
  top?: number | string;
  bottom?: number | string;
  left?: number | string;
  right?: number | string;
  transform?: string;
};

const positionStyles: Record<string, Position> = {
  top: {
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  bottom: {
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  left: {
    right: "100%",
    top: "50%",
    transform: "translateY(-50%)",
  },
  right: {
    left: "100%",
    top: "50%",
    transform: "translateY(-50%)",
  },
};

const arrowStyles: Record<string, React.CSSProperties> = {
  top: {
    bottom: "-6px",
    left: "50%",
    transform: "translateX(-50%) rotate(45deg)",
  },
  bottom: {
    top: "-6px",
    left: "50%",
    transform: "translateX(-50%) rotate(45deg)",
  },
  left: {
    right: "-6px",
    top: "50%",
    transform: "translateY(-50%) rotate(45deg)",
  },
  right: {
    left: "-6px",
    top: "50%",
    transform: "translateY(-50%) rotate(45deg)",
  },
};

const animationVariants = {
  top: {
    initial: { opacity: 0, y: 8, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.95 },
  },
  bottom: {
    initial: { opacity: 0, y: -8, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.95 },
  },
  left: {
    initial: { opacity: 0, x: 8, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 8, scale: 0.95 },
  },
  right: {
    initial: { opacity: 0, x: -8, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: -8, scale: 0.95 },
  },
};

const marginStyles: Record<string, React.CSSProperties> = {
  top: { marginBottom: "10px" },
  bottom: { marginTop: "10px" },
  left: { marginRight: "10px" },
  right: { marginLeft: "10px" },
};

export function HelpTip({
  content,
  title,
  position = "top",
  trigger = "both",
  size = "sm",
  className = "",
}: HelpTipProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isVisible =
    trigger === "hover" ? isHovering :
    trigger === "click" ? isClicked :
    isHovering || isClicked;

  // Handle click outside to close
  useEffect(() => {
    if (!isClicked) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsClicked(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isClicked]);

  const handleMouseEnter = () => {
    if (trigger === "hover" || trigger === "both") {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    if (trigger === "hover" || trigger === "both") {
      setIsHovering(false);
    }
  };

  const handleClick = () => {
    if (trigger === "click" || trigger === "both") {
      setIsClicked((prev) => !prev);
    }
  };

  const buttonSize = size === "sm" ? "w-5 h-5" : "w-6 h-6";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const tooltipMaxWidth = size === "sm" ? "max-w-[240px]" : "max-w-[300px]";

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={`${buttonSize} rounded-full flex items-center justify-center transition-all`}
        style={{
          backgroundColor: isVisible ? colors.gold.wash : `rgba(244, 241, 234, 0.1)`,
          color: isVisible ? colors.gold.DEFAULT : `rgba(244, 241, 234, 0.5)`,
          border: `1px solid ${isVisible ? colors.gold.border : "transparent"}`,
        }}
        aria-label="Help"
        aria-expanded={isVisible}
      >
        <svg
          className={iconSize}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={tooltipRef}
            {...animationVariants[position]}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className={`absolute ${tooltipMaxWidth} rounded-lg px-3 py-2.5 pointer-events-auto`}
            style={{
              ...positionStyles[position],
              ...marginStyles[position],
              backgroundColor: colors.ink.card,
              border: `1px solid ${colors.gold.border}`,
              boxShadow: shadows.lg,
              zIndex: zIndex.tooltip,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Arrow */}
            <span
              className="absolute w-3 h-3"
              style={{
                ...arrowStyles[position],
                backgroundColor: colors.ink.card,
                borderRight: `1px solid ${colors.gold.border}`,
                borderBottom: `1px solid ${colors.gold.border}`,
              }}
            />

            {/* Content */}
            {title && (
              <p
                className="text-xs font-semibold mb-1"
                style={{ color: colors.gold.DEFAULT }}
              >
                {title}
              </p>
            )}
            <div
              className="text-xs leading-relaxed"
              style={{ color: `rgba(244, 241, 234, 0.8)` }}
            >
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// Alternative: Inline help text component (for longer explanations)
export function HelpText({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-xs flex items-start gap-1.5 ${className}`}
      style={{ color: `rgba(244, 241, 234, 0.5)` }}
    >
      <svg
        className="w-4 h-4 flex-shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        style={{ color: colors.gold.muted }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{children}</span>
    </p>
  );
}

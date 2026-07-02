"use client";

import { forwardRef, type ReactNode, type CSSProperties } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { colors, shadows } from "@/lib/design-tokens";

// ============================================================================
// Types
// ============================================================================

export type CardVariant = "default" | "glass" | "elevated";

export interface CardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  variant?: CardVariant;
  children: ReactNode;
  /** Enable hover lift animation */
  hoverLift?: boolean;
  /** Enable border glow on hover */
  borderGlow?: boolean;
  /** Glow color - defaults to gold */
  glowColor?: "gold" | "evidence";
  /** Make the card clickable with press animation */
  onClick?: () => void;
  /** Padding preset */
  padding?: "none" | "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles = `
  relative rounded-xl overflow-hidden
  transition-all duration-200
`;

const paddingStyles: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

// ============================================================================
// Card Component
// ============================================================================

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "default",
      children,
      hoverLift = false,
      borderGlow = false,
      glowColor = "gold",
      onClick,
      padding = "md",
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const isClickable = !!onClick;

    // Build variant-specific inline styles
    const getVariantStyles = (): CSSProperties => {
      switch (variant) {
        case "default":
          return {
            backgroundColor: colors.ink.card,
            borderWidth: "1px",
            borderColor: colors.hairline.DEFAULT,
          };
        case "glass":
          return {
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderWidth: "1px",
            borderColor: colors.hairline.DEFAULT,
          };
        case "elevated":
          return {
            backgroundColor: colors.ink.card,
            borderWidth: "1px",
            borderColor: colors.hairline.strong,
            boxShadow: shadows.lg,
          };
        default:
          return {};
      }
    };

    // Glow shadow color
    const glowShadow =
      glowColor === "gold" ? shadows.goldGlow : shadows.evidenceGlow;

    // Animation variants
    const hoverAnimation = {
      y: hoverLift ? -8 : 0,
      boxShadow: borderGlow ? glowShadow : hoverLift ? shadows.cardHover : undefined,
      borderColor: borderGlow
        ? glowColor === "gold"
          ? colors.gold.border
          : colors.evidence.border
        : undefined,
    };

    return (
      <motion.div
        ref={ref}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={`
          ${baseStyles}
          ${paddingStyles[padding]}
          ${isClickable ? "cursor-pointer" : ""}
          ${className}
        `}
        style={{
          ...getVariantStyles(),
          ...style,
        }}
        // Framer Motion animations
        initial={false}
        whileHover={
          hoverLift || borderGlow
            ? hoverAnimation
            : undefined
        }
        whileTap={isClickable ? { scale: 0.98 } : undefined}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 20,
        }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

Card.displayName = "Card";

// ============================================================================
// Card Sub-components
// ============================================================================

export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export const CardHeader = ({ children, className = "" }: CardHeaderProps) => (
  <div className={`mb-4 ${className}`}>{children}</div>
);

export interface CardTitleProps {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

export const CardTitle = ({
  children,
  className = "",
  as: Tag = "h3",
}: CardTitleProps) => (
  <Tag
    className={`text-lg font-semibold ${className}`}
    style={{ color: colors.paper.DEFAULT }}
  >
    {children}
  </Tag>
);

export interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export const CardDescription = ({
  children,
  className = "",
}: CardDescriptionProps) => (
  <p
    className={`text-sm mt-1 ${className}`}
    style={{ color: colors.paper.muted }}
  >
    {children}
  </p>
);

export interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export const CardContent = ({ children, className = "" }: CardContentProps) => (
  <div className={className}>{children}</div>
);

export interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export const CardFooter = ({ children, className = "" }: CardFooterProps) => (
  <div
    className={`mt-4 pt-4 flex items-center gap-3 ${className}`}
    style={{ borderTop: `1px solid ${colors.hairline.DEFAULT}` }}
  >
    {children}
  </div>
);

export default Card;

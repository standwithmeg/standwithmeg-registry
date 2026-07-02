"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { colors } from "@/lib/design-tokens";

// ============================================================================
// Types
// ============================================================================

export type ButtonVariant = "primary" | "secondary" | "ghost" | "evidence";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles = `
  relative inline-flex items-center justify-center
  font-semibold tracking-wide
  rounded-lg
  transition-colors duration-200
  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1E30]
  disabled:cursor-not-allowed
`;

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 min-h-[32px]",
  md: "px-5 py-2.5 text-base gap-2 min-h-[44px]",
  lg: "px-7 py-3.5 text-lg gap-2.5 min-h-[52px]",
};

// ============================================================================
// Spinner Component
// ============================================================================

const Spinner = ({ size }: { size: ButtonSize }) => {
  const spinnerSizes: Record<ButtonSize, string> = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <svg
      className={`animate-spin ${spinnerSizes[size]}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

// ============================================================================
// Button Component
// ============================================================================

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      children,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Build inline styles for colors (more reliable than template literals in Tailwind)
    const getVariantInlineStyles = (): React.CSSProperties => {
      switch (variant) {
        case "primary":
          return {
            backgroundColor: colors.gold.DEFAULT,
            color: colors.ink.DEFAULT,
          };
        case "secondary":
          return {
            backgroundColor: "transparent",
            color: colors.paper.DEFAULT,
            borderWidth: "1px",
            borderColor: colors.hairline.strong,
          };
        case "ghost":
          return {
            backgroundColor: "transparent",
            color: colors.paper.muted,
          };
        case "evidence":
          return {
            backgroundColor: colors.evidence.DEFAULT,
            color: "#ffffff",
          };
        default:
          return {};
      }
    };

    return (
      <motion.button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={`
          ${baseStyles}
          ${sizeStyles[size]}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `}
        style={{
          ...getVariantInlineStyles(),
          ...style,
        }}
        // Framer Motion animations
        whileHover={
          !isDisabled
            ? {
                scale: 1.02,
                backgroundColor:
                  variant === "primary"
                    ? colors.gold.soft
                    : variant === "evidence"
                    ? colors.evidence.hot
                    : undefined,
              }
            : undefined
        }
        whileTap={!isDisabled ? { scale: 0.98 } : undefined}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
        }}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size={size} />
          </span>
        )}

        {/* Button content */}
        <span
          className={`
            inline-flex items-center justify-center gap-2
            ${loading ? "opacity-0" : "opacity-100"}
          `}
        >
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </span>
      </motion.button>
    );
  }
);

Button.displayName = "Button";

export default Button;

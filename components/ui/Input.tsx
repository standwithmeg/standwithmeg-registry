"use client";

import {
  forwardRef,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  useState,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { colors } from "@/lib/design-tokens";

// ============================================================================
// Input Component with Floating Label
// ============================================================================

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  variant?: "default" | "filled";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      variant = "default",
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = props.value !== undefined && props.value !== "";
    const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    const baseInputStyles = `
      w-full px-4 py-3 text-base transition-all duration-200
      rounded-xl border outline-none
      disabled:opacity-50 disabled:cursor-not-allowed
      ${leftIcon ? "pl-11" : ""}
      ${rightIcon ? "pr-11" : ""}
    `;

    const variantStyles = {
      default: `
        bg-[${colors.surface.DEFAULT}] 
        border-[${colors.hairline.DEFAULT}]
        text-[${colors.paper.DEFAULT}]
        placeholder:text-[${colors.paper.muted}]/50
        focus:border-[${colors.gold.DEFAULT}]
        focus:ring-2 focus:ring-[${colors.gold.wash}]
        ${error ? `border-[${colors.evidence.DEFAULT}] focus:border-[${colors.evidence.DEFAULT}] focus:ring-[${colors.evidence.wash}]` : ""}
      `,
      filled: `
        bg-[${colors.surface.raised}]
        border-transparent
        text-[${colors.paper.DEFAULT}]
        placeholder:text-[${colors.paper.muted}]/50
        focus:bg-[${colors.surface.elevated}]
        focus:border-[${colors.gold.DEFAULT}]
        ${error ? `border-[${colors.evidence.DEFAULT}]` : ""}
      `,
    };

    return (
      <div className={`relative ${className}`}>
        {/* Floating Label */}
        {label && (
          <motion.label
            htmlFor={inputId}
            initial={false}
            animate={{
              y: isFocused || hasValue ? -28 : 0,
              scale: isFocused || hasValue ? 0.85 : 1,
              color:
                error
                  ? colors.evidence.DEFAULT
                  : isFocused
                    ? colors.gold.DEFAULT
                    : colors.paper.muted,
            }}
            transition={{ duration: 0.2 }}
            className="absolute left-4 top-3.5 origin-left pointer-events-none z-10 text-base"
            style={{ color: colors.paper.muted }}
          >
            {label}
          </motion.label>
        )}

        {/* Left Icon */}
        {leftIcon && (
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: isFocused ? colors.gold.DEFAULT : colors.paper.muted }}
          >
            {leftIcon}
          </div>
        )}

        {/* Input */}
        <input
          ref={ref}
          id={inputId}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          className={`${baseInputStyles} ${variantStyles[variant]} ${label ? "pt-5 pb-2" : ""}`}
          style={{
            backgroundColor: variant === "default" ? colors.surface.DEFAULT : colors.surface.raised,
            borderColor: error
              ? colors.evidence.DEFAULT
              : isFocused
                ? colors.gold.DEFAULT
                : colors.hairline.DEFAULT,
            color: colors.paper.DEFAULT,
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />

        {/* Right Icon */}
        {rightIcon && (
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2"
            style={{ color: colors.paper.muted }}
          >
            {rightIcon}
          </div>
        )}

        {/* Error or Hint Message */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              id={`${inputId}-error`}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1.5 text-sm flex items-center gap-1.5"
              style={{ color: colors.evidence.DEFAULT }}
              role="alert"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </motion.p>
          )}
          {hint && !error && (
            <motion.p
              id={`${inputId}-hint`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5 text-sm"
              style={{ color: colors.paper.muted }}
            >
              {hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

Input.displayName = "Input";

// ============================================================================
// Textarea Component with Floating Label
// ============================================================================

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  showCount?: boolean;
  maxLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      showCount = false,
      maxLength,
      className = "",
      id,
      value,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== "";
    const textareaId = id || `textarea-${label?.toLowerCase().replace(/\s+/g, "-")}`;
    const charCount = typeof value === "string" ? value.length : 0;

    return (
      <div className={`relative ${className}`}>
        {/* Floating Label */}
        {label && (
          <motion.label
            htmlFor={textareaId}
            initial={false}
            animate={{
              y: isFocused || hasValue ? -28 : 0,
              scale: isFocused || hasValue ? 0.85 : 1,
              color:
                error
                  ? colors.evidence.DEFAULT
                  : isFocused
                    ? colors.gold.DEFAULT
                    : colors.paper.muted,
            }}
            transition={{ duration: 0.2 }}
            className="absolute left-4 top-3.5 origin-left pointer-events-none z-10 text-base"
          >
            {label}
          </motion.label>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          id={textareaId}
          value={value}
          maxLength={maxLength}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          className={`
            w-full px-4 py-3 text-base transition-all duration-200
            rounded-xl border outline-none resize-none min-h-[120px]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${label ? "pt-6 pb-2" : ""}
          `}
          style={{
            backgroundColor: colors.surface.DEFAULT,
            borderColor: error
              ? colors.evidence.DEFAULT
              : isFocused
                ? colors.gold.DEFAULT
                : colors.hairline.DEFAULT,
            color: colors.paper.DEFAULT,
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          {...props}
        />

        {/* Character Count */}
        {showCount && maxLength && (
          <div
            className="absolute bottom-2 right-3 text-xs"
            style={{
              color: charCount >= maxLength ? colors.evidence.DEFAULT : colors.paper.muted,
            }}
          >
            {charCount}/{maxLength}
          </div>
        )}

        {/* Error or Hint Message */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              id={`${textareaId}-error`}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-1.5 text-sm flex items-center gap-1.5"
              style={{ color: colors.evidence.DEFAULT }}
              role="alert"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </motion.p>
          )}
          {hint && !error && (
            <motion.p
              id={`${textareaId}-hint`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5 text-sm"
              style={{ color: colors.paper.muted }}
            >
              {hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

// ============================================================================
// Select Component
// ============================================================================

export interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, className = "", id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const selectId = id || `select-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <div className={`relative ${className}`}>
        {/* Label */}
        {label && (
          <label
            htmlFor={selectId}
            className="block mb-1.5 text-sm font-medium"
            style={{ color: error ? colors.evidence.DEFAULT : colors.paper.muted }}
          >
            {label}
          </label>
        )}

        {/* Select */}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            className="
              w-full px-4 py-3 pr-10 text-base transition-all duration-200
              rounded-xl border outline-none appearance-none cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            style={{
              backgroundColor: colors.surface.DEFAULT,
              borderColor: error
                ? colors.evidence.DEFAULT
                : isFocused
                  ? colors.gold.DEFAULT
                  : colors.hairline.DEFAULT,
              color: colors.paper.DEFAULT,
            }}
            aria-invalid={!!error}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ backgroundColor: colors.ink.DEFAULT }}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Dropdown Arrow */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.paper.muted}
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Error or Hint */}
        {error && (
          <p className="mt-1.5 text-sm" style={{ color: colors.evidence.DEFAULT }}>
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-sm" style={{ color: colors.paper.muted }}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

// ============================================================================
// Checkbox Component
// ============================================================================

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = "", id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${label.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <label
        htmlFor={checkboxId}
        className={`flex items-start gap-3 cursor-pointer group ${className}`}
      >
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className="peer sr-only"
            {...props}
          />
          <div
            className="
              w-5 h-5 rounded-md border-2 transition-all duration-200
              peer-checked:border-transparent peer-checked:bg-[#C9A227]
              peer-focus-visible:ring-2 peer-focus-visible:ring-[#C9A227]/30
              peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
              group-hover:border-[#C9A227]/50
            "
            style={{ borderColor: colors.hairline.strong }}
          />
          <svg
            className="
              absolute top-0.5 left-0.5 w-4 h-4 opacity-0 transition-opacity duration-200
              peer-checked:opacity-100
            "
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.ink.DEFAULT}
            strokeWidth="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <span className="text-base" style={{ color: colors.paper.DEFAULT }}>
            {label}
          </span>
          {description && (
            <p className="text-sm mt-0.5" style={{ color: colors.paper.muted }}>
              {description}
            </p>
          )}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";

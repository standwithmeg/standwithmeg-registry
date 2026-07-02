"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  ReactNode,
} from "react";
import { AnimatePresence } from "framer-motion";
import { Toast } from "@/components/ui/Toast";

// ============================================================================
// TYPES
// ============================================================================

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

export interface ToastOptions {
  duration?: number;
}

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_DURATION = 5000; // 5 seconds
const MAX_TOASTS = 5;

// ============================================================================
// CONTEXT
// ============================================================================

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================================================
// HOOK
// ============================================================================

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============================================================================
// PROVIDER
// ============================================================================

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdCounter = useRef(0);

  // Generate unique ID
  const generateId = useCallback(() => {
    toastIdCounter.current += 1;
    return `toast-${toastIdCounter.current}-${Date.now()}`;
  }, []);

  // Dismiss a specific toast
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dismiss all toasts
  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Add a new toast
  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info", options?: ToastOptions): string => {
      const id = generateId();
      const duration = options?.duration ?? DEFAULT_DURATION;

      setToasts((prev) => {
        // If we already have MAX_TOASTS, remove the oldest one(s)
        const updated = [...prev];
        while (updated.length >= MAX_TOASTS) {
          updated.shift(); // Remove oldest (first in array)
        }
        return [...updated, { id, message, variant, duration }];
      });

      return id;
    },
    [generateId]
  );

  // Create the toast function
  const toast = useCallback(
    (message: string, variant?: ToastVariant, options?: ToastOptions) => {
      return addToast(message, variant, options);
    },
    [addToast]
  );

  const contextValue: ToastContextValue = {
    toast,
    dismiss,
    dismissAll,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast Container - Fixed at bottom-right */}
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          zIndex: 80, // zIndex.toast from design tokens
          pointerEvents: "none",
        }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              id={t.id}
              message={t.message}
              variant={t.variant}
              duration={t.duration}
              onDismiss={dismiss}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

"use client";

import { ReactNode, useEffect } from "react";
import { ToastProvider } from "@/lib/toast-context";
import { WelcomeModal } from "@/components/Onboarding/WelcomeModal";
import { AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@supabase/ssr";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") {
          const protectedPaths = ["/admin", "/connect", "/report"];
          const currentPath = window.location.pathname;
          if (protectedPaths.some((p) => currentPath.startsWith(p))) {
            window.location.href = "/swm-login";
          }
        }
      }
    );

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith("sb-") && e.key.endsWith("-auth-token")) {
        supabase.auth.getSession();
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return (
    <ToastProvider>
      <AnimatePresence mode="wait">
        {children}
      </AnimatePresence>
      <WelcomeModal />
    </ToastProvider>
  );
}
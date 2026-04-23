"use client";

import { useState, useEffect } from "react";
import { AccessGate } from "./_components/AccessGate";
import { DashboardView } from "./_components/DashboardView";

const STORAGE_KEY = "swm_dashboard_access";

export default function ImpactPage() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = checking

  // SSR-safe one-time check of URL + localStorage on mount. Intentional:
  // hasAccess starts null so server and client both render the spinner,
  // then the client resolves to true/false after hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin_preview") === "1") {
      setHasAccess(true);
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.email && parsed.granted_at) {
          setHasAccess(true);
          return;
        }
      }
    } catch {
      // invalid JSON — treat as no access
    }
    setHasAccess(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleGateComplete(data: { email: string; state_of_interest: string }) {
    const record = { ...data, granted_at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setHasAccess(true);
  }

  // Still checking localStorage
  if (hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0F1E30" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#C9A227 transparent #C9A227 #C9A227" }} />
      </div>
    );
  }

  if (!hasAccess) {
    return <AccessGate onComplete={handleGateComplete} />;
  }

  return <DashboardView />;
}

"use client";

import { useState, useEffect } from "react";
import { AccessGate } from "./_components/AccessGate";
import { DashboardView } from "./_components/DashboardView";

const STORAGE_KEY = "swm_dashboard_access";

export default function ImpactPage() {
  const [hasAccess, setHasAccess] = useState(false);

  // SSR-safe one-time check of URL + localStorage on mount. The server renders
  // the access gate first so the public page has meaningful no-JS/SEO content.
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

  if (!hasAccess) {
    return <AccessGate onComplete={handleGateComplete} />;
  }

  return <DashboardView />;
}

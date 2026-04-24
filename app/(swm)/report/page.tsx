"use client";

import { useState } from "react";
import { AccessGate } from "./_components/AccessGate";
import { DashboardView } from "./_components/DashboardView";

const STORAGE_KEY = "swm_dashboard_access";

// Synchronously determine access on first render. Runs on server as false
// (so the HTML has meaningful no-JS/SEO content — the AccessGate). Runs on
// client with access=true for returning visitors, BEFORE the browser paints.
// This eliminates the ~50ms gate flash returning users used to see.
function readAccessSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin_preview") === "1") return true;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return Boolean(parsed?.email && parsed?.granted_at);
  } catch {
    return false;
  }
}

export default function ImpactPage() {
  // Lazy initializer: runs once on first client render, before paint.
  // Returning visitors see the dashboard immediately, no flash of the gate.
  const [hasAccess, setHasAccess] = useState(readAccessSync);

  function handleGateComplete(data: { email: string; state_of_interest: string }) {
    const record = { ...data, granted_at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setHasAccess(true);
  }

  // suppressHydrationWarning: the server always renders the gate (hasAccess
  // starts false on SSR) but a returning user's client renders the dashboard.
  // That mismatch is intentional and safe — client is the source of truth.
  return (
    <div suppressHydrationWarning>
      {hasAccess ? (
        <DashboardView />
      ) : (
        <AccessGate onComplete={handleGateComplete} />
      )}
    </div>
  );
}

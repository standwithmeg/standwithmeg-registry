"use client";

import { useState, useSyncExternalStore } from "react";
import { AccessGate } from "./AccessGate";
import { DashboardView } from "./DashboardView";
import type { ReportInitialCourtActors } from "../../../../lib/report-initial-court-actors";

const STORAGE_KEY = "swm_dashboard_access";

type GateData = {
  email: string;
  state_of_interest: string;
  first_name: string;
  last_name: string;
  organization?: string;
};

function readStoredAccess(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return Boolean(parsed?.email && parsed?.granted_at);
  } catch {
    return false;
  }
}

function subscribeToStoredAccess(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getServerAccessSnapshot() {
  return false;
}

export function ReportAccessClient({
  initialHasAccess,
  initialCourtActors,
}: {
  initialHasAccess: boolean;
  initialCourtActors: ReportInitialCourtActors;
}) {
  const storedAccess = useSyncExternalStore(
    subscribeToStoredAccess,
    readStoredAccess,
    getServerAccessSnapshot,
  );
  const [gateGranted, setGateGranted] = useState(false);
  const hasAccess = initialHasAccess || storedAccess || gateGranted;

  function handleGateComplete(data: GateData) {
    const record = { ...data, granted_at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setGateGranted(true);
  }

  return (
    <main>
      {hasAccess ? (
        <DashboardView initialCourtActors={initialCourtActors} />
      ) : (
        <AccessGate onComplete={handleGateComplete} />
      )}
    </main>
  );
}

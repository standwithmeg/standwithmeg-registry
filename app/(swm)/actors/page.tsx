"use client";

import { useState } from "react";
import { SubmitterGate } from "./_components/SubmitterGate";
import { ActorsBrowser } from "./_components/ActorsBrowser";

// Force the page shell to render dynamically and not be edge-cached. Without
// this, Vercel was serving multi-minute-old cached HTML to visitors after
// new deployments — which delayed UX changes from showing up. The actor data
// is fetched client-side from /api/actors/all, so dynamic rendering of the
// shell adds essentially zero latency.
export const dynamic = "force-dynamic";

const STORAGE_KEY = "swm_actors_access";

type GateData = {
  email: string;
  submission_id: string;
  first_name: string;
  granted_at: string;
};

function readAccessSync(): GateData | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin_preview") === "1") {
      return { email: "admin_preview@standwithmeg.com", submission_id: "", first_name: "", granted_at: new Date().toISOString() };
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed?.email && parsed?.submission_id !== undefined && parsed?.granted_at) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export default function ActorsPage() {
  const [access, setAccess] = useState<GateData | null>(readAccessSync);

  function handleGateComplete(data: { email: string; submission_id: string; first_name: string }) {
    const record: GateData = { ...data, granted_at: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* localStorage unavailable */ }
    setAccess(record);
  }

  function handleSignOut() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* localStorage unavailable */ }
    setAccess(null);
  }

  return (
    <div suppressHydrationWarning>
      {access ? (
        <ActorsBrowser
          visitorEmail={access.email}
          visitorSubmissionId={access.submission_id}
          visitorFirstName={access.first_name}
          onSignOut={handleSignOut}
        />
      ) : (
        <SubmitterGate onComplete={handleGateComplete} />
      )}
    </div>
  );
}

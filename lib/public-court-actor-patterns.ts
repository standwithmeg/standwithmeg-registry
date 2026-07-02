import { headers } from "next/headers";
import {
  courtActorPacketId,
  courtActorComplaintPacketUrl,
} from "./complaint-routing/courtActorPacketId";

export { courtActorSlug, courtActorPacketId, courtActorComplaintPacketUrl } from "./complaint-routing/courtActorPacketId";

export type PublicCourtActorPatternCategory = {
  label: string;
  count: number;
};

export type PublicCourtActorPattern = {
  id: string;
  role: string;
  roles: string[];
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  public_status: true;
  latest_reported_at: string | null;
  actor_report_url: string;
  complaint_packet_url: string;
  pattern_categories: PublicCourtActorPatternCategory[];
};

type ApiActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  latest_reported_at?: string | null;
};

async function fetchPublicActors(): Promise<ApiActor[]> {
  // Build the internal URL from the active request so the helper works on
  // localhost, preview, and production without env vars. Falls back to env
  // when headers are not available (e.g. during a non-request render path).
  let origin: string | null = null;
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      origin = `${proto}://${host}`;
    }
  } catch {
    // Outside a request context — fall through to env fallback.
  }
  if (!origin) {
    const envOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
    if (!envOrigin) return [];
    origin = envOrigin.startsWith("http") ? envOrigin : `https://${envOrigin}`;
  }
  try {
    const res = await fetch(`${origin}/api/survey/court-actors`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.actors ?? []) as ApiActor[];
  } catch {
    return [];
  }
}

function toPattern(actor: ApiActor): PublicCourtActorPattern {
  // The API roleSummary() formats roles as "Role A / Role B" with an optional
  // " + N more roles" tail when there are 4+. Split on "/" and strip the tail
  // so getComplaintAgenciesForActor can match each role to its agency.
  const baseRole = actor.role.split(/\s+\+\s+\d+\s+more/)[0];
  const roles = baseRole
    .split(/\s*\/\s*/)
    .map(r => r.trim())
    .filter(Boolean);
  return {
    id: courtActorPacketId(actor),
    role: actor.role,
    roles,
    name: actor.name,
    court_or_county: actor.court_or_county,
    state_code: actor.state_code,
    location_key: actor.location_key,
    count: actor.count,
    public_status: true,
    latest_reported_at: actor.latest_reported_at ?? null,
    actor_report_url: "/report#court-actors",
    complaint_packet_url: courtActorComplaintPacketUrl(actor),
    pattern_categories: [],
  };
}

export async function findPublicCourtActorByPacketId(actorId: string): Promise<PublicCourtActorPattern | null> {
  const actors = await fetchPublicActors();
  for (const actor of actors) {
    if (courtActorPacketId(actor) === actorId) return toPattern(actor);
  }
  return null;
}

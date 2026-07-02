import "server-only";

import actorManifest from "../public/court-actors/manifest.json";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorLooseNameKey } from "./court-actors";

const INITIAL_ACTOR_PAGE_SIZE = 50;

type ManifestEntry = {
  slug: string;
  state_abbr: string | null;
  display_name: string | null;
  canonical_name: string | null;
  actor_bucket_key: string | null;
  photo_url: string | null;
  share_url: string | null;
};

export type ReportInitialCourtActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  submission_count: number;
  latest_reported_at: string | null;
  photo_url: string | null;
  share_url: string | null;
};

export type ReportInitialCourtActors = {
  actors: ReportInitialCourtActor[];
  total: number;
  threshold: number;
  counts: Record<string, number>;
  data_mode: "live" | "snapshot";
};

const GENERATED_AT = typeof actorManifest.generated_at === "string"
  ? actorManifest.generated_at
  : null;

function manifestEntries(): ManifestEntry[] {
  return (actorManifest.actors ?? []) as ManifestEntry[];
}

function actorCountsByLocation(actors: ReportInitialCourtActor[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const actor of actors) {
    const location = actor.location_key || actor.state_code;
    if (!location) continue;
    counts[location] = (counts[location] ?? 0) + 1;
  }
  return counts;
}

function loadFromManifest(): ReportInitialCourtActor[] {
  return manifestEntries()
    .filter(entry => entry.slug && entry.state_abbr && entry.share_url)
    .map(entry => {
      const state = entry.state_abbr!.trim().toUpperCase();
      const name = entry.display_name || entry.canonical_name || entry.slug.replace(/_/g, " ");
      return {
        role: "Court Actor",
        name,
        court_or_county: null,
        state_code: state,
        location_key: state,
        count: COURT_ACTOR_PUBLIC_THRESHOLD,
        submission_count: COURT_ACTOR_PUBLIC_THRESHOLD,
        latest_reported_at: GENERATED_AT,
        photo_url: entry.photo_url ?? null,
        share_url: entry.share_url ?? null,
      };
    })
    .sort((a, b) => (a.state_code ?? "").localeCompare(b.state_code ?? "") || a.name.localeCompare(b.name));
}

function reportOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost}`;
  return null;
}

async function tryFetchLiveCourtActorCounts(origin: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(
      `${origin}/api/survey/court-actors?counts_only=1&v=2`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const data = await res.json() as { counts?: Record<string, number> };
    const counts = data.counts ?? null;
    return counts && Object.keys(counts).length > 0 ? counts : null;
  } catch (err) {
    console.error("loadReportInitialCourtActors counts fetch failed:", err);
    return null;
  }
}

async function tryFetchLiveCourtActors(origin: string): Promise<ReportInitialCourtActors | null> {
  try {
    const [countsRes, actorsRes] = await Promise.all([
      tryFetchLiveCourtActorCounts(origin),
      fetch(
        `${origin}/api/survey/court-actors?limit=${INITIAL_ACTOR_PAGE_SIZE}&offset=0&v=2`,
        { next: { revalidate: 300 } },
      ),
    ]);
    if (!actorsRes.ok) return null;
    const data = await actorsRes.json() as {
      actors?: ReportInitialCourtActor[];
      total?: number;
      threshold?: number;
      data_mode?: "live" | "snapshot";
    };
    const actors = data.actors ?? [];
    if (actors.length === 0) return null;
    return {
      actors,
      total: data.total ?? actors.length,
      threshold: data.threshold ?? COURT_ACTOR_PUBLIC_THRESHOLD,
      counts: countsRes ?? actorCountsByLocation(actors),
      data_mode: data.data_mode === "snapshot" ? "snapshot" : "live",
    };
  } catch (err) {
    console.error("loadReportInitialCourtActors fetch failed:", err);
    return null;
  }
}

export async function loadReportInitialCourtActors(): Promise<ReportInitialCourtActors> {
  const origin = reportOrigin();
  if (origin) {
    const live = await tryFetchLiveCourtActors(origin);
    if (live) return live;
  }

  const snapshot = loadFromManifest();
  const actors = snapshot.slice(0, INITIAL_ACTOR_PAGE_SIZE);
  return {
    actors,
    total: snapshot.length,
    threshold: COURT_ACTOR_PUBLIC_THRESHOLD,
    counts: actorCountsByLocation(snapshot),
    data_mode: "snapshot",
  };
}
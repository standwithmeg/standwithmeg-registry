import "server-only";

import { promises as fs } from "fs";
import path from "path";
import reportIndex from "../public/state-reports/index.json";
import reportFinancials from "../public/state-reports/financials.json";
import actorManifest from "../public/court-actors/manifest.json";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorLooseNameKey } from "./court-actors";
import { formatCourtActorLocationLabel } from "./court-actor-display";
import { US_JURISDICTION_NAMES } from "./us-jurisdictions";

type ReportIndexEntry = {
  state: string;
  submissions: number;
  file: string;
  size_kb: number;
};

type ManifestEntry = {
  slug: string;
  state_abbr: string | null;
  display_name: string | null;
  canonical_name: string | null;
  photo_url: string | null;
  share_url: string | null;
};

type ActorSpec = {
  actor?: {
    slug?: string;
    display_name?: string;
    canonical_name?: string;
    role?: string;
    court_or_county?: string | null;
    court?: string | null;
    county?: string | null;
    state_abbr?: string;
    public_family_count?: number;
    family_count?: number;
    mention_count?: number;
  };
  state_stats?: {
    families_approved?: number;
    total_submissions?: number;
    avg_financial_loss?: number;
    avg_months_lost?: number;
    pro_se_count?: number;
  };
  movement_total?: number;
  supabase?: {
    public_comments?: Array<{
      comment_text?: string;
      author?: string;
      court_or_county?: string | null;
    }>;
  };
};

type StaticStateRow = {
  state: string;
  is_us: boolean;
  total_submissions: number;
  approved_count: number;
  avg_financial_loss: number | null;
  total_financial_loss: number | null;
  avg_months_lost: number | null;
  total_loss_count: number;
  pro_se_count: number;
  last_submission_at: string;
};

type StaticActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  count: number;
  latest_reported_at: string | null;
  photo_url: string | null;
  share_url: string | null;
};

type RankedStaticActor = StaticActor & {
  _slug: string | null;
  _rank: number;
};

type StaticQuote = {
  id: string;
  quote: string;
  attribution: string;
  state: string | null;
  county: string | null;
  created_at: string;
};

const GENERATED_AT = typeof actorManifest.generated_at === "string"
  ? actorManifest.generated_at
  : new Date().toISOString();

const SPEC_CACHE = new Map<string, Promise<ActorSpec | null>>();

function isUsLocation(location: string): boolean {
  return Object.prototype.hasOwnProperty.call(US_JURISDICTION_NAMES, location);
}

function manifestEntries(): ManifestEntry[] {
  return (actorManifest.actors ?? []) as ManifestEntry[];
}

async function rootRelativePublicAssetExists(assetUrl: string | null | undefined): Promise<boolean> {
  const url = assetUrl?.trim();
  if (!url || !url.startsWith("/") || url.startsWith("//")) return false;
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/court-actors/")) return false;
  const publicRoot = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(publicRoot, pathname.slice(1));
  if (!resolved.startsWith(`${publicRoot}${path.sep}`)) return false;
  try {
    const stat = await fs.stat(resolved);
    return stat.isFile();
  } catch {
    return false;
  }
}

function slugifyActorName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function staticActorDedupeKey(actor: StaticActor): string {
  return [
    actor.location_key ?? actor.state_code ?? "",
    actorLooseNameKey(actor.name),
    actor.role.toLowerCase().replace(/\s+/g, " ").trim(),
  ].join("|");
}

function staticActorRank(actor: StaticActor, slug: string | null): number {
  let rank = actor.count * 100;
  if (actor.share_url) rank += 10;
  if (actor.photo_url) rank += 5;
  if (slug && slug === slugifyActorName(actor.name)) rank += 20;
  return rank;
}

async function readSpec(entry: ManifestEntry): Promise<ActorSpec | null> {
  if (!entry.state_abbr || !entry.slug) return null;
  const specPath = path.join(
    process.cwd(),
    "public",
    "court-actors",
    entry.state_abbr.toLowerCase(),
    entry.slug,
    "spec.json",
  );

  let promise = SPEC_CACHE.get(specPath);
  if (!promise) {
    promise = fs.readFile(specPath, "utf8")
      .then(text => JSON.parse(text) as ActorSpec)
      .catch(() => null);
    SPEC_CACHE.set(specPath, promise);
  }
  return promise;
}

async function loadSpecs(): Promise<Array<{ entry: ManifestEntry; spec: ActorSpec | null }>> {
  return Promise.all(manifestEntries().map(async entry => ({
    entry,
    spec: await readSpec(entry),
  })));
}

export async function loadStaticMovementStats() {
  const specs = await loadSpecs();
  const statsByLocation = new Map<string, ActorSpec["state_stats"]>();
  let movementTotal = 0;

  for (const { spec } of specs) {
    const location = spec?.actor?.state_abbr;
    if (location && spec.state_stats && !statsByLocation.has(location)) {
      statsByLocation.set(location, spec.state_stats);
    }
    if (typeof spec?.movement_total === "number") {
      movementTotal = Math.max(movementTotal, spec.movement_total);
    }
  }

  const reportRows = new Map(((reportIndex as ReportIndexEntry[]) ?? []).map(entry => [entry.state, entry]));

  // Capped (≤$5M/submission) per-state loss totals, sourced from the same
  // movement_stats_by_state view the live API uses and refreshed by the hourly
  // regen workflow (scripts/pdf/sync_state_financials.py). Reading these here
  // lets the snapshot show a real "total reported loss" figure when live
  // Supabase is briefly unreachable, instead of an empty "In state reports".
  const financials = reportFinancials as {
    total_financial_loss?: number;
    by_state?: Record<string, number>;
  };
  const lossByState = financials.by_state ?? {};

  const locations = new Set<string>([
    ...reportRows.keys(),
    ...statsByLocation.keys(),
  ]);

  const byState: StaticStateRow[] = Array.from(locations)
    .map(location => {
      const entry = reportRows.get(location);
      const stats = statsByLocation.get(location);
      const totalSubmissions = Number(stats?.total_submissions ?? entry?.submissions ?? 0) || 0;
      return {
        state: location,
        is_us: isUsLocation(location),
        total_submissions: totalSubmissions,
        approved_count: Number(stats?.families_approved ?? entry?.submissions ?? 0) || 0,
        avg_financial_loss: typeof stats?.avg_financial_loss === "number" ? stats.avg_financial_loss : null,
        // Capped total-loss value mirrored from the movement_stats_by_state
        // view (see financials.json). Blank only when this location is absent
        // from the snapshot, so we never derive a misleading total.
        total_financial_loss: typeof lossByState[location] === "number" ? lossByState[location] : null,
        avg_months_lost: typeof stats?.avg_months_lost === "number" ? stats.avg_months_lost : null,
        total_loss_count: 0,
        pro_se_count: Number(stats?.pro_se_count ?? 0) || 0,
        last_submission_at: GENERATED_AT,
      };
    })
    .filter(row => row.total_submissions > 0)
    .sort((a, b) => b.total_submissions - a.total_submissions || a.state.localeCompare(b.state));

  const snapshotRowsTotal = byState.reduce((sum, row) => sum + row.total_submissions, 0);
  const total = movementTotal || byState.reduce((sum, row) => sum + row.total_submissions, 0);
  // Prefer the view's pre-aggregated capped total (covers every location,
  // including sub-threshold states without a public PDF row) over re-summing
  // the snapshot rows, which would undercount.
  const snapshotTotalFinancialLoss =
    typeof financials.total_financial_loss === "number" && financials.total_financial_loss > 0
      ? financials.total_financial_loss
      : byState.reduce((sum, row) => sum + (Number(row.total_financial_loss) || 0), 0);
  return {
    total,
    by_state: byState,
    data_mode: "snapshot",
    snapshot_generated_at: GENERATED_AT,
    snapshot_rows_total: snapshotRowsTotal,
    snapshot_unallocated_submissions: Math.max(0, total - snapshotRowsTotal),
    snapshot_total_financial_loss: snapshotTotalFinancialLoss,
  };
}

export async function loadStaticPublicActors(locationFilter?: string | null) {
  const normalizedLocation = locationFilter?.trim().toUpperCase() || null;
  const specs = await loadSpecs();
  const actorsByKey = new Map<string, RankedStaticActor>();

  for (const { entry, spec } of specs) {
    const actor = spec?.actor;
    const location = actor?.state_abbr ?? entry.state_abbr ?? null;
    if (!location) continue;
    if (normalizedLocation && location !== normalizedLocation) continue;

    const count = Number(actor?.public_family_count ?? actor?.family_count ?? actor?.mention_count ?? 0) || 0;
    if (count < COURT_ACTOR_PUBLIC_THRESHOLD) continue;

    const name = actor?.display_name || actor?.canonical_name || entry.display_name || entry.canonical_name || entry.slug;
    const [photoExists, shareExists] = await Promise.all([
      rootRelativePublicAssetExists(entry.photo_url),
      rootRelativePublicAssetExists(entry.share_url),
    ]);
    const candidate: RankedStaticActor = {
      role: actor?.role || "Court Actor",
      name,
      court_or_county: formatCourtActorLocationLabel(actor?.court_or_county ?? actor?.court ?? actor?.county ?? null),
      state_code: location,
      location_key: location,
      count,
      latest_reported_at: GENERATED_AT,
      photo_url: photoExists ? entry.photo_url ?? null : null,
      share_url: shareExists ? entry.share_url ?? null : null,
      _slug: entry.slug ?? actor?.slug ?? null,
      _rank: 0,
    };
    candidate._rank = staticActorRank(candidate, candidate._slug);

    const key = staticActorDedupeKey(candidate);
    const existing = actorsByKey.get(key);
    if (!existing || candidate._rank > existing._rank) {
      actorsByKey.set(key, candidate);
    }
  }

  return Array.from(actorsByKey.values())
    .map(actor => ({
      role: actor.role,
      name: actor.name,
      court_or_county: actor.court_or_county,
      state_code: actor.state_code,
      location_key: actor.location_key,
      count: actor.count,
      latest_reported_at: actor.latest_reported_at,
      photo_url: actor.photo_url,
      share_url: actor.share_url,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function loadStaticPublicQuotes(stateFilter?: string | null) {
  const normalizedState = stateFilter?.trim().toUpperCase() || null;
  const specs = await loadSpecs();
  const seen = new Set<string>();
  const quotes: StaticQuote[] = [];

  for (const { entry, spec } of specs) {
    const location = spec?.actor?.state_abbr ?? entry.state_abbr ?? null;
    if (!location) continue;
    if (normalizedState && location !== normalizedState) continue;

    for (const comment of spec?.supabase?.public_comments ?? []) {
      const quote = comment.comment_text?.trim();
      if (!quote) continue;
      const key = `${location}|${quote.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      quotes.push({
        id: `static-${location}-${seen.size}`,
        quote,
        attribution: comment.author || "Anonymous parent",
        state: location,
        county: comment.court_or_county ?? spec?.actor?.court_or_county ?? null,
        created_at: GENERATED_AT,
      });
    }
  }

  return quotes;
}

export async function loadStaticQuoteCounts() {
  const quotes = await loadStaticPublicQuotes();
  const counts: Record<string, number> = {};
  for (const quote of quotes) {
    if (!quote.state) continue;
    counts[quote.state] = (counts[quote.state] ?? 0) + 1;
  }
  return counts;
}

export function staticReportResources() {
  return ((reportIndex as ReportIndexEntry[]) ?? []).map(entry => ({
    state: entry.state,
    state_name: US_JURISDICTION_NAMES[entry.state as keyof typeof US_JURISDICTION_NAMES] ?? entry.state,
    submissions: entry.submissions,
    pdf: entry.file,
    size_kb: entry.size_kb,
  }));
}

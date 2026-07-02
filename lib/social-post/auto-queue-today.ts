import {
  crossedThresholdTodayCandidates,
  type DiscoverCandidate,
  discoverSocialPostCandidates,
  invalidateDiscoverCache,
} from "./discover";
import { stageCourtActorSocialPosts } from "./stage";

const DEFAULT_MAX_AUTO_QUEUE = 12;

export type AutoQueueTodayResult = {
  ok: true;
  candidates: number;
  queued: number;
  staged: Array<{ actor: string; status: string; note?: string }>;
  skipped: Array<{ actor: string; reason: string }>;
};

type PartyLane = "D" | "R" | "mixed";

function candidatePartyLane(candidate: DiscoverCandidate): PartyLane {
  // Use state-level D/R balancing for the daily social queue.
  // Since we now guarantee a Democrat + Republican in the state legislator
  // block for each post, derive lane from the state (for feed variety)
  // rather than the (now mixed) leg pair.
  const st = (candidate.state_abbr || "").toUpperCase().trim();
  if (!st) return "mixed";
  // Deterministic per-state assignment for stable rotation across days.
  // This ensures the auto-queue mixes posts across states for D/R surface.
  const hash = st.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return Math.abs(hash) % 2 === 0 ? "D" : "R";
}

function balancePartyLanes(candidates: DiscoverCandidate[]): DiscoverCandidate[] {
  const lanes: Record<PartyLane, DiscoverCandidate[]> = { D: [], R: [], mixed: [] };
  for (const candidate of candidates) {
    lanes[candidatePartyLane(candidate)].push(candidate);
  }

  // State-level D/R balance: interleave Democrat and Republican lanes (by state)
  // before the daily slice so the social pipeline surfaces both.
  if (lanes.D.length === 0 || lanes.R.length === 0) return [...candidates];

  const originalLane = candidatePartyLane(candidates[0]);
  let next: "D" | "R" = lanes.D.length > lanes.R.length
    ? "R"
    : lanes.R.length > lanes.D.length
      ? "D"
      : originalLane === "R"
        ? "R"
        : "D";
  const balanced: DiscoverCandidate[] = [];

  while (lanes.D.length > 0 || lanes.R.length > 0) {
    const primary = lanes[next];
    const fallback = lanes[next === "D" ? "R" : "D"];
    const picked = primary.shift() ?? fallback.shift();
    if (picked) balanced.push(picked);
    next = next === "D" ? "R" : "D";
  }

  return [...balanced, ...lanes.mixed];
}

export async function autoQueueCrossedTodayWithPhotos(options: {
  max?: number;
  skipEmail?: boolean;
  source?: string;
} = {}): Promise<AutoQueueTodayResult> {
  const max = Math.max(1, Math.min(options.max ?? DEFAULT_MAX_AUTO_QUEUE, 24));
  const skipEmail = options.skipEmail !== false;
  const source = options.source ?? "auto-queue-today";

  const discover = await discoverSocialPostCandidates({ mode: "lite", refresh: true });
  const candidates = balancePartyLanes(crossedThresholdTodayCandidates(discover).filter(
    candidate => candidate.likely_stageable && candidate.has_photo,
  )).slice(0, max);

  const staged: AutoQueueTodayResult["staged"] = [];
  const skipped: AutoQueueTodayResult["skipped"] = [];
  let queued = 0;

  for (const candidate of candidates) {
    const result = await stageCourtActorSocialPosts({
      actorBucketKey: candidate.actor_bucket_key,
      skipEmail,
      forceRequeue: false,
      source,
    });
    if (result.staged.length > 0) {
      queued += 1;
    }
    staged.push(...result.staged);
    skipped.push(...result.skipped);
  }

  invalidateDiscoverCache();

  return {
    ok: true,
    candidates: candidates.length,
    queued,
    staged,
    skipped,
  };
}

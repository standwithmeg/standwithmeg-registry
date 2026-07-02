"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolvePublicAssetUrl } from "../../../../lib/court-actor-public-url";
import { INSTAGRAM_CAPTION_MAX_CHARS } from "../../../../lib/social-post/caption-limits";

const GOLD = "#C9A227";

type QueueRow = {
  id: string;
  actor_bucket_key: string;
  actor_slug: string;
  state_abbr: string;
  actor_name: string;
  role: string;
  county: string | null;
  status: string;
  package_json: {
    actor_name: string;
    role: string;
    county: string | null;
    state_abbr: string;
    family_count: number;
    frames: Array<{ url: string; filename: string; order: number }>;
    captions: {
      facebook: string;
      instagram: string;
      x: string;
      firstComment: string;
      legislatorComment?: string;
      locationTag: string;
    };
    legislators: Array<{
      level: string;
      party: string | null;
      name: string;
      title: string;
      handle?: string;
      profile_url?: string;
      socials?: Array<{
        platform: string;
        handle?: string;
        url: string;
      }>;
      note?: string;
    }>;
    stats: {
      state_family_count: number | null;
      median_financial_loss: number | null;
      pro_se_pct: number | null;
      median_months_lost: number | null;
      movement_total: number | null;
    };
    quotes: Array<{ text: string; attribution: string }>;
    share_url: string;
    hero_url?: string;
    portrait_verified?: boolean;
  };
  review_notes: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
};

type ActionResponse = {
  error?: string;
  posted?: boolean;
  partial?: boolean;
  succeeded_platforms?: string[];
  failed_platforms?: string[];
  results?: Array<{
    platform?: string;
    success?: boolean;
    error?: string;
    postId?: string;
  }>;
};

const X_EDIT_WINDOW_MS = 60 * 60 * 1000;
const TAG_NOW_WINDOW_MS = 2 * 60 * 60 * 1000;
const POSTED_THIS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type DiscoverCandidate = {
  actor_bucket_key: string;
  actor_name: string;
  role: string;
  state_abbr: string;
  county: string | null;
  family_count: number;
  share_url: string | null;
  reason: string;
  queue_id: string | null;
  queue_status: string | null;
  updated_at: string | null;
  created_at: string | null;
  likely_stageable?: boolean;
  photo_url?: string | null;
  has_photo?: boolean;
  crossed_threshold_at?: string | null;
  crossed_threshold_today?: boolean;
  priority_tier?: number;
};

type InboxSummary = {
  review_count: number;
  crossed_today: number;
  ready_to_queue: number;
  missing_photo: number;
  stale_open: number;
};

type DiscoverPayload = {
  not_queued: DiscoverCandidate[];
  staged_today: DiscoverCandidate[];
  stale_open: DiscoverCandidate[];
  total_public: number;
  mode?: "lite" | "full";
  cached?: boolean;
};

const QUEUE_VIEWS = [
  { key: "inbox", label: "Today's inbox", group: "queue", hint: "New actors first, then updates — one place to review and queue" },
  { key: "approved_to_post", label: "Approved to post", group: "queue" },
  { key: "posted", label: "Posted history", group: "queue" },
  { key: "rejected", label: "Rejected", group: "queue" },
  { key: "pending_review", label: "Pending only", group: "advanced" },
  { key: "needs_review", label: "Needs review only", group: "advanced" },
  { key: "discover:not_queued", label: "Missing from queue", group: "advanced", hint: "Public actors not in Blotato yet" },
  { key: "discover:stale_open", label: "More families reported", group: "advanced", hint: "Queue items with new family data" },
] as const;

function discoverBucket(payload: DiscoverPayload | null, view: string): DiscoverCandidate[] {
  if (!payload) return [];
  if (view === "discover:not_queued") return payload.not_queued;
  if (view === "discover:staged_today") return payload.staged_today;
  if (view === "discover:stale_open") return payload.stale_open;
  return [];
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function publishFailureMessage(data: ActionResponse): string | null {
  const results = Array.isArray(data.results) ? data.results : [];
  const succeeded = results.filter(result => result.success === true);
  const failed = results.filter(result => result.success !== true);
  if (succeeded.length > 0) return null;
  if (failed.length > 0) {
    return failed
      .map(result => `${result.platform ?? "platform"}: ${result.error || "Blotato did not confirm this platform."}`)
      .join(" | ");
  }
  if (data.posted === false) {
    return "Blotato did not confirm the post, so it was left in Approved to post.";
  }
  return null;
}

function isLegislatorTagBlock(text: string): boolean {
  return /Congress — follow|follow \+ tag/i.test(text);
}

function professionalPageShareText(pkg: QueueRow["package_json"]): string {
  const text = pkg.captions.firstComment?.trim() ?? "";
  if (!text) return "";
  if (isLegislatorTagBlock(text)) return "";
  return text;
}

function legislatorTagText(pkg: QueueRow["package_json"]): string {
  if (pkg.captions.legislatorComment?.trim()) return pkg.captions.legislatorComment.trim();
  const legacy = pkg.captions.firstComment?.trim() ?? "";
  return isLegislatorTagBlock(legacy) ? legacy : "";
}

function postedDisplayAt(row: Pick<QueueRow, "posted_at" | "updated_at">): string | null {
  return row.posted_at ?? row.updated_at ?? null;
}

function postedTimestamp(row: QueueRow): number {
  const iso = row.posted_at ?? row.updated_at ?? row.created_at;
  return new Date(iso).getTime();
}

function isSameCalendarDay(iso: string, now = new Date()): boolean {
  const posted = new Date(iso);
  return posted.getFullYear() === now.getFullYear()
    && posted.getMonth() === now.getMonth()
    && posted.getDate() === now.getDate();
}

function isPostedToday(row: Pick<QueueRow, "posted_at" | "updated_at">): boolean {
  const iso = postedDisplayAt(row);
  return iso ? isSameCalendarDay(iso) : false;
}

function xEditWindowLabel(row: Pick<QueueRow, "posted_at" | "updated_at">): string | null {
  const postedAt = postedDisplayAt(row);
  if (!postedAt) return null;
  const remaining = X_EDIT_WINDOW_MS - (Date.now() - new Date(postedAt).getTime());
  if (remaining <= 0) return "X edit window likely closed";
  const minutes = Math.ceil(remaining / 60_000);
  return `~${minutes}m left to edit X`;
}

function isTagNowWindow(row: Pick<QueueRow, "posted_at" | "updated_at">): boolean {
  const postedAt = postedDisplayAt(row);
  if (!postedAt) return false;
  return Date.now() - new Date(postedAt).getTime() <= TAG_NOW_WINDOW_MS;
}

function isPostedThisWeek(row: Pick<QueueRow, "posted_at" | "updated_at">): boolean {
  const iso = postedDisplayAt(row);
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() <= POSTED_THIS_WEEK_MS;
}

function formatPostedWhen(iso: string | null): string {
  if (!iso) return "date unknown";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function postedHistoryGroupLabel(iso: string | null): string {
  if (!iso) return "Date unknown";
  const posted = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfPosted = new Date(posted.getFullYear(), posted.getMonth(), posted.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - startOfPosted.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  if (diffDays < 30) return "This month";
  return posted.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function mapsSearchUrl(locationTag: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationTag)}`;
}

type PackageLegislator = QueueRow["package_json"]["legislators"][number];

function legislatorGroupLabel(level: string): string {
  if (level === "state_senate") return "State Senate";
  if (level === "state_house") return "State House";
  return "Congress";
}

function socialLinksFor(legislator: PackageLegislator): Array<{ platform: string; handle?: string; url: string }> {
  const links = [...(legislator.socials ?? [])];
  if (legislator.profile_url && !links.some(link => link.url === legislator.profile_url)) {
    links.unshift({
      platform: "Profile",
      handle: legislator.handle,
      url: legislator.profile_url,
    });
  }
  return links;
}

function partyLabel(party: string | null): string {
  return party ? ` (${party})` : "";
}

function matchesActorSearch(
  query: string,
  fields: { name: string; role: string; state: string; county?: string | null; slug?: string; bucket?: string },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.name.toLowerCase().includes(q)
    || fields.role.toLowerCase().includes(q)
    || fields.state.toLowerCase().includes(q)
    || (fields.county ?? "").toLowerCase().includes(q)
    || (fields.slug ?? "").toLowerCase().includes(q)
    || (fields.bucket ?? "").toLowerCase().includes(q);
}

function queueRowSearchFields(row: QueueRow) {
  return {
    name: row.package_json.actor_name,
    role: row.package_json.role,
    state: row.package_json.state_abbr,
    county: row.package_json.county ?? row.county,
    slug: row.actor_slug,
    bucket: row.actor_bucket_key,
  };
}

const PIPELINE_STATUS_RANK: Record<string, number> = {
  posted: 0,
  approved_to_post: 1,
  needs_review: 2,
  pending_review: 3,
  rejected: 4,
};

function portraitSlideWarning(pkg: QueueRow["package_json"]): string | null {
  const hasSlideOne = pkg.frames.some(frame => frame.order === 1);
  if (!hasSlideOne) return "Portrait slide (frame-01) is missing from this package.";
  if (pkg.portrait_verified === false) return "Portrait was not verified when this was staged.";
  if (pkg.portrait_verified !== true) {
    return "Share page may have a newer photo than these slides — use Add photo & regen slides.";
  }
  return null;
}

type PortraitModalState = {
  row: QueueRow;
  photoFile: File | null;
  status: "idle" | "working" | "polling" | "refreshing" | "done" | "error";
  message: string | null;
  runUrl: string | null;
};

function readyToQueueFromDiscover(payload: DiscoverPayload | null): DiscoverCandidate[] {
  if (!payload) return [];
  return payload.not_queued.filter(candidate => candidate.likely_stageable && candidate.has_photo);
}

function crossedTodayFromDiscover(payload: DiscoverPayload | null): DiscoverCandidate[] {
  if (!payload) return [];
  return payload.not_queued.filter(candidate => candidate.crossed_threshold_today);
}

function moreFamiliesFromDiscover(payload: DiscoverPayload | null): DiscoverCandidate[] {
  if (!payload) return [];
  return payload.stale_open.filter(candidate => candidate.reason === "stale_package" || candidate.reason === "new_families");
}

function missingPhotoFromDiscover(payload: DiscoverPayload | null): DiscoverCandidate[] {
  if (!payload) return [];
  return payload.not_queued
    .filter(candidate => !candidate.has_photo)
    .sort((a, b) =>
      (b.crossed_threshold_today ? 1 : 0) - (a.crossed_threshold_today ? 1 : 0)
      || b.family_count - a.family_count
      || a.actor_name.localeCompare(b.actor_name),
    );
}

function courtActorPhotoUploadUrl(candidate: DiscoverCandidate): string {
  const params = new URLSearchParams();
  params.set("court_actor_q", candidate.actor_name);
  if (candidate.state_abbr) params.set("court_state", candidate.state_abbr);
  params.set("court_bucket", candidate.actor_bucket_key);
  params.set("open_photo", "1");
  return `/admin?${params.toString()}#admin-court-actors`;
}

function portraitUrlFromPackage(pkg: QueueRow["package_json"]): string | null {
  if (pkg.hero_url?.trim()) return pkg.hero_url.trim();
  const frameOne = pkg.frames.find(frame => frame.order === 1);
  return frameOne?.url?.trim() ?? null;
}

function portraitUrlFromCandidate(candidate: DiscoverCandidate): string | null {
  if (candidate.photo_url?.trim()) return candidate.photo_url.trim();
  return null;
}

function priorityMetaFromDiscover(
  discover: DiscoverPayload | null,
  bucketKey: string,
): { priority_tier: number; crossed_threshold_today: boolean; more_families: boolean } {
  const lists = [
    ...(discover?.not_queued ?? []),
    ...(discover?.stale_open ?? []),
    ...(discover?.staged_today ?? []),
  ];
  const hit = lists.find(candidate => candidate.actor_bucket_key === bucketKey);
  return {
    priority_tier: hit?.priority_tier ?? 3,
    crossed_threshold_today: hit?.crossed_threshold_today ?? false,
    more_families: hit?.reason === "stale_package" || hit?.reason === "new_families",
  };
}

export function SocialPostQueuePanel() {
  const [status, setStatus] = useState("inbox");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [inboxSummary, setInboxSummary] = useState<InboxSummary | null>(null);
  const [discover, setDiscover] = useState<DiscoverPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [stagingBuckets, setStagingBuckets] = useState<Record<string, boolean>>({});
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [requeueAll, setRequeueAll] = useState(false);
  const [publishPlatforms, setPublishPlatforms] = useState<Record<string, string[]>>({});
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [pipelineSearchRows, setPipelineSearchRows] = useState<QueueRow[]>([]);
  const [pipelineSearchLoading, setPipelineSearchLoading] = useState(false);
  const [portraitModal, setPortraitModal] = useState<PortraitModalState | null>(null);
  const [autoQueueBusy, setAutoQueueBusy] = useState(false);
  const discoverAbortRef = useRef<AbortController | null>(null);
  const pipelineSearchAbortRef = useRef<AbortController | null>(null);
  const autoQueueAttemptedRef = useRef(false);

  const isDiscoverView = status.startsWith("discover:");
  const isInboxView = status === "inbox";
  const isPipelineSearch = searchFilter.trim().length > 0;

  const fetchDiscover = useCallback(async (options?: { mode?: "lite" | "full"; refresh?: boolean }) => {
    discoverAbortRef.current?.abort();
    const controller = new AbortController();
    discoverAbortRef.current = controller;
    setDiscoverLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("mode", options?.mode ?? "lite");
      if (options?.refresh) params.set("refresh", "1");
      const res = await fetch(`/api/admin/social-post-queue/discover?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!controller.signal.aborted) {
        setDiscover(data as DiscoverPayload);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!controller.signal.aborted) setDiscoverLoading(false);
    }
  }, []);

  const refreshPipelineSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setPipelineSearchRows([]);
      setPipelineSearchLoading(false);
      return;
    }
    pipelineSearchAbortRef.current?.abort();
    const controller = new AbortController();
    pipelineSearchAbortRef.current = controller;
    setPipelineSearchLoading(true);
    try {
      const statuses = ["posted", "approved_to_post", "inbox", "rejected"] as const;
      const responses = await Promise.all(
        statuses.map(statusValue =>
          fetch(`/api/admin/social-post-queue?status=${statusValue}`, { signal: controller.signal }),
        ),
      );
      const merged: QueueRow[] = [];
      for (const res of responses) {
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.rows)) {
          merged.push(...(data.rows as QueueRow[]));
        }
      }
      if (!controller.signal.aborted) {
        setPipelineSearchRows(merged);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setPipelineSearchLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const q = searchFilter.trim();
    if (!q) {
      setPipelineSearchRows([]);
      setPipelineSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshPipelineSearch(q);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      pipelineSearchAbortRef.current?.abort();
    };
  }, [searchFilter, refreshPipelineSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isDiscoverView) {
        setRows([]);
        await fetchDiscover({ mode: "lite" });
        return;
      }
      const res = await fetch(`/api/admin/social-post-queue?status=${encodeURIComponent(status)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((data.rows ?? []) as QueueRow[]);
      if (data.discover) {
        setDiscover(data.discover as DiscoverPayload);
      }
      if (data.summary) {
        setInboxSummary(data.summary as InboxSummary);
      } else if (!isInboxView) {
        setInboxSummary(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [status, isDiscoverView, fetchDiscover, isInboxView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchDiscover({ mode: "lite" });
    return () => discoverAbortRef.current?.abort();
  }, [fetchDiscover]);

  const runAutoQueueToday = useCallback(async () => {
    setAutoQueueBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/social-post-queue/auto-queue-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max: 12 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const queued = typeof data.queued === "number" ? data.queued : 0;
      if (queued > 0) {
        setStageMessage(`Auto-queued ${queued} new actor${queued === 1 ? "" : "s"} who crossed 3 families today.`);
        await load();
        void fetchDiscover({ mode: "lite", refresh: true });
      }
      return queued;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return 0;
    } finally {
      setAutoQueueBusy(false);
    }
  }, [fetchDiscover, load]);

  useEffect(() => {
    if (status !== "inbox" || autoQueueAttemptedRef.current || discoverLoading || !discover) return;
    const readyToday = crossedTodayFromDiscover(discover).filter(
      candidate => candidate.likely_stageable && candidate.has_photo,
    );
    if (readyToday.length === 0) {
      autoQueueAttemptedRef.current = true;
      return;
    }
    autoQueueAttemptedRef.current = true;
    void runAutoQueueToday();
  }, [status, discover, discoverLoading, runAutoQueueToday]);

  async function act(id: string, action: "approve" | "reject" | "posted" | "publish" | "needs-review" | "wrong-photo") {
    const scrollY = window.scrollY;
    setActing(prev => ({ ...prev, [id]: action }));
    setError(null);
    setStageMessage(null);
    try {
      const endpoint = action === "approve"
        ? "approve"
        : action === "reject"
          ? "reject"
          : action === "posted"
            ? "posted"
            : action === "publish"
              ? "publish"
              : "needs-review";
      const url = `/api/admin/social-post-queue/${id}/${endpoint}`;
      let body: string | undefined;
      if (action === "approve" || action === "publish") {
        const globalPlatforms = publishPlatforms["__global__"];
        const platforms = globalPlatforms?.length ? globalPlatforms : undefined;
        body = JSON.stringify({
          publish: action === "publish" || undefined,
          mark_posted: action === "publish",
          platforms,
        });
      }
      if (action === "reject") {
        const notes = window.prompt("Why should this post be rejected? This note will stay with the queue item.");
        if (notes === null) {
          setActing(prev => ({ ...prev, [id]: "" }));
          return;
        }
        body = JSON.stringify({ review_notes: notes });
      }
      if (action === "needs-review") {
        const notes = window.prompt("What needs to be fixed before posting? Example: change total, edit caption, replace slide 1.");
        if (notes === null) {
          setActing(prev => ({ ...prev, [id]: "" }));
          return;
        }
        body = JSON.stringify({ review_notes: notes });
      }
      if (action === "wrong-photo") {
        body = JSON.stringify({ review_notes: "Wrong or unclear photo. Replace the portrait/source image, regenerate slides, then review again." });
      }
      const res = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body });
      const data = (await res.json().catch(() => ({}))) as ActionResponse;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (action === "posted" || action === "approve" || action === "reject") {
        setRows(prev => prev.filter(row => row.id !== id));
        if (isInboxView && inboxSummary) {
          setInboxSummary(prev => prev ? {
            ...prev,
            review_count: Math.max(0, prev.review_count - 1),
          } : prev);
        }
      }
      if (action === "publish") {
        const publishError = publishFailureMessage(data);
        if (publishError) {
          throw new Error(`Publish did not complete: ${publishError}`);
        }
        const partial = data.partial === true;
        if (!partial) {
          // Only remove from current list on full success. Partial keeps it visible for retry.
          setRows(prev => prev.filter(row => row.id !== id));
        }
        setStageMessage(
          partial
            ? `Partial publish to ${(data.succeeded_platforms ?? []).join(", ")}. Some platforms failed — item remains here so you can retry.`
            : "Published to Blotato — now in Posted history. Tag legislators and edit X while you can.",
        );
      } else if (action === "posted") {
        setStageMessage("Marked as posted — now in Posted history.");
      } else if (action === "approve") {
        setStageMessage("Moved to Approved to post.");
      } else if (action === "reject") {
        setStageMessage("Rejected and saved the note.");
      } else if (action === "needs-review" || action === "wrong-photo") {
        setStageMessage("Moved to Needs review with your note.");
      }
      await load();
      if (searchFilter.trim()) {
        await refreshPipelineSearch(searchFilter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActing(prev => ({ ...prev, [id]: "" }));
      // Preserve scroll position and ensure we stay in the social pipeline section.
      // This prevents re-renders from kicking the view down into the Court Actors / state patterns list.
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
        // If we somehow landed in the court actors area, force back to the social queue section.
        const socialEl = document.getElementById("admin-social-queue");
        const courtEl = document.getElementById("admin-court-actors");
        if (socialEl && courtEl) {
          const courtRect = courtEl.getBoundingClientRect();
          if (courtRect.top < 100) {  // court actors is now near the top of viewport
            socialEl.scrollIntoView({ behavior: "auto", block: "nearest" });
          }
        }
      });
    }
  }

  function isStaging(bucketKey?: string): boolean {
    if (stagingBuckets.__all__) return true;
    if (!bucketKey) return false;
    return Boolean(stagingBuckets[bucketKey]);
  }

  async function stageAllReady() {
    const ready = readyToQueueFromDiscover(discover);
    if (ready.length === 0) {
      setStageMessage("No actors with a photo are waiting to be queued.");
      return;
    }
    const batch = ready.slice(0, 12);
    setStagingBuckets(prev => ({ ...prev, __batch__: true }));
    setError(null);
    let queued = 0;
    try {
      for (const candidate of batch) {
        const res = await fetch("/api/admin/social-post-queue/stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skip_email: true,
            force_requeue: true,
            actor_bucket_key: candidate.actor_bucket_key,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.staged) && data.staged.length > 0) {
          queued += 1;
        }
      }
      setStageMessage(`Queued ${queued} of ${batch.length} actors with photos. They're in Today's inbox.`);
      setStatus("inbox");
      await load();
      void fetchDiscover({ mode: "lite", refresh: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStagingBuckets(prev => {
        const next = { ...prev };
        delete next.__batch__;
        return next;
      });
    }
  }

  async function stageNow(actorBucketKey?: string, forceRequeue = false) {
    const stagingKey = actorBucketKey ?? "__all__";
    setStagingBuckets(prev => ({ ...prev, [stagingKey]: true }));
    setError(null);
    setStageMessage(null);
    try {
      const res = await fetch("/api/admin/social-post-queue/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skip_email: true,
          requeue_all: actorBucketKey ? false : requeueAll,
          force_requeue: forceRequeue,
          actor_bucket_key: actorBucketKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const stagedCount = Array.isArray(data.staged) ? data.staged.length : 0;
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;
      const skippedReason = Array.isArray(data.skipped) && data.skipped[0]?.reason
        ? String(data.skipped[0].reason)
        : null;
      if (!actorBucketKey) setStatus("inbox");
      setStageMessage(
        actorBucketKey
          ? (stagedCount > 0
            ? "Added to Blotato queue — check Pending review."
            : (skippedReason ? `Could not queue: ${skippedReason}` : "Nothing new to queue for this actor."))
          : `Staged ${stagedCount} post${stagedCount === 1 ? "" : "s"}; skipped ${skippedCount}.`,
      );
      if (actorBucketKey && stagedCount > 0) {
        setDiscover(prev => {
          if (!prev) return prev;
          const remove = (list: DiscoverCandidate[]) =>
            list.filter(candidate => candidate.actor_bucket_key !== actorBucketKey);
          return {
            ...prev,
            not_queued: remove(prev.not_queued),
            stale_open: remove(prev.stale_open),
          };
        });
      }
      if (isDiscoverView) {
        await fetchDiscover({ mode: "lite", refresh: true });
      } else {
        await load();
        void fetchDiscover({ mode: "lite", refresh: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStagingBuckets(prev => {
        const next = { ...prev };
        delete next[stagingKey];
        return next;
      });
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  function openPortraitModal(row: QueueRow) {
    setPortraitModal({
      row,
      photoFile: null,
      status: "idle",
      message: null,
      runUrl: null,
    });
  }

  async function waitForPortraitReady(queueId: string, maxAttempts = 36): Promise<boolean> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      const res = await fetch(`/api/admin/social-post-queue/${queueId}/portrait`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.slides_stale === false && data.frame_one_live === true) {
        return true;
      }
    }
    return false;
  }

  async function submitPortraitModal(regenOnly: boolean) {
    if (!portraitModal) return;
    const { row, photoFile } = portraitModal;
    if (!regenOnly && !photoFile) {
      setPortraitModal(prev => prev ? { ...prev, status: "error", message: "Choose a PNG or JPEG photo first." } : prev);
      return;
    }

    setPortraitModal(prev => prev ? { ...prev, status: "working", message: null } : prev);
    setError(null);
    try {
      const form = new FormData();
      if (photoFile) form.append("photo", photoFile);
      if (regenOnly) form.append("regen_only", "true");
      const res = await fetch(`/api/admin/social-post-queue/${row.id}/portrait`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setPortraitModal(prev => prev ? {
        ...prev,
        status: "polling",
        message: data.message || "Regeneration queued. Waiting for slides to update on the live site…",
        runUrl: data.run_url ?? data.workflow_url ?? null,
      } : prev);

      const ready = await waitForPortraitReady(row.id);
      setPortraitModal(prev => prev ? { ...prev, status: "refreshing", message: "Slides updated — rebuilding queue package…" } : prev);
      await stageNow(row.actor_bucket_key, true);

      setPortraitModal(prev => prev ? {
        ...prev,
        status: "done",
        message: ready
          ? "Portrait and slides updated in the queue."
          : "Regeneration was queued. Slides may still be deploying — click Refresh slides again in a minute if needed.",
      } : prev);
      setStageMessage(ready ? `Updated portrait slides for ${row.package_json.actor_name}.` : `Queued portrait regen for ${row.package_json.actor_name}.`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPortraitModal(prev => prev ? { ...prev, status: "error", message } : prev);
      setError(message);
    }
  }

  const discoverRows = useMemo(() => {
    const bucket = discoverBucket(discover, status);
    return bucket.filter(candidate =>
      matchesActorSearch(searchFilter, {
        name: candidate.actor_name,
        role: candidate.role,
        state: candidate.state_abbr,
        county: candidate.county,
      }),
    );
  }, [discover, status, searchFilter]);

  const pipelineSearchResults = useMemo(() => {
    const q = searchFilter.trim();
    if (!q) return [];
    const byBucket = new Map<string, QueueRow>();
    for (const row of pipelineSearchRows) {
      if (!matchesActorSearch(q, queueRowSearchFields(row))) continue;
      const existing = byBucket.get(row.actor_bucket_key);
      if (!existing) {
        byBucket.set(row.actor_bucket_key, row);
        continue;
      }
      const nextRank = PIPELINE_STATUS_RANK[row.status] ?? 9;
      const existingRank = PIPELINE_STATUS_RANK[existing.status] ?? 9;
      if (nextRank < existingRank) {
        byBucket.set(row.actor_bucket_key, row);
      }
    }
    return Array.from(byBucket.values()).sort((a, b) => {
      const rankDiff = (PIPELINE_STATUS_RANK[a.status] ?? 9) - (PIPELINE_STATUS_RANK[b.status] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      if (a.status === "posted" && b.status === "posted") {
        return postedTimestamp(b) - postedTimestamp(a);
      }
      return a.package_json.actor_name.localeCompare(b.package_json.actor_name);
    });
  }, [pipelineSearchRows, searchFilter]);

  const filteredQueueRows = useMemo(() => {
    const filtered = rows.filter(row => matchesActorSearch(searchFilter, queueRowSearchFields(row)));
    if (status === "posted") {
      return [...filtered].sort((a, b) => postedTimestamp(b) - postedTimestamp(a));
    }
    return filtered;
  }, [rows, searchFilter, status]);

  const reviewBucketKeys = useMemo(
    () => new Set(filteredQueueRows.map(row => row.actor_bucket_key)),
    [filteredQueueRows],
  );

  const inboxNewToday = useMemo(() => {
    return crossedTodayFromDiscover(discover).filter(candidate =>
      matchesActorSearch(searchFilter, {
        name: candidate.actor_name,
        role: candidate.role,
        state: candidate.state_abbr,
        county: candidate.county,
      }),
    );
  }, [discover, searchFilter]);

  const inboxMoreFamilies = useMemo(() => {
    return moreFamiliesFromDiscover(discover).filter(candidate =>
      !reviewBucketKeys.has(candidate.actor_bucket_key)
      && matchesActorSearch(searchFilter, {
        name: candidate.actor_name,
        role: candidate.role,
        state: candidate.state_abbr,
        county: candidate.county,
      }),
    );
  }, [discover, searchFilter, reviewBucketKeys]);

  const inboxMissingPhoto = useMemo(() => {
    return missingPhotoFromDiscover(discover).filter(candidate =>
      matchesActorSearch(searchFilter, {
        name: candidate.actor_name,
        role: candidate.role,
        state: candidate.state_abbr,
        county: candidate.county,
      }),
    );
  }, [discover, searchFilter]);

  const postedTodayRows = useMemo(() => {
    return filteredQueueRows.filter(row => row.status === "posted" && isPostedToday(row));
  }, [filteredQueueRows]);

  const postedEarlierThisWeekRows = useMemo(() => {
    return filteredQueueRows.filter(row => row.status === "posted" && !isPostedToday(row) && isPostedThisWeek(row));
  }, [filteredQueueRows]);

  const olderPostedRows = useMemo(() => {
    return filteredQueueRows.filter(row => row.status === "posted" && !isPostedThisWeek(row));
  }, [filteredQueueRows]);

  const postedThisWeekRows = useMemo(() => {
    return [...postedTodayRows, ...postedEarlierThisWeekRows];
  }, [postedTodayRows, postedEarlierThisWeekRows]);

  const olderPostedGroups = useMemo(() => {
    const groups = new Map<string, QueueRow[]>();
    for (const row of olderPostedRows) {
      const label = postedHistoryGroupLabel(postedDisplayAt(row));
      const list = groups.get(label) ?? [];
      list.push(row);
      groups.set(label, list);
    }
    const groupSortKey = (label: string, groupRows: QueueRow[]): number => {
      const newest = Math.max(...groupRows.map(row => postedTimestamp(row)));
      const preset: Record<string, number> = {
        Today: 5,
        Yesterday: 4,
        "Earlier this week": 3,
        "This month": 2,
      };
      return (preset[label] ?? 1) * 1e15 + newest;
    };
    return Array.from(groups.entries()).sort((a, b) => groupSortKey(b[0], b[1]) - groupSortKey(a[0], a[1]));
  }, [olderPostedRows]);

  const inboxReadyNotToday = useMemo(() => {
    const todayKeys = new Set(inboxNewToday.map(candidate => candidate.actor_bucket_key));
    return readyToQueueFromDiscover(discover).filter(candidate =>
      !todayKeys.has(candidate.actor_bucket_key)
      && matchesActorSearch(searchFilter, {
        name: candidate.actor_name,
        role: candidate.role,
        state: candidate.state_abbr,
        county: candidate.county,
      }),
    );
  }, [discover, searchFilter, inboxNewToday]);

  const activeDiscoverHint = (() => {
    const view = QUEUE_VIEWS.find(v => v.key === status);
    return view && "hint" in view ? view.hint : "";
  })();

  return (
    <div
      className="rounded-[2rem] p-6 mt-6 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, rgba(15,30,48,0.98) 0%, rgba(9,22,37,0.95) 55%, rgba(30,58,95,0.25) 100%)",
        border: "1px solid rgba(201,162,39,0.28)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>Social media pipeline</p>
          <h2 className="mt-2 text-2xl font-black text-white tracking-tight">Court Actor Post Queue</h2>
          <p className="mt-1 text-xs max-w-xl" style={{ color: "rgba(245,245,245,0.52)" }}>
            Start in <strong className="text-white/80">Today&apos;s inbox</strong> — new actors with photos auto-queue; missing portraits get an upload shortcut.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "rgba(245,245,245,0.7)" }}>
            <input
              type="checkbox"
              checked={requeueAll}
              onChange={(e) => setRequeueAll(e.target.checked)}
              className="accent-amber-400"
            />
            Re-stage all
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "rgba(245,245,245,0.7)" }}>
            <input
              type="checkbox"
              checked={
                publishPlatforms["__global__"]?.length === 1
                && publishPlatforms["__global__"]?.[0] === "facebook"
              }
              onChange={(e) => {
                const checked = e.target.checked;
                setPublishPlatforms(prev => {
                  if (checked) return { ...prev, __global__: ["facebook"] };
                  const next = { ...prev };
                  delete next.__global__;
                  return next;
                });
              }}
              className="accent-amber-400"
            />
            Facebook only
          </label>
          {(inboxSummary?.ready_to_queue ?? readyToQueueFromDiscover(discover).length) > 0 && (
            <button
              type="button"
              onClick={() => void stageAllReady()}
              disabled={isStaging()}
              className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: "#0ea5e9", color: "#f0f9ff", border: "1px solid rgba(14,165,233,0.55)" }}
            >
              {stagingBuckets.__batch__ ? "Queuing…" : `Queue all with photos (${inboxSummary?.ready_to_queue ?? readyToQueueFromDiscover(discover).length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => void stageNow()}
            disabled={isStaging()}
            className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#091625", border: "1px solid rgba(201,162,39,0.6)" }}
          >
            {isStaging() ? "Staging…" : "Re-stage all"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-lg font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: "1px solid rgba(201,162,39,0.4)" }}
          >
            {loading || discoverLoading || autoQueueBusy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search anyone in the pipeline — name, state, county, slug…"
          className="flex-1 min-w-[240px] rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "white" }}
        />
        {isPipelineSearch && (
          <p className="text-[11px] w-full" style={{ color: "rgba(245,245,245,0.55)" }}>
            Searching posted, approved, inbox, and rejected — posted matches show first for tagging.
          </p>
        )}
        {searchFilter.trim() && (
          <button
            type="button"
            onClick={() => setSearchFilter("")}
            className="text-xs px-2 py-1 rounded-md"
            style={{ color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Clear
          </button>
        )}
        {isDiscoverView && activeDiscoverHint && (
          <p className="text-[11px] w-full sm:w-auto" style={{ color: "rgba(245,245,245,0.5)" }}>{activeDiscoverHint}</p>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}
      {stageMessage && <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-100">{stageMessage}</p>}

      {!isPipelineSearch && isInboxView && inboxSummary && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "To review", value: inboxSummary.review_count, color: GOLD },
            { label: "New today", value: inboxSummary.crossed_today, color: "#34d399" },
            { label: "Ready to queue", value: inboxSummary.ready_to_queue, color: "#38bdf8" },
            { label: "More families", value: inboxSummary.stale_open, color: "#fbbf24" },
            { label: "Need photo first", value: inboxSummary.missing_photo, color: "#fb923c" },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-xl px-3 py-2"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.45)" }}>{stat.label}</div>
              <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: "rgba(245,245,245,0.42)" }}>Views</div>
        <div className="flex flex-wrap gap-2">
          {QUEUE_VIEWS.filter(v => v.group === "queue").map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: status === s.key ? "rgba(201,162,39,0.22)" : "rgba(255,255,255,0.05)",
                color: status === s.key ? GOLD : "rgba(245,245,245,0.75)",
                border: `1px solid ${status === s.key ? "rgba(201,162,39,0.45)" : "rgba(255,255,255,0.1)"}`,
                boxShadow: status === s.key ? `0 0 20px ${GOLD}22` : undefined,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] pt-1" style={{ color: "rgba(245,245,245,0.42)" }}>Advanced</div>
        <div className="flex flex-wrap gap-2">
          {QUEUE_VIEWS.filter(v => v.group === "advanced").map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: status === s.key ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.05)",
                color: status === s.key ? "#7dd3fc" : "rgba(245,245,245,0.75)",
                border: `1px solid ${status === s.key ? "rgba(56,189,248,0.4)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {s.label}
              {(() => {
                const count = discoverBucket(discover, s.key).length;
                if (count <= 0) return null;
                return (
                  <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "rgba(56,189,248,0.25)" }}>
                    {count}
                  </span>
                );
              })()}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {isPipelineSearch && (
          <InboxSection
            title={`Search: “${searchFilter.trim()}”`}
            subtitle={
              pipelineSearchLoading
                ? "Searching the full social pipeline…"
                : `${pipelineSearchResults.length} match${pipelineSearchResults.length === 1 ? "" : "es"} — expand posted rows for legislator tags`
            }
            accent={GOLD}
          >
            {pipelineSearchLoading && pipelineSearchResults.length === 0 && (
              <p className="text-sm animate-pulse" style={{ color: "rgba(245,245,245,0.55)" }}>Searching…</p>
            )}
            {!pipelineSearchLoading && pipelineSearchResults.length === 0 && (
              <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>
                No one in the pipeline matches “{searchFilter.trim()}”. Try a first name, state (NC), county, or slug.
              </p>
            )}
            {pipelineSearchResults.map(row => (
              <QueueReviewCard
                key={row.id}
                row={row}
                discover={discover}
                acting={acting[row.id]}
                expanded={expanded[row.id] ?? row.status === "posted"}
                compact={row.status !== "posted"}
                isStaging={isStaging(row.actor_bucket_key)}
                portraitModalBusy={!!portraitModal && portraitModal.status === "working"}
                onToggleExpanded={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                onAct={(action) => void act(row.id, action)}
                onOpenPortrait={() => openPortraitModal(row)}
                onRefreshSlides={() => void stageNow(row.actor_bucket_key, true)}
                onCopy={copy}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && isInboxView && (loading || discoverLoading) && filteredQueueRows.length === 0 && inboxNewToday.length === 0 && (
          <p className="text-sm animate-pulse" style={{ color: "rgba(245,245,245,0.55)" }}>
            Loading today&apos;s inbox…
          </p>
        )}

        {!isPipelineSearch && isInboxView && inboxNewToday.length > 0 && (
          <InboxSection
            title="New today — crossed 3 families"
            subtitle="Public actors who hit the threshold today. Queue them to start review."
            accent="#34d399"
          >
            {inboxNewToday.map(candidate => (
              <DiscoverCandidateCard
                key={candidate.actor_bucket_key}
                candidate={candidate}
                isStaging={isStaging(candidate.actor_bucket_key)}
                onStage={() => void stageNow(candidate.actor_bucket_key, true)}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && isInboxView && inboxMoreFamilies.length > 0 && (
          <InboxSection
            title="More families reported"
            subtitle="These actors have new submissions since the last package was built."
            accent="#fbbf24"
          >
            {inboxMoreFamilies.map(candidate => (
              <DiscoverCandidateCard
                key={candidate.actor_bucket_key}
                candidate={candidate}
                isStaging={isStaging(candidate.actor_bucket_key)}
                onStage={() => void stageNow(candidate.actor_bucket_key, true)}
                stageLabel="Refresh & queue"
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && isInboxView && inboxReadyNotToday.length > 0 && (
          <InboxSection
            title="Ready to queue"
            subtitle="Has a photo and share page — not yet in the Blotato queue."
            accent="#38bdf8"
          >
            {inboxReadyNotToday.map(candidate => (
              <DiscoverCandidateCard
                key={candidate.actor_bucket_key}
                candidate={candidate}
                isStaging={isStaging(candidate.actor_bucket_key)}
                onStage={() => void stageNow(candidate.actor_bucket_key, true)}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && isInboxView && inboxMissingPhoto.length > 0 && (
          <InboxSection
            title="Need photo first"
            subtitle="Public actors waiting on a portrait before they can enter the queue."
            accent="#fb923c"
          >
            {inboxMissingPhoto.map(candidate => (
              <DiscoverCandidateCard
                key={candidate.actor_bucket_key}
                candidate={candidate}
                isStaging={isStaging(candidate.actor_bucket_key)}
                onStage={() => void stageNow(candidate.actor_bucket_key, true)}
                stageLabel="Queue anyway"
                photoUploadHref={courtActorPhotoUploadUrl(candidate)}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && isInboxView && filteredQueueRows.length > 0 && (
          <InboxSection
            title="In your review queue"
            subtitle="Pending and needs-review posts in one list — approve, fix, or mark already posted."
            accent={GOLD}
          >
            {filteredQueueRows.map(row => (
              <QueueReviewCard
                key={row.id}
                row={row}
                discover={discover}
                acting={acting[row.id]}
                expanded={expanded[row.id] ?? false}
                isStaging={isStaging(row.actor_bucket_key)}
                portraitModalBusy={!!portraitModal && portraitModal.status === "working"}
                onToggleExpanded={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                onAct={(action) => void act(row.id, action)}
                onOpenPortrait={() => openPortraitModal(row)}
                onRefreshSlides={() => void stageNow(row.actor_bucket_key, true)}
                onCopy={copy}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && isInboxView && !loading && !discoverLoading
          && filteredQueueRows.length === 0
          && inboxNewToday.length === 0
          && inboxMoreFamilies.length === 0
          && inboxReadyNotToday.length === 0
          && inboxMissingPhoto.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>
            {searchFilter.trim()
              ? `No actors match "${searchFilter.trim()}".`
              : "Inbox is clear — new public actors will show up here when families cross the threshold."}
          </p>
        )}

        {!isPipelineSearch && isDiscoverView && (loading || discoverLoading) && (
          <p className="text-sm animate-pulse" style={{ color: "rgba(245,245,245,0.55)" }}>
            Scanning public actors…
          </p>
        )}

        {!isPipelineSearch && isDiscoverView && discoverRows.length === 0 && !loading && !discoverLoading && (
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>
            {searchFilter.trim()
              ? "No actors match that search."
              : (status === "discover:not_queued"
                ? "Every public actor is already in the queue — or none are public yet. Try Court Actors → open an actor → Push to Blotato queue."
                : "Nothing in this bucket right now.")}
          </p>
        )}

        {!isPipelineSearch && isDiscoverView && discoverRows.map(candidate => (
          <DiscoverCandidateCard
            key={candidate.actor_bucket_key}
            candidate={candidate}
            isStaging={isStaging(candidate.actor_bucket_key)}
            onStage={() => void stageNow(candidate.actor_bucket_key, true)}
          />
        ))}

        {!isPipelineSearch && status === "posted" && postedTodayRows.length > 0 && (
          <InboxSection
            title="Posted today"
            subtitle="Everything you published today — expanded so you can tag legislators and edit X."
            accent="#f472b6"
          >
            {postedTodayRows.map(row => (
              <QueueReviewCard
                key={row.id}
                row={row}
                discover={discover}
                acting={acting[row.id]}
                expanded={expanded[row.id] ?? true}
                compact={false}
                isStaging={isStaging(row.actor_bucket_key)}
                portraitModalBusy={!!portraitModal && portraitModal.status === "working"}
                onToggleExpanded={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                onAct={(action) => void act(row.id, action)}
                onOpenPortrait={() => openPortraitModal(row)}
                onRefreshSlides={() => void stageNow(row.actor_bucket_key, true)}
                onCopy={copy}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && status === "posted" && postedEarlierThisWeekRows.length > 0 && (
          <InboxSection
            title="Posted earlier this week"
            subtitle="Last 7 days (before today). Expand any card for legislator tags and captions."
            accent="#34d399"
          >
            {postedEarlierThisWeekRows.map(row => (
              <QueueReviewCard
                key={row.id}
                row={row}
                discover={discover}
                acting={acting[row.id]}
                expanded={expanded[row.id] ?? false}
                compact
                isStaging={isStaging(row.actor_bucket_key)}
                portraitModalBusy={!!portraitModal && portraitModal.status === "working"}
                onToggleExpanded={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                onAct={(action) => void act(row.id, action)}
                onOpenPortrait={() => openPortraitModal(row)}
                onRefreshSlides={() => void stageNow(row.actor_bucket_key, true)}
                onCopy={copy}
              />
            ))}
          </InboxSection>
        )}

        {!isPipelineSearch && !isDiscoverView && !isInboxView && status === "posted" && postedThisWeekRows.length === 0 && olderPostedRows.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>
            {searchFilter.trim()
              ? `No posts match "${searchFilter.trim()}".`
              : "No posted history yet. After you click Publish now, items land here automatically. If you refreshed slides on a post, check Today's inbox — it may have moved back for review."}
          </p>
        )}

        {!isPipelineSearch && !isDiscoverView && !isInboxView && status !== "posted" && filteredQueueRows.length === 0 && !loading && (
          <p className="text-sm" style={{ color: "rgba(245,245,245,0.5)" }}>
            {searchFilter.trim()
              ? `No posts match "${searchFilter.trim()}".`
              : "No posts in this queue."}
          </p>
        )}

        {!isPipelineSearch && !isDiscoverView && !isInboxView && status === "posted" && olderPostedGroups.map(([label, groupRows]) => (
          <PostedHistoryGroup
            key={label}
            label={label}
            count={groupRows.length}
            defaultOpen={label === "Today" || label === "Yesterday"}
          >
            {groupRows.map(row => (
              <QueueReviewCard
                key={row.id}
                row={row}
                discover={discover}
                acting={acting[row.id]}
                expanded={expanded[row.id] ?? false}
                compact
                isStaging={isStaging(row.actor_bucket_key)}
                portraitModalBusy={!!portraitModal && portraitModal.status === "working"}
                onToggleExpanded={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                onAct={(action) => void act(row.id, action)}
                onOpenPortrait={() => openPortraitModal(row)}
                onRefreshSlides={() => void stageNow(row.actor_bucket_key, true)}
                onCopy={copy}
              />
            ))}
          </PostedHistoryGroup>
        ))}

        {!isPipelineSearch && !isDiscoverView && !isInboxView && status !== "posted" && filteredQueueRows.map(row => (
          <QueueReviewCard
            key={row.id}
            row={row}
            discover={discover}
            acting={acting[row.id]}
            expanded={expanded[row.id] ?? false}
            isStaging={isStaging(row.actor_bucket_key)}
            portraitModalBusy={!!portraitModal && portraitModal.status === "working"}
            onToggleExpanded={() => setExpanded(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
            onAct={(action) => void act(row.id, action)}
            onOpenPortrait={() => openPortraitModal(row)}
            onRefreshSlides={() => void stageNow(row.actor_bucket_key, true)}
            onCopy={copy}
          />
        ))}
      </div>

      {portraitModal && (
        <PortraitRegenModal
          modal={portraitModal}
          onClose={() => setPortraitModal(null)}
          onChooseFile={(file) => setPortraitModal(prev => prev ? { ...prev, photoFile: file, status: "idle", message: null } : prev)}
          onSubmitUpload={() => void submitPortraitModal(false)}
          onSubmitRegenOnly={() => void submitPortraitModal(true)}
        />
      )}
    </div>
  );
}

function InboxSection({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-white">{title}</h3>
          <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,245,245,0.5)" }}>{subtitle}</p>
        </div>
        <div className="h-1 w-12 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function PostedHistoryGroup({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="rounded-2xl" open={defaultOpen} style={{ border: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.02)" }}>
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{label}</div>
          <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.5)" }}>
            {count} post{count === 1 ? "" : "s"} — click to expand
          </div>
        </div>
        <span className="text-xs font-bold" style={{ color: GOLD }}>▾</span>
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function ActorPortraitThumb({
  url,
  name,
  size = "md",
  missingLabel = "No photo",
}: {
  url: string | null;
  name: string;
  size?: "sm" | "md";
  missingLabel?: string;
}) {
  const [broken, setBroken] = useState(false);
  const dims = size === "sm" ? "h-14 w-14" : "h-20 w-20";
  const src = url ? resolvePublicAssetUrl(url) : null;

  if (!src || broken) {
    return (
      <div
        className={`${dims} shrink-0 rounded-xl border border-dashed flex flex-col items-center justify-center px-1 text-center`}
        style={{ borderColor: "rgba(251,146,60,0.45)", backgroundColor: "rgba(251,146,60,0.08)", color: "#fb923c" }}
      >
        <span className="text-[9px] font-black uppercase tracking-wide leading-tight">{missingLabel}</span>
      </div>
    );
  }

  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${name} portrait`}
        className={`${dims} rounded-xl object-cover border`}
        style={{ borderColor: "rgba(255,255,255,0.14)" }}
        onError={() => setBroken(true)}
      />
    </a>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}

function discoverReasonLabel(candidate: DiscoverCandidate): string {
  if (candidate.reason === "not_queued") {
    if (candidate.crossed_threshold_today) return "Crossed 3 families today";
    if (candidate.has_photo && candidate.likely_stageable) return "Ready to queue";
    if (!candidate.has_photo) return "Needs portrait before queueing";
    return "Share page may not be live yet";
  }
  if (candidate.reason === "staged_today") return "Added to queue today";
  if (candidate.reason === "stale_package") return "New family data since last package";
  if (candidate.reason === "new_families") return "Posted before — new families";
  return candidate.reason;
}

function DiscoverCandidateCard({
  candidate,
  isStaging,
  onStage,
  stageLabel = "Add to queue",
  photoUploadHref,
}: {
  candidate: DiscoverCandidate;
  isStaging: boolean;
  onStage: () => void;
  stageLabel?: string;
  photoUploadHref?: string;
}) {
  const portraitUrl = portraitUrlFromCandidate(candidate);
  const shareHref = candidate.share_url?.startsWith("http")
    ? candidate.share_url
    : (candidate.share_url ? resolvePublicAssetUrl(candidate.share_url) : null);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(56,189,248,0.18)" }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <ActorPortraitThumb
          url={portraitUrl}
          name={candidate.actor_name}
          missingLabel={candidate.has_photo ? "Photo error" : "No photo"}
        />
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-black text-white">{candidate.actor_name}</div>
            {candidate.crossed_threshold_today && <StatusBadge label="New today" color="#34d399" />}
            {!candidate.has_photo && <StatusBadge label="Need photo" color="#fb923c" />}
          </div>
          <div className="text-xs" style={{ color: "rgba(245,245,245,0.55)" }}>
            {candidate.role} · {candidate.county ? `${candidate.county}, ` : ""}{candidate.state_abbr} · {candidate.family_count} families
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "#7dd3fc" }}>
            {discoverReasonLabel(candidate)}
            {candidate.queue_status ? ` · was ${candidate.queue_status}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {photoUploadHref && (
            <a
              href={photoUploadHref}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: "rgba(251,146,60,0.18)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.4)" }}
            >
              Upload photo
            </a>
          )}
          {shareHref && (
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Share page
            </a>
          )}
          <button
            type="button"
            onClick={onStage}
            disabled={isStaging || (!candidate.likely_stageable && !photoUploadHref)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#091625" }}
            title={candidate.likely_stageable ? "Build slides and add to review queue" : "Share page must be live first"}
          >
            {isStaging ? "Queuing…" : stageLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function QueueReviewCard({
  row,
  discover,
  acting,
  expanded,
  compact = false,
  isStaging,
  portraitModalBusy,
  onToggleExpanded,
  onAct,
  onOpenPortrait,
  onRefreshSlides,
  onCopy,
}: {
  row: QueueRow;
  discover: DiscoverPayload | null;
  acting?: string;
  expanded: boolean;
  compact?: boolean;
  isStaging: boolean;
  portraitModalBusy: boolean;
  onToggleExpanded: () => void;
  onAct: (action: "approve" | "reject" | "posted" | "publish" | "needs-review" | "wrong-photo") => void;
  onOpenPortrait: () => void;
  onRefreshSlides: () => void;
  onCopy: (text: string) => void;
}) {
  const pkg = row.package_json;
  const slideWarning = portraitSlideWarning(pkg);
  const portraitUrl = portraitUrlFromPackage(pkg);
  const priority = priorityMetaFromDiscover(discover, row.actor_bucket_key);
  const shareCopy = professionalPageShareText(pkg);
  const legislatorCopy = legislatorTagText(pkg);
  const postedToday = row.status === "posted" && isPostedToday(row);
  const tagNow = row.status === "posted" && isTagNowWindow(row);
  const xWindow = row.status === "posted" ? xEditWindowLabel(row) : null;

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-start gap-3 flex-wrap">
        <ActorPortraitThumb url={portraitUrl} name={pkg.actor_name} />
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-black text-white">{pkg.actor_name}</div>
            {row.status === "pending_review" && <StatusBadge label="Pending review" color="#60a5fa" />}
            {row.status === "needs_review" && <StatusBadge label="Needs review" color="#fbbf24" />}
            {row.status === "approved_to_post" && <StatusBadge label="Approved" color="#34d399" />}
            {row.status === "posted" && <StatusBadge label="Posted" color="#34d399" />}
            {postedToday && <StatusBadge label="Today" color="#f472b6" />}
            {tagNow && <StatusBadge label="Tag now" color="#f472b6" />}
            {xWindow && <StatusBadge label={xWindow} color="#a78bfa" />}
            {priority.crossed_threshold_today && <StatusBadge label="New today" color="#34d399" />}
            {priority.more_families && <StatusBadge label="More families" color="#fbbf24" />}
          </div>
          <div className="text-xs" style={{ color: "rgba(245,245,245,0.55)" }}>
            {pkg.role} · {(pkg.county ?? row.county) ? `${pkg.county ?? row.county}, ` : ""}{pkg.state_abbr} · {pkg.family_count} {pkg.family_count === 1 ? "family" : "families"}
            {row.status === "posted"
              ? ` · posted ${formatPostedWhen(postedDisplayAt(row) ?? row.created_at)}`
              : ` · queued ${timeAgo(row.created_at)}`}
          </div>
          {row.review_notes && (
            <div className="mt-1 text-xs" style={{ color: "#fbbf24" }}>⚠️ {row.review_notes}</div>
          )}
          {slideWarning && (
            <div className="mt-1 text-xs" style={{ color: "#fb923c" }}>⚠️ {slideWarning}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(row.status === "pending_review" || row.status === "needs_review") && (
            <>
              <button type="button" onClick={() => onAct("approve")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "#16a34a", color: "white" }}>
                {acting === "approve" ? "…" : "Approve"}
              </button>
              <button type="button" onClick={() => onAct("reject")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "#dc2626", color: "white" }}>
                {acting === "reject" ? "…" : "Reject"}
              </button>
              <button type="button" onClick={() => onAct("needs-review")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(251,191,36,0.16)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}>
                {acting === "needs-review" ? "…" : "Needs changes"}
              </button>
              <button type="button" onClick={() => onAct("wrong-photo")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}>
                {acting === "wrong-photo" ? "…" : "Wrong photo"}
              </button>
              <button type="button" onClick={() => onAct("posted")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(148,163,184,0.2)", color: "rgba(245,245,245,0.9)", border: "1px solid rgba(148,163,184,0.35)" }}>
                {acting === "posted" ? "…" : "Already posted"}
              </button>
            </>
          )}
          {row.status === "approved_to_post" && (
            <>
              <button type="button" onClick={() => onAct("publish")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: GOLD, color: "#091625" }}>
                {acting === "publish" ? "…" : "Publish now"}
              </button>
              <button type="button" onClick={() => onAct("posted")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(245,245,245,0.9)", border: "1px solid rgba(255,255,255,0.15)" }}>
                {acting === "posted" ? "…" : "Already posted"}
              </button>
              <button type="button" onClick={() => onAct("needs-review")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(251,191,36,0.16)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}>
                {acting === "needs-review" ? "…" : "Needs changes"}
              </button>
              <button type="button" onClick={() => onAct("wrong-photo")} disabled={!!acting} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.85)", border: "1px solid rgba(255,255,255,0.12)" }}>
                {acting === "wrong-photo" ? "…" : "Wrong photo"}
              </button>
            </>
          )}
          <button type="button" onClick={onOpenPortrait} disabled={isStaging || portraitModalBusy} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(167,139,250,0.16)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.35)" }} title="Upload a portrait or regenerate slides from the live share page">
            Add photo & regen
          </button>
          <button type="button" onClick={onRefreshSlides} disabled={isStaging} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ backgroundColor: "rgba(56,189,248,0.14)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,0.35)" }} title="Rebuild slides from the live share page and replace this queue item">
            Refresh slides
          </button>
          <a href={`/api/admin/social-post-queue/${row.id}/download`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}>
            Download
          </a>
        </div>
      </div>

      {!compact && pkg.frames.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {pkg.frames.map(frame => (
            <FrameSlidePreview key={frame.order} frame={frame} />
          ))}
        </div>
      )}

      {shareCopy && (
        <ProfessionalShareBlock
          text={shareCopy}
          onCopy={onCopy}
          highlight={row.status === "posted"}
          defaultOpen={row.status === "posted" ? (postedToday || tagNow) : !compact}
        />
      )}

      <ManualPostingLinks
        packageData={pkg}
        legislatorText={legislatorCopy}
        onCopy={onCopy}
        defaultOpen={row.status === "posted" ? (postedToday || tagNow) : !compact}
      />

      <details className="mt-3" open={expanded}>
        <summary
          className="cursor-pointer list-none text-xs font-bold underline-offset-2 hover:underline"
          style={{ color: GOLD }}
          onClick={(e) => {
            e.preventDefault();
            onToggleExpanded();
          }}
        >
          {expanded ? "Hide platform captions" : "Show platform captions (FB / IG / X)"}
        </summary>
        {expanded && (
          <div className="mt-3 space-y-2">
            <CaptionBlock label="Facebook" text={pkg.captions.facebook} onCopy={onCopy} defaultOpen={false} />
            <CaptionBlock label="Instagram" text={pkg.captions.instagram} onCopy={onCopy} limit={INSTAGRAM_CAPTION_MAX_CHARS} defaultOpen={false} />
            <CaptionBlock label="X" text={pkg.captions.x} onCopy={onCopy} defaultOpen={false} />
            {shareCopy && <CaptionBlock label="Share to professional page" text={shareCopy} onCopy={onCopy} defaultOpen={false} />}
            {legislatorCopy && <CaptionBlock label="Legislator tags (FB/IG comment)" text={legislatorCopy} onCopy={onCopy} defaultOpen={!compact} />}
            <div className="text-xs px-1" style={{ color: "rgba(245,245,245,0.5)" }}>
              Location tag: <span className="text-white/80">{pkg.captions.locationTag}</span>
            </div>
          </div>
        )}
      </details>
    </div>
  );
}

function PortraitRegenModal({
  modal,
  onClose,
  onChooseFile,
  onSubmitUpload,
  onSubmitRegenOnly,
}: {
  modal: PortraitModalState;
  onClose: () => void;
  onChooseFile: (file: File | null) => void;
  onSubmitUpload: () => void;
  onSubmitRegenOnly: () => void;
}) {
  const pkg = modal.row.package_json;
  const busy = modal.status === "working" || modal.status === "polling" || modal.status === "refreshing";
  const shareHref = pkg.share_url.startsWith("http") ? pkg.share_url : resolvePublicAssetUrl(pkg.share_url);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.72)" }}>
      <div
        className="w-full max-w-lg rounded-2xl p-5"
        style={{ backgroundColor: "#0f1e30", border: "1px solid rgba(201,162,39,0.35)", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: GOLD }}>Portrait & slides</p>
            <h3 className="mt-1 text-lg font-black text-white">{pkg.actor_name}</h3>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,245,245,0.55)" }}>
              {pkg.role} · {pkg.state_abbr} · {modal.row.actor_slug}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-white/60 hover:text-white text-sm disabled:opacity-40">✕</button>
        </div>

        <p className="mt-4 text-xs leading-relaxed" style={{ color: "rgba(245,245,245,0.72)" }}>
          If the photo already shows on the <a href={shareHref} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#7dd3fc" }}>share page</a> but slide 1 is blank,
          regenerate slides from that live portrait. Or upload a new photo here — it commits to GitHub and rebuilds slides for {pkg.state_abbr}.
        </p>

        <label className="mt-4 block text-[10px] font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.5)" }}>
          New portrait (optional)
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            disabled={busy}
            onChange={(e) => onChooseFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-xs"
            style={{ color: "rgba(245,245,245,0.85)" }}
          />
        </label>
        {modal.photoFile && (
          <p className="mt-2 text-xs" style={{ color: "#c4b5fd" }}>Selected: {modal.photoFile.name}</p>
        )}

        {modal.message && (
          <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{
            color: modal.status === "error" ? "#fecaca" : "#bbf7d0",
            backgroundColor: modal.status === "error" ? "rgba(127,29,29,0.35)" : "rgba(6,78,59,0.28)",
            border: `1px solid ${modal.status === "error" ? "rgba(248,113,113,0.35)" : "rgba(74,222,128,0.25)"}`,
          }}>
            {modal.message}
            {modal.runUrl && (
              <>{" "}<a href={modal.runUrl} target="_blank" rel="noopener noreferrer" className="underline">Track workflow</a></>
            )}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onSubmitRegenOnly}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{ backgroundColor: "rgba(56,189,248,0.14)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,0.35)" }}
          >
            {busy ? "Working…" : "Regen from share page photo"}
          </button>
          <button
            type="button"
            onClick={onSubmitUpload}
            disabled={busy || !modal.photoFile}
            className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#091625" }}
          >
            {busy ? "Working…" : "Upload photo & regen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfessionalShareBlock({
  text,
  onCopy,
  highlight = false,
  defaultOpen = false,
}: {
  text: string;
  onCopy: (text: string) => void;
  highlight?: boolean;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="mt-3 rounded-xl"
      open={defaultOpen}
      style={{
        backgroundColor: highlight ? "rgba(52,211,153,0.12)" : "rgba(56,189,248,0.1)",
        border: `1px solid ${highlight ? "rgba(52,211,153,0.35)" : "rgba(56,189,248,0.28)"}`,
      }}
    >
      <summary className="cursor-pointer list-none p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: highlight ? "#34d399" : "#7dd3fc" }}>
            Share business page → professional page
          </div>
          <div className="mt-1 text-xs" style={{ color: "rgba(245,245,245,0.62)" }}>
            Expand to copy the professional-page share text.
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onCopy(text);
          }}
          className="text-[10px] font-bold px-2 py-1 rounded"
          style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(245,245,245,0.9)" }}
        >
          Copy share text
        </button>
      </summary>
      <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words" style={{ color: "rgba(245,245,245,0.86)" }}>{text}</pre>
    </details>
  );
}

function ManualPostingLinks({
  packageData,
  legislatorText,
  onCopy,
  defaultOpen = false,
}: {
  packageData: QueueRow["package_json"];
  legislatorText: string;
  onCopy: (text: string) => void;
  defaultOpen?: boolean;
}) {
  const locationTag = packageData.captions.locationTag;
  const congress = packageData.legislators.filter(l => l.level === "congress");
  const stateLegislators = packageData.legislators.filter(l => l.level === "state_senate" || l.level === "state_house");

  return (
    <details
      className="mt-3 rounded-xl"
      open={defaultOpen}
      style={{ backgroundColor: "rgba(201,162,39,0.08)", border: "1px solid rgba(201,162,39,0.18)" }}
    >
      <summary className="cursor-pointer list-none p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: GOLD }}>Legislator tags & location</div>
          <div className="mt-1 text-xs" style={{ color: "rgba(245,245,245,0.62)" }}>
            Congress + state legislators · expand to copy tags or open profiles.
          </div>
        </div>
        {legislatorText && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onCopy(legislatorText);
            }}
            className="text-[10px] font-bold px-2 py-1 rounded"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.75)" }}
          >
            Copy legislator tags
          </button>
        )}
      </summary>

      <div className="px-3 pb-3">
        <div className="flex flex-wrap gap-2">
          {locationTag && (
            <a
              href={mapsSearchUrl(locationTag)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fef3c7", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              Location: {locationTag}
            </a>
          )}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <LegislatorLinkGroup title="Congress" legislators={congress} />
          <LegislatorLinkGroup
            title="State legislators"
            legislators={stateLegislators}
            emptyText={packageData.county
              ? `No state-legislator pair matched ${packageData.county}, ${packageData.state_abbr}. Click Refresh slides to rebuild from the actor record, or add this county to the roster.`
              : "County missing on this package — click Refresh slides to pull county from the actor spec and rebuild legislator tags."}
          />
        </div>

        {legislatorText && (
          <details className="mt-3 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.16)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <summary className="cursor-pointer list-none px-2.5 py-2 text-[10px] font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.52)" }}>
              Full legislator comment text
            </summary>
            <pre className="px-2.5 pb-2.5 text-xs whitespace-pre-wrap break-words" style={{ color: "rgba(245,245,245,0.76)" }}>{legislatorText}</pre>
          </details>
        )}
      </div>
    </details>
  );
}

function LegislatorLinkGroup({
  title,
  legislators,
  emptyText,
}: {
  title: string;
  legislators: PackageLegislator[];
  emptyText?: string;
}) {
  return (
    <div className="rounded-lg p-2.5" style={{ backgroundColor: "rgba(0,0,0,0.16)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.52)" }}>{title}</div>
      {legislators.length === 0 && (
        <div className="mt-2 text-xs" style={{ color: "rgba(245,245,245,0.52)" }}>{emptyText ?? "No links available."}</div>
      )}
      <div className="mt-2 space-y-2">
        {legislators.map((legislator, index) => {
          const links = socialLinksFor(legislator);
          return (
            <div key={`${legislator.level}-${legislator.name}-${index}`} className="text-xs">
              <div className="font-bold" style={{ color: "#fef3c7" }}>
                {legislatorGroupLabel(legislator.level)}: {legislator.name}{partyLabel(legislator.party)}
              </div>
              <div className="mt-0.5" style={{ color: "rgba(245,245,245,0.62)" }}>
                {legislator.title}{legislator.note ? ` · ${legislator.note}` : ""}
              </div>
              {links.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {links.map(link => (
                    <a
                      key={`${legislator.name}-${link.platform}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md px-2 py-1 font-bold"
                      style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.86)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      {link.platform}{link.handle ? ` ${link.handle}` : ""}
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-xs" style={{ color: "#fbbf24" }}>No social/profile link saved.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FrameSlidePreview({ frame }: { frame: QueueRow["package_json"]["frames"][number] }) {
  const [broken, setBroken] = useState(false);
  const src = resolvePublicAssetUrl(frame.url);

  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
      {broken ? (
        <div
          className="h-24 w-16 rounded-lg border border-dashed border-orange-400/50 flex items-center justify-center px-1 text-center text-[10px] font-bold"
          style={{ color: "#fb923c", backgroundColor: "rgba(251,146,60,0.08)" }}
        >
          Slide {frame.order} missing
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={`Slide ${frame.order}`}
          className="h-24 w-auto rounded-lg border border-white/10"
          onError={() => setBroken(true)}
        />
      )}
    </a>
  );
}

function CaptionBlock({
  label,
  text,
  onCopy,
  limit,
  defaultOpen = false,
}: {
  label: string;
  text: string;
  onCopy: (t: string) => void;
  limit?: number;
  defaultOpen?: boolean;
}) {
  const overLimit = typeof limit === "number" && text.length > limit;
  return (
    <details
      className="rounded-xl"
      open={defaultOpen}
      style={{ backgroundColor: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: overLimit ? "#f87171" : "rgba(245,245,245,0.5)" }}>
          {label}{typeof limit === "number" ? ` · ${text.length}/${limit}` : ""}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onCopy(text);
          }}
          className="text-[10px] font-bold px-2 py-1 rounded"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,245,0.7)" }}
        >
          Copy
        </button>
      </summary>
      <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words" style={{ color: "rgba(245,245,245,0.8)" }}>{text}</pre>
    </details>
  );
}

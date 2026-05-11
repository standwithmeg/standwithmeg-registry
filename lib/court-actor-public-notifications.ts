import { createAdminSupabaseClient } from "./supabase-admin";
import {
  COURT_ACTOR_PUBLIC_THRESHOLD,
  actorBucketKeyWithLocation,
  actorLooseNameKey,
  courtActorLocationKey,
  resolveFamilyKey,
  type CourtActorRowReviewDecision,
} from "./court-actors";
import { isCountableSubmission, isPublicShareableSubmission } from "./submission-public-visibility";
import { US_JURISDICTIONS } from "./us-jurisdictions";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

const US_STATE_NAME_BY_CODE: Map<string, string> = new Map(
  US_JURISDICTIONS.map(([code, name]) => [code, name]),
);

/**
 * Render a location_key for human display in the email body.
 *   "KS" → "Kansas"
 *   "Mexico" → "Mexico"   (non-US country left as-is)
 * Counting/dedupe always uses the raw location_key, never this string.
 */
export function formatLocationForEmail(locationKey: string): string {
  const trimmed = locationKey.trim();
  if (!trimmed) return trimmed;
  const upper = trimmed.toUpperCase();
  return US_STATE_NAME_BY_CODE.get(upper) ?? trimmed;
}

/**
 * One contributing reporter for a public court-actor bucket. The script
 * uses these to address an email; the email body never reveals one
 * reporter to another.
 */
export type PublicActorReporter = {
  reporter_email: string;
  reporter_first_name: string | null;
  submission_id: string;
  court_actor_row_id: string;
  raw_name_submitted: string;
};

/**
 * Public court actor bucket — name has crossed the 3-family threshold
 * via form_direct rows, with admin alias merges + row-review decisions
 * applied exactly like the public /api/survey/court-actors endpoint.
 */
export type PublicActorBucket = {
  actor_bucket_key: string;
  canonical_name: string;
  role_summary: string;
  location_key: string;
  state_code: string | null;
  family_count: number;
  /**
   * ISO timestamp of the row that pushed this bucket's distinct-family
   * count to COURT_ACTOR_PUBLIC_THRESHOLD (3). Used to split "already
   * public for a while" buckets from "crossed threshold today" buckets
   * so we can backfill the former and auto-email the latter.
   */
  crossed_threshold_at: string | null;
  reporters: PublicActorReporter[];
};

type ActorJoinedRow = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  created_at: string;
  submission_id: string;
  source: string | null;
  survey_submissions:
    | {
        email: string | null;
        first_name: string | null;
        state_of_occurrence: string | null;
        outside_us_country: string | null;
        permission_to_share: string | null;
        approved: boolean | null;
      }
    | {
        email: string | null;
        first_name: string | null;
        state_of_occurrence: string | null;
        outside_us_country: string | null;
        permission_to_share: string | null;
        approved: boolean | null;
      }[]
    | null;
};

function joinedSubmission(row: ActorJoinedRow) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function rowLocation(row: ActorJoinedRow): string | null {
  if (row.location_key?.trim()) return row.location_key.trim();
  const submission = joinedSubmission(row);
  return courtActorLocationKey(
    submission?.state_of_occurrence ?? null,
    submission?.outside_us_country ?? null,
  );
}

async function loadRowReviewMap(sb: AdminClient): Promise<Map<string, CourtActorRowReviewDecision>> {
  const map = new Map<string, CourtActorRowReviewDecision>();
  const { data, error } = await sb
    .from("court_actor_row_review")
    .select("row_id, decision");
  if (error) {
    const missing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /Could not find the table/i.test(error.message ?? "");
    if (missing) return map;
    throw new Error(`court_actor_row_review select failed: ${error.message}`);
  }
  for (const r of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
    map.set(r.row_id, r.decision);
  }
  return map;
}

function pickMostFrequent<T>(m: Map<T, number>): T | null {
  let best: T | null = null;
  let max = 0;
  for (const entry of Array.from(m.entries())) {
    const [k, v] = entry;
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

function roleSummary(roles: Map<string, number>) {
  const sorted = Array.from(roles.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length === 1) return sorted[0][0];
  return `${sorted[0][0]} + ${sorted.length - 1} role${sorted.length === 2 ? "" : "s"}`;
}

/**
 * Loads every form_direct court_actors row, applies the same alias and
 * row-review decisions as the public counting logic, and returns each
 * bucket that has met the 3-family threshold along with the reporter
 * emails of the families who contributed.
 *
 * Reporters are deduped per bucket using the same family key as
 * resolveFamilyKey() — so one family naming the same actor twice yields
 * one reporter entry. We pick the row with the earliest created_at as
 * the reporter's representative submission.
 */
export async function getPublicActorsWithReporters(): Promise<PublicActorBucket[]> {
  const sb = createAdminSupabaseClient();

  const all: ActorJoinedRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb
      .from("court_actors")
      .select(
        "id, role, name, court_or_county, state_code, location_key, created_at, submission_id, source, survey_submissions(email, first_name, state_of_occurrence, outside_us_country, permission_to_share, approved)",
      )
      .eq("source", "form_direct")
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`court_actors select failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as ActorJoinedRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const rowReviewMap = await loadRowReviewMap(sb);

  type FamilyEntry = {
    reporter_email: string;
    reporter_first_name: string | null;
    submission_id: string;
    court_actor_row_id: string;
    raw_name_submitted: string;
    created_at: string;
  };

  type Bucket = {
    actor_bucket_key: string;
    canonical_name: string;
    location_key: string;
    state_code: string | null;
    casingCounts: Map<string, number>;
    roleCounts: Map<string, number>;
    families: Map<string, FamilyEntry>;
  };

  const buckets = new Map<string, Bucket>();

  for (const a of all) {
    if (!a.role || !a.name) continue;
    const location = rowLocation(a);
    if (!location) continue;

    const submission = joinedSubmission(a);
    if (!isPublicShareableSubmission(submission)) continue;

    const fk = resolveFamilyKey({
      row_id: a.id,
      reporter_email: submission?.email ?? null,
      submission_id: a.submission_id,
      location_key: location,
      review_decision: rowReviewMap.get(a.id) ?? null,
    });
    if (fk === null) continue;

    const effectiveName = a.name;
    const bucketKey = actorBucketKeyWithLocation(effectiveName, a.role, location);
    if (!bucketKey.split("|")[0]) continue;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        actor_bucket_key: bucketKey,
        canonical_name: effectiveName,
        location_key: location,
        state_code: a.state_code,
        casingCounts: new Map(),
        roleCounts: new Map(),
        families: new Map(),
      };
      buckets.set(bucketKey, bucket);
    }

    bucket.roleCounts.set(a.role, (bucket.roleCounts.get(a.role) ?? 0) + 1);
    const casingName = a.name;
    bucket.casingCounts.set(casingName, (bucket.casingCounts.get(casingName) ?? 0) + 1);

    const reporterEmail = submission?.email?.trim().toLowerCase();
    // Only families that have a reporter email can receive an automated
    // photo request. submission-only / synthetic family keys are still
    // counted toward the public threshold (they always were), but we
    // can't email anyone without an address on file.
    if (!reporterEmail) continue;

    const existing = bucket.families.get(fk);
    if (!existing || a.created_at < existing.created_at) {
      bucket.families.set(fk, {
        reporter_email: reporterEmail,
        reporter_first_name: submission?.first_name?.trim() || null,
        submission_id: a.submission_id,
        court_actor_row_id: a.id,
        raw_name_submitted: a.name,
        created_at: a.created_at,
      });
    }
  }

  // Per-bucket thresholding uses ALL family keys (with or without email).
  // We have to recount that here, because we only kept emailable rows above.
  // While we're at it, capture each bucket's distinct family arrival
  // timeline so we can compute when the 3rd family pushed it public.
  const allFamilyCounts = new Map<string, Set<string>>();
  type FamilyArrival = { family_key: string; created_at: string };
  const arrivalsByBucket = new Map<string, FamilyArrival[]>();
  for (const a of all) {
    if (!a.role || !a.name) continue;
    const location = rowLocation(a);
    if (!location) continue;
    const submission = joinedSubmission(a);
    if (!isCountableSubmission(submission)) continue;
    const fk = resolveFamilyKey({
      row_id: a.id,
      reporter_email: submission?.email ?? null,
      submission_id: a.submission_id,
      location_key: location,
      review_decision: rowReviewMap.get(a.id) ?? null,
    });
    if (fk === null) continue;
    const effectiveName = a.name;
    const bucketKey = actorBucketKeyWithLocation(effectiveName, a.role, location);
    if (!bucketKey.split("|")[0]) continue;
    let set = allFamilyCounts.get(bucketKey);
    if (!set) {
      set = new Set<string>();
      allFamilyCounts.set(bucketKey, set);
    }
    set.add(fk);
    let arrivals = arrivalsByBucket.get(bucketKey);
    if (!arrivals) {
      arrivals = [];
      arrivalsByBucket.set(bucketKey, arrivals);
    }
    arrivals.push({ family_key: fk, created_at: a.created_at });
  }

  const out: PublicActorBucket[] = [];
  for (const bucket of Array.from(buckets.values())) {
    const totalFamilies = allFamilyCounts.get(bucket.actor_bucket_key)?.size ?? 0;
    if (totalFamilies < COURT_ACTOR_PUBLIC_THRESHOLD) continue;

    // Walk this bucket's contributions in chronological order. The row
    // that adds the 3rd distinct family is the one that pushed it
    // public — record its created_at as crossed_threshold_at.
    const arrivals = (arrivalsByBucket.get(bucket.actor_bucket_key) ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const seenFamilies = new Set<string>();
    let crossedAt: string | null = null;
    for (const arrival of arrivals) {
      if (seenFamilies.has(arrival.family_key)) continue;
      seenFamilies.add(arrival.family_key);
      if (seenFamilies.size === COURT_ACTOR_PUBLIC_THRESHOLD) {
        crossedAt = arrival.created_at;
        break;
      }
    }

    const canonical = pickMostFrequent(bucket.casingCounts) ?? bucket.canonical_name;
    out.push({
      actor_bucket_key: `${actorLooseNameKey(canonical)}|${bucket.location_key}`,
      canonical_name: canonical,
      role_summary: roleSummary(bucket.roleCounts),
      location_key: bucket.location_key,
      state_code: bucket.state_code,
      family_count: totalFamilies,
      crossed_threshold_at: crossedAt,
      reporters: Array.from(bucket.families.values())
        .map(entry => ({
          reporter_email: entry.reporter_email,
          reporter_first_name: entry.reporter_first_name,
          submission_id: entry.submission_id,
          court_actor_row_id: entry.court_actor_row_id,
          raw_name_submitted: entry.raw_name_submitted,
        }))
        .sort((a, b) => a.reporter_email.localeCompare(b.reporter_email)),
    });
  }

  out.sort(
    (a, b) =>
      b.family_count - a.family_count ||
      a.canonical_name.localeCompare(b.canonical_name),
  );

  return out;
}

export type ExistingNotificationRow = {
  id: string;
  actor_bucket_key: string;
  reporter_email: string;
  status: "sent" | "skipped" | "failed" | "pending";
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};

/**
 * Loads every existing court_actor_public_notifications row so the
 * caller can decide which (reporter_email, actor_bucket_key) pairs
 * are already in a non-resendable state ("sent").
 */
export async function loadExistingNotifications(): Promise<ExistingNotificationRow[]> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("court_actor_public_notifications")
    .select("id, actor_bucket_key, reporter_email, status, sent_at, error_message, created_at");
  if (error) {
    const missing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /Could not find the table/i.test(error.message ?? "");
    if (missing) return [];
    throw new Error(`court_actor_public_notifications select failed: ${error.message}`);
  }
  return (data ?? []) as ExistingNotificationRow[];
}

export function notificationDedupeKey(
  reporterEmail: string,
  actorBucketKey: string,
): string {
  return `${reporterEmail.trim().toLowerCase()}|${actorBucketKey}`;
}

/**
 * Build the locked photo-request email body. Never reveals other
 * reporters or how many families submitted.
 */
export function buildPhotoRequestEmail(args: {
  firstName: string | null;
  canonicalName: string;
  locationKey: string;
}): { subject: string; body: string } {
  const greetingName = args.firstName?.trim() ? args.firstName.trim() : "there";
  const locationDisplay = formatLocationForEmail(args.locationKey);
  const subject = "Court actor update for Stand With Meg";
  const body = [
    `Hi ${greetingName},`,
    "",
    "Thank you for submitting your Stand With Meg survey.",
    "",
    `The court actor you named, ${args.canonicalName} in ${locationDisplay}, has now reached the public reporting threshold on Stand With Meg.`,
    "",
    "If you have a public, official source for this person’s photo or profile, you can reply with it. Helpful sources include:",
    "- court or government directory page",
    "- official judicial profile",
    "- state bar or licensing profile",
    "- professional website/profile",
    "- public news article or public source link",
    "",
    "Please do not send private photos, family photos, home/social media photos, or anything that is not publicly available.",
    "",
    "Nothing will be published automatically. Anything you send will be reviewed first.",
    "",
    "Thank you,",
    "Meg",
    "Stand With Meg",
  ].join("\n");
  return { subject, body };
}

// ─────────────────────────────────────────────────────────────────────
// Send-and-record dispatcher.
//
// Does the actual work: for every public bucket that has emailable
// reporters not already in the dedupe table, send the locked email via
// SMTP and record a court_actor_public_notifications row. Used by the
// daily script and by the survey-submission hot path (fire-and-forget).
//
// The same partial unique index that protects the script also protects
// concurrent calls from this function — a duplicate send race becomes a
// 23505 on insert, which we count as 'skipped' instead of 'sent'.
// ─────────────────────────────────────────────────────────────────────
export type DispatchSummary = {
  sent: number;
  skipped: number;
  failed: number;
  details: Array<
    | { kind: "sent"; reporter_email: string; canonical_name: string; location_key: string; message_id?: string }
    | { kind: "skipped"; reporter_email: string; canonical_name: string; location_key: string; reason: string }
    | { kind: "failed"; reporter_email: string; canonical_name: string; location_key: string; error: string }
  >;
};

export type DispatchOptions = {
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  replyToAddress: string;
  /**
   * Optional filter: only consider buckets whose actor_bucket_key is in
   * this set. Used by the survey hot path so we only do the SMTP work
   * for actors related to the just-submitted form, not the entire DB.
   */
  onlyActorBucketKeys?: Set<string>;
  logger?: {
    log: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
};

const DEFAULT_LOGGER = {
  log: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};

export async function dispatchPendingPhotoRequests(
  options: DispatchOptions,
): Promise<DispatchSummary> {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const summary: DispatchSummary = { sent: 0, skipped: 0, failed: 0, details: [] };

  const sb = createAdminSupabaseClient();

  const probe = await sb
    .from("court_actor_public_notifications")
    .select("id", { count: "exact", head: true });
  if (probe.error) {
    throw new Error(
      `court_actor_public_notifications is unreachable (${probe.error.message}). ` +
        "Apply migration 023_court_actor_public_notifications.sql first.",
    );
  }

  const buckets = await getPublicActorsWithReporters();
  const existingRows = await loadExistingNotifications();
  const alreadySent = new Set<string>();
  for (const r of existingRows) {
    if (r.status === "sent") {
      alreadySent.add(notificationDedupeKey(r.reporter_email, r.actor_bucket_key));
    }
  }

  type Plan = {
    bucket: PublicActorBucket;
    reporter: PublicActorReporter;
    subject: string;
    body: string;
  };
  const plan: Plan[] = [];
  for (const bucket of buckets) {
    if (options.onlyActorBucketKeys && !options.onlyActorBucketKeys.has(bucket.actor_bucket_key)) {
      continue;
    }
    for (const reporter of bucket.reporters) {
      const key = notificationDedupeKey(reporter.reporter_email, bucket.actor_bucket_key);
      if (alreadySent.has(key)) continue;
      const { subject, body } = buildPhotoRequestEmail({
        firstName: reporter.reporter_first_name,
        canonicalName: bucket.canonical_name,
        locationKey: bucket.location_key,
      });
      plan.push({ bucket, reporter, subject, body });
    }
  }

  if (plan.length === 0) return summary;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: options.smtpUser, pass: options.smtpPass },
  });

  for (const p of plan) {
    // Race-safety: another caller may have written a 'sent' row since we
    // loaded existingRows. Re-check immediately before SMTP work.
    const { data: justChecked, error: dedupeErr } = await sb
      .from("court_actor_public_notifications")
      .select("id")
      .eq("status", "sent")
      .eq("actor_bucket_key", p.bucket.actor_bucket_key)
      .ilike("reporter_email", p.reporter.reporter_email)
      .limit(1);
    if (dedupeErr) {
      summary.skipped += 1;
      summary.details.push({
        kind: "skipped",
        reporter_email: p.reporter.reporter_email,
        canonical_name: p.bucket.canonical_name,
        location_key: p.bucket.location_key,
        reason: `dedupe-check-failed: ${dedupeErr.message}`,
      });
      logger.error(`[skip] dedupe check failed for ${p.reporter.reporter_email}: ${dedupeErr.message}`);
      continue;
    }
    if (justChecked && justChecked.length > 0) {
      summary.skipped += 1;
      summary.details.push({
        kind: "skipped",
        reporter_email: p.reporter.reporter_email,
        canonical_name: p.bucket.canonical_name,
        location_key: p.bucket.location_key,
        reason: "already-sent-in-other-run",
      });
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: `"Stand With Meg" <${options.fromAddress}>`,
        replyTo: options.replyToAddress,
        to: p.reporter.reporter_email,
        subject: p.subject,
        text: p.body,
      });
      const { error: insertErr } = await sb
        .from("court_actor_public_notifications")
        .insert({
          actor_bucket_key: p.bucket.actor_bucket_key,
          canonical_name: p.bucket.canonical_name,
          location_key: p.bucket.location_key,
          reporter_email: p.reporter.reporter_email,
          submission_id: p.reporter.submission_id,
          court_actor_row_id: p.reporter.court_actor_row_id,
          status: "sent",
          email_subject: p.subject,
          email_body: p.body,
          sent_at: new Date().toISOString(),
        });
      summary.sent += 1;
      summary.details.push({
        kind: "sent",
        reporter_email: p.reporter.reporter_email,
        canonical_name: p.bucket.canonical_name,
        location_key: p.bucket.location_key,
        message_id: info.messageId,
      });
      if (insertErr) {
        logger.warn(
          `[warn] sent email but failed to record notification for ${p.reporter.reporter_email}: ${insertErr.message}`,
        );
      } else {
        logger.log(
          `[sent] ${p.reporter.reporter_email} re: ${p.bucket.canonical_name} — messageId=${info.messageId}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[fail] ${p.reporter.reporter_email} re: ${p.bucket.canonical_name}: ${message}`);
      await sb.from("court_actor_public_notifications").insert({
        actor_bucket_key: p.bucket.actor_bucket_key,
        canonical_name: p.bucket.canonical_name,
        location_key: p.bucket.location_key,
        reporter_email: p.reporter.reporter_email,
        submission_id: p.reporter.submission_id,
        court_actor_row_id: p.reporter.court_actor_row_id,
        status: "failed",
        email_subject: p.subject,
        email_body: p.body,
        error_message: message.slice(0, 2000),
      });
      summary.failed += 1;
      summary.details.push({
        kind: "failed",
        reporter_email: p.reporter.reporter_email,
        canonical_name: p.bucket.canonical_name,
        location_key: p.bucket.location_key,
        error: message,
      });
    }
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────
// Recent-activity reader for the admin tile.
// ─────────────────────────────────────────────────────────────────────
export type RecentNotification = {
  id: string;
  actor_bucket_key: string;
  canonical_name: string;
  location_key: string;
  reporter_email: string;
  status: "sent" | "skipped" | "failed" | "pending";
  email_subject: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

/**
 * Most-recent N notification rows. Used by the admin tile to surface
 * "what fired since last time I looked" plus any failures.
 */
export async function loadRecentNotifications(limit = 50): Promise<RecentNotification[]> {
  const sb = createAdminSupabaseClient();
  const { data, error } = await sb
    .from("court_actor_public_notifications")
    .select("id, actor_bucket_key, canonical_name, location_key, reporter_email, status, email_subject, error_message, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    const missing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /Could not find the table/i.test(error.message ?? "");
    if (missing) return [];
    throw new Error(`court_actor_public_notifications recent select failed: ${error.message}`);
  }
  return (data ?? []) as RecentNotification[];
}

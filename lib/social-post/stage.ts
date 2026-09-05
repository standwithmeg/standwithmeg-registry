import { actorBucketKeyWithLocation } from "../court-actors";
import { getGmailClient, sendEmail, targetGmailMailboxEmail } from "../gmail";
import { createAdminSupabaseClient } from "../supabase-admin";
import {
  getQueuedPostsByBucketKey,
  insertQueuedPost,
  logAction,
  replaceQueuePost,
  updateQueueEmailDeliveryFailure,
  updateQueueEmailSentMessageId,
  type QueueInsert,
  type QueueRow,
} from "./db";
import type { SocialPostStatus } from "./types";
import { buildApprovalEmail } from "./email";
import { inFlightSocialPlatforms } from "./in-flight";
import { buildSocialPostPackage, type PublicActorLike } from "./package";
import { socialPostPackageSignature } from "./signature";
import {
  computePublicActorsDirect,
  expirePublicActorCache,
} from "../../app/api/survey/court-actors/route";

export type StageSocialPostsOptions = {
  dryRun?: boolean;
  requeueAll?: boolean;
  /** Rebuild slides even when package signature is unchanged (manual push from actor detail). */
  forceRequeue?: boolean;
  skipEmail?: boolean;
  source?: string;
  /** When set, only stage this actor bucket (discovery / single-actor refresh). */
  actorBucketKey?: string;
};

export type StageSocialPostsResult = {
  ok: true;
  dry_run: boolean;
  requeue_all: boolean;
  staged: Array<{ actor: string; status: string; note?: string }>;
  skipped: Array<{ actor: string; reason: string }>;
  email_errors: string[];
  emails_sent: number;
  emails_skipped: number;
  email_rate_limited: number;
  total_public_actors: number;
};

const APPROVAL_EMAIL_DELAY_MS = Number(process.env.SOCIAL_POST_EMAIL_DELAY_MS ?? 2500);
const MAX_APPROVAL_EMAILS_PER_RUN = Number(process.env.SOCIAL_POST_MAX_EMAILS_PER_CRON ?? 8);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function approvalEmailAddress(): string {
  return targetGmailMailboxEmail();
}

async function fetchPublicActorsForStaging(bucketKeyFilter?: string | null): Promise<PublicActorLike[]> {
  const sb = createAdminSupabaseClient();
  const bucketFilter = bucketKeyFilter?.trim().toLowerCase() || null;

  // Single-actor push from admin: skip MV refresh + full cache bust (50s+ on production).
  if (bucketFilter) {
    let actors = await computePublicActorsDirect(sb, null, null, { bypassRowCache: false });
    let match = actors.filter(actor => actorBucketKey(actor) === bucketFilter);
    if (match.length > 0) return match;

    await expirePublicActorCache(sb);
    actors = await computePublicActorsDirect(sb, null, null, { bypassRowCache: true });
    match = actors.filter(actor => actorBucketKey(actor) === bucketFilter);
    if (match.length > 0) return match;

    return [];
  }

  await expirePublicActorCache(sb);
  try {
    await sb.rpc("refresh_mv_court_actors_public_safe");
  } catch (err) {
    console.error("refresh_mv_court_actors_public_safe failed during social staging:", err);
  }
  return computePublicActorsDirect(sb, null, null, { bypassRowCache: true });
}

function actorBucketKey(actor: PublicActorLike): string {
  const state = (actor.location_key ?? actor.state_code ?? "").toUpperCase();
  return actorBucketKeyWithLocation(actor.name, actor.role, state).toLowerCase();
}

const OPEN_QUEUE_STATUSES = new Set<SocialPostStatus>([
  "pending_review",
  "needs_review",
  "approved_to_post",
]);

function resolveQueueUpdate(args: {
  existing: QueueRow | null;
  requeueAll: boolean;
  forceRequeue: boolean;
  existingSignature: string | null;
  nextSignature: string;
  nextFamilyCount: number;
}): { shouldSkip: boolean; status: SocialPostStatus; reviewNotes: string | null; skipReason?: string } {
  const { existing, requeueAll, forceRequeue, existingSignature, nextSignature, nextFamilyCount } = args;
  if (!existing) {
    return { shouldSkip: false, status: "pending_review", reviewNotes: null };
  }
  if (!requeueAll && !forceRequeue && existingSignature === nextSignature) {
    return { shouldSkip: true, status: existing.status, reviewNotes: null };
  }
  const inFlightPlatforms = inFlightSocialPlatforms(existing.review_notes);
  if (inFlightPlatforms.length > 0) {
    return {
      shouldSkip: true,
      status: existing.status,
      reviewNotes: null,
      skipReason: `Package refresh deferred while ${inFlightPlatforms.join(", ")} submission${inFlightPlatforms.length === 1 ? " is" : "s are"} still publishing or scheduled.`,
    };
  }

  if (existing.status === "posted" || existing.status === "rejected") {
    const existingFamilyCount = existing.package_json.family_count ?? 0;
    if (forceRequeue && existingSignature === nextSignature) {
      if (existing.status === "posted") {
        return {
          shouldSkip: false,
          status: "posted",
          reviewNotes: "Refreshed slides/package in posted history.",
        };
      }
      return {
        shouldSkip: false,
        status: "pending_review",
        reviewNotes: "Manually pushed to social queue again for review.",
      };
    }
    if (nextFamilyCount <= existingFamilyCount) {
      return {
        shouldSkip: false,
        status: existing.status,
        reviewNotes: existing.status === "posted"
          ? "Refreshed social package metadata while preserving posted history."
          : "Refreshed social package metadata while preserving rejected status.",
      };
    }
    return {
      shouldSkip: false,
      status: "pending_review",
      reviewNotes: `New family data (${nextFamilyCount} families now); review updated slides before posting again.`,
    };
  }

  if (OPEN_QUEUE_STATUSES.has(existing.status)) {
    const status: SocialPostStatus = existing.status === "approved_to_post" ? "needs_review" : existing.status;
    const reviewNotes = forceRequeue && existingSignature === nextSignature
      ? "Manually pushed to social queue again for review."
      : "Updated with new parent quote/slides since the last queue item; review before posting.";
    return {
      shouldSkip: false,
      status,
      reviewNotes,
    };
  }

  return { shouldSkip: false, status: "pending_review", reviewNotes: null };
}

export async function stageCourtActorSocialPosts(options: StageSocialPostsOptions = {}): Promise<StageSocialPostsResult> {
  const dryRun = options.dryRun === true;
  const requeueAll = options.requeueAll === true;
  const forceRequeue = options.forceRequeue === true;
  const skipEmail = options.skipEmail === true || dryRun;
  const source = options.source ?? "cron";

  const approvalEmail = approvalEmailAddress();
  if (!skipEmail && !approvalEmail) {
    throw new Error("SOCIAL_POST_APPROVAL_EMAIL, GOOGLE_SMTP_USER, or FOUNDER_EMAIL must be set.");
  }

  const [publicActors, queuedPostsByBucketKey] = await Promise.all([
    fetchPublicActorsForStaging(options.actorBucketKey),
    getQueuedPostsByBucketKey(),
  ]);

  const staged: StageSocialPostsResult["staged"] = [];
  const skipped: StageSocialPostsResult["skipped"] = [];
  const emailErrors: string[] = [];
  let emailsSent = 0;
  let emailsSkipped = 0;
  let emailRateLimited = 0;

  const bucketFilter = options.actorBucketKey?.trim().toLowerCase() || null;

  if (bucketFilter && publicActors.length === 0) {
    return {
      ok: true,
      dry_run: dryRun,
      requeue_all: requeueAll,
      staged: [],
      skipped: [{ actor: bucketFilter, reason: "Actor not found in the public registry (refresh Court Actors, then try again)." }],
      email_errors: emailErrors,
      emails_sent: emailsSent,
      emails_skipped: emailsSkipped,
      email_rate_limited: emailRateLimited,
      total_public_actors: 0,
    };
  }

  for (const actor of publicActors) {
    const bucketKey = actorBucketKey(actor);
    if (bucketFilter && bucketKey !== bucketFilter) continue;
    const existing = queuedPostsByBucketKey.get(bucketKey) ?? null;

    const buildResult = await buildSocialPostPackage(actor);
    if (!buildResult.ok) {
      skipped.push({ actor: actor.name, reason: buildResult.reason });
      continue;
    }

    const pkg = buildResult.package;
    const existingSignature = existing?.package_json.content_signature
      ?? (existing ? socialPostPackageSignature(existing.package_json) : null);
    const nextSignature = pkg.content_signature ?? socialPostPackageSignature(pkg);

    const updatePlan = resolveQueueUpdate({
      existing,
      requeueAll,
      forceRequeue,
      existingSignature,
      nextSignature,
      nextFamilyCount: pkg.family_count,
    });
    if (updatePlan.shouldSkip) {
      if (updatePlan.skipReason) skipped.push({ actor: pkg.actor_name, reason: updatePlan.skipReason });
      continue;
    }

    const { status, reviewNotes } = updatePlan;
    staged.push({ actor: pkg.actor_name, status, note: reviewNotes ?? undefined });

    if (dryRun) {
      continue;
    }

    const insertRow: QueueInsert = {
      actor_bucket_key: pkg.actor_bucket_key,
      actor_slug: pkg.actor_slug,
      state_abbr: pkg.state_abbr,
      actor_name: pkg.actor_name,
      role: pkg.role,
      county: pkg.county,
      status,
      package_json: pkg,
      review_notes: reviewNotes,
    };

    const queued = existing
      ? await replaceQueuePost(pkg.actor_bucket_key, insertRow)
      : await insertQueuedPost(insertRow);
    await logAction({
      queueId: queued.id,
      action: "staged",
      source,
      actorName: pkg.actor_name,
      actorBucketKey: pkg.actor_bucket_key,
    });

    if (skipEmail) continue;

    const signatureUnchanged = existingSignature === nextSignature;
    const alreadyEmailed =
      Boolean(existing?.email_sent_message_id) &&
      signatureUnchanged &&
      !forceRequeue &&
      !requeueAll;
    if (alreadyEmailed) {
      emailsSkipped += 1;
      continue;
    }

    if (emailsSent >= MAX_APPROVAL_EMAILS_PER_RUN) {
      emailRateLimited += 1;
      skipped.push({
        actor: pkg.actor_name,
        reason: `Approval email deferred — cron cap (${MAX_APPROVAL_EMAILS_PER_RUN}/run). Re-run staging or approve from dashboard.`,
      });
      continue;
    }

    try {
      if (emailsSent > 0) {
        await sleep(APPROVAL_EMAIL_DELAY_MS);
      }
      const admin = createAdminSupabaseClient();
      const gmailClient = await getGmailClient(admin, approvalEmail);
      const email = buildApprovalEmail({
        to: approvalEmail,
        package: pkg,
        queueId: queued.id,
        reviewNotes,
      });
      const sent = await sendEmail(gmailClient, {
        to: email.to,
        subject: email.subject,
        body: email.html,
      });
      if (sent.id) {
        await updateQueueEmailSentMessageId(queued.id, sent.id);
      }
      emailsSent += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      emailErrors.push(`${pkg.actor_name}: ${message}`);
      await updateQueueEmailDeliveryFailure(queued.id, message);
      console.error(`[social-post] approval email failed for ${pkg.actor_name}:`, message);
    }
  }

  return {
    ok: true,
    dry_run: dryRun,
    requeue_all: requeueAll,
    staged,
    skipped,
    email_errors: emailErrors,
    emails_sent: emailsSent,
    emails_skipped: emailsSkipped,
    email_rate_limited: emailRateLimited,
    total_public_actors: publicActors.length,
  };
}

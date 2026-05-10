/**
 * Send (or dry-run) automatic photo / source request emails to families
 * whose named court actor has reached the public reporting threshold
 * (3+ distinct families, form_direct only).
 *
 * Usage:
 *   # Show exactly who WOULD be emailed, write nothing, send nothing.
 *   npx tsx scripts/send-public-court-actor-photo-requests.ts --dry-run
 *
 *   # Real send. Writes one row per attempt to court_actor_public_notifications.
 *   npx tsx scripts/send-public-court-actor-photo-requests.ts --send
 *
 * Required env (real send only):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_SMTP_USER          (e.g. info@standwithmeg.com)
 *   GOOGLE_SMTP_PASSWORD      (16-char Google Workspace app password)
 *   GOOGLE_SMTP_FROM          (optional — falls back to GOOGLE_SMTP_USER)
 *   GOOGLE_SMTP_REPLY_TO      (optional — falls back to FROM)
 *
 * .env.local in the repo root is loaded automatically (no dotenv dep).
 *
 * Privacy / safety rules enforced here:
 *   - Each (reporter_email, actor_bucket_key) pair gets at most ONE
 *     successful email, ever. We check court_actor_public_notifications
 *     before every send and write the result row after every send.
 *   - The email body never names another reporter, reveals counts, or
 *     asks for private/family/social-media images.
 *   - --dry-run does NOT write any rows and does NOT send anything.
 *   - This script never modifies court_actors counts.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

loadDotEnvLocal();

import {
  buildPhotoRequestEmail,
  getPublicActorsWithReporters,
  loadExistingNotifications,
  notificationDedupeKey,
  type ExistingNotificationRow,
  type PublicActorBucket,
  type PublicActorReporter,
} from "../lib/court-actor-public-notifications";

type Mode = "dry-run" | "send";

type PlannedSend = {
  bucket: PublicActorBucket;
  reporter: PublicActorReporter;
  subject: string;
  body: string;
};

type ExistingIndex = {
  alreadySentKeys: Set<string>;
  prior: Map<string, ExistingNotificationRow[]>;
};

/**
 * Tiny .env.local loader so the script is self-contained — Next.js
 * loads .env.local automatically at runtime, but tsx scripts don't.
 * Only sets keys that aren't already in process.env, so explicit shell
 * vars still win.
 */
function loadDotEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseMode(argv: string[]): Mode {
  const has = (flag: string) => argv.includes(flag);
  if (has("--send") && has("--dry-run")) {
    throw new Error("Pass either --dry-run or --send, not both.");
  }
  if (has("--send")) return "send";
  if (has("--dry-run")) return "dry-run";
  throw new Error(
    "Missing mode. Pass --dry-run to preview, or --send to actually email.",
  );
}

function indexExisting(rows: ExistingNotificationRow[]): ExistingIndex {
  const alreadySentKeys = new Set<string>();
  const prior = new Map<string, ExistingNotificationRow[]>();
  for (const r of rows) {
    const key = notificationDedupeKey(r.reporter_email, r.actor_bucket_key);
    if (r.status === "sent") alreadySentKeys.add(key);
    let list = prior.get(key);
    if (!list) {
      list = [];
      prior.set(key, list);
    }
    list.push(r);
  }
  return { alreadySentKeys, prior };
}

function planSends(buckets: PublicActorBucket[], existing: ExistingIndex): {
  plan: PlannedSend[];
  alreadySent: Array<{ bucket: PublicActorBucket; reporter: PublicActorReporter }>;
} {
  const plan: PlannedSend[] = [];
  const alreadySent: Array<{ bucket: PublicActorBucket; reporter: PublicActorReporter }> = [];
  for (const bucket of buckets) {
    for (const reporter of bucket.reporters) {
      const key = notificationDedupeKey(reporter.reporter_email, bucket.actor_bucket_key);
      if (existing.alreadySentKeys.has(key)) {
        alreadySent.push({ bucket, reporter });
        continue;
      }
      const { subject, body } = buildPhotoRequestEmail({
        firstName: reporter.reporter_first_name,
        canonicalName: bucket.canonical_name,
        locationKey: bucket.location_key,
      });
      plan.push({ bucket, reporter, subject, body });
    }
  }
  return { plan, alreadySent };
}

function ensureSupabaseEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  }
}

function logHeader(mode: Mode) {
  const banner = mode === "dry-run"
    ? "DRY RUN — no rows written, no emails sent."
    : "REAL SEND — writing court_actor_public_notifications rows and sending emails.";
  console.log("=".repeat(banner.length));
  console.log(banner);
  console.log("=".repeat(banner.length));
}

function logPreview(args: {
  buckets: PublicActorBucket[];
  plan: PlannedSend[];
  alreadySent: Array<{ bucket: PublicActorBucket; reporter: PublicActorReporter }>;
  prior: Map<string, ExistingNotificationRow[]>;
}) {
  const { buckets, plan, alreadySent, prior } = args;

  console.log(`\nPublic court-actor buckets at threshold: ${buckets.length}`);
  for (const b of buckets) {
    console.log(
      `  • ${b.canonical_name} (${b.role_summary}) — ${b.location_key} — ${b.family_count} families — ${b.reporters.length} emailable reporter(s)`,
    );
  }

  console.log(`\nWill send: ${plan.length}`);
  for (const p of plan) {
    console.log(
      `  → ${p.reporter.reporter_email} re: ${p.bucket.canonical_name} in ${p.bucket.location_key}`,
    );
  }

  console.log(`\nAlready sent (skipping): ${alreadySent.length}`);
  for (const a of alreadySent) {
    const key = notificationDedupeKey(a.reporter.reporter_email, a.bucket.actor_bucket_key);
    const lastSent = prior.get(key)?.find(r => r.status === "sent")?.sent_at;
    console.log(
      `  · ${a.reporter.reporter_email} re: ${a.bucket.canonical_name} in ${a.bucket.location_key} (sent_at: ${lastSent ?? "?"})`,
    );
  }

  const failed: ExistingNotificationRow[] = [];
  for (const list of Array.from(prior.values())) {
    for (const r of list) {
      if (r.status === "failed") failed.push(r);
    }
  }
  if (failed.length > 0) {
    console.log(`\nPrior failures still on record: ${failed.length}`);
    for (const f of failed) {
      console.log(
        `  ✗ ${f.reporter_email} bucket=${f.actor_bucket_key} error=${f.error_message ?? "(none)"} at ${f.created_at}`,
      );
    }
  }
}

async function performSend(args: {
  plan: PlannedSend[];
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  replyToAddress: string;
}) {
  const { plan, smtpUser, smtpPass, fromAddress, replyToAddress } = args;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Confirm the dedupe table exists. If not, refuse to send — sending
  // without writing the audit row would defeat the one-email-per-reporter rule.
  const probe = await sb
    .from("court_actor_public_notifications")
    .select("id", { count: "exact", head: true });
  if (probe.error) {
    throw new Error(
      `Refusing to --send: court_actor_public_notifications is unreachable (${probe.error.message}). ` +
        "Apply migration 023_court_actor_public_notifications.sql first.",
    );
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const p of plan) {
    // Race-safety: re-check just before sending in case another run beat us.
    const { data: existing, error: existingErr } = await sb
      .from("court_actor_public_notifications")
      .select("id")
      .eq("status", "sent")
      .eq("actor_bucket_key", p.bucket.actor_bucket_key)
      .ilike("reporter_email", p.reporter.reporter_email)
      .limit(1);
    if (existingErr) {
      console.error(
        `[skip] could not verify dedupe for ${p.reporter.reporter_email}: ${existingErr.message}`,
      );
      skippedCount += 1;
      continue;
    }
    if (existing && existing.length > 0) {
      console.log(
        `[skip] ${p.reporter.reporter_email} re: ${p.bucket.canonical_name} — already sent in another run`,
      );
      skippedCount += 1;
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: `"Stand With Meg" <${fromAddress}>`,
        replyTo: replyToAddress,
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
      if (insertErr) {
        console.error(
          `[warn] sent email but failed to record notification for ${p.reporter.reporter_email}: ${insertErr.message}`,
        );
      } else {
        console.log(
          `[sent] ${p.reporter.reporter_email} re: ${p.bucket.canonical_name} — messageId=${info.messageId}`,
        );
      }
      sentCount += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[fail] ${p.reporter.reporter_email} re: ${p.bucket.canonical_name}: ${message}`,
      );
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
      failedCount += 1;
    }
  }

  console.log(`\nDone. sent=${sentCount} skipped=${skippedCount} failed=${failedCount}`);
}

function describeMissingMigration(text: string): boolean {
  return /court_actor_public_notifications/i.test(text);
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  logHeader(mode);

  ensureSupabaseEnv();

  const buckets = await getPublicActorsWithReporters();

  let existingRows: ExistingNotificationRow[] = [];
  let migrationMissing = false;
  try {
    existingRows = await loadExistingNotifications();
    // The lib silently returns [] when the table doesn't exist. Probe to
    // surface that in the dry-run preview so the operator isn't confused.
    if (existingRows.length === 0) {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const probe = await sb
        .from("court_actor_public_notifications")
        .select("id", { count: "exact", head: true });
      if (probe.error && describeMissingMigration(probe.error.message)) {
        migrationMissing = true;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (describeMissingMigration(msg)) {
      migrationMissing = true;
    } else {
      throw err;
    }
  }
  if (migrationMissing) {
    console.warn(
      "WARNING: court_actor_public_notifications table not found. Apply migration 023_court_actor_public_notifications.sql before --send.",
    );
  }
  const existingIndex = indexExisting(existingRows);

  const { plan, alreadySent } = planSends(buckets, existingIndex);

  logPreview({ buckets, plan, alreadySent, prior: existingIndex.prior });

  if (mode === "dry-run") {
    console.log("\nDry run finished. No state changed.");
    return;
  }

  // Real send: require SMTP env up front so we don't half-execute.
  const smtpUser = process.env.GOOGLE_SMTP_USER;
  const smtpPass = process.env.GOOGLE_SMTP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    throw new Error(
      "Cannot --send: GOOGLE_SMTP_USER and GOOGLE_SMTP_PASSWORD must be set in .env.local. " +
        "Use --dry-run to preview without sending.",
    );
  }
  const fromAddress = process.env.GOOGLE_SMTP_FROM || smtpUser;
  const replyToAddress = process.env.GOOGLE_SMTP_REPLY_TO || fromAddress;

  if (plan.length === 0) {
    console.log("\nNothing to send.");
    return;
  }

  await performSend({ plan, smtpUser, smtpPass, fromAddress, replyToAddress });
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", msg);
  process.exit(1);
});

/**
 * One-time backfill: mark every (reporter, public court actor) pair that
 * is ALREADY public as "already handled" in court_actor_public_notifications,
 * so the auto-email script never retroactively emails reporters whose
 * actor crossed the threshold before this workflow went live.
 *
 * Meg has already contacted these reporters manually. Going forward, only
 * NEW threshold crossings should trigger an automatic email.
 *
 * Each backfill row is inserted with:
 *   status         = 'sent'
 *   email_subject  = '[backfill <YYYY-MM-DD>] handled manually before auto-email rollout'
 *   email_body     = null
 *   sent_at        = now()
 *
 * The unique partial index ux_court_actor_public_notif_sent_once then
 * blocks any future --send from re-emailing these pairs.
 *
 * Usage:
 *   # Preview only — no rows inserted.
 *   npx tsx scripts/backfill-public-court-actor-notifications.ts --dry-run
 *
 *   # Real backfill — every currently-public bucket marked handled.
 *   npx tsx scripts/backfill-public-court-actor-notifications.ts --apply
 *
 *   # Real backfill, but ONLY for buckets that crossed threshold BEFORE
 *   # the cutoff (YYYY-MM-DD, UTC). Buckets that crossed on/after the
 *   # cutoff are skipped so the auto-emailer will email them.
 *   npx tsx scripts/backfill-public-court-actor-notifications.ts --apply --cutoff=2026-05-09
 *
 * Requires migration 023_court_actor_public_notifications.sql to be
 * applied first.
 *
 * Safe to re-run: existing rows for the same (lower(reporter_email),
 * actor_bucket_key, status='sent') are skipped — the unique index will
 * reject duplicates and we count them as "already backfilled".
 */

import { existsSync, readFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

loadDotEnvLocal();

import {
  getPublicActorsWithReporters,
  loadExistingNotifications,
  notificationDedupeKey,
} from "../lib/court-actor-public-notifications";

type Mode = "dry-run" | "apply";

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
  if (has("--apply") && has("--dry-run")) {
    throw new Error("Pass either --dry-run or --apply, not both.");
  }
  if (has("--apply")) return "apply";
  if (has("--dry-run")) return "dry-run";
  throw new Error(
    "Missing mode. Pass --dry-run to preview, or --apply to write rows.",
  );
}

/**
 * Optional --cutoff=YYYY-MM-DD. Returns the parsed UTC midnight
 * timestamp of the cutoff date, or null when the flag is absent.
 * Buckets whose crossed_threshold_at is < cutoffIso are backfilled
 * (treated as "old, manually handled"); buckets at or after cutoffIso
 * are left out so the auto-emailer can email them.
 */
function parseCutoff(argv: string[]): string | null {
  const arg = argv.find(a => a.startsWith("--cutoff="));
  if (!arg) return null;
  const value = arg.slice("--cutoff=".length).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`--cutoff must be YYYY-MM-DD; got "${value}".`);
  }
  const iso = `${value}T00:00:00.000Z`;
  if (Number.isNaN(Date.parse(iso))) {
    throw new Error(`--cutoff "${value}" is not a valid date.`);
  }
  return iso;
}

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const cutoffIso = parseCutoff(process.argv.slice(2));
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const banner =
    mode === "dry-run"
      ? "DRY RUN — no rows written."
      : "APPLY — writing backfill rows to court_actor_public_notifications.";
  console.log("=".repeat(banner.length));
  console.log(banner);
  console.log("=".repeat(banner.length));
  if (cutoffIso) {
    console.log(
      `Cutoff: only backfilling buckets that crossed threshold BEFORE ${cutoffIso}. ` +
        `Buckets that crossed on/after that date will be left for the auto-emailer.`,
    );
  }

  const buckets = await getPublicActorsWithReporters();
  const existing = await loadExistingNotifications();

  const alreadySentKeys = new Set<string>();
  for (const r of existing) {
    if (r.status === "sent") {
      alreadySentKeys.add(notificationDedupeKey(r.reporter_email, r.actor_bucket_key));
    }
  }

  type Pending = {
    actor_bucket_key: string;
    canonical_name: string;
    location_key: string;
    reporter_email: string;
    submission_id: string;
    court_actor_row_id: string;
  };

  const pending: Pending[] = [];
  const skippedNew: Array<{
    bucket: typeof buckets[number];
    reporter: typeof buckets[number]["reporters"][number];
  }> = [];
  let alreadyHandled = 0;
  for (const b of buckets) {
    const isPostCutoff =
      cutoffIso !== null &&
      (b.crossed_threshold_at === null || b.crossed_threshold_at >= cutoffIso);
    for (const r of b.reporters) {
      const key = notificationDedupeKey(r.reporter_email, b.actor_bucket_key);
      if (alreadySentKeys.has(key)) {
        alreadyHandled += 1;
        continue;
      }
      if (isPostCutoff) {
        skippedNew.push({ bucket: b, reporter: r });
        continue;
      }
      pending.push({
        actor_bucket_key: b.actor_bucket_key,
        canonical_name: b.canonical_name,
        location_key: b.location_key,
        reporter_email: r.reporter_email,
        submission_id: r.submission_id,
        court_actor_row_id: r.court_actor_row_id,
      });
    }
  }

  console.log(`\nPublic buckets: ${buckets.length}`);
  console.log(`Reporter pairs to backfill (pre-cutoff): ${pending.length}`);
  console.log(`Already marked as sent (skipping): ${alreadyHandled}`);
  if (cutoffIso) {
    console.log(
      `Reporter pairs left for auto-emailer (post-cutoff): ${skippedNew.length}`,
    );
  }

  for (const p of pending) {
    console.log(`  · ${p.reporter_email} re: ${p.canonical_name} in ${p.location_key}`);
  }
  if (skippedNew.length > 0) {
    console.log("\nLeaving for auto-emailer (will receive a real email on --send):");
    for (const s of skippedNew) {
      console.log(
        `  → ${s.reporter.reporter_email} re: ${s.bucket.canonical_name} in ${s.bucket.location_key} (crossed ${s.bucket.crossed_threshold_at})`,
      );
    }
  }

  if (mode === "dry-run") {
    console.log("\nDry run finished. No state changed.");
    return;
  }

  if (pending.length === 0) {
    console.log("\nNothing to backfill.");
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Refuse to write if the table is missing — protects against running
  // before migration 023.
  const probe = await sb
    .from("court_actor_public_notifications")
    .select("id", { count: "exact", head: true });
  if (probe.error) {
    throw new Error(
      `Refusing to --apply: court_actor_public_notifications is unreachable (${probe.error.message}). ` +
        "Apply migration 023_court_actor_public_notifications.sql first.",
    );
  }

  const stamp = todayStamp();
  const subject = `[backfill ${stamp}] handled manually before auto-email rollout`;
  const sentAt = new Date().toISOString();

  let inserted = 0;
  let conflicted = 0;
  let failed = 0;

  // Insert one at a time so a single conflict (unique index hit) doesn't
  // abort the whole batch. The volume here is small (≤ ~150).
  for (const p of pending) {
    const { error } = await sb.from("court_actor_public_notifications").insert({
      actor_bucket_key: p.actor_bucket_key,
      canonical_name: p.canonical_name,
      location_key: p.location_key,
      reporter_email: p.reporter_email,
      submission_id: p.submission_id,
      court_actor_row_id: p.court_actor_row_id,
      status: "sent",
      email_subject: subject,
      email_body: null,
      sent_at: sentAt,
    });
    if (!error) {
      inserted += 1;
      continue;
    }
    if (error.code === "23505") {
      conflicted += 1;
      continue;
    }
    failed += 1;
    console.error(
      `[fail] ${p.reporter_email} re: ${p.canonical_name}: ${error.message}`,
    );
  }

  console.log(
    `\nDone. inserted=${inserted} already_present=${conflicted} failed=${failed}`,
  );
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", msg);
  process.exit(1);
});

import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../lib/require-auth";
import { COURT_ACTOR_PUBLIC_THRESHOLD, actorBucketKeyWithLocation, courtActorLocationKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "../../../../lib/court-actors";
import { AliasResolver, type AliasDecisionRow } from "../../../../lib/court-actor-similarity";
import { isCountableSubmission } from "../../../../lib/submission-public-visibility";
import { normalizeCourtActorEditFields } from "../../../../lib/court-actor-admin-edit";
import { loadCourtActorManifestFromDisk, manifestReadyShareStateSlugSet, manifestStateSlugKey, manifestStateSlugSet, spotlightSlug } from "../../../../lib/court-actor-deploy";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

const SUSPECT_PHOTO_SIZE_KB = 800;
const CONFIRMED_SUSPECT_PHOTO_KEYS = new Set([
  "fl/leah_case",
  "la/michael_clement",
  "ks/naomi_catadeulla",
]);

type ManifestAssetInfo = {
  photo_url: string | null;
  share_url: string | null;
  photo_size_kb: number | null;
  photo_suspect: boolean;
  photo_suspect_reason: string | null;
};

function publicAssetOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SWM_PUBLIC_API_BASE;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return (configured || vercelUrl || "https://my.standwithmeg.com").replace(/\/+$/, "");
}

async function fetchPhotoSizeKb(photoUrl: string): Promise<number | null> {
  try {
    const res = await fetch(new URL(photoUrl, publicAssetOrigin()), {
      method: "HEAD",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const contentLength = res.headers.get("content-length");
    if (!contentLength) return null;
    const bytes = Number(contentLength);
    return Number.isFinite(bytes) && bytes > 0 ? Math.ceil(bytes / 1024) : null;
  } catch {
    return null;
  }
}

async function loadManifestAssetInfoByActor(manifest: { actors?: Array<{ slug?: string | null; state_abbr?: string | null; photo_url?: string | null; share_url?: string | null }> }): Promise<Map<string, ManifestAssetInfo>> {
  const info = new Map<string, ManifestAssetInfo>();
  await Promise.all((manifest.actors ?? []).map(async actor => {
    if (!actor.slug || !actor.state_abbr) return;
    const key = manifestStateSlugKey(actor.state_abbr, actor.slug);
    const photoSizeKb = actor.photo_url ? await fetchPhotoSizeKb(actor.photo_url) : null;
    const sizeSuspect = photoSizeKb !== null && photoSizeKb > SUSPECT_PHOTO_SIZE_KB;
    const confirmedSuspect = CONFIRMED_SUSPECT_PHOTO_KEYS.has(key);
    info.set(key, {
      photo_url: actor.photo_url ?? null,
      share_url: actor.share_url ?? null,
      photo_size_kb: photoSizeKb,
      photo_suspect: Boolean(actor.photo_url && (sizeSuspect || confirmedSuspect)),
      photo_suspect_reason: sizeSuspect
        ? "May not be a portrait — file size suggests a webpage screenshot"
        : confirmedSuspect
          ? "May not be a portrait — flagged by the photo audit"
          : null,
    });
  }));
  return info;
}

async function loadAliasResolver(sb: AdminClient): Promise<AliasResolver | null> {
  const { data, error } = await sb
    .from("court_actor_alias_decisions")
    .select("cluster_key, location_key, decision, canonical_name, canonical_role, name_keys")
    .eq("decision", "same_actor");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "42703"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return null;
    console.error("court_actor_alias_decisions select error:", error.message);
    return null;
  }
  return new AliasResolver((data ?? []) as AliasDecisionRow[]);
}

async function loadRowReviewMap(sb: AdminClient): Promise<Map<string, CourtActorRowReviewDecision>> {
  const { data, error } = await sb
    .from("court_actor_row_review")
    .select("row_id, decision");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return new Map();
    console.error("court_actor_row_review select error:", error.message);
    return new Map();
  }
  const map = new Map<string, CourtActorRowReviewDecision>();
  for (const r of (data ?? []) as Array<{ row_id: string; decision: CourtActorRowReviewDecision }>) {
    map.set(r.row_id, r.decision);
  }
  return map;
}

type CommentMergeRecord = {
  primary_row_id: string;
  merged_row_ids: string[];
  merged_comment: string;
};

async function loadCommentMerges(sb: AdminClient): Promise<{
  byPrimary: Map<string, CommentMergeRecord>;
  byMerged: Map<string, string>; // merged row_id → primary row_id
}> {
  const empty = { byPrimary: new Map(), byMerged: new Map() };
  const { data, error } = await sb
    .from("court_actor_comment_merges")
    .select("primary_row_id, merged_row_ids, merged_comment");
  if (error) {
    const missing = error.code === "42P01"
      || error.code === "PGRST205"
      || /Could not find the table/i.test(error.message ?? "");
    if (missing) return empty;
    console.error("court_actor_comment_merges select error:", error.message);
    return empty;
  }
  const byPrimary = new Map<string, CommentMergeRecord>();
  const byMerged = new Map<string, string>();
  for (const r of (data ?? []) as CommentMergeRecord[]) {
    byPrimary.set(r.primary_row_id, r);
    for (const m of r.merged_row_ids ?? []) byMerged.set(m, r.primary_row_id);
  }
  return { byPrimary, byMerged };
}

/**
 * Admin-only: returns EVERY named court actor (no threshold), plus aggregate
 * counts per unique (name, location) bucket. Includes reporter info
 * (submission_id + email) so the admin can trace who named whom.
 */

type Row = {
  id: string;
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  location_key: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
  submission_id: string;
  nudge_sent_at: string | null;
  nudge_sent_by: string | null;
  nudge_sent_to: string | null;
  nudge_last_subject: string | null;
  survey_submissions:
    | { email: string | null; first_name: string | null; last_name: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }
    | { email: string | null; first_name: string | null; last_name: string | null; state_of_occurrence: string | null; outside_us_country: string | null; permission_to_share: string | null; approved: boolean | null }[]
    | null;
};

function joinedSubmission(row: Row) {
  return Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0] ?? null
    : row.survey_submissions;
}

function actorLocation(row: Row): string | null {
  // Prefer direct location_key if available (post-migration)
  if (row.location_key?.trim()) {
    return row.location_key.trim();
  }
  // Fallback: compute from submission data for compatibility
  const submission = joinedSubmission(row);
  return courtActorLocationKey(submission?.state_of_occurrence || null, submission?.outside_us_country || null);
}

function familyKey(row: Row, reviewMap: Map<string, CourtActorRowReviewDecision>): string | null {
  const location = actorLocation(row) ?? null;
  return resolveFamilyKey({
    row_id: row.id,
    reporter_email: joinedSubmission(row)?.email ?? null,
    submission_id: row.submission_id,
    location_key: location,
    review_decision: reviewMap.get(row.id) ?? null,
  });
}

function mostFrequent<T>(m: Map<T, number>): T | null {
  let best: T | null = null;
  let max = 0;
  for (const entry of Array.from(m.entries())) {
    const [value, count] = entry;
    if (count > max) {
      best = value;
      max = count;
    }
  }
  return best;
}

function roleSummary(roles: Map<string, number>) {
  // Show every role this actor has been named under, joined by " / ".
  // Mirrors app/api/actors/all/route.ts.
  const sorted = Array.from(roles.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length <= 3) return sorted.map(s => s[0]).join(" / ");
  const head = sorted.slice(0, 2).map(s => s[0]).join(" / ");
  const remaining = sorted.length - 2;
  return `${head} + ${remaining} more role${remaining === 1 ? "" : "s"}`;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const adminSb = createAdminSupabaseClient();

    // All actor rows + joined submission info
    let from = 0;
    const pageSize = 1000;
    const rows: Row[] = [];
    const baseSelect = "id, role, name, court_or_county, state_code, notes, source, created_at, submission_id, survey_submissions(email, first_name, last_name, state_of_occurrence, outside_us_country, permission_to_share, approved)";
    const nudgeSelect = "id, role, name, court_or_county, state_code, notes, source, created_at, submission_id, nudge_sent_at, nudge_sent_by, nudge_sent_to, nudge_last_subject, survey_submissions(email, first_name, last_name, state_of_occurrence, outside_us_country, permission_to_share, approved)";
    const locationSelect = "id, role, name, court_or_county, state_code, location_key, notes, source, created_at, submission_id, nudge_sent_at, nudge_sent_by, nudge_sent_to, nudge_last_subject, survey_submissions(email, first_name, last_name, state_of_occurrence, outside_us_country, permission_to_share, approved)";

    let includeNudgeColumns = true;
    let includeLocationKey = true;

    while (true) {
      let selectString = baseSelect;
      if (includeLocationKey && includeNudgeColumns) {
        selectString = locationSelect;
      } else if (includeNudgeColumns) {
        selectString = nudgeSelect;
      }

      const { data, error } = await adminSb
        .from("court_actors")
        .select(selectString)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        if (includeLocationKey && error.code === "42703") {
          // location_key column doesn't exist yet
          includeLocationKey = false;
          rows.length = 0;
          from = 0;
          continue;
        } else if (includeNudgeColumns && error.code === "42703") {
          // nudge columns don't exist yet
          includeNudgeColumns = false;
          rows.length = 0;
          from = 0;
          continue;
        }
        console.error("admin court-actors error:", error);
        return Response.json({ actors: [], aggregates: [] });
      }
      if (!data || data.length === 0) break;

      // Add null location_key to rows that don't have it
      const processedData = (data as unknown as Row[]).map(row => ({
        ...row,
        location_key: includeLocationKey ? row.location_key : null
      }));

      rows.push(...processedData);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Build aggregates: normalized (name, location) -> count distinct families.
    // This merges casing, punctuation, common titles, middle initials, small
    // repeated-letter misspellings, and different role labels for the same
    // person in the same location. Approved 'same_actor' alias decisions
    // additionally roll close-spelling variants into the canonical name.
    const aliasResolver = await loadAliasResolver(adminSb);
    const rowReviewMap = await loadRowReviewMap(adminSb);
    const commentMerges = await loadCommentMerges(adminSb);
    const manifest = await loadCourtActorManifestFromDisk().catch(() => ({ actors: [] }));
    const manifestSlugs = manifestStateSlugSet(manifest);
    const readyShareSlugs = manifestReadyShareStateSlugSet(manifest);
    const manifestAssetsByActor = await loadManifestAssetInfoByActor(manifest);

    type AggBucket = {
      name: string;
      state_code: string | null;
      location_key: string | null;
      families: Set<string>;
      roles: Map<string, number>;
      names: Map<string, number>;
      courts: Map<string, number>;
    };

    const agg = new Map<string, AggBucket>();
    for (const r of rows) {
      if ((r.source ?? "form_direct") !== "form_direct") continue;
      if (!r.role || !r.name) continue;
      if (!isCountableSubmission(joinedSubmission(r))) continue;
      const fk = familyKey(r, rowReviewMap);
      if (fk === null) continue;
      const location = actorLocation(r);
      const aliasHit = aliasResolver?.resolve(r.name, location) ?? null;
      const effectiveName = aliasHit?.canonical_name ?? r.name;
      const key = actorBucketKeyWithLocation(effectiveName, r.role, location);
      if (!key.split("|")[0]) continue;
      if (!agg.has(key)) {
        agg.set(key, {
          name: effectiveName,
          state_code: r.state_code,
          location_key: location,
          families: new Set(),
          roles: new Map(),
          names: new Map(),
          courts: new Map(),
        });
      }
      const b = agg.get(key)!;
      b.families.add(fk);
      b.roles.set(r.role, (b.roles.get(r.role) ?? 0) + 1);
      const casingName = aliasHit?.canonical_name ?? r.name;
      b.names.set(casingName, (b.names.get(casingName) ?? 0) + 1);
      if (r.court_or_county) b.courts.set(r.court_or_county, (b.courts.get(r.court_or_county) ?? 0) + 1);
    }

    const aggregates = Array.from(agg.entries())
      .map(([actor_bucket_key, b]) => {
        const name = mostFrequent(b.names) ?? b.name;
        const stateAbbr = /^[A-Z]{2}$/.test(b.location_key ?? "") ? b.location_key : b.state_code;
        const slug = spotlightSlug(name);
        const deployKey = stateAbbr && slug ? manifestStateSlugKey(stateAbbr, slug) : "";
        const manifestAssets = deployKey ? manifestAssetsByActor.get(deployKey) : null;
        const hasManifestEntry = Boolean(deployKey && manifestSlugs.has(deployKey));
        const hasReadySharePage = Boolean(deployKey && readyShareSlugs.has(deployKey));
        return {
          role: roleSummary(b.roles),
          name,
          state_code: b.state_code,
          location_key: b.location_key,
          court_or_county: Array.from(b.courts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
          count: b.families.size,
          actor_bucket_key,
          deploy_slug: slug || null,
          deploy_state_abbr: stateAbbr ?? null,
          deployable: Boolean(stateAbbr && /^[A-Z]{2}$/.test(stateAbbr) && slug),
          deployed: hasReadySharePage,
          deployment_pending: hasManifestEntry && !hasReadySharePage,
          share_url: manifestAssets?.share_url ?? null,
          photo_url: manifestAssets?.photo_url ?? null,
          photo_size_kb: manifestAssets?.photo_size_kb ?? null,
          photo_suspect: manifestAssets?.photo_suspect ?? false,
          photo_suspect_reason: manifestAssets?.photo_suspect_reason ?? null,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Flat list with reporter info
    const actors = rows.map(r => {
      const submission = joinedSubmission(r);
      const review = rowReviewMap.get(r.id) ?? null;
      const fk = familyKey(r, rowReviewMap);
      const mergePrimary = commentMerges.byPrimary.get(r.id) ?? null;
      const mergeParentId = commentMerges.byMerged.get(r.id) ?? null;
      const isPublicEligible = isCountableSubmission(submission);
      return {
        id: r.id,
        role: r.role,
        name: r.name,
        court_or_county: r.court_or_county,
        state_code: r.state_code,
        location_key: actorLocation(r),
        notes: r.notes,
        source: r.source ?? "form_direct",
        created_at: r.created_at,
        submission_id: r.submission_id,
        nudge_sent_at: r.nudge_sent_at ?? null,
        nudge_sent_by: r.nudge_sent_by ?? null,
        nudge_sent_to: r.nudge_sent_to ?? null,
        nudge_last_subject: r.nudge_last_subject ?? null,
        reporter_email: submission?.email ?? null,
        reporter_name: submission
          ? [submission.first_name, submission.last_name].filter(Boolean).join(" ") || null
          : null,
        reporter_permission: submission?.permission_to_share ?? null,
        reporter_approved: submission?.approved ?? null,
        review_decision: review,
        counts_publicly: isPublicEligible && fk !== null && (r.source ?? "form_direct") === "form_direct",
        // Comment-merge state for the admin UI:
        //   merge_primary_for: row IDs this row is the merged-display primary for
        //   merged_into:        primary row id this row's testimony was merged into
        //   merged_comment:     when this row IS the primary, the public-facing combined text
        merge_primary_for: mergePrimary?.merged_row_ids ?? null,
        merged_into: mergeParentId,
        merged_comment: mergePrimary?.merged_comment ?? null,
      };
    });

    return Response.json({ actors, aggregates, threshold: COURT_ACTOR_PUBLIC_THRESHOLD });
  } catch (err) {
    console.error("GET /api/admin/court-actors error:", err);
    return Response.json({ error: "Failed." }, { status: 500 });
  }
}

/**
 * PATCH — admin actions on a single court_actors row.
 *
 * Body:
 *   { id: uuid, action: "promote" }   // change source → form_direct
 *   { id: uuid, action: "demote"  }   // revert to extracted_regex (in case of misclick)
 *   { id: uuid, action: "delete"  }   // remove entirely (e.g. confirmed bogus)
 *   { id: uuid, action: "edit", fields: { name?, role?, court_or_county? } }
 *
 * "promote" is the big one: once form_direct, the row counts toward the
 * public threshold. Meant to be used after the admin has
 * personally verified a name is real and worth surfacing.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { id, action, fields } = await request.json();
    if (!id || typeof id !== "string") {
      return Response.json({ error: "id is required." }, { status: 400 });
    }
    if (!["promote", "demote", "delete", "edit"].includes(action)) {
      return Response.json({ error: "action must be promote, demote, delete, or edit." }, { status: 400 });
    }

    const adminSb = createAdminSupabaseClient();

    if (action === "edit") {
      const normalized = normalizeCourtActorEditFields(fields);
      if ("error" in normalized) {
        return Response.json({ error: normalized.error }, { status: 400 });
      }
      const { data, error } = await adminSb
        .from("court_actors")
        .update(normalized.update)
        .eq("id", id)
        .select("id, name, role, court_or_county")
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, actor: data });
    }

    if (action === "delete") {
      const { error } = await adminSb.from("court_actors").delete().eq("id", id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, action: "deleted" });
    }

    const newSource = action === "promote" ? "form_direct" : "extracted_regex";
    const { error } = await adminSb.from("court_actors").update({ source: newSource }).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, source: newSource });
  } catch (err) {
    console.error("PATCH /api/admin/court-actors error:", err);
    return Response.json({ error: "Failed." }, { status: 500 });
  }
}

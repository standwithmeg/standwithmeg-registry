import { createServerSupabaseClient } from "../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../lib/require-auth";
import { actorBucketKey } from "../../../../lib/court-actors";

/**
 * Admin-only: returns EVERY named court actor (no threshold), plus aggregate
 * counts per unique (role, name, state) bucket. Includes reporter info
 * (submission_id + email) so the admin can trace who named whom.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const adminSb = createAdminSupabaseClient();

    // All actor rows + joined submission info
    type Row = {
      id: string;
      role: string;
      name: string;
      court_or_county: string | null;
      state_code: string | null;
      notes: string | null;
      source: string | null;
      created_at: string;
      submission_id: string;
      survey_submissions:
        | { email: string | null; first_name: string | null; last_name: string | null; state_of_occurrence: string | null }
        | { email: string | null; first_name: string | null; last_name: string | null; state_of_occurrence: string | null }[]
        | null;
    };

    function joinedSubmission(row: Row) {
      return Array.isArray(row.survey_submissions)
        ? row.survey_submissions[0] ?? null
        : row.survey_submissions;
    }

    function familyKey(row: Row): string {
      const state = actorState(row) ?? "";
      const email = joinedSubmission(row)?.email?.trim().toLowerCase();
      return email ? `${email}|${state}` : `submission:${row.submission_id}`;
    }

    function actorState(row: Row): string | null {
      const direct = row.state_code?.trim().toUpperCase();
      if (direct) return direct;
      const joined = joinedSubmission(row)?.state_of_occurrence?.trim().toUpperCase();
      return joined || null;
    }

    let from = 0;
    const pageSize = 1000;
    const rows: Row[] = [];
    while (true) {
      const { data, error } = await adminSb
        .from("court_actors")
        .select("id, role, name, court_or_county, state_code, notes, source, created_at, submission_id, survey_submissions(email, first_name, last_name, state_of_occurrence)")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        console.error("admin court-actors error:", error);
        return Response.json({ actors: [], aggregates: [] });
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as unknown as Row[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Build aggregates: normalized (name, role, state) -> count distinct families.
    // This merges casing, punctuation, common titles, and middle initials,
    // but intentionally avoids risky fuzzy misspelling merges.
    type AggBucket = {
      role: string;
      name: string;
      state_code: string | null;
      families: Set<string>;
      courts: Map<string, number>;
    };
    const agg = new Map<string, AggBucket>();
    for (const r of rows) {
      if (!r.role || !r.name) continue;
      const state = actorState(r);
      const key = actorBucketKey(r.name, r.role, state);
      if (!key.split("|")[0]) continue;
      if (!agg.has(key)) {
        agg.set(key, {
          role: r.role, name: r.name, state_code: state,
          families: new Set(), courts: new Map(),
        });
      }
      const b = agg.get(key)!;
      b.families.add(familyKey(r));
      if (r.court_or_county) b.courts.set(r.court_or_county, (b.courts.get(r.court_or_county) ?? 0) + 1);
    }

    const aggregates = [...agg.values()]
      .map(b => ({
        role: b.role,
        name: b.name,
        state_code: b.state_code,
        court_or_county: [...b.courts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        count: b.families.size,
      }))
      .sort((a, b) => b.count - a.count);

    // Flat list with reporter info
    const actors = rows.map(r => {
      const submission = joinedSubmission(r);
      return {
        id: r.id,
        role: r.role,
        name: r.name,
        court_or_county: r.court_or_county,
        state_code: actorState(r),
        notes: r.notes,
        source: r.source ?? "form_direct",
        created_at: r.created_at,
        submission_id: r.submission_id,
        reporter_email: submission?.email ?? null,
        reporter_name: submission
          ? [submission.first_name, submission.last_name].filter(Boolean).join(" ") || null
          : null,
      };
    });

    return Response.json({ actors, aggregates });
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
 *
 * "promote" is the big one: once form_direct, the row counts toward the
 * public 5-family threshold. Meant to be used after the admin has
 * personally verified a name is real and worth surfacing.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { id, action } = await request.json();
    if (!id || typeof id !== "string") {
      return Response.json({ error: "id is required." }, { status: 400 });
    }
    if (!["promote", "demote", "delete"].includes(action)) {
      return Response.json({ error: "action must be promote, demote, or delete." }, { status: 400 });
    }

    const adminSb = createAdminSupabaseClient();

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

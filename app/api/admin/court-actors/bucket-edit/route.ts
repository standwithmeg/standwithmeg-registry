import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { normalizeCourtActorEditFields } from "../../../../../lib/court-actor-admin-edit";
import { queueStateRegeneration } from "../../../../../lib/state-regeneration";
import { refreshPublicActorCache } from "../../../survey/court-actors/route";
import { after } from "next/server";

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { ids, fields } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: "ids must be a non-empty array." }, { status: 400 });
    }
    if (ids.length > 200) {
      return Response.json({ error: "ids cannot contain more than 200 rows." }, { status: 400 });
    }
    const normalizedIds = ids.map(id => typeof id === "string" ? id.trim() : "");
    if (normalizedIds.some(id => !id)) {
      return Response.json({ error: "Every id must be a non-empty string." }, { status: 400 });
    }

    const normalized = normalizeCourtActorEditFields(fields);
    if ("error" in normalized) {
      return Response.json({ error: normalized.error }, { status: 400 });
    }

    const adminSb = createAdminSupabaseClient();
    const { data, error } = await adminSb
      .from("court_actors")
      .update(normalized.update)
      .in("id", normalizedIds)
      .select("id, name, role, court_or_county, state_code, location_key");

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // An admin edit here (spelling fix, role/county correction) changes what the
    // public slide should show. Regenerate the affected state(s) so the share
    // pages + PDF pick up the change instead of waiting for the hourly cron.
    // Per-location debounce in queueStateRegeneration collapses duplicates.
    const regenLocations = new Set<string>();
    for (const row of data ?? []) {
      const loc = String(row.state_code || row.location_key || "").trim();
      if (loc) regenLocations.add(loc);
    }
    for (const location of regenLocations) {
      queueStateRegeneration(location, "admin bucket edit");
    }
    after(() => refreshPublicActorCache(adminSb).catch(err => {
      console.error("public actor cache refresh failed after admin bucket edit:", err);
    }));

    return Response.json({ success: true, actors: data ?? [] });
  } catch (err) {
    console.error("PATCH /api/admin/court-actors/bucket-edit error:", err);
    return Response.json({ error: "Failed." }, { status: 500 });
  }
}

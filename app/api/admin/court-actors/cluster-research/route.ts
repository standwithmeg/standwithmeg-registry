import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";

/**
 * Admin-only: durable research notes attached to a Possible Matches
 * cluster *before* an alias decision is made. These do not affect
 * public family counting. They give the admin a place to record web
 * searches, license lookups, judicial-directory confirmations, and
 * follow-ups while a cluster is still pending.
 *
 * Routes:
 *   GET    ?cluster_key=...   list notes for one cluster
 *   GET                       list all notes (small; chronological)
 *   POST   { cluster_key, location_key?, name_keys?, note, source_url? }
 *   DELETE { id }
 */

type ResearchRow = {
  id: string;
  cluster_key: string;
  location_key: string | null;
  name_keys: string[];
  note: string;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

async function requireAdminEmail() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email) ? user.email : null;
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return Boolean(error.message && /Could not find the table/i.test(error.message));
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clusterKey = searchParams.get("cluster_key")?.trim();

    const sb = createAdminSupabaseClient();
    let query = sb
      .from("court_actor_cluster_research")
      .select("id, cluster_key, location_key, name_keys, note, source_url, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (clusterKey) query = query.eq("cluster_key", clusterKey);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return Response.json({ notes: [], available: false });
      }
      console.error("cluster-research GET error:", error);
      return Response.json({ notes: [], error: error.message }, { status: 500 });
    }
    return Response.json({ notes: (data ?? []) as ResearchRow[], available: true });
  } catch (err) {
    console.error("GET /api/admin/court-actors/cluster-research error:", err);
    return Response.json({ error: "Failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminEmail = await requireAdminEmail();
    if (!adminEmail) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const clusterKey = typeof body?.cluster_key === "string" ? body.cluster_key.trim() : "";
    const locationKey = typeof body?.location_key === "string" && body.location_key.trim()
      ? body.location_key.trim()
      : null;
    const nameKeys = Array.isArray(body?.name_keys)
      ? Array.from(new Set((body.name_keys as unknown[]).map(k => String(k)).filter(Boolean)))
      : [];
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const sourceUrl = typeof body?.source_url === "string" && body.source_url.trim()
      ? body.source_url.trim()
      : null;

    if (!clusterKey) {
      return Response.json({ error: "cluster_key is required." }, { status: 400 });
    }
    if (!note) {
      return Response.json({ error: "note text is required." }, { status: 400 });
    }
    if (note.length > 5000) {
      return Response.json({ error: "note must be 5000 characters or fewer." }, { status: 400 });
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      return Response.json({ error: "source_url must start with http:// or https://" }, { status: 400 });
    }

    const sb = createAdminSupabaseClient();
    const { data, error } = await sb
      .from("court_actor_cluster_research")
      .insert({
        cluster_key: clusterKey,
        location_key: locationKey,
        name_keys: nameKeys,
        note,
        source_url: sourceUrl,
        created_by: adminEmail,
      })
      .select("id, cluster_key, location_key, name_keys, note, source_url, created_by, created_at, updated_at")
      .single();

    if (error) {
      const message = isMissingTable(error)
        ? "The court_actor_cluster_research Supabase migration (021) needs to be run before research notes can save."
        : error.message;
      console.error("cluster-research POST error:", error);
      return Response.json({ error: message }, { status: 500 });
    }
    return Response.json({ note: data });
  } catch (err) {
    console.error("POST /api/admin/court-actors/cluster-research error:", err);
    return Response.json({ error: "Save failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await requireAdminEmail())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });

    const sb = createAdminSupabaseClient();
    const { error } = await sb
      .from("court_actor_cluster_research")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("cluster-research DELETE error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/court-actors/cluster-research error:", err);
    return Response.json({ error: "Delete failed." }, { status: 500 });
  }
}

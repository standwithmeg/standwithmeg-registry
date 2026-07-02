import type { SupabaseClient } from "@supabase/supabase-js";

export async function expirePublicActorCacheRows(sb: SupabaseClient): Promise<void> {
  try {
    await sb
      .from("public_actor_cache")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .neq("cache_key", "");
  } catch (err) {
    console.error("expirePublicActorCache error:", err);
  }
}

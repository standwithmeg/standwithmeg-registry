import { createServerSupabaseClient } from "../supabase";
import { isFounderEmail } from "../require-auth";

export async function requireFounderApi(): Promise<{ email: string; id: string }> {
  const sb = await createServerSupabaseClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user?.email || !isFounderEmail(data.user.email)) {
    throw new Error("Founder access required.");
  }
  return { email: data.user.email, id: data.user.id };
}

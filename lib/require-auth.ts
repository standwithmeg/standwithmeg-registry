import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./supabase";

export async function requireAuth(loginPath: string, nextPath: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`${loginPath}?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

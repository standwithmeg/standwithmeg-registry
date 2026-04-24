import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./supabase";

export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export async function requireAuth(loginPath: string, nextPath: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`${loginPath}?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

export async function requireAdmin(loginPath: string, nextPath: string) {
  const user = await requireAuth(loginPath, nextPath);
  if (!user.email || !isAdminEmail(user.email)) {
    redirect(`${loginPath}?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

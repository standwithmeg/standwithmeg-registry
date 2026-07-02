import { createServerSupabaseClient } from "../../../../lib/supabase";
import { cookies } from "next/headers";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  const authCookies = cookieStore.getAll().filter((c) =>
    c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  authCookies.forEach((c) => {
    headers.append(
      "Set-Cookie",
      `${c.name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    );
  });

  return new Response(JSON.stringify({ signed_out: true }), { headers });
}
import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { isFounderEmail } from "../../../../../lib/require-auth";
import { adminListMessages, adminPostMessage } from "../../../../../lib/admin-circles-chat";

export const dynamic = "force-dynamic";

async function requireFounderEmail(_req: Request): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email || !isFounderEmail(user.email)) return null;
  return user.email.toLowerCase();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ actorKey: string }> },
) {
  const founderEmail = await requireFounderEmail(request);
  if (!founderEmail) {
    return Response.json({ error: "Founder access required." }, { status: 403 });
  }

  try {
    const { actorKey } = await context.params;
    const after = new URL(request.url).searchParams.get("after");
    const messages = await adminListMessages(founderEmail, actorKey, after);
    return Response.json({ messages });
  } catch (err) {
    console.error("GET /api/admin/circles-chat/[actorKey] error:", err);
    if (err instanceof Error && "status" in err && typeof err.status === "number") {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Could not load chat messages." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ actorKey: string }> },
) {
  const founderEmail = await requireFounderEmail(request);
  if (!founderEmail) {
    return Response.json({ error: "Founder access required." }, { status: 403 });
  }

  try {
    const { actorKey } = await context.params;
    const body = await request.json().catch(() => ({}));
    const message = await adminPostMessage(founderEmail, actorKey, String(body?.body ?? ""));
    return Response.json({ message });
  } catch (err) {
    console.error("POST /api/admin/circles-chat/[actorKey] error:", err);
    if (err instanceof Error && "status" in err && typeof err.status === "number") {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Could not send message." }, { status: 500 });
  }
}

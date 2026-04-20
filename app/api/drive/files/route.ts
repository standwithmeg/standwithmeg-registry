import { createServerSupabaseClient } from "../../../../lib/supabase";
import { getValidAccessToken, listDriveFiles } from "../../../../lib/google-drive";

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(user.id, supabase);
    } catch {
      return Response.json({ error: "Google Drive not connected." }, { status: 400 });
    }

    const files = await listDriveFiles(accessToken, 50, search);
    return Response.json({ files });
  } catch (err) {
    console.error("GET /api/drive/files error:", err);
    return Response.json({ error: "Failed to list Drive files." }, { status: 500 });
  }
}

import { createServerSupabaseClient } from "../../../../../lib/supabase";

// POST — save an already-extracted document (e.g. a session upload) permanently to the vault
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: vault } = await supabase
      .from("vaults")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!vault) {
      return Response.json({ error: "Vault not found." }, { status: 404 });
    }

    const body = await request.json();
    const { name, type, sizeBytes, extractedText } = body as {
      name: string;
      type: string;
      sizeBytes: number;
      extractedText: string;
    };

    if (!name?.trim()) {
      return Response.json({ error: "name is required." }, { status: 400 });
    }

    const { data: doc, error: insertError } = await supabase
      .from("vault_documents")
      .insert({
        vault_id: id,
        user_id: user.id,
        name: name.trim(),
        type: type ?? "Document",
        tag: "untagged",
        storage_path: null,
        size_bytes: typeof sizeBytes === "number" && !isNaN(sizeBytes) ? sizeBytes : 0,
        extracted_text: extractedText ?? "",
        source: "upload",
        drive_file_id: null,
        drive_mime_type: null,
      })
      .select("id, name, type, tag, size_bytes, source, drive_file_id, extracted_text, uploaded_at")
      .single();

    if (insertError) {
      console.error("POST /api/vaults/[id]/documents error:", insertError.message);
      return Response.json({ error: "Failed to save document." }, { status: 500 });
    }

    return Response.json({ document: doc });
  } catch (err) {
    console.error("POST /api/vaults/[id]/documents error:", err);
    return Response.json({ error: "Failed to save document." }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Verify vault ownership first
    const { data: vault } = await supabase
      .from("vaults")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!vault) {
      return Response.json({ error: "Vault not found." }, { status: 404 });
    }

    const { data: documents, error } = await supabase
      .from("vault_documents")
      .select("id, name, type, tag, size_bytes, source, drive_file_id, extracted_text, uploaded_at")
      .eq("vault_id", id)
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("GET /api/vaults/[id]/documents error:", error.message);
      return Response.json({ error: "Failed to load documents." }, { status: 500 });
    }

    return Response.json({ documents: documents ?? [] });
  } catch (err) {
    console.error("GET /api/vaults/[id]/documents error:", err);
    return Response.json({ error: "Failed to load documents." }, { status: 500 });
  }
}

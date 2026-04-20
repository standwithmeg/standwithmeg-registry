import { createServerSupabaseClient } from "../../../../lib/supabase";
import {
  getValidAccessToken,
  downloadDriveFile,
  mimeToDocType,
  type DriveFile,
} from "../../../../lib/google-drive";

// pdf-parse runs a test file read at the package root during require(),
// which fails at Next.js build time. Import the internal lib directly to skip it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const MAX_TEXT_BYTES = 400_000; // ~400KB extracted text cap per document

async function extractText(
  buffer: ArrayBuffer,
  exportedMime: string,
  originalMime: string
): Promise<string> {
  try {
    if (originalMime === "application/vnd.google-apps.document" || exportedMime === "text/plain") {
      // Already plain text from the export
      const text = new TextDecoder().decode(buffer);
      return text.substring(0, MAX_TEXT_BYTES);
    }

    if (originalMime === "application/pdf") {
      const result = await pdfParse(Buffer.from(buffer));
      return (result.text ?? "").substring(0, MAX_TEXT_BYTES);
    }

    // Word docs and other types — skip text extraction for now
    return "";
  } catch (err) {
    console.warn("Text extraction failed:", err);
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const { vaultId, files } = body as { vaultId: string; files: DriveFile[] };

    if (!vaultId || !Array.isArray(files) || files.length === 0) {
      return Response.json({ error: "vaultId and files are required." }, { status: 400 });
    }

    // Verify the vault belongs to this user
    const { data: vault, error: vaultError } = await supabase
      .from("vaults")
      .select("id")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .single();

    if (vaultError || !vault) {
      return Response.json({ error: "Vault not found." }, { status: 404 });
    }

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(user.id, supabase);
    } catch {
      return Response.json({ error: "Google Drive not connected." }, { status: 400 });
    }

    const imported: string[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const file of files.slice(0, 20)) { // hard cap: 20 files per import
      try {
        const { buffer, exportedMime } = await downloadDriveFile(
          accessToken,
          file.id,
          file.mimeType
        );

        const extractedText = await extractText(buffer, exportedMime, file.mimeType);
        const sizeBytes = file.size ? parseInt(file.size, 10) : buffer.byteLength;

        const { data: doc, error: insertError } = await supabase
          .from("vault_documents")
          .insert({
            vault_id: vaultId,
            user_id: user.id,
            name: file.name,
            type: mimeToDocType(file.mimeType),
            tag: "untagged",
            storage_path: null,
            size_bytes: isNaN(sizeBytes) ? 0 : sizeBytes,
            extracted_text: extractedText,
            source: "google_drive",
            drive_file_id: file.id,
            drive_mime_type: file.mimeType,
          })
          .select("id, name")
          .single();

        if (insertError) {
          console.error("Insert error for", file.name, insertError.message);
          failed.push({ name: file.name, reason: insertError.message });
        } else {
          imported.push(doc.id);
        }
      } catch (err) {
        console.error("Import error for", file.name, err);
        failed.push({ name: file.name, reason: String(err) });
      }
    }

    return Response.json({ imported: imported.length, failed });
  } catch (err) {
    console.error("POST /api/drive/import error:", err);
    return Response.json({ error: "Import failed." }, { status: 500 });
  }
}

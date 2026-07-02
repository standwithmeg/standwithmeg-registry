import { createServerSupabaseClient } from "../../../../lib/supabase";

// pdf-parse runs a test file read at the package root during require(),
// which fails at Next.js build time. Import the internal lib directly to skip it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const MAX_TEXT_BYTES = 400_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function mimeToDocType(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "Text";
  if (mime.includes("word") || mime.includes("officedocument")) return "Word Doc";
  return "Document";
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "File too large. Maximum 10 MB." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    let extractedText = "";

    if (file.type === "application/pdf") {
      try {
        const result = await pdfParse(Buffer.from(buffer));
        extractedText = (result.text ?? "").substring(0, MAX_TEXT_BYTES);
      } catch {
        extractedText = "";
      }
    } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      extractedText = new TextDecoder().decode(buffer).substring(0, MAX_TEXT_BYTES);
    }
    // Word docs: text extraction not yet supported — extractedText remains ""

    return Response.json({
      name: file.name,
      type: mimeToDocType(file.type),
      sizeBytes: file.size,
      extractedText,
      hasText: extractedText.length > 0,
    });
  } catch (err) {
    console.error("POST /api/documents/extract error:", err);
    return Response.json({ error: "Text extraction failed." }, { status: 500 });
  }
}

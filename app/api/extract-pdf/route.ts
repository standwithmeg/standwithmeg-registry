export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "Please upload a PDF file." }, { status: 400 });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Import pdf-parse core directly to avoid test-file auto-run in index.js
    // @ts-expect-error - pdf-parse has no types for deep import
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdfParse(buffer);

    if (!data.text || data.text.trim().length < 20) {
      return Response.json({
        error: "Could not extract readable text from this PDF. It may be a scanned image. Please paste the document text manually instead.",
        pages: data.numpages,
      }, { status: 422 });
    }

    return Response.json({
      text: data.text,
      pages: data.numpages,
    });

  } catch (error) {
    console.error("PDF extraction error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `PDF extraction failed: ${message}` }, { status: 500 });
  }
}

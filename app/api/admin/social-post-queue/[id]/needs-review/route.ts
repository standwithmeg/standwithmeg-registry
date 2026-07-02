import { NextRequest } from "next/server";
import { findQueueById, updateQueueStatus } from "@/lib/social-post/db";
import { requireFounderApi } from "@/lib/social-post/admin-auth";

const ALLOWED_FROM = ["approved_to_post", "pending_review"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireFounderApi();
  const { id } = await params;

  const row = await findQueueById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  if (!ALLOWED_FROM.includes(row.status)) {
    if (row.status === "needs_review") {
      return Response.json({ ok: true, row });
    }
    return Response.json(
      { error: `Cannot move a "${row.status}" post back to needs_review.` },
      { status: 400 },
    );
  }

  const existingNotes = row.review_notes ? row.review_notes + "\n" : "";
  const approverNote = row.approved_by
    ? `Moved back to review (was approved by ${row.approved_by})`
    : "Moved back to review";

  await updateQueueStatus({
    id,
    status: "needs_review",
    reviewNotes: existingNotes + approverNote,
  });

  const updated = await findQueueById(id);
  return Response.json({ ok: true, row: updated });
}
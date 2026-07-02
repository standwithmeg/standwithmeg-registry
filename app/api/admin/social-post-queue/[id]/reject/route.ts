import { NextRequest } from "next/server";
import { findQueueById, updateQueueStatus } from "@/lib/social-post/db";
import { requireFounderApi } from "@/lib/social-post/admin-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireFounderApi();
  const { id } = await params;

  const row = await findQueueById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  if (row.status === "posted") {
    return Response.json({ error: "Cannot reject a post that was already published." }, { status: 400 });
  }
  if (row.status === "rejected") {
    return Response.json({ ok: true, row });
  }

  const existingNotes = row.review_notes ? row.review_notes + "\n" : "";
  const newNote = row.approved_by
    ? `Rejected (was previously approved by ${row.approved_by})`
    : "Rejected";

  await updateQueueStatus({
    id,
    status: "rejected",
    reviewNotes: existingNotes + newNote,
  });

  const updated = await findQueueById(id);
  return Response.json({ ok: true, row: updated });
}
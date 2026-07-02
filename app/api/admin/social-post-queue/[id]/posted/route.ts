import { NextRequest } from "next/server";
import { findQueueById, updateQueueStatus } from "@/lib/social-post/db";
import { requireFounderApi } from "@/lib/social-post/admin-auth";

const ALLOWED_FROM = ["approved_to_post", "pending_review", "needs_review"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const founder = await requireFounderApi();
  const { id } = await params;

  const row = await findQueueById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  if (!ALLOWED_FROM.includes(row.status)) {
    if (row.status === "posted") {
      return Response.json({ ok: true, row });
    }
    return Response.json(
      { error: `Cannot mark a "${row.status}" post as posted. It must be approved first.` },
      { status: 400 },
    );
  }

  await updateQueueStatus({ id, status: "posted", postedBy: `dashboard:${founder.email}` });
  const updated = await findQueueById(id);
  return Response.json({ ok: true, row: updated });
}

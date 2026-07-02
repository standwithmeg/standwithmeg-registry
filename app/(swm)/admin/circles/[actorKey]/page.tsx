import { requireFounder } from "../../../../../lib/require-auth";
import { adminGetCircleActorDetail, getDemoCircleDetail, getDemoMessages } from "../../../../../lib/admin-circles";
import { parseActorKey } from "../../../../../lib/connection-circle-matching";
import AdminCircleActorPageClient from "./AdminCircleActorPageClient";

export const dynamic = "force-dynamic";

export default async function AdminCircleActorPage({
  params,
  searchParams,
}: {
  params: Promise<{ actorKey: string }>;
  searchParams: Promise<{ preview?: string; demo?: string }>;
}) {
  await requireFounder("/swm-login", "/admin/circles");
  const { actorKey } = await params;
  const { preview, demo } = await searchParams;
  const previewMode = preview === "member" || preview === "demo";
  const demoMode = preview === "demo";
  const demoKey = demo || "jane";

  let detail = await adminGetCircleActorDetail(actorKey);

  if (demoMode) {
    detail = getDemoCircleDetail(demoKey);
  }

  const fallbackActor = parseActorKey(actorKey);
  const actor = detail?.actor ?? fallbackActor ?? { name: "Unknown actor", state: null, role: "Unknown role" };

  return (
    <AdminCircleActorPageClient
      actorKey={actorKey}
      actor={actor}
      parents={detail?.parents ?? []}
      joinedHandles={detail?.joined_handles ?? 0}
      acceptedIntros={detail?.accepted_intros ?? 0}
      preview={previewMode}
      demo={demoMode}
      demoKey={demoKey}
      demoMessages={demoMode ? getDemoMessages(actor.name) : undefined}
    />
  );
}

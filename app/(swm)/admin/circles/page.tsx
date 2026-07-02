import { requireFounder } from "../../../../lib/require-auth";
import { fetchCirclesDashboardData } from "../../../../lib/admin-metrics";
import { CirclesAdminView } from "../_components/CirclesAdminView";

export const dynamic = "force-dynamic";

export default async function CirclesAdminPage() {
  await requireFounder("/swm-login", "/admin/circles");
  const data = await fetchCirclesDashboardData();
  return <CirclesAdminView data={data} />;
}

import { requireFounder } from "../../../../lib/require-auth";
import { ShawnLeeAdminPanel } from "../_components/ShawnLeeAdminPanel";

export const dynamic = "force-dynamic";

export default async function ShawnLeeAdminPage() {
  await requireFounder("/swm-login", "/admin/shawn-lee");
  return <ShawnLeeAdminPanel />;
}
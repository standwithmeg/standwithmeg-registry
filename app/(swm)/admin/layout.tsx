import { requireAuth } from "@/lib/require-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAuth("/swm-login", "/admin");
  return <>{children}</>;
}

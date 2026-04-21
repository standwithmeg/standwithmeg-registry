import { requireAuth } from "@/lib/require-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth("/login", "/dashboard");
  return <>{children}</>;
}

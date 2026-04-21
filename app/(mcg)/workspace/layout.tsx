import { requireAuth } from "@/lib/require-auth";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireAuth("/login", "/workspace");
  return <>{children}</>;
}

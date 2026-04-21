import { requireAuth } from "@/lib/require-auth";

export default async function VaultsLayout({ children }: { children: React.ReactNode }) {
  await requireAuth("/login", "/vaults");
  return <>{children}</>;
}

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/require-auth";

export const metadata: Metadata = {
  title: "Admin Dashboard | Stand With Meg",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/swm-login", "/admin");
  return <>{children}</>;
}

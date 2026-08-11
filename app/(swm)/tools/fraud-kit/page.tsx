import type { Metadata } from "next";
import { hasReportKitAccess } from "@/lib/report-kit";
import { isAdminOrFounderEmail, isFounderEmail } from "@/lib/require-auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { FraudKitClient } from "./FraudKitClient";

// Access is session-bound; never cache an unlocked workspace for another browser.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Report Kit | The Shawn Lee Report",
  description:
    "Private, evidence-first documentation workspace based on Shawn Lee's educational framework, with source-status intake and current official reporting routes.",
  alternates: { canonical: "/tools/fraud-kit" },
};

export default async function FraudKitPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase() || "";
  const hasAccess = email
    ? isAdminOrFounderEmail(email) || await hasReportKitAccess(email)
    : false;

  return (
    <FraudKitClient
      initialEmail={email}
      initialHasAccess={hasAccess}
      authenticated={Boolean(email)}
      canManageTesterAccess={Boolean(email && isFounderEmail(email))}
    />
  );
}

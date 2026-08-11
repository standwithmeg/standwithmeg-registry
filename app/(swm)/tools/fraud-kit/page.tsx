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
  let email = "";
  let hasAccess = false;
  let canManageTesterAccess = false;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email?.trim().toLowerCase() || "";
    if (email) {
      canManageTesterAccess = isFounderEmail(email);
      hasAccess = isAdminOrFounderEmail(email) || (await hasReportKitAccess(email));
    }
  } catch (error) {
    console.error("Report Kit access check failed:", error);
  }

  return (
    <FraudKitClient
      initialEmail={email}
      initialHasAccess={hasAccess}
      authenticated={Boolean(email)}
      canManageTesterAccess={canManageTesterAccess}
    />
  );
}

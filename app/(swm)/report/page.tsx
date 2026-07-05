import type { Metadata } from "next";
import { ReportAccessClient } from "./_components/ReportAccessClient";
import { loadReportInitialCourtActors } from "../../../lib/report-initial-court-actors";
import { SiteHeader } from "@/components/dossier/SiteHeader";
import { SiteFooter } from "@/components/dossier/SiteFooter";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "The Public Record — Family Court Reports by State",
  description:
    "Every state's family-reported numbers: families counted, reported losses, and free PDF reports that rebuild with every new survey submission.",
};

type ReportPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function isAdminPreview(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

export default async function ImpactPage({ searchParams }: ReportPageProps) {
  const params = searchParams ? await searchParams : {};
  const initialCourtActors = await loadReportInitialCourtActors();
  return (
    <>
      <SiteHeader />
      <ReportAccessClient
        initialHasAccess={isAdminPreview(params.admin_preview)}
        initialCourtActors={initialCourtActors}
      />
      <SiteFooter />
    </>
  );
}

import { ReportAccessClient } from "./_components/ReportAccessClient";
import { loadReportInitialCourtActors } from "../../../lib/report-initial-court-actors";

export const revalidate = 300;

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
    <ReportAccessClient
      initialHasAccess={isAdminPreview(params.admin_preview)}
      initialCourtActors={initialCourtActors}
    />
  );
}

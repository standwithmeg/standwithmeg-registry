import reportIndex from "../../../public/state-reports/index.json";
import { US_JURISDICTION_NAMES } from "../../../lib/us-jurisdictions";

type ReportIndexEntry = {
  state: string;
  submissions: number;
  file: string;
  size_kb: number;
};

export async function GET() {
  const resources = (reportIndex as ReportIndexEntry[])
    .filter(entry => /^[A-Z]{2}$/.test(entry.state) && entry.submissions >= 30)
    .map(entry => ({
      state_code: entry.state,
      state_name: US_JURISDICTION_NAMES[entry.state as keyof typeof US_JURISDICTION_NAMES] ?? entry.state,
      drive_folder_url: `/state-reports/${entry.state}.pdf`,
      report_available: true,
      report_title: `${entry.state} Family Rights Report`,
      updated_at: null,
    }));

  return Response.json({ resources });
}

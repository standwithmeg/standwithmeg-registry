import reportIndex from "../../../public/state-reports/index.json";

type ReportIndexEntry = {
  state: string;
  submissions: number;
  file: string;
  size_kb: number;
};

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export async function GET() {
  const resources = (reportIndex as ReportIndexEntry[])
    .filter(entry => /^[A-Z]{2}$/.test(entry.state) && entry.submissions >= 30)
    .map(entry => ({
      state_code: entry.state,
      state_name: STATE_NAMES[entry.state] ?? entry.state,
      drive_folder_url: `/state-reports/${entry.state}.pdf`,
      report_available: true,
      report_title: `${entry.state} Family Rights Report`,
      updated_at: null,
    }));

  return Response.json({ resources });
}

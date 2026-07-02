import Link from "next/link";
import { requireAdminOrFounder } from "../../../../lib/require-auth";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

type LookupResult = {
  id: string;
  email: string;
  state_of_occurrence: string | null;
  outside_us_country: string | null;
  first_name: string | null;
  created_at: string;
  source_table: "survey_submissions" | "legacy_submissions";
};

export const dynamic = "force-dynamic";

export default async function AdminSurveyLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  await requireAdminOrFounder("/swm-login", "/admin/survey-lookup");
  const { email } = await searchParams;
  const query = (email || "").trim();

  let results: LookupResult[] = [];
  let error = "";
  if (query) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com"}/api/admin/survey-lookup?email=${encodeURIComponent(query)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      error = data.error || "Could not load lookup.";
    } else {
      results = (data.results ?? []) as LookupResult[];
    }
  }

  const stateFor = (row: LookupResult) =>
    row.state_of_occurrence?.trim().toUpperCase() ||
    row.outside_us_country?.trim() ||
    "—";

  return (
    <main className="min-h-screen px-6 py-10 text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>Admin · Survey Lookup</p>
            <h1 className="mt-2 text-3xl font-black">Survey lookup by email</h1>
          </div>
          <Link href="/admin/connect/hardship" className="rounded-lg px-4 py-2 text-sm font-bold text-white/80" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>
            Back to hardship waitlist
          </Link>
        </div>

        <div className="rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <form method="get" className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              name="email"
              defaultValue={query}
              placeholder="parent@example.com"
              className="min-w-0 flex-1 rounded-lg px-4 py-3 text-white outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.18)" }}
              required
            />
            <button type="submit" className="rounded-lg px-5 py-3 text-sm font-black" style={{ backgroundColor: GOLD, color: NAVY }}>
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-400/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>
        )}

        {query && !error && (
          <div className="mt-6 rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <h2 className="text-lg font-black">{results.length} result{results.length === 1 ? "" : "s"} for {query}</h2>
            {results.length === 0 ? (
              <p className="mt-3 text-sm text-white/60">No survey submissions found for this email in either the current or legacy tables.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {results.map(row => (
                  <li key={row.id} className="flex flex-col gap-2 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                    <div>
                      <div className="font-bold">{row.first_name || "Anonymous"}</div>
                      <div className="text-sm text-white/60">
                        {stateFor(row)} · {new Date(row.created_at).toLocaleString()} · {row.source_table === "legacy_submissions" ? "Legacy" : "Current survey"}
                      </div>
                    </div>
                    <Link href={`/admin/survey-submission/${row.id}`} className="text-sm font-bold hover:underline" style={{ color: GOLD }}>
                      View submission →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

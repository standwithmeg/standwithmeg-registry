import Link from "next/link";
import { requireAdminOrFounder } from "@/lib/require-auth";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

function dollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents));
}

function fmt(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default async function AdminSurveySubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminOrFounder("/swm-login", "/admin");
  const { id } = await params;

  const res = await fetch(`/api/admin/survey-submission/${id}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    return (
      <main className="min-h-screen px-6 py-10 text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-black">No survey on file</h1>
            <Link href="/admin/connect/hardship" className="rounded-lg px-4 py-2 text-sm font-bold text-white/80" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>Back to hardship waitlist</Link>
          </div>
          <div className="rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <p className="text-white/70">This submission ID was not found in the current survey table or the legacy submissions table.</p>
          </div>
        </div>
      </main>
    );
  }
  if (!res.ok) {
    return (
      <main className="min-h-screen px-6 py-10 text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto max-w-4xl rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <h1 className="text-2xl font-black">Could not load survey</h1>
          <p className="mt-2 text-white/60">{res.status === 403 ? "Not authorized." : "Something went wrong loading this submission."}</p>
        </div>
      </main>
    );
  }

  const data = (await res.json()) as {
    submission: Record<string, string | number | boolean | null>;
    source_table?: "survey_submissions" | "legacy_submissions";
    court_actors: Array<Record<string, string | null>>;
  };
  const sub = data.submission;
  const actors = data.court_actors ?? [];

  const state =
    String(sub.state_of_occurrence || "").trim().toUpperCase() ||
    String(sub.outside_us_country || "").trim() ||
    String(sub.state || "").trim().toUpperCase() ||
    "—";

  const fields: { label: string; value: string }[] = [
    { label: "Email", value: fmt(sub.email) },
    { label: "First name", value: fmt(sub.first_name) },
    { label: "State / Country", value: state },
    { label: "County", value: fmt(sub.case_county ?? sub.county) },
    { label: "Permission to share", value: fmt(sub.permission_to_share ?? sub.permission) },
    { label: "Case status", value: fmt(sub.case_status) },
    { label: "System", value: fmt(sub.system) },
    { label: "Duration (years)", value: fmt(sub.duration) },
    { label: "Months lost", value: fmt(sub.months_lost) },
    { label: "Custody", value: fmt(sub.custody) },
    { label: "Pro se", value: sub.pro_se == null ? "—" : sub.pro_se ? "Yes" : "No" },
    { label: "Legal representation", value: fmt(sub.legal_rep) },
    { label: "Allegation", value: fmt(sub.allegation) },
    { label: "Attorney fees", value: dollars(sub.atty_fees as number | null) },
    { label: "GAL fees", value: dollars(sub.gal_fees as number | null) },
    { label: "Therapy fees", value: dollars(sub.therapy_fees as number | null) },
    { label: "Reunification fees", value: dollars(sub.reunif_fees as number | null) },
    { label: "Other fees", value: dollars(sub.other_fees as number | null) },
    { label: "Lost wages", value: dollars(sub.lost_wages as number | null) },
    { label: "Asset loss", value: dollars(sub.asset_loss as number | null) },
    { label: "Total financial loss", value: dollars(sub.total_financial_loss as number | null) },
    { label: "Approved for public display", value: sub.approved == null ? "—" : sub.approved ? "Yes" : "No" },
    { label: "Submitted", value: sub.created_at ? new Date(String(sub.created_at)).toLocaleString() : "—" },
  ];

  return (
    <main className="min-h-screen px-6 py-10 text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>Admin · Survey Submission</p>
            <h1 className="mt-2 text-3xl font-black">{String(sub.first_name || "Anonymous")}</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/connect/hardship"
              className="rounded-lg px-4 py-2 text-sm font-bold text-white/80"
              style={{ border: "1px solid rgba(255,255,255,0.18)" }}
            >
              Back to hardship waitlist
            </Link>
            <Link
              href="/admin/circles"
              className="rounded-lg px-4 py-2 text-sm font-bold text-white/80"
              style={{ border: "1px solid rgba(255,255,255,0.18)" }}
            >
              Back to Circles admin
            </Link>
          </div>
        </div>

        {data.source_table === "legacy_submissions" && (
          <div className="mb-6 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            This is a legacy submission. Some fields may be incomplete or stored differently than the current survey.
          </div>
        )}

        <div className="rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <h2 className="text-lg font-black">Submission details</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {fields.map(({ label, value }) => (
              <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                <dt className="text-xs uppercase tracking-wider text-white/40">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-white/90">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {sub.impact_quote && (
          <div className="mt-6 rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <h2 className="text-lg font-black">Impact quote</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{String(sub.impact_quote)}</p>
          </div>
        )}

        <div className="mt-6 rounded-xl p-6" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <h2 className="text-lg font-black">Court actors ({actors.length})</h2>
          {actors.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No court actors recorded for this submission.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {actors.map(actor => (
                <li key={String(actor.id)} className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <div className="font-bold">{actor.name}</div>
                  <div className="text-sm text-white/60">
                    {actor.role}
                    {actor.court_or_county ? ` · ${actor.court_or_county}` : ""}
                    {actor.state_code ? ` · ${actor.state_code}` : ""}
                  </div>
                  {actor.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-white/50">{String(actor.notes)}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

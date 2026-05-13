import Link from "next/link";
import { notFound } from "next/navigation";
import {
  complaintChecklistItems,
  complaintPatternCategories,
  getComplaintAgenciesForActor,
  getStateComplaintConfig,
} from "@/lib/complaint-routing/stateComplaintConfig";
import { findPublicCourtActorByPacketId } from "@/lib/public-court-actor-patterns";

// The packet page resolves actor data per request from the live registry API.
// Disable static prerendering so the build does not try to evaluate the route
// without an active request context.
export const dynamic = "force-dynamic";

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

type PageProps = {
  params: Promise<{ actorId: string }>;
};

function statusLabel(status: string) {
  if (status === "verified") return "Verified routing";
  if (status === "unavailable") return "Unavailable";
  return "Needs review";
}

function complaintTemplate(actor: Awaited<ReturnType<typeof findPublicCourtActorByPacketId>>, agencyName: string) {
  if (!actor) return "";
  const state = actor.state_code || actor.location_key || "";
  return `To: ${agencyName}

Re: Complaint concerning ${actor.name} (${actor.role}) in ${state}${actor.court_or_county ? ` / ${actor.court_or_county}` : ""}

My name: [YOUR NAME]
Case number: [CASE NUMBER]
Court: [COURT NAME]
Dates of conduct: [DATES]

I am submitting this complaint based on my direct experience. I understand the Stand With Meg Family Rights Registry reflects family-reported data and is not a court finding. The Registry currently shows ${actor.count} public family report${actor.count === 1 ? "" : "s"} naming ${actor.name}. I am including that only as pattern context. My formal complaint is based on my own case facts, dates, evidence, orders, transcripts, and documents.

What happened:
[Write the facts in chronological order. Include who was present, what was said or done, and where it appears in the record.]

Why I am requesting review:
[Explain the conduct that may violate judicial, ethical, or professional rules. Avoid conclusions by themselves. Tie each concern to facts and evidence.]

Evidence I can provide:
[List orders, transcripts, audio/video, messages, emails, exhibits, billing records, witness names, and any other support.]

Harm caused:
[Explain the impact on parenting time, due process, finances, safety, access to evidence, or ability to be heard.]

Requested action:
[State what you are asking the agency to review. I am not asking this agency to act as an appellate court, but to review conduct for possible misconduct/professional rule violations.]

I certify that this complaint is based on my truthful, first-hand knowledge and supporting records.`;
}

export default async function ComplaintPacketPage({ params }: PageProps) {
  const { actorId } = await params;
  const actor = await findPublicCourtActorByPacketId(actorId);
  if (!actor) notFound();

  const stateConfig = getStateComplaintConfig(actor.state_code || actor.location_key);
  const agencies = getComplaintAgenciesForActor(actor);
  const primaryAgency = agencies[0];
  const hasNeedsReview = agencies.some(a => a.verificationStatus === "needs_review");
  const patterns = actor.pattern_categories.length
    ? actor.pattern_categories
    : complaintPatternCategories.map(label => ({ label, count: 0 }));
  const template = complaintTemplate(actor, primaryAgency.name);

  return (
    <main className="min-h-screen" style={{ backgroundColor: "#07111F", color: "white" }}>
      <style>{`
        @media print {
          body { background: white !important; }
          main { background: white !important; color: #111827 !important; }
          .no-print { display: none !important; }
          .print-card { break-inside: avoid; border-color: #D1D5DB !important; background: white !important; color: #111827 !important; }
          .print-dark { color: #111827 !important; }
          a { color: #111827 !important; text-decoration: underline; }
          textarea { color: #111827 !important; border-color: #D1D5DB !important; background: white !important; }
        }
      `}</style>

      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/report#court-actors" className="text-sm font-semibold" style={{ color: GOLD }}>
            Back to actor reports
          </Link>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wide"
            style={{ borderColor: "rgba(201,162,39,0.45)", color: GOLD }}
          >
            Print or Save as PDF
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="print-card rounded-2xl border p-6 sm:p-8" style={{ backgroundColor: NAVY, borderColor: "rgba(201,162,39,0.35)" }}>
            <div className="text-xs font-black uppercase tracking-[0.24em]" style={{ color: GOLD }}>
              Formal Complaint Packet
            </div>
            <h1 className="print-dark mt-4 text-3xl font-black leading-tight sm:text-5xl">
              {actor.name}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">
              Family-reported. Not court findings. This page helps each family prepare a careful complaint packet based on their own direct experience and evidence.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["Role", actor.role],
                ["State", stateConfig.stateName],
                ["County / Court", actor.court_or_county || "Not listed"],
                ["Reports", `${actor.count} public family report${actor.count === 1 ? "" : "s"}`],
                ["Public status", actor.public_status ? "Public threshold met" : "Not public"],
                ["Registry page", "Public dashboard actor report"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3" style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <div className="text-[10px] font-black uppercase tracking-wide text-white/40">{label}</div>
                  <div className="mt-1 text-sm font-semibold">{value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg border p-4" style={{ borderColor: "rgba(185,28,28,0.45)", backgroundColor: "rgba(185,28,28,0.14)" }}>
              <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: "#FCA5A5" }}>
                Before filing
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/78">
                Do not copy another family&apos;s allegations. Do not exaggerate. Do not claim an agency has found misconduct unless there is a public finding. File only what you personally know and can support.
              </p>
            </div>
          </section>

          <aside className="print-card rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(201,162,39,0.28)" }}>
            <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>
              Complaint Destination
            </h2>
            <div className="mt-4 space-y-4">
              {agencies.map(agency => (
                <div key={`${agency.name}-${agency.url}`} className="rounded-lg border p-4" style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(15,30,48,0.55)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="print-dark text-sm font-black">{agency.name}</h3>
                    <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide" style={{ backgroundColor: agency.verificationStatus === "verified" ? "rgba(34,197,94,0.18)" : "rgba(201,162,39,0.16)", color: agency.verificationStatus === "verified" ? "#86EFAC" : GOLD }}>
                      {statusLabel(agency.verificationStatus)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/62">{agency.description}</p>
                  <a href={agency.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide" style={{ backgroundColor: GOLD, color: NAVY }}>
                    Open complaint page
                  </a>
                </div>
              ))}
            </div>
            {hasNeedsReview && (
              <p className="mt-4 rounded-lg border p-3 text-xs leading-5" style={{ borderColor: "rgba(201,162,39,0.4)", color: GOLD }}>
                This complaint routing is pending verification. Confirm the agency before filing.
              </p>
            )}
          </aside>
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="print-card rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
            <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>State Rules and Limits</h2>
            <div className="mt-4 space-y-3">
              {(stateConfig.legalRules || []).map(rule => (
                <div key={rule.title} className="border-b border-white/10 pb-3">
                  <a href={rule.url} target="_blank" rel="noopener noreferrer" className="text-sm font-black" style={{ color: "white" }}>
                    {rule.title}
                  </a>
                  <p className="mt-1 text-xs leading-5 text-white/60">{rule.description}</p>
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-white/70">
              {(stateConfig.notes || []).map(note => <li key={note}>• {note}</li>)}
            </ul>
          </div>

          <div className="print-card rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
            <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Complaint Checklist</h2>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-white/75 sm:grid-cols-2">
              {complaintChecklistItems.map(item => <li key={item}>□ {item}</li>)}
            </ul>
          </div>
        </section>

        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
          <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Registry Pattern Context</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            This Registry data is pattern context only. Your formal complaint should be based on your own direct experience and evidence.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {patterns.map(pattern => (
              <div key={pattern.label} className="rounded-lg border p-3" style={{ borderColor: "rgba(201,162,39,0.18)", backgroundColor: "rgba(15,30,48,0.55)" }}>
                <div className="text-sm font-bold">{pattern.label}</div>
                <div className="mt-1 text-xs text-white/50">
                  {pattern.count > 0 ? `${pattern.count} public-family signal${pattern.count === 1 ? "" : "s"}` : "No public count shown"}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
          <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Copy-Ready Complaint Template</h2>
          <p className="mt-2 text-sm leading-6 text-white/68">
            Replace every bracketed blank with your own truthful facts. Keep the wording factual and attach your own evidence.
          </p>
          <textarea
            readOnly
            value={template}
            className="mt-4 h-[520px] w-full rounded-lg border p-4 font-mono text-xs leading-5 outline-none"
            style={{ backgroundColor: "#050A14", borderColor: "rgba(201,162,39,0.28)", color: "rgba(255,255,255,0.88)" }}
          />
        </section>

        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(185,28,28,0.12)", borderColor: "rgba(185,28,28,0.35)" }}>
          <h2 className="text-lg font-black" style={{ color: "#FCA5A5" }}>Disclaimer</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Stand With Meg does not provide legal advice and does not file complaints for families. This packet is an organizing tool. Each person must file only their own truthful, first-hand complaint using their own case facts, dates, evidence, orders, transcripts, and documents. Family Rights Registry data is family-reported and is not a court finding or agency finding.
          </p>
        </section>
      </section>
    </main>
  );
}

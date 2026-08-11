import Link from "next/link";
import type { Metadata } from "next";
import {
  factsVsConclusionsLine,
  falseStatementCard,
  fraudChecklistItems,
  fraudDocumentationGuidance,
  fraudDocumentationTemplate,
  getFraudDoorsForState,
  getFraudStateName,
  wireFraudElements,
} from "@/lib/complaint-routing/fraudDoorConfig";
import { DoorGuide } from "./DoorGuide";
import { PrintButton } from "./PrintButton";
import { StateSelect } from "./StateSelect";

export const metadata: Metadata = {
  title: "Fraud Documentation Packet | Stand With Meg",
  description:
    "Build a careful, truthful record of your own fraud case and route it to the right office. Family-reported. Educational, not legal advice.",
};

const GOLD = "#C9A227";
const NAVY = "#0F1E30";

type PageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export default async function FraudPacketPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const stateCode = firstParam(params.state).trim().toUpperCase();
  const stateName = getFraudStateName(stateCode);
  const doors = getFraudDoorsForState(stateCode);
  const primaryDoor = doors[0];
  const hasNeedsReview = doors.some(door => door.verificationStatus === "needs_review");
  const template = fraudDocumentationTemplate(primaryDoor.name, stateCode);

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
          <Link href="/report" className="text-sm font-semibold" style={{ color: GOLD }}>
            Back to reports
          </Link>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-end gap-4">
              <StateSelect selected={stateCode} />
              <PrintButton stateCode={stateCode} />
            </div>
            <p className="max-w-xs text-right text-[11px] leading-4 text-white/50">
              Select your state first — your PDF includes {stateCode ? `${stateName} filing doors` : "custom state filing doors"}.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Header / framing card */}
          <section className="print-card rounded-2xl border p-6 sm:p-8" style={{ backgroundColor: NAVY, borderColor: "rgba(201,162,39,0.35)" }}>
            <div className="text-xs font-black uppercase tracking-[0.24em]" style={{ color: GOLD }}>
              Fraud Documentation Packet
            </div>
            <h1 className="print-dark mt-4 text-3xl font-black leading-tight sm:text-5xl">
              Build a careful, truthful record of your own case.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">
              Family-reported. This page does not accuse anyone. It helps you document what you
              personally experienced{stateName === "your state" ? "" : ` in ${stateName}`}, in your
              own words, and take it to the right office. You supply every name from your own
              first-hand facts.
            </p>

            <div className="mt-6 rounded-lg border p-4" style={{ borderColor: "rgba(185,28,28,0.45)", backgroundColor: "rgba(185,28,28,0.14)" }}>
              <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: "#FCA5A5" }}>
                Before filing
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/78">
                {falseStatementCard.body}
              </p>
            </div>
          </section>

          <DoorGuide doors={doors} hasNeedsReview={hasNeedsReview} />
        </div>

        {/* The four elements + §1001 */}
        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
          <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Four wire-fraud elements to understand</h2>
          <p className="mt-2 text-sm leading-6 text-white/68">
            These are the legal building blocks of wire fraud. They are here to teach you what
            counts — not to label anyone.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {wireFraudElements.map(element => (
              <div key={element.title} className="rounded-lg border p-4" style={{ borderColor: "rgba(201,162,39,0.18)", backgroundColor: "rgba(15,30,48,0.55)" }}>
                <div className="text-sm font-black text-white/85">{element.title}</div>
                <div className="mt-1 text-xs leading-5 text-white/55">{element.body}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "rgba(185,28,28,0.35)", backgroundColor: "rgba(185,28,28,0.12)" }}>
            <div className="text-sm font-black" style={{ color: "#FCA5A5" }}>{falseStatementCard.title}</div>
            <div className="mt-1 text-xs leading-5 text-white/72">{falseStatementCard.body}</div>
          </div>
        </section>

        {/* Documentation checklist */}
        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
          <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Documentation checklist</h2>
          <p className="mt-2 text-sm leading-6 text-white/68">{factsVsConclusionsLine}</p>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-white/75 sm:grid-cols-2">
            {fraudChecklistItems.map(item => <li key={item}>□ {item}</li>)}
          </ul>
        </section>

        {/* Documentation summary template */}
        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
          <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Documentation summary template</h2>
          <p className="mt-2 text-sm leading-6 text-white/68">
            Addressed to: <span className="font-bold text-white/85">{primaryDoor.name}</span>. {fraudDocumentationGuidance} Replace every bracketed blank with your own truthful facts.
          </p>
          <textarea
            readOnly
            value={template}
            className="mt-4 h-[560px] w-full rounded-lg border p-4 font-mono text-xs leading-5 outline-none"
            style={{ backgroundColor: "#050A14", borderColor: "rgba(201,162,39,0.28)", color: "rgba(255,255,255,0.88)" }}
          />
        </section>

        {/* Find an outside attorney — advertising slot */}
        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="print-dark text-lg font-black" style={{ color: GOLD }}>Find an outside attorney</h2>
            <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white/45" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>
              Advertisement
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/68">
            An independent attorney directory is being verified. Listings, when live, are paid
            advertisements and are not endorsements. Stand With Meg does not match you to a lawyer
            or take part in your case.
          </p>
          <Link href="/contact" className="mt-3 inline-flex rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wide" style={{ borderColor: "rgba(201,162,39,0.45)", color: GOLD }}>
            Contact us about the directory
          </Link>
        </section>

        <section className="print-card mt-6 rounded-2xl border p-6 no-print" style={{ borderColor: "rgba(201,162,39,0.35)", backgroundColor: "rgba(201,162,39,0.08)" }}>
          <h2 className="text-lg font-black" style={{ color: GOLD }}>Want guided help organizing the record?</h2>
          <p className="mt-2 text-sm leading-6 text-white/85">
            This free packet organizes your facts and shows you current official starting points. <strong className="text-white">The Report Kit ($79 one-time)</strong> adds written lessons based on Shawn&apos;s public educational framework, source-status intake, evidence and money mapping, current routing, and private exports.
          </p>
          <p className="mt-2 text-xs leading-5 text-white/60">Written lessons · guided workspace · TXT, RTF, JSON, and print-to-PDF exports · lifetime updates</p>
          <Link href="/tools/fraud-kit" className="mt-4 inline-flex rounded-md px-4 py-2 text-xs font-black uppercase tracking-wide text-[#0F1E30]" style={{ backgroundColor: GOLD }}>
            Get The Report Kit — $79
          </Link>
        </section>

        {/* Disclaimer */}
        <section className="print-card mt-6 rounded-2xl border p-6" style={{ backgroundColor: "rgba(185,28,28,0.12)", borderColor: "rgba(185,28,28,0.35)" }}>
          <h2 className="text-lg font-black" style={{ color: "#FCA5A5" }}>Disclaimer</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Stand With Meg does not provide legal advice and does not file complaints for families.
            This packet is an organizing tool. Each person must file only their own truthful,
            first-hand record using their own facts, dates, evidence, and documents.
          </p>
          <p className="mt-3 text-sm leading-6 text-white/75">
            Built from Shawn Lee&apos;s public educational framework. New material has not been represented
            as Shawn&apos;s case-specific review. This is general legal education, not legal advice, and
            creates no attorney-client relationship.
          </p>
        </section>
      </section>
    </main>
  );
}

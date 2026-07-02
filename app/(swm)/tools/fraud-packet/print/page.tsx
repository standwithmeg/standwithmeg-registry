import Link from "next/link";
import type { Metadata } from "next";
import {
  NATIONAL_FRAUD_ENFORCEMENT_CONTACT,
  factsVsConclusionsLine,
  falseStatementCard,
  fraudChecklistItems,
  fraudDocumentationGuidance,
  fraudDocumentationTemplate,
  fraudReportingResources,
  getFraudDoorsForState,
  getFraudStateName,
  whichDoorTree,
  wireFraudElements,
} from "@/lib/complaint-routing/fraudDoorConfig";
import { REPORT_KIT_PRICE_CENTS } from "@/lib/report-kit";
import { PrintAutoTrigger } from "./PrintAutoTrigger";

export const metadata: Metadata = {
  title: "Fraud Documentation Packet (PDF)",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function statusLabel(status: string) {
  if (status === "verified") return "Verified routing";
  if (status === "unavailable") return "Unavailable";
  return "Confirm before filing";
}

export default async function FraudPacketPrintPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const stateCode = firstParam(params.state).trim().toUpperCase();
  const stateName = getFraudStateName(stateCode);
  const hasState = stateName !== "your state";
  const doors = getFraudDoorsForState(stateCode);
  const primaryDoor = doors[0];
  const template = fraudDocumentationTemplate(primaryDoor.name, stateCode);
  const kitPrice = `$${(REPORT_KIT_PRICE_CENTS / 100).toFixed(0)}`;
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <style>{`
        @page { size: letter; margin: 0.65in 0.7in; }
        .fraud-packet-print-root {
          position: fixed; inset: 0; z-index: 9999;
          overflow: auto; background: #fff; color: #111827;
        }
        .fraud-packet-print-root * { box-sizing: border-box; }
        .fraud-packet-print-root .doc {
          max-width: 7.2in; margin: 0 auto;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 10.5pt; line-height: 1.45;
          padding: 0 0 2rem;
        }
        .fraud-packet-print-root .toolbar {
          position: sticky; top: 0; z-index: 20;
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;
          padding: 0.75rem 1rem; background: #0F1E30; color: #F2EAD6;
          border-bottom: 3px solid #C9A227;
          font-family: system-ui, sans-serif; font-size: 0.85rem;
        }
        .fraud-packet-print-root .toolbar button {
          background: #C9A227; color: #050A14; border: 0; border-radius: 6px;
          padding: 0.5rem 1rem; font-weight: 800; font-size: 0.75rem; letter-spacing: 0.06em;
          text-transform: uppercase; cursor: pointer;
        }
        .fraud-packet-print-root .cover {
          border: 2px solid #0F1E30; padding: 1.1rem 1.25rem 1.25rem;
          margin: 1rem 1rem 0; page-break-after: avoid;
        }
        .fraud-packet-print-root .cover-hero {
          display: block; width: 100%; max-height: 2.35in; object-fit: cover;
          object-position: center top; border-radius: 4px; margin-bottom: 0.85rem;
        }
        .fraud-packet-print-root .kicker {
          font-family: system-ui, sans-serif;
          font-size: 0.62rem; font-weight: 800; letter-spacing: 0.22em;
          text-transform: uppercase; color: #9B2C2C;
        }
        .fraud-packet-print-root h1 {
          margin: 0.35rem 0 0.15rem; font-size: 1.65rem; line-height: 1.1;
        }
        .fraud-packet-print-root .subtitle { margin: 0; color: #374151; font-size: 0.95rem; }
        .fraud-packet-print-root .state-pill {
          display: inline-block; margin-top: 0.65rem; padding: 0.3rem 0.65rem;
          border: 1px solid #C9A227; font-family: system-ui, sans-serif;
          font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .fraud-packet-print-root section { margin: 0 1rem; }
        .fraud-packet-print-root h2 {
          margin: 1.1rem 0 0.35rem; font-family: system-ui, sans-serif;
          font-size: 0.78rem; font-weight: 800; letter-spacing: 0.14em;
          text-transform: uppercase; color: #0F1E30;
          border-bottom: 2px solid #C9A227; padding-bottom: 0.2rem;
          page-break-after: avoid;
        }
        .fraud-packet-print-root h3 { margin: 0.65rem 0 0.2rem; font-size: 1rem; }
        .fraud-packet-print-root p { margin: 0.35rem 0; }
        .fraud-packet-print-root .warn {
          border: 1px solid #9B2C2C; background: #FEF2F2;
          padding: 0.65rem 0.75rem; margin: 0.65rem 1rem; page-break-inside: avoid;
        }
        .fraud-packet-print-root .steps { margin: 0.4rem 0 0.65rem 1.1rem; }
        .fraud-packet-print-root table {
          width: 100%; border-collapse: collapse; margin: 0.45rem 0 0.75rem;
          font-size: 0.92rem; page-break-inside: avoid;
        }
        .fraud-packet-print-root th, .fraud-packet-print-root td {
          border: 1px solid #D1D5DB; padding: 0.4rem 0.5rem; vertical-align: top;
        }
        .fraud-packet-print-root th {
          background: #F3F4F6; font-family: system-ui, sans-serif;
          font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .fraud-packet-print-root .door-card {
          border: 1px solid #D1D5DB; padding: 0.6rem 0.7rem; margin: 0.45rem 0;
          page-break-inside: avoid;
        }
        .fraud-packet-print-root .badge {
          display: inline-block; font-family: system-ui, sans-serif;
          font-size: 0.58rem; font-weight: 800; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 0.15rem 0.35rem;
          border: 1px solid #D1D5DB; margin-left: 0.35rem;
        }
        .fraud-packet-print-root .url {
          font-family: ui-monospace, monospace; font-size: 0.82rem;
          word-break: break-all; color: #1D4ED8;
        }
        .fraud-packet-print-root .grid-2 {
          display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
        }
        .fraud-packet-print-root .element {
          border: 1px solid #E5E7EB; padding: 0.5rem 0.6rem; page-break-inside: avoid;
        }
        .fraud-packet-print-root .checklist {
          columns: 2; column-gap: 1.25rem; margin: 0.35rem 0 0.65rem 1rem;
        }
        .fraud-packet-print-root .template {
          white-space: pre-wrap; font-family: ui-monospace, monospace;
          font-size: 0.78rem; line-height: 1.4; border: 1px solid #D1D5DB;
          background: #FAFAFA; padding: 0.75rem; margin-top: 0.45rem;
          page-break-inside: avoid;
        }
        .fraud-packet-print-root .cta {
          border: 2px solid #C9A227; background: #FFFBEB;
          padding: 0.75rem 0.85rem; margin: 0.85rem 0; page-break-inside: avoid;
        }
        .fraud-packet-print-root .price { font-size: 1.25rem; font-weight: 800; }
        .fraud-packet-print-root .fine { font-size: 0.82rem; color: #4B5563; }
        .fraud-packet-print-root .page-break { page-break-before: always; }
        @media print {
          .fraud-packet-print-root { position: static; inset: auto; }
          .fraud-packet-print-root .no-print { display: none !important; }
          .fraud-packet-print-root a { color: #111827; text-decoration: none; }
          .fraud-packet-print-root .url { color: #111827; }
        }
      `}</style>

      <div className="fraud-packet-print-root">
        <PrintAutoTrigger />

        <div className="doc">
          <header className="cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/swm/hero-main-page-meg-shawn.jpg"
              alt="Shawn Lee and Meg — The Shawn Lee Report"
              className="cover-hero"
              width={1200}
              height={675}
            />
            <div className="kicker">Stand With Meg · The Shawn Lee Report · Free Download</div>
            <h1>Fraud Documentation Packet</h1>
            <p className="subtitle">Build a careful, truthful record of your own case — then take it to the right office.</p>
            <div className="state-pill">
              {hasState ? `Prepared for: ${stateName} (${stateCode})` : "Select your state online to customize this packet"}
            </div>
            <p className="fine" style={{ marginTop: "0.55rem" }}>
              Generated {generated} · Family-reported · General legal education only — not legal advice
            </p>
          </header>

          <section>
            <h2>How to use this packet</h2>
            <ol className="steps">
              <li><strong>Read “Which door?” below</strong> — route by whose money was touched, not by who you blame.</li>
              <li><strong>Gather documents first</strong> — dates, invoices, emails, e-filings, billing records, messages.</li>
              <li><strong>Fill in the copy-ready template</strong> using only facts you personally know.</li>
              <li><strong>File through the correct portal</strong> — URLs and contacts are listed in this PDF.</li>
              <li><strong>Keep a copy</strong> of everything you submit.</li>
            </ol>
            {!hasState && (
              <p className="warn">
                <strong>No state selected.</strong> Open https://my.standwithmeg.com/tools/fraud-packet, choose your state, then download this PDF again so your State Attorney General door is customized.
              </p>
            )}
          </section>

          <div className="warn">
            <strong>Before you file anything</strong>
            <p>
              Do not copy another family&apos;s allegations. Do not exaggerate. Knowingly false statements to federal investigators are a separate federal crime (18 U.S.C. §1001). File only what you personally know and can support with documents.
            </p>
          </div>

          <section>
            <h2>Which door? — quick routing guide</h2>
            <table>
              <thead>
                <tr>
                  <th>If this happened…</th>
                  <th>Start here</th>
                </tr>
              </thead>
              <tbody>
                {whichDoorTree.map(branch => (
                  <tr key={branch.when}>
                    <td><strong>{branch.when}</strong></td>
                    <td>{branch.route}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fine">
              Licensed professional conduct is usually a separate parallel track through that profession&apos;s state licensing board.
            </p>
          </section>

          <section>
            <h2>Where to report — doors for {hasState ? stateName : "your state"}</h2>
            {doors.map(door => (
              <div key={door.key} className="door-card">
                <h3>
                  {door.name}
                  <span className="badge">{statusLabel(door.verificationStatus)}</span>
                </h3>
                <p><strong>Use when:</strong> {door.whenToUse}</p>
                <p>{door.description}</p>
                <p><strong>File here:</strong> <span className="url">{door.url}</span></p>
              </div>
            ))}
          </section>

          <section>
            <h2>National Fraud Enforcement — DOJ contact</h2>
            <div className="door-card">
              <h3>{NATIONAL_FRAUD_ENFORCEMENT_CONTACT.name}</h3>
              <p><strong>Address:</strong> {NATIONAL_FRAUD_ENFORCEMENT_CONTACT.address}</p>
              <p><strong>Phone:</strong> {NATIONAL_FRAUD_ENFORCEMENT_CONTACT.phone}</p>
              <p><strong>Email:</strong> {NATIONAL_FRAUD_ENFORCEMENT_CONTACT.email}</p>
              <p><strong>Web:</strong> <span className="url">https://www.justice.gov/fraud</span></p>
            </div>
          </section>

          <section>
            <h2>More reporting resources Shawn references</h2>
            {fraudReportingResources.map(resource => (
              <div key={resource.key} className="door-card">
                <h3>{resource.name}</h3>
                <p>{resource.plainEnglish}</p>
                <p><strong>Use when:</strong> {resource.whenToUse}</p>
                <p><strong>Link:</strong> <span className="url">{resource.url}</span></p>
              </div>
            ))}
          </section>

          <section className="page-break">
            <h2>The four things wire fraud needs (educational)</h2>
            <div className="grid-2">
              {wireFraudElements.map(element => (
                <div key={element.title} className="element">
                  <strong>{element.title}</strong>
                  <span>{element.body}</span>
                </div>
              ))}
            </div>
            <div className="warn" style={{ marginTop: "0.65rem" }}>
              <strong>{falseStatementCard.title}</strong>
              <p>{falseStatementCard.body}</p>
            </div>
          </section>

          <section>
            <h2>Documentation checklist</h2>
            <p>{factsVsConclusionsLine}</p>
            <ul className="checklist">
              {fraudChecklistItems.map(item => (
                <li key={item}>☐ {item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Copy-ready complaint template</h2>
            <p>
              Addressed to: <strong>{primaryDoor.name}</strong>. {fraudDocumentationGuidance}
            </p>
            <div className="template">{template}</div>
          </section>

          <section className="cta">
            <div className="kicker" style={{ color: "#92400E" }}>Want to know exactly what to say?</div>
            <p className="price">The Report Kit — {kitPrice} one-time</p>
            <p>
              <strong>Shawn&apos;s step-by-step video course</strong> walks you through each element, each document, and each filing door. <strong>Meg translates every step into plain English</strong> — what to gather, what words to use, and what not to say.
            </p>
            <p>Expanded worksheets, annotated examples, state door directory, lifetime updates.</p>
            <p><strong>Get it at:</strong> <span className="url">https://my.standwithmeg.com/tools/fraud-kit</span></p>
            <p className="fine">This free packet organizes your facts. The Report Kit teaches you how to present them.</p>
          </section>

          <section>
            <h2>Disclaimer</h2>
            <p className="fine">
              Stand With Meg does not provide legal advice and does not file complaints for families. Educational tool only. Reviewed for educational accuracy by Shawn Lee, Criminal Trial Attorney. No attorney-client relationship. Consult a licensed attorney in your state before filing.
            </p>
            <p className="fine no-print" style={{ marginTop: "1rem" }}>
              <Link href={stateCode ? `/tools/fraud-packet?state=${stateCode}` : "/tools/fraud-packet"}>← Back to interactive packet</Link>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  REPORT_KIT_DISCLAIMER,
  REPORT_KIT_ISSUES,
  REPORT_KIT_LESSONS,
  REPORT_KIT_PRIVACY_NOTICE,
  REPORT_KIT_ROUTES,
  REPORT_KIT_SOURCE_STATUSES,
} from "@/lib/report-kit-content";
import {
  buildReportKitPacket,
  createReportKitDraft,
  makeReportKitId,
  mergeReportKitDraft,
  packetTextToRtf,
  reportKitPacketFilename,
  reportKitStorageKey,
  type ReportKitDraft,
  validateReportKitDraft,
} from "@/lib/report-kit-packet";

const GOLD = "#C9A227";

type Tab = "learn" | "build";
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string };
type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; help?: string };

function Input({ label, help, id, ...props }: InputProps) {
  const fallbackId = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const fieldId = id || fallbackId;
  const helpId = help ? `${fieldId}-help` : undefined;
  return (
    <label htmlFor={fieldId} className="block text-sm font-semibold text-white/85">
      {label}
      <input
        id={fieldId}
        aria-describedby={helpId}
        className="mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40"
        {...props}
      />
      {help ? <span id={helpId} className="mt-1 block text-xs font-normal leading-5 text-white/55">{help}</span> : null}
    </label>
  );
}

function TextArea({ label, help, id, ...props }: TextAreaProps) {
  const fallbackId = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const fieldId = id || fallbackId;
  const helpId = help ? `${fieldId}-help` : undefined;
  return (
    <label htmlFor={fieldId} className="block text-sm font-semibold text-white/85">
      {label}
      <textarea
        id={fieldId}
        aria-describedby={helpId}
        className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40"
        {...props}
      />
      {help ? <span id={helpId} className="mt-1 block text-xs font-normal leading-5 text-white/55">{help}</span> : null}
    </label>
  );
}

function downloadBlob(contents: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ReportKitWorkspace({ email }: { email: string }) {
  const accountEmail = email.trim().toLowerCase();
  const [tab, setTab] = useState<Tab>("learn");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ReportKitDraft>(() => createReportKitDraft(accountEmail));
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("Your private workspace is ready.");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const packet = useMemo(() => buildReportKitPacket(draft), [draft]);
  const storageKey = useMemo(() => reportKitStorageKey(accountEmail), [accountEmail]);

  // Reload draft when the authenticated account changes so shared browsers cannot
  // briefly show another tester's answers under the wrong email key.
  useEffect(() => {
    setHydrated(false);
    setDraft(createReportKitDraft(accountEmail));
    setStep(0);
    setErrors([]);
    setConfirmClear(false);
    if (!accountEmail) {
      setStatus("Sign in is required before a private draft can load.");
      setHydrated(true);
      return;
    }
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        setDraft(mergeReportKitDraft(JSON.parse(saved), accountEmail));
        setStatus("Saved draft restored from this browser.");
      } else {
        setStatus("Your private workspace is ready.");
      }
    } catch {
      setStatus("The saved draft could not be read. A new private draft was opened.");
    } finally {
      setHydrated(true);
    }
  }, [accountEmail, storageKey]);

  useEffect(() => {
    if (!hydrated || !accountEmail) return;
    const timer = window.setTimeout(() => {
      try {
        const next = { ...draft, updatedAt: new Date().toISOString() };
        window.localStorage.setItem(storageKey, JSON.stringify(next));
        setStatus("Draft saved on this device.");
      } catch {
        setStatus("Autosave is blocked by this browser. Download a JSON backup before closing.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [accountEmail, draft, hydrated, storageKey]);

  useEffect(() => {
    if (tab === "build") headingRef.current?.focus();
  }, [step, tab]);

  function nextStep() {
    const allErrors = validateReportKitDraft(draft);
    const stepPatterns: Partial<Record<number, RegExp>> = {
      0: /Confirm all four/,
      1: /reporter|email|phone|state connected|matter summary/i,
      3: /factual event|source status|supporting record/i,
      6: /reporting route/i,
    };
    const pattern = stepPatterns[step];
    const stepErrors = pattern ? allErrors.filter(error => pattern.test(error)) : [];
    if (stepErrors.length) {
      setErrors(stepErrors);
      setStatus(`Review needed: ${stepErrors.length} item${stepErrors.length === 1 ? "" : "s"}.`);
      return;
    }
    setErrors([]);
    setStep(value => Math.min(BUILD_STEPS.length - 1, value + 1));
  }

  function previousStep() {
    setErrors([]);
    setStep(value => Math.max(0, value - 1));
  }

  function clearDraft() {
    try { window.localStorage.removeItem(storageKey); } catch { /* no-op */ }
    setDraft(createReportKitDraft(accountEmail));
    setStep(0);
    setErrors([]);
    setConfirmClear(false);
    setStatus("Draft cleared from this browser.");
  }

  async function copyPacket() {
    if (!validateAndReport()) return;
    try {
      await navigator.clipboard.writeText(packet);
      setStatus("Packet copied to the clipboard.");
    } catch {
      setStatus("Clipboard access was blocked. Use Download text instead.");
    }
  }

  function validateAndReport(): boolean {
    const nextErrors = validateReportKitDraft(draft);
    setErrors(nextErrors);
    if (nextErrors.length) {
      setStatus(`Review needed: ${nextErrors.length} item${nextErrors.length === 1 ? "" : "s"}.`);
      return false;
    }
    return true;
  }

  function printPacket() {
    if (!validateAndReport()) return;
    const priorTitle = document.title;
    document.title = reportKitPacketFilename("txt").replace(/\.txt$/, "");
    window.print();
    document.title = priorTitle;
    setStatus("Print dialog opened. Choose Save as PDF to make a PDF copy.");
  }

  function downloadPacket(extension: "txt" | "rtf") {
    if (!validateAndReport()) return;
    if (extension === "txt") {
      downloadBlob(packet, "text/plain;charset=utf-8", reportKitPacketFilename("txt"));
      setStatus("Text packet downloaded.");
      return;
    }
    downloadBlob(packetTextToRtf(packet), "application/rtf", reportKitPacketFilename("rtf"));
    setStatus("Word-compatible RTF packet downloaded.");
  }

  const current = BUILD_STEPS[step];

  return (
    <div className="mt-8">
      <style>{`
        .report-kit-print { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .report-kit-print, .report-kit-print * { visibility: visible !important; }
          .report-kit-print { display: block !important; position: absolute; inset: 0; padding: 0.55in; color: #111; background: white; }
          .report-kit-print pre { white-space: pre-wrap; font: 10.5pt/1.45 Georgia, 'Times New Roman', serif; }
        }
      `}</style>

      <div className="report-kit-screen rounded-2xl border border-white/10 bg-black/20 p-2" role="tablist" aria-label="Report Kit workspace">
        {(["learn", "build"] as Tab[]).map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`report-kit-tab-${value}`}
            aria-controls={`report-kit-panel-${value}`}
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className="min-h-11 rounded-xl px-5 py-2.5 text-sm font-black focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
            style={tab === value ? { background: GOLD, color: "#050A14" } : { color: "rgba(255,255,255,0.72)" }}
          >
            {value === "learn" ? "LEARN SHAWN'S FRAMEWORK" : "BUILD MY PACKET"}
          </button>
        ))}
      </div>

      <div className="report-kit-screen mt-4 rounded-xl border border-sky-400/25 bg-sky-950/25 px-4 py-3 text-sm leading-6 text-sky-100">
        <strong>Private by design:</strong> {REPORT_KIT_PRIVACY_NOTICE}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{status}</p>

      {tab === "learn" ? (
        <section id="report-kit-panel-learn" role="tabpanel" aria-labelledby="report-kit-tab-learn" className="report-kit-screen mt-6 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: GOLD }}>Updated through Episodes 5-7</p>
            <h2 className="mt-2 text-2xl font-black text-white">The record comes before the label.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
              These written lessons combine Shawn&apos;s teaching with current source-status and reporting-route guardrails. The Connecticut telework segment is intentionally withheld until the missing source is supplied and verified.
            </p>
          </div>
          {REPORT_KIT_LESSONS.map((lesson, index) => (
            <article key={lesson.id} className="rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider">
                <span style={{ color: GOLD }}>Lesson {index + 1}</span>
                <span className="text-white/45">{lesson.episode}</span>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/60">{lesson.status}</span>
              </div>
              <h3 className="mt-2 text-xl font-black text-white">{lesson.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/75">{lesson.summary}</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                {lesson.takeaways.map(item => <li key={item}>• {item}</li>)}
              </ul>
              <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/45">Source note: {lesson.sourceNote}</p>
            </article>
          ))}
          <button type="button" onClick={() => setTab("build")} className="min-h-12 w-full rounded-xl px-5 py-3 text-sm font-black text-[#050A14] focus:outline-none focus:ring-2 focus:ring-white" style={{ background: GOLD }}>
            START MY PRIVATE PACKET
          </button>
        </section>
      ) : (
        <section id="report-kit-panel-build" role="tabpanel" aria-labelledby="report-kit-tab-build" className="report-kit-screen mt-6">
          <div className="mb-4 flex items-center justify-between gap-3 text-xs text-white/55">
            <span>Step {step + 1} of {BUILD_STEPS.length}</span>
            <span>{Math.round(((step + 1) / BUILD_STEPS.length) * 100)}% complete</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full bg-[#C9A227] transition-[width]" style={{ width: `${((step + 1) / BUILD_STEPS.length) * 100}%` }} />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: GOLD }}>{current.eyebrow}</p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black text-white outline-none">{current.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">{current.description}</p>

            {errors.length ? (
              <div role="alert" className="mt-5 rounded-xl border border-red-400/40 bg-red-950/30 p-4 text-sm text-red-100">
                <p className="font-black">Please review:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">{errors.map(error => <li key={error}>{error}</li>)}</ul>
              </div>
            ) : null}

            <div className="mt-6">{renderStep(step, draft, setDraft, setStatus, validateAndReport, packet)}</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={previousStep} disabled={step === 0} className="min-h-11 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-2 focus:ring-[#C9A227]">
              BACK
            </button>
            {step < BUILD_STEPS.length - 1 ? (
              <button type="button" onClick={nextStep} className="min-h-11 rounded-xl px-6 py-2.5 text-sm font-black text-[#050A14] focus:outline-none focus:ring-2 focus:ring-white" style={{ background: GOLD }}>
                SAVE & CONTINUE
              </button>
            ) : null}
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-white/55" aria-hidden="true">{status}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadPacket("txt")} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]">DOWNLOAD TEXT</button>
              <button type="button" onClick={() => downloadPacket("rtf")} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]">DOWNLOAD WORD-COMPATIBLE RTF</button>
              <button type="button" onClick={() => downloadBlob(JSON.stringify(draft, null, 2), "application/json", reportKitPacketFilename("json"))} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]">DOWNLOAD PRIVATE BACKUP</button>
              <button type="button" onClick={() => void copyPacket()} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]">COPY PACKET</button>
              <button type="button" onClick={printPacket} className="min-h-11 rounded-lg px-4 py-2 text-xs font-black text-[#050A14] focus:outline-none focus:ring-2 focus:ring-white" style={{ background: GOLD }}>PRINT / SAVE PDF</button>
            </div>
            {!confirmClear ? (
              <button type="button" onClick={() => setConfirmClear(true)} className="mt-4 min-h-11 text-xs font-bold text-red-300 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-red-300">Clear this draft from this browser</button>
            ) : (
              <div className="mt-4 rounded-lg border border-red-400/40 bg-red-950/25 p-3">
                <p className="text-sm text-red-100">This erases every saved answer on this device. Download a backup first if you may need it.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={clearDraft} className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-white">ERASE DRAFT</button>
                  <button type="button" onClick={() => setConfirmClear(false)} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs font-black text-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]">CANCEL</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="report-kit-print" aria-hidden="true"><pre>{packet}</pre></div>
    </div>
  );
}

const BUILD_STEPS = [
  { eyebrow: "Ground rules", title: "Accuracy before action", description: "Confirm the boundaries that keep the packet useful and source-safe." },
  { eyebrow: "Reporter and matter", title: "Give the receiving agency a neutral starting point", description: "No children's names, Social Security numbers, account numbers, or sealed case details." },
  { eyebrow: "Record map", title: "People and organizations named in your records", description: "List roles and documented actions, without declaring guilt or intent." },
  { eyebrow: "Chronology", title: "Build a source-status timeline", description: "One event per card, with the record and how it was obtained." },
  { eyebrow: "Money map", title: "Show the payment, program, and service", description: "Do not assume federal or Medicaid money without a reliable record." },
  { eyebrow: "Issue spotting", title: "Choose legal issues for review - optional", description: "These notes do not plead criminal counts and do not decide what law applies." },
  { eyebrow: "Routing", title: "Choose the current official doors", description: "Route by jurisdiction and funding source, then read each agency's instructions." },
  { eyebrow: "Review and export", title: "Read every line before submitting", description: "Download, copy, or print the packet; record any submission confirmation afterward." },
];

function renderStep(
  step: number,
  draft: ReportKitDraft,
  setDraft: React.Dispatch<React.SetStateAction<ReportKitDraft>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  validateAndReport: () => boolean,
  packet: string,
) {
  if (step === 0) {
    const options = [
      ["truth", "I will include only information I believe is true and will distinguish personal knowledge from records, reports, and analysis."],
      ["sources", "I will not describe an allegation, complaint, indictment, charge, plea, verdict, or conviction as something it is not."],
      ["privacy", "I will remove children's full names and sensitive identifiers and will not upload private case files to public AI tools."],
      ["outcome", "I understand that a submission does not guarantee contact, investigation, prosecution, custody relief, or recovery."],
    ];
    return (
      <div className="space-y-3">
        {options.map(([id, label]) => (
          <label key={id} className="flex min-h-11 cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/80 focus-within:ring-2 focus-within:ring-[#C9A227]">
            <input type="checkbox" checked={draft.pledges.includes(id)} onChange={event => setDraft(value => ({ ...value, pledges: event.target.checked ? Array.from(new Set([...value.pledges, id])) : value.pledges.filter(item => item !== id) }))} className="mt-1 h-5 w-5 accent-[#C9A227]" />
            <span>{label}</span>
          </label>
        ))}
        <p className="text-xs leading-5 text-white/50">{REPORT_KIT_DISCLAIMER}</p>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" value={draft.reporter.name} onChange={event => setDraft(value => ({ ...value, reporter: { ...value.reporter, name: event.target.value } }))} />
        <Input label="Contact email" type="email" value={draft.reporter.email} onChange={event => setDraft(value => ({ ...value, reporter: { ...value.reporter, email: event.target.value } }))} />
        <Input label="Contact phone (optional)" value={draft.reporter.phone} onChange={event => setDraft(value => ({ ...value, reporter: { ...value.reporter, phone: event.target.value } }))} />
        <Input label="Your city and state (optional)" value={[draft.reporter.city, draft.reporter.state].filter(Boolean).join(", ")} onChange={event => {
          const [city, ...stateParts] = event.target.value.split(",");
          setDraft(value => ({ ...value, reporter: { ...value.reporter, city: city.trim(), state: stateParts.join(",").trim() } }));
        }} />
        <Input label="State connected to the matter" value={draft.matter.state} onChange={event => setDraft(value => ({ ...value, matter: { ...value.matter, state: event.target.value } }))} />
        <Input label="County (optional)" value={draft.matter.county} onChange={event => setDraft(value => ({ ...value, matter: { ...value.matter, county: event.target.value } }))} />
        <Input label="Matter type" placeholder="Custody, divorce, guardianship, other" value={draft.matter.type} onChange={event => setDraft(value => ({ ...value, matter: { ...value.matter, type: event.target.value } }))} />
        <Input label="Year begun (optional)" inputMode="numeric" value={draft.matter.year} onChange={event => setDraft(value => ({ ...value, matter: { ...value.matter, year: event.target.value } }))} />
        <label htmlFor="matter-ongoing" className="block text-sm font-semibold text-white/85">Is it ongoing?
          <select id="matter-ongoing" value={draft.matter.ongoing} onChange={event => setDraft(value => ({ ...value, matter: { ...value.matter, ongoing: event.target.value as ReportKitDraft["matter"]["ongoing"] } }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40">
            <option value="unknown">Unknown / prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </label>
        <div className="sm:col-span-2"><TextArea label="Neutral 3-5 sentence summary" rows={5} help="Describe what record, bill, service, or statement concerns you and approximately when. Do not label anyone a criminal." value={draft.matter.summary} onChange={event => setDraft(value => ({ ...value, matter: { ...value.matter, summary: event.target.value } }))} /></div>
      </div>
    );
  }

  if (step === 2) {
    return <Repeater
      empty="No person or organization has been added. That is allowed if the records are not ready."
      addLabel="ADD PERSON OR ORGANIZATION"
      items={draft.people}
      onAdd={() => setDraft(value => ({ ...value, people: [...value.people, { id: makeReportKitId("person"), name: "", role: "", organization: "", documentedAction: "", supportingRecord: "" }] }))}
      onRemove={id => setDraft(value => ({ ...value, people: value.people.filter(item => item.id !== id) }))}
      render={(person, index) => <div className="grid gap-4 sm:grid-cols-2">
        <Input id={`person-${index}-name`} label="Name as it appears in the record" value={person.name} onChange={event => setDraft(value => ({ ...value, people: value.people.map(item => item.id === person.id ? { ...item, name: event.target.value } : item) }))} />
        <Input id={`person-${index}-role`} label="Role" value={person.role} onChange={event => setDraft(value => ({ ...value, people: value.people.map(item => item.id === person.id ? { ...item, role: event.target.value } : item) }))} />
        <Input id={`person-${index}-org`} label="Organization (optional)" value={person.organization} onChange={event => setDraft(value => ({ ...value, people: value.people.map(item => item.id === person.id ? { ...item, organization: event.target.value } : item) }))} />
        <Input id={`person-${index}-record`} label="Supporting record" value={person.supportingRecord} onChange={event => setDraft(value => ({ ...value, people: value.people.map(item => item.id === person.id ? { ...item, supportingRecord: event.target.value } : item) }))} />
        <div className="sm:col-span-2"><TextArea id={`person-${index}-action`} label="Documented action or role" rows={3} help="Example: Signed invoice dated 3/4/2025. Avoid conclusions about motive or guilt." value={person.documentedAction} onChange={event => setDraft(value => ({ ...value, people: value.people.map(item => item.id === person.id ? { ...item, documentedAction: event.target.value } : item) }))} /></div>
      </div>}
    />;
  }

  if (step === 3) {
    return <Repeater
      empty="Add at least one factual event."
      addLabel="ADD FACTUAL EVENT"
      items={draft.facts}
      onAdd={() => setDraft(value => ({ ...value, facts: [...value.facts, { id: makeReportKitId("fact"), date: "", what: "", sourceStatus: "", sourceDocument: "", storedAt: "", authenticity: "", contradiction: "" }] }))}
      onRemove={id => setDraft(value => ({ ...value, facts: value.facts.filter(item => item.id !== id) }))}
      render={(fact, index) => <div className="grid gap-4 sm:grid-cols-2">
        <Input id={`fact-${index}-date`} label="Date or approximate date" value={fact.date} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, date: event.target.value } : item) }))} />
        <label className="block text-sm font-semibold text-white/85">Source status
          <select id={`fact-${index}-status`} value={fact.sourceStatus} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, sourceStatus: event.target.value } : item) }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-white/15 bg-[#050A14] px-3 text-white outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/40">
            <option value="">Choose one...</option>{REPORT_KIT_SOURCE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2"><TextArea id={`fact-${index}-what`} label="What happened - facts only" rows={3} value={fact.what} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, what: event.target.value } : item) }))} /></div>
        <Input id={`fact-${index}-document`} label="Supporting record, or 'none yet'" value={fact.sourceDocument} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, sourceDocument: event.target.value } : item) }))} />
        <Input id={`fact-${index}-stored`} label="Where the record is stored" value={fact.storedAt} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, storedAt: event.target.value } : item) }))} />
        <Input id={`fact-${index}-auth`} label="How obtained / authenticity note" value={fact.authenticity} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, authenticity: event.target.value } : item) }))} />
        <Input id={`fact-${index}-contradiction`} label="Contradictory or missing record" value={fact.contradiction} onChange={event => setDraft(value => ({ ...value, facts: value.facts.map(item => item.id === fact.id ? { ...item, contradiction: event.target.value } : item) }))} />
      </div>}
    />;
  }

  if (step === 4) {
    return <div className="space-y-6"><Repeater
      empty="No payment or program item added. Do not infer federal funding without a record."
      addLabel="ADD PAYMENT OR PROGRAM ITEM"
      items={draft.money}
      onAdd={() => setDraft(value => ({ ...value, money: [...value.money, { id: makeReportKitId("money"), date: "", payer: "", payee: "", amount: "", service: "", fundingSource: "", delivered: "", supportingRecord: "" }] }))}
      onRemove={id => setDraft(value => ({ ...value, money: value.money.filter(item => item.id !== id) }))}
      render={(item, index) => <div className="grid gap-4 sm:grid-cols-2">
        {(["date", "payer", "payee", "amount", "service", "fundingSource", "delivered", "supportingRecord"] as const).map(key => <Input key={key} id={`money-${index}-${key}`} label={({ date: "Date", payer: "Who paid", payee: "Who received", amount: "Amount", service: "Service or charge", fundingSource: "Funding source or program", delivered: "What was actually delivered", supportingRecord: "Supporting record" } as const)[key]} value={item[key]} onChange={event => setDraft(value => ({ ...value, money: value.money.map(row => row.id === item.id ? { ...row, [key]: event.target.value } : row) }))} />)}
      </div>}
    />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextArea label="Financial harm" rows={3} value={draft.harm.financial} onChange={event => setDraft(value => ({ ...value, harm: { ...value.harm, financial: event.target.value } }))} />
        <TextArea label="Service or program harm" rows={3} value={draft.harm.service} onChange={event => setDraft(value => ({ ...value, harm: { ...value.harm, service: event.target.value } }))} />
        <div className="sm:col-span-2"><TextArea label="Other documented harm" rows={3} value={draft.harm.other} onChange={event => setDraft(value => ({ ...value, harm: { ...value.harm, other: event.target.value } }))} /></div>
      </div>
    </div>;
  }

  if (step === 5) {
    return <div className="space-y-3">{REPORT_KIT_ISSUES.map(issue => <label key={issue.id} className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 focus-within:ring-2 focus-within:ring-[#C9A227]">
      <input type="checkbox" checked={draft.issueIds.includes(issue.id)} onChange={event => setDraft(value => ({ ...value, issueIds: event.target.checked ? Array.from(new Set([...value.issueIds, issue.id])) : value.issueIds.filter(id => id !== issue.id) }))} className="mt-1 h-5 w-5 accent-[#C9A227]" />
      <span><strong className="block text-sm text-white">{issue.cite} - {issue.title}</strong><span className="mt-1 block text-xs leading-5 text-white/60">{issue.threshold}</span><a href={issue.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block min-h-6 text-xs font-bold underline underline-offset-4" style={{ color: GOLD }}>Read the official statute</a></span>
    </label>)}</div>;
  }

  if (step === 6) {
    return <div className="space-y-3">{REPORT_KIT_ROUTES.map(route => <label key={route.id} className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 focus-within:ring-2 focus-within:ring-[#C9A227]">
      <input type="checkbox" checked={draft.routeIds.includes(route.id)} onChange={event => setDraft(value => ({ ...value, routeIds: event.target.checked ? Array.from(new Set([...value.routeIds, route.id])) : value.routeIds.filter(id => id !== route.id) }))} className="mt-1 h-5 w-5 accent-[#C9A227]" />
      <span><strong className="block text-sm text-white">{route.name}</strong><span className="mt-1 block text-xs leading-5 text-white/65">{route.useWhen}</span><span className="mt-1 block text-xs leading-5 text-amber-100/70">{route.caution}</span><a href={route.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block min-h-6 text-xs font-bold underline underline-offset-4" style={{ color: GOLD }}>Open current official page</a></span>
    </label>)}</div>;
  }

  return <div className="space-y-5">
    <div className="rounded-xl border border-white/10 bg-[#050A14] p-4"><pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/75">{packet}</pre></div>
    <button type="button" onClick={() => {
      if (validateAndReport()) setStatus("Packet passed the required-field check. Read every line before submitting.");
    }} className="min-h-11 rounded-xl border border-emerald-400/40 bg-emerald-950/25 px-5 py-2.5 text-sm font-black text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300">RUN REQUIRED-FIELD CHECK</button>
    <Repeater
      empty="After filing, add the agency confirmation here so later supplements stay connected."
      addLabel="ADD SUBMISSION CONFIRMATION"
      items={draft.submissions}
      onAdd={() => setDraft(value => ({ ...value, submissions: [...value.submissions, { id: makeReportKitId("submission"), agency: "", date: "", reference: "", notes: "" }] }))}
      onRemove={id => setDraft(value => ({ ...value, submissions: value.submissions.filter(item => item.id !== id) }))}
      render={(submission, index) => <div className="grid gap-4 sm:grid-cols-2">
        <Input id={`submission-${index}-agency`} label="Agency" value={submission.agency} onChange={event => setDraft(value => ({ ...value, submissions: value.submissions.map(item => item.id === submission.id ? { ...item, agency: event.target.value } : item) }))} />
        <Input id={`submission-${index}-date`} label="Submission date" value={submission.date} onChange={event => setDraft(value => ({ ...value, submissions: value.submissions.map(item => item.id === submission.id ? { ...item, date: event.target.value } : item) }))} />
        <Input id={`submission-${index}-reference`} label="Confirmation or reference number" value={submission.reference} onChange={event => setDraft(value => ({ ...value, submissions: value.submissions.map(item => item.id === submission.id ? { ...item, reference: event.target.value } : item) }))} />
        <Input id={`submission-${index}-notes`} label="Notes or supplement status" value={submission.notes} onChange={event => setDraft(value => ({ ...value, submissions: value.submissions.map(item => item.id === submission.id ? { ...item, notes: event.target.value } : item) }))} />
      </div>}
    />
  </div>;
}

function Repeater<T extends { id: string }>({ items, empty, addLabel, onAdd, onRemove, render }: { items: T[]; empty: string; addLabel: string; onAdd: () => void; onRemove: (id: string) => void; render: (item: T, index: number) => React.ReactNode }) {
  return <div className="space-y-4">
    {!items.length ? <p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/55">{empty}</p> : null}
    {items.map((item, index) => <fieldset key={item.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <legend className="px-2 text-xs font-black uppercase tracking-wider" style={{ color: GOLD }}>Item {index + 1}</legend>
      {render(item, index)}
      <button type="button" onClick={() => onRemove(item.id)} className="mt-4 min-h-11 text-xs font-bold text-red-300 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-red-300">Remove item {index + 1}</button>
    </fieldset>)}
    <button type="button" onClick={onAdd} className="min-h-11 rounded-lg border border-[#C9A227]/50 px-4 py-2.5 text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#C9A227]" style={{ color: GOLD }}>{addLabel}</button>
  </div>;
}

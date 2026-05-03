"use client";

import { useState } from "react";
import { COURT_ACTOR_PUBLIC_THRESHOLD } from "../../../lib/court-actors";
import { isUnitedStatesCountry } from "../../../lib/survey-location";
import { US_JURISDICTIONS } from "../../../lib/us-jurisdictions";

const NAVY = "#1E3A5F";
const GOLD = "#C9A227";

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina",
  "Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados",
  "Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana",
  "Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon",
  "Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros",
  "Congo (Brazzaville)","Congo (Kinshasa)","Costa Rica","Croatia","Cuba","Cyprus",
  "Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt",
  "El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji",
  "Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada",
  "Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland",
  "India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan",
  "Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon",
  "Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi",
  "Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico",
  "Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
  "Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria",
  "North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania",
  "Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines",
  "Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia",
  "Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden",
  "Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo",
  "Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine",
  "United Arab Emirates","United Kingdom","Uruguay","Uzbekistan","Vanuatu","Vatican City",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

const DUE_PROCESS_OPTIONS = [
  "Perjury/False testimony by case workers or officials",
  "No Due Process Still waiting for a Hearing...",
  "Evidence was suppressed or ignored by the Judge",
  "Ex-parte communications (Judge spoke to other side without me)",
  "Denial of a timely hearing (constitutional violations)",
  "Tampering with court transcripts or records",
  "Unconstitutional Gag Orders (Preventing me from speaking out)",
  "None",
];

type FormData = {
  outside_us: string;
  outside_us_country: string;
  state: string;
  county: string;
  system: string;
  case_status: string;
  number_of_kids: string;
  duration: string;
  months_lost: string;
  lost_milestones_description: string;
  custody: string;
  pro_se: string;
  legal_rep: string;
  allegation: string;
  allegation_other_detail: string;
  allegation_root_cause: string;
  other_allegation_details: string;
  conflict_of_interest_awareness: string;
  conflict_description: string;
  federal_funding_influence: string;
  atty_fees: string;
  gal_fees: string;
  therapy_fees: string;
  reunif_fees: string;
  other_fees: string;
  lost_wages: string;
  asset_loss: string;
  quote: string;
  permission: string;
  first_name: string;
  last_name: string;
  email: string;
};

const EMPTY: FormData = {
  outside_us: "no",
  outside_us_country: "",
  state: "",
  county: "",
  system: "",
  case_status: "",
  number_of_kids: "",
  duration: "",
  months_lost: "",
  lost_milestones_description: "",
  custody: "",
  pro_se: "",
  legal_rep: "",
  allegation: "",
  allegation_other_detail: "",
  allegation_root_cause: "",
  other_allegation_details: "",
  conflict_of_interest_awareness: "",
  conflict_description: "",
  federal_funding_influence: "",
  atty_fees: "",
  gal_fees: "",
  therapy_fees: "",
  reunif_fees: "",
  other_fees: "",
  lost_wages: "",
  asset_loss: "",
  quote: "",
  permission: "anonymous",
  first_name: "",
  last_name: "",
  email: "",
};

const STEP_LABELS = ["Location", "Case Details", "Financial Impact", "Your Story"];

function CurrencyInput({ label, name, value, onChange, hint }: {
  label: string; name: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: NAVY }}>
        {label}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: GOLD }}>$</span>
        <input
          type="number" min="0" step="1"
          name={name} value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
          className="w-full border rounded-lg pl-7 pr-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none"
          style={{ border: `1.5px solid #E5E7EB` }}
          onFocus={e => (e.currentTarget.style.border = `1.5px solid ${GOLD}`)}
          onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
        />
      </div>
    </div>
  );
}

const STORAGE_VERSION = "v2";
const STORAGE_FORM   = `swm-survey-form-${STORAGE_VERSION}`;
const STORAGE_DPC    = `swm-survey-dpc-${STORAGE_VERSION}`;
const STORAGE_ACTORS = `swm-survey-actors-${STORAGE_VERSION}`;
const ACTOR_NOTE_MIN_CHARS = 12;

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function SubmitPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(() => readStorage<FormData>(STORAGE_FORM, EMPTY));
  const [dueProcessChecklist, setDueProcessChecklist] = useState<string[]>(
    () => readStorage<string[]>(STORAGE_DPC, [])
  );
  const [courtActors, setCourtActors] = useState<Array<{ role: string; name: string; court: string; notes: string }>>(
    () => readStorage<Array<{ role: string; name: string; court: string; notes: string }>>(STORAGE_ACTORS, [])
  );
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(f: keyof FormData, v: string) {
    setForm(prev => {
      const next = { ...prev, [f]: v };
      try { sessionStorage.setItem(STORAGE_FORM, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function toggleDueProcess(option: string) {
    setDueProcessChecklist(prev => {
      const next = prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option];
      try { sessionStorage.setItem(STORAGE_DPC, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function persistActors(next: Array<{ role: string; name: string; court: string; notes: string }>) {
    try { sessionStorage.setItem(STORAGE_ACTORS, JSON.stringify(next)); } catch {}
    return next;
  }
  function addActor() {
    setCourtActors(prev => persistActors([...prev, { role: "", name: "", court: "", notes: "" }]));
  }
  function updateActor(idx: number, field: "role" | "name" | "court" | "notes", value: string) {
    setCourtActors(prev => persistActors(prev.map((a, i) => i === idx ? { ...a, [field]: value } : a)));
  }
  function removeActor(idx: number) {
    setCourtActors(prev => persistActors(prev.filter((_, i) => i !== idx)));
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(STORAGE_FORM);
      sessionStorage.removeItem(STORAGE_DPC);
      sessionStorage.removeItem(STORAGE_ACTORS);
    } catch {}
    setForm(EMPTY);
    setDueProcessChecklist([]);
    setCourtActors([]);
    setStep(0);
    setSubmittedId(null);
  }

  function bind(name: keyof FormData) {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        set(name, e.target.value),
      style: { border: "1.5px solid #E5E7EB" },
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        (e.currentTarget.style.border = "1.5px solid #B91C1C"),
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        (e.currentTarget.style.border = "1.5px solid #E5E7EB"),
      className: "w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none",
    };
  }

  const outsideUS = form.outside_us === "yes";
  // Mirrors server-side validation in app/api/survey/route.ts. Broken up by
  // step so the user sees every missing field on a step together before
  // moving on, not one-at-a-time and not all at the end.
  function validateStep(stepIndex: number): string | null {
    const missing: string[] = [];

    if (stepIndex === 0) {
      if (outsideUS) {
        const country = form.outside_us_country.trim();
        if (!country) missing.push("Country");
        else if (isUnitedStatesCountry(country)) {
          return "If your case is in the United States, choose \"I am in the United States\" and select your state.";
        }
      } else {
        if (!form.state) missing.push("State of occurrence");
      }
      if (!form.county.trim()) missing.push("County");
    }

    if (stepIndex === 1) {
      if (!form.case_status)              missing.push("Case status");
      if (form.number_of_kids === ""
          || isNaN(parseInt(form.number_of_kids, 10))
          || parseInt(form.number_of_kids, 10) < 0
          || parseInt(form.number_of_kids, 10) > 20) missing.push("Number of children involved in this case (0-20)");
      if (!form.system)                   missing.push("System affected");
      if (!form.duration)                 missing.push("Time in system");
      if (!form.custody)                  missing.push("Custody status");
      if (!form.pro_se)                   missing.push("Pro Se / attorney status");
      if (!form.legal_rep)                missing.push("Legal representation history");
      if (!form.allegation)               missing.push("Primary nature of allegations");
      if (dueProcessChecklist.length === 0) missing.push("Due process & fraud checklist (at least one)");
      if (!form.conflict_of_interest_awareness) missing.push("Conflict of interest awareness");
      courtActors.forEach((actor, idx) => {
        const hasAnyActorField = Boolean(
          actor.role.trim() ||
          actor.name.trim() ||
          actor.court.trim() ||
          actor.notes.trim()
        );
        if (!hasAnyActorField) return;
        if (!actor.role.trim()) missing.push(`Court actor #${idx + 1} role`);
        if (!actor.name.trim()) missing.push(`Court actor #${idx + 1} name`);
        if (actor.notes.trim().length < ACTOR_NOTE_MIN_CHARS) {
          missing.push(`Court actor #${idx + 1} reason/note`);
        }
      });
    }

    if (stepIndex === 3) {
      if (!form.quote.trim())             missing.push("Impact quote");
      if (!form.permission)               missing.push("Permission to share");
      if (!form.first_name.trim())        missing.push("First name");
      if (!form.last_name.trim())         missing.push("Last name");
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        missing.push("A valid email address");
      }
    }

    if (missing.length === 0) return null;
    if (missing.length === 1) return `${missing[0]} is required.`;
    return `Please complete: ${missing.join(", ")}.`;
  }

  function advanceTo(next: number) {
    const err = validateStep(step);
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    setStep(next);
  }

  async function handleSubmit() {
    const validationError = validateStep(3);
    if (validationError) {
      setError(validationError);
      return; // error banner is right above the Submit button
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // location
          outside_us:          outsideUS,
          state_of_occurrence: outsideUS ? null : (form.state || null),
          outside_us_country:  outsideUS ? (form.outside_us_country.trim() || null) : null,
          // case details
          case_county:       form.county,
          case_status:       form.case_status,
          number_of_kids:    form.number_of_kids !== "" ? parseInt(form.number_of_kids, 10) : null,
          system_affected:   form.system,
          time_in_system:    form.duration,
          custody_status:    form.custody,
          is_pro_se:         form.pro_se === "yes",
          legal_rep_history: form.legal_rep,
          // allegation fields
          allegation_type:          form.allegation,
          allegation_other_detail:  form.allegation === "Other" ? (form.allegation_other_detail.trim() || null) : null,
          allegation_root_cause:    form.allegation_root_cause.trim() || null,
          due_process_checklist:    dueProcessChecklist,
          other_allegation_details: form.other_allegation_details.trim() || null,
          // conflict
          conflict_of_interest_awareness: form.conflict_of_interest_awareness,
          conflict_description: form.conflict_of_interest_awareness === "Yes"
            ? (form.conflict_description.trim() || null)
            : null,
          // court actors — filtered so empty rows don't get sent
          court_actors: courtActors
            .filter(a => a.role.trim() && a.name.trim() && a.notes.trim())
            .map(a => ({
              role:  a.role.trim(),
              name:  a.name.trim(),
              court: a.court.trim() || null,
              notes: a.notes.trim() || null,
            })),
          // stolen time
          months_lost_parenting_time:  form.months_lost ? parseInt(form.months_lost, 10) : null,
          lost_milestones_description: form.lost_milestones_description.trim() || null,
          // financials
          attorney_fees:           form.atty_fees    ? parseFloat(form.atty_fees)    : null,
          gal_fees:                form.gal_fees     ? parseFloat(form.gal_fees)     : null,
          therapy_eval_fees:       form.therapy_fees ? parseFloat(form.therapy_fees) : null,
          reunification_fees:      form.reunif_fees  ? parseFloat(form.reunif_fees)  : null,
          other_court_actors_fees: form.other_fees   ? parseFloat(form.other_fees)   : null,
          lost_wages:              form.lost_wages   ? parseFloat(form.lost_wages)   : null,
          asset_liquidation_loss:  form.asset_loss   ? parseFloat(form.asset_loss)   : null,
          // story
          impact_quote:        form.quote,
          permission_to_share: form.permission,
          first_name:          form.first_name,
          last_name:           form.last_name,
          email:               form.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Submission failed."); setSubmitting(false); return; }
      try { sessionStorage.removeItem(STORAGE_FORM); sessionStorage.removeItem(STORAGE_DPC); sessionStorage.removeItem(STORAGE_ACTORS); } catch {}
      // Auto-grant /actors access for the new submitter — they shouldn't have to
      // re-prove they submitted by re-entering their email on the actors gate.
      try {
        localStorage.setItem("swm_actors_access", JSON.stringify({
          email: form.email.trim().toLowerCase(),
          submission_id: data.id,
          first_name: form.first_name,
          granted_at: new Date().toISOString(),
        }));
      } catch { /* localStorage unavailable */ }
      setSubmittedId(data.id);
      setStep(4);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const labelCls = "block text-xs font-bold uppercase tracking-wide mb-1.5";
  const textareaCls = "w-full rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none resize-none";
  const borderDefault = { border: "1.5px solid #E5E7EB" };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden" style={{ minHeight: 260 }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/swm/meg-hero.png')",
            backgroundSize: "cover",
            backgroundPosition: "center 20%",
          }}
        />
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(15,30,50,0.78)" }} />
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: GOLD }} />

        <div className="relative z-10 max-w-2xl mx-auto px-8 py-10">
          <a href="https://standwithmeg.com"
            className="inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors"
            style={{ color: "rgba(201,162,39,0.8)" }}>
            ← StandWithMeg.com
          </a>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-xs font-black uppercase tracking-widest text-white opacity-70">Stand With Meg</div>
          </div>

          <h1 className="text-3xl font-black text-white leading-tight mb-3">
            Share Your Story.
          </h1>
          <p className="text-sm leading-relaxed max-w-lg" style={{ color: "rgba(245,245,245,0.7)" }}>
            Families across this country are losing children, life savings, and years — to a system
            that rarely gets documented. Your experience, however you choose to share it, becomes
            part of the national record. Every submission strengthens the case for change.
          </p>

          {/* Trust strip */}
          <div className="flex flex-wrap gap-5 mt-6">
            {["Anonymous option available", "No account required", "Data never sold", "Used for advocacy only"].map(t => (
              <div key={t} className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(201,162,39,0.85)" }}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gold bar */}
      <div className="h-1 w-full" style={{ backgroundColor: GOLD }} />

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* ── Step Progress ── */}
        {step < 4 && (
          <div className="flex items-center gap-2 mb-8">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (i < step) setStep(i); }}
                  disabled={i >= step}
                  className="flex items-center gap-2 disabled:cursor-default"
                  style={{ background: "none", border: "none", padding: 0 }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all"
                    style={
                      i < step
                        ? { backgroundColor: GOLD, color: NAVY, cursor: "pointer" }
                        : i === step
                        ? { backgroundColor: "#B91C1C", color: "white" }
                        : { backgroundColor: "#E5E7EB", color: "#9CA3AF" }
                    }
                  >
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span
                    className="text-xs font-semibold hidden sm:inline"
                    style={{
                      color: i === step ? NAVY : i < step ? GOLD : "#9CA3AF",
                      cursor: i < step ? "pointer" : "default",
                    }}
                  >
                    {label}
                  </span>
                </button>
                {i < STEP_LABELS.length - 1 && (
                  <div className="w-8 h-px" style={{ backgroundColor: i < step ? GOLD : "#D1D5DB" }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Form Card ── */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm"
          style={{ border: `1px solid #E5E7EB`, borderTop: `3px solid #B91C1C` }}>

          {/* Step heading bar */}
          {step < 4 && (
            <div className="px-8 pt-7 pb-0">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-1 h-6 rounded-full bg-red-700" />
                <h2 className="text-xl font-black" style={{ color: NAVY }}>
                  {step === 0 ? "Where did this happen?" :
                   step === 1 ? "Tell us about your case." :
                   step === 2 ? "What did it cost you?" :
                   "Your words."}
                </h2>
              </div>
              <p className="text-sm text-gray-400 ml-4 mb-6">
                {step === 0 ? "We map data by location to show where families are most affected." :
                 step === 1 ? "All fields optional unless marked required. Share only what you're comfortable with." :
                 step === 2 ? "These numbers document the financial reality of family court. Approximate totals are fine." :
                 "A direct quote — in your words — is the most powerful thing we can publish."}
              </p>
            </div>
          )}

          <div className="px-8 pb-8 space-y-5">

            {/* ── Step 0: Location ── */}
            {step === 0 && (
              <>
                {/* Outside US toggle */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Where are you located? <span className="text-red-700">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 mt-1">
                    {[["no", "I am in the United States, D.C., or a U.S. territory"], ["yes", "I am outside the United States"]].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input
                          type="radio"
                          name="outside_us"
                          value={v}
                          checked={form.outside_us === v}
                          onChange={() => {
                            set("outside_us", v);
                            if (v === "yes") set("state", "");
                            if (v === "no") set("outside_us_country", "");
                          }}
                          className="w-4 h-4"
                          style={{ accentColor: "#B91C1C" }}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                {/* US state — shown when not outside US */}
                {!outsideUS && (
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>
                      State / District / U.S. territory <span className="text-red-700">*</span>
                    </label>
                    <select {...bind("state")}>
                      <option value="">Select your location</option>
                      {US_JURISDICTIONS.map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Country — shown when outside US */}
                {outsideUS && (
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>
                      Country <span className="text-red-700">*</span>
                    </label>
                    <input
                      type="text"
                      list="swm-countries"
                      placeholder="Start typing your country (e.g., Canada, United Kingdom, Australia)"
                      value={form.outside_us_country}
                      onChange={e => set("outside_us_country", e.target.value)}
                      className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none"
                      style={{ border: "1.5px solid #E5E7EB" }}
                      onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                      onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                      autoComplete="off"
                    />
                    <datalist id="swm-countries">
                      {COUNTRIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                )}

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                  {outsideUS ? "Province / Region / District" : "County / Parish / Borough"} <span className="text-red-700">*</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-1">
                    {outsideUS
                      ? "Enter the local area name that best fits your country (e.g., province, region, district, or county)."
                      : "County, parish, borough, or local court area (not country)"}
                  </p>
                  <input
                    type="text"
                    placeholder={outsideUS ? "e.g. Ontario, West Midlands, Île-de-France" : "e.g. Johnson County"}
                    {...bind("county")}
                  />
                </div>

                {error && (
                  <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700"
                    style={{ backgroundColor: "rgba(185,28,28,0.06)", border: "1.5px solid #B91C1C" }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={() => advanceTo(1)}
                  className="w-full py-3.5 rounded-xl font-black text-sm tracking-wide text-white transition-colors bg-red-700 hover:bg-red-600"
                >
                  Continue →
                </button>
              </>
            )}

            {/* ── Step 1: Case Details ── */}
            {step === 1 && (
              <>
                {error && (
                  <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700"
                    style={{ backgroundColor: "rgba(185,28,28,0.06)", border: "1.5px solid #B91C1C" }}>
                    {error}
                  </div>
                )}

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    System involved <span className="text-red-700">*</span>
                  </label>
                  <select {...bind("system")}>
                    <option value="">Select one</option>
                    <option value="Family Court Only">Family Court Only</option>
                    <option value="CPS (Child Protective Services) Only">Child welfare / child protection agency Only</option>
                    <option value="Both Family Court and CPS">Both Family Court and child welfare / child protection agency</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Case status <span className="text-red-700">*</span>
                  </label>
                  <select {...bind("case_status")}>
                    <option value="">Select one</option>
                    <option value={'Currently involved / "Stuck"'}>I am currently stuck in an active case (prolonged, delayed, or no resolution)</option>
                    <option value="Active - Progress">I am currently in an active case (progress is being made)</option>
                    <option value="Case closed (within the last 2 years)">Case closed (within the last 2 years)</option>
                    <option value="Case closed (more than 2 years ago)">Case closed (more than 2 years ago)</option>
                    <option value="Experienced as a child">I experienced this as a child in Family Court or child welfare / child protection agency</option>
                    <option value="Not in court but still affected">I am not currently in court but still affected</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    If children are involved in this case, how many? <span className="text-red-700">*</span>
                  </label>
                  <input type="number" min="0" max="20" step="1" placeholder="e.g. 2" {...bind("number_of_kids")} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>
                      How long &ldquo;in the system&rdquo;? <span className="text-red-700">*</span>
                    </label>
                    <select {...bind("duration")}>
                      <option value="">Select one</option>
                      <option value="Less than 6 months">Less than 6 months</option>
                      <option value="6 months – 1 year">6 months – 1 year</option>
                      <option value="1 – 3 years">1 – 3 years</option>
                      <option value="3 – 5 years">3 – 5 years</option>
                      <option value="5 – 10 years">5 – 10 years</option>
                      <option value="Over 10 years">Over 10 years</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>Total months of lost parenting time</label>
                    <input type="number" min="0" placeholder="e.g. 18" {...bind("months_lost")} />
                    <p className="text-xs text-gray-400 mt-1">Approximately how many total MONTHS have you been deprived of normal parenting time with your children?</p>
                  </div>
                </div>

                {/* Lost milestones — conditional companion to months_lost */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Description of Lost Milestones{" "}
                    <span className="text-gray-300 font-normal normal-case tracking-normal text-xs">(optional)</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-1">
                    Milestones Missed: What specific moments or milestones (birthdays, holidays, first steps) were stolen from you during this time?
                  </p>
                  <textarea
                    rows={3}
                    value={form.lost_milestones_description}
                    onChange={e => set("lost_milestones_description", e.target.value)}
                    className={textareaCls}
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Current Custody Status <span className="text-red-700">*</span>
                  </label>
                  <select {...bind("custody")}>
                    <option value="">Select one</option>
                    <option value="Full Custody">Full Custody</option>
                    <option value="50/50 Joint">50/50 Joint</option>
                    <option value="Visitation Only">Visitation Only</option>
                    <option value="No Contact / Total Loss of Access">No Contact / Total Loss of Access</option>
                    <option value="Children in Foster Care">Children in Foster Care</option>
                    <option value="Adopted Out (Rights Terminated)">Adopted Out (Rights Terminated)</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>Are you representing yourself (Pro Se)? <span className="text-red-700">*</span></label>
                  <div className="flex flex-col gap-2 mt-1">
                    {[
                      ["yes", "Yes, I am Pro Se (Representing myself)"],
                      ["no",  "No, I have an attorney"],
                    ].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input type="radio" name="pro_se" value={v}
                          checked={form.pro_se === v}
                          onChange={() => set("pro_se", v)}
                          className="w-4 h-4"
                          style={{ accentColor: "#B91C1C" }}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>Legal Representation History <span className="text-red-700">*</span></label>
                  <select {...bind("legal_rep")}>
                    <option value="">Select one</option>
                    <option value="I have always had an attorney">I have always had an attorney</option>
                    <option value="I had an attorney, but ran out of money/resources (Now Pro Se)">I had an attorney, but ran out of money/resources (Now Pro Se)</option>
                    <option value="I have always been Pro Se by choice">I have always been Pro Se by choice</option>
                    <option value="I have always been Pro Se because I couldn't afford a lawyer">I have always been Pro Se because I couldn&apos;t afford a lawyer</option>
                  </select>
                </div>

                {/* ── Allegations ── */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Primary Nature of Allegations/Intervention <span className="text-red-700">*</span>
                  </label>
                  <select {...bind("allegation")}>
                    <option value="">Select one</option>
                    <option value="Family Court False Accusations (Domestic Violence/Abuse/Alienation)">Family Court False Accusations (Domestic Violence/Abuse/Alienation)</option>
                    <option value="Medical CPS (Medical Child Abuse allegations, disagreement with doctors)">Medical child welfare / child protection agency (Medical Child Abuse allegations, disagreement with doctors)</option>
                    <option value="False Accusations CPS (Non-Medical) (Vengeful ex-partner, malicious report)">False Accusations — child welfare / child protection agency (Non-Medical) (Vengeful ex-partner, malicious report)</option>
                    <option value="High Conflict Divorce">High Conflict Divorce</option>
                    <option value="Social Media Retaliation">Social Media Retaliation</option>
                    <option value="Educational Neglect">Educational Neglect</option>
                    <option value="Environmental/Poverty-Related (Lack of housing, utilities, etc.)">Environmental/Poverty-Related (Lack of housing, utilities, etc.)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Conditional: Other allegation short answer */}
                {form.allegation === "Other" && (
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>
                      Please describe <span className="text-red-700">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Briefly describe the nature of the allegation"
                      {...bind("allegation_other_detail")}
                    />
                  </div>
                )}

                {/* Allegation root cause */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Briefly describe the root cause of the initial intervention{" "}
                    <span className="text-gray-300 font-normal normal-case tracking-normal text-xs">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.allegation_root_cause}
                    onChange={e => set("allegation_root_cause", e.target.value)}
                    className={textareaCls}
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                {/* ── Due Process & Fraud Checklist ── */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Due Process &amp; Fraud Checklist <span className="text-red-700">*</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Select all that apply. At least one selection is required. If none apply, select <strong>None</strong>.
                  </p>
                  <div className="space-y-2">
                    {DUE_PROCESS_OPTIONS.map(option => (
                      <label key={option} className="flex items-start gap-3 cursor-pointer text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={dueProcessChecklist.includes(option)}
                          onChange={() => toggleDueProcess(option)}
                          className="w-4 h-4 mt-0.5 flex-shrink-0"
                          style={{ accentColor: "#B91C1C" }}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Other allegation details */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Other Allegation Details{" "}
                    <span className="text-gray-300 font-normal normal-case tracking-normal text-xs">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.other_allegation_details}
                    onChange={e => set("other_allegation_details", e.target.value)}
                    className={textareaCls}
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                {/* ── Conflict of Interest ── */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Are you aware of any personal, professional, or financial relationships between the Judge, Attorneys, or Evaluators that were not disclosed in your case? <span className="text-red-700">*</span>
                  </label>
                  <div className="flex gap-4 mt-1">
                    {[["Yes", "Yes"], ["No", "No"], ["Unsure", "Unsure"]].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input type="radio" name="conflict_of_interest_awareness" value={v}
                          checked={form.conflict_of_interest_awareness === v}
                          onChange={() => set("conflict_of_interest_awareness", v)}
                          className="w-4 h-4"
                          style={{ accentColor: "#B91C1C" }}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Conditional: conflict description */}
                {form.conflict_of_interest_awareness === "Yes" && (
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>
                      If Yes, please briefly describe the nature of the conflict.{" "}
                      <span className="text-gray-300 font-normal normal-case tracking-normal text-xs">(optional)</span>
                    </label>
                    <p className="text-xs text-gray-400 mb-1">(e.g., the Judge and Attorney are in the same private firm)</p>
                    <textarea
                      rows={3}
                      value={form.conflict_description}
                      onChange={e => set("conflict_description", e.target.value)}
                      className={textareaCls}
                      style={borderDefault}
                      onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                      onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                    />
                  </div>
                )}

                {/* ── Court Actors ── */}
                <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(201,162,39,0.06)", border: `1px solid rgba(201,162,39,0.25)` }}>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Name the Court Actors involved in your case{" "}
                    <span className="text-gray-300 font-normal normal-case tracking-normal text-xs">(optional)</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Add any judges, attorneys, GALs, evaluators, therapists, CPS workers, or others involved in your case.
                    Your identity stays private. A name only appears publicly once it has been independently reported by <strong>{COURT_ACTOR_PUBLIC_THRESHOLD} different families</strong>.
                    Anything you add here is visible to Stand With Meg admins for pattern research. If you add a court actor,
                    please include one short factual sentence about what happened. It can be harmful, neutral, or positive.
                  </p>

                  {courtActors.length === 0 && (
                    <p className="text-xs italic text-gray-400 mb-3">No court actors added yet.</p>
                  )}

                  {courtActors.map((actor, i) => (
                    <div key={i} className="rounded-lg p-3 mb-3 bg-white" style={{ border: "1px solid #E5E7EB" }}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Actor #{i + 1}</span>
                        <button type="button" onClick={() => removeActor(i)}
                          className="text-xs text-red-700 hover:text-red-900 font-semibold">
                          Remove
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 mb-2">
                        <select value={actor.role} onChange={e => updateActor(i, "role", e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                          style={{ border: "1px solid #E5E7EB" }}>
                          <option value="">Role…</option>
                          <option value="Judge">Judge</option>
                          <option value="Attorney (Mine)">Attorney (Mine)</option>
                          <option value="Attorney (Opposing)">Attorney (Opposing)</option>
                          <option value="GAL / Child Representative">GAL / Child Representative</option>
                          <option value="Custody Evaluator">Custody Evaluator</option>
                          <option value="Psychological Evaluator">Psychological Evaluator</option>
                          <option value="CPS Worker">CPS Worker</option>
                          <option value="Therapist / Counselor">Therapist / Counselor</option>
                          <option value="Mediator">Mediator</option>
                          <option value="Reunification Therapist">Reunification Therapist</option>
                          <option value="Other">Other</option>
                        </select>
                        <input type="text" placeholder="Name" value={actor.name}
                          onChange={e => updateActor(i, "name", e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                          style={{ border: "1px solid #E5E7EB" }} />
                      </div>
                      <input type="text" placeholder="Court or County (optional)" value={actor.court}
                        onChange={e => updateActor(i, "court", e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white mb-2"
                        style={{ border: "1px solid #E5E7EB" }} />
                      <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                        What happened with this court actor?
                        {(actor.role.trim() || actor.name.trim() || actor.court.trim() || actor.notes.trim()) && (
                          <span className="text-red-700"> *</span>
                        )}
                      </label>
                      <textarea rows={3}
                        placeholder="Required: one short factual sentence. Example: denied my motion without a hearing, ignored evidence, delayed reunification, or handled one issue fairly."
                        value={actor.notes}
                        onChange={e => updateActor(i, "notes", e.target.value)}
                        minLength={ACTOR_NOTE_MIN_CHARS}
                        required
                        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white resize-none"
                        style={{ border: "1px solid #E5E7EB" }} />
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                        Required for each listed actor. Do not include private details about your children or case number.
                        Your name/email will not be published with this actor report.
                      </p>
                    </div>
                  ))}

                  <button type="button" onClick={addActor}
                    className="w-full py-2.5 rounded-lg text-sm font-bold tracking-wide transition-colors"
                    style={{ backgroundColor: "rgba(30,58,95,0.08)", color: NAVY, border: `1.5px dashed rgba(30,58,95,0.3)` }}>
                    + Add a Court Actor
                  </button>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setError(null); setStep(0); }}
                    className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors text-gray-600 hover:bg-gray-50"
                    style={{ border: `1.5px solid #E5E7EB` }}>
                    ← Back
                  </button>
                  <button onClick={() => advanceTo(2)}
                    className="flex-1 py-3 rounded-xl font-black text-sm text-white bg-red-700 hover:bg-red-600 transition-colors">
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* ── Step 2: Financial ── */}
            {step === 2 && (
              <>
                <div className="rounded-xl p-4 text-sm leading-relaxed"
                  style={{ backgroundColor: "rgba(201,162,39,0.08)", border: `1px solid rgba(201,162,39,0.3)`, color: NAVY }}>
                  <strong>Why this matters:</strong> The financial data collected here is aggregated into
                  state and national reports. It documents the economic reality of family court — and
                  strengthens the case for systemic reform.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <CurrencyInput label="Attorney Fees" name="atty_fees" value={form.atty_fees} onChange={v => set("atty_fees", v)} hint="Total paid to all private counsels." />
                  <CurrencyInput label="GAL / Child Representative Fees" name="gal_fees" value={form.gal_fees} onChange={v => set("gal_fees", v)} hint="Fees paid to the Guardian ad Litem or AMC" />
                  <CurrencyInput label="Therapy / Evaluations Fees" name="therapy_fees" value={form.therapy_fees} onChange={v => set("therapy_fees", v)} hint='Forced psych evals, "coaching," or supervised therapy.' />
                  <CurrencyInput label="Reunification Service Fees" name="reunif_fees" value={form.reunif_fees} onChange={v => set("reunif_fees", v)} hint="Supervised visitation or required parenting classes." />
                  <CurrencyInput label="Lost Wages" name="lost_wages" value={form.lost_wages} onChange={v => set("lost_wages", v)} hint="Estimated income lost due to missing work for the system" />
                  <CurrencyInput label="Asset Liquidation &amp; Property Loss" name="asset_loss" value={form.asset_loss} onChange={v => set("asset_loss", v)} hint="Estimate the total value of physical assets lost or sold due to this case (e.g., home, vehicles, land, or retirement accounts)." />
                  <CurrencyInput label="Other Court Actors Fees" name="other_fees" value={form.other_fees} onChange={v => set("other_fees", v)} hint="Parent coordinators, private PIs, or expert witnesses." />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setStep(1)}
                    className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors text-gray-600 hover:bg-gray-50"
                    style={{ border: `1.5px solid #E5E7EB` }}>
                    ← Back
                  </button>
                  <button onClick={() => setStep(3)}
                    className="flex-1 py-3 rounded-xl font-black text-sm text-white bg-red-700 hover:bg-red-600 transition-colors">
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* ── Step 3: Story & Permission ── */}
            {step === 3 && (
              <>
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    In one quote (1–2 sentences), describe what this system has done to you and your family. <span className="text-red-700">*</span>
                  </label>
                  <textarea
                    value={form.quote}
                    onChange={e => set("quote", e.target.value)}
                    rows={5}
                    placeholder="In your own words — what happened, what it cost you, what you want people to know."
                    className={textareaCls}
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>Permission to Share <span className="text-red-700">*</span></label>
                  <div className="space-y-2.5 mt-2">
                    {[
                      ["anonymous",  "Use my quote anonymously for the project.",          "e.g. \"— Anonymous, Kansas\""],
                      ["first_name", "Use my quote with my first name only.",              "e.g. \"— Sarah, Kansas\""],
                      ["data_only",  "For data purposes only (Do not share publicly).",    "Your story informs the data but won't be published."],
                      ["public",     "Share away! I consent to the public use of all information provided.", "Your full name and story may be published."],
                    ].map(([value, label, example]) => (
                      <label
                        key={value}
                        className="flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                        style={
                          form.permission === value
                            ? { border: `2px solid #B91C1C`, backgroundColor: "rgba(185,28,28,0.04)" }
                            : { border: "2px solid #E5E7EB", backgroundColor: "white" }
                        }
                      >
                        <input type="radio" name="permission" value={value}
                          checked={form.permission === value}
                          onChange={() => set("permission", value)}
                          className="mt-0.5 w-4 h-4"
                          style={{ accentColor: "#B91C1C" }}
                        />
                        <div>
                          <div className="font-bold text-sm text-gray-800">{label}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{example}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>First Name <span className="text-red-700">*</span></label>
                  <input type="text" placeholder="First name"
                    value={form.first_name}
                    onChange={e => set("first_name", e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none"
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Last Name <span className="text-red-700">*</span>
                  </label>
                  <input type="text" placeholder="Last name"
                    value={form.last_name}
                    onChange={e => set("last_name", e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none"
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Email <span className="text-red-700">*</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-1">Your email (For verification and case updates only)</p>
                  <input type="email" placeholder="your@email.com"
                    value={form.email}
                    onChange={e => set("email", e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none"
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                {error && (
                  <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700"
                    style={{ backgroundColor: "rgba(185,28,28,0.06)", border: "1.5px solid #B91C1C" }}>
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setStep(2)} disabled={submitting}
                    className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    style={{ border: `1.5px solid #E5E7EB` }}>
                    ← Back
                  </button>
                  <button onClick={handleSubmit} disabled={submitting}
                    className="flex-1 py-3.5 rounded-xl font-black text-sm text-white bg-red-700 hover:bg-red-600 transition-colors disabled:opacity-40">
                    {submitting ? "Submitting..." : "Submit My Story"}
                  </button>
                </div>

                <p className="text-xs text-gray-400 text-center pt-1">
                  No account required. Your data is never sold. Request removal anytime using your submission ID.
                </p>
              </>
            )}

            {/* ── Step 4: Confirmation ── */}
            {step === 4 && (
              <div className="space-y-0 py-2">

                {/* ── Header: registered ── */}
                <div className="text-center px-2 pt-4 pb-6"
                  style={{ borderBottom: `1px solid #F0F0F0` }}>
                  <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(201,162,39,0.12)", border: `2px solid ${GOLD}` }}>
                      <svg className="w-7 h-7" fill="none" stroke={GOLD} viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GOLD }}>
                    Case Successfully Registered
                  </p>
                  <h2 className="text-2xl font-black leading-tight mb-3" style={{ color: NAVY }}>
                    Thank you for having the courage to speak out.
                  </h2>
                  <p className="text-sm leading-relaxed text-gray-500 max-w-md mx-auto">
                    Your story has now been added to the Stand With Meg Family Rights Registry.
                    Every submission helps document what families are living through and strengthens
                    the public record we are building together.
                  </p>
                </div>

                {/* ── Submission ID ── */}
                {submittedId && (
                  <div className="px-2 py-5" style={{ borderBottom: `1px solid #F0F0F0` }}>
                    <div className="rounded-xl p-4"
                      style={{ backgroundColor: "rgba(30,58,95,0.04)", border: `1px solid rgba(30,58,95,0.12)` }}>
                      <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: NAVY }}>
                        Your Submission ID
                      </p>
                      <code className="text-xs font-mono text-gray-600 break-all">{submittedId}</code>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Save this ID. You can use it to request removal of your submission at any time.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Court Actor Registry — primary next step. Fresh submitters
                    just named actors on their case; this lets them immediately
                    see whether anyone else has named the same person, and
                    "claim" any matches with one tap. localStorage was already
                    set above so the gate is auto-passed. ── */}
                <div className="px-2 py-6 rounded-xl mx-0"
                  style={{ borderBottom: `1px solid #F0F0F0`, backgroundColor: "rgba(201,162,39,0.06)" }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GOLD }}>
                    Now: Check the Court Actor Registry
                  </p>
                  <h3 className="text-base font-black mb-2" style={{ color: NAVY }}>
                    See who else named the same judges, GALs, or attorneys.
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-500 mb-4">
                    Every court actor named by Stand With Meg families is now listed in one searchable registry.
                    When 3+ families independently name the same person, their name goes public.
                    You may recognize names from your own case &mdash; and you can add yourself to those reports with one tap.
                  </p>
                  <a
                    href="/actors"
                    className="inline-block w-full text-center py-3.5 rounded-xl font-black text-sm transition-colors"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Browse the Court Actor Registry &rarr;
                  </a>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                    You&rsquo;re already signed in &mdash; the registry will open without asking for your email again.
                  </p>
                </div>

                {/* ── State Data Packet ── */}
                <div className="px-2 py-6" style={{ borderBottom: `1px solid #F0F0F0` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: NAVY }}>
                    Does Your State Have a Data Packet Yet?
                  </p>
                  <p className="text-sm leading-relaxed text-gray-500 mb-4">
                    Thanks to submissions like yours, we are building public-facing Family Court Data
                    Packets by state. If your state already has a report available, you can request it below.
                    If your state is not listed yet, your submission helps move it closer.
                  </p>
                  <a
                    href="/report"
                    className="inline-block w-full text-center py-3 rounded-xl font-black text-sm transition-colors"
                    style={{ backgroundColor: "rgba(30,58,95,0.06)", border: `1.5px solid ${NAVY}`, color: NAVY }}
                  >
                    View State Reports and Dashboard &rarr;
                  </a>
                </div>

                {/* ── Donation ── */}
                <div className="px-2 py-6 rounded-xl mx-0"
                  style={{ borderBottom: `1px solid #F0F0F0`, backgroundColor: "rgba(185,28,28,0.03)" }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "#B91C1C" }}>
                    If This Helped You, Please Consider Donating
                  </p>
                  <p className="text-sm leading-relaxed text-gray-500 mb-4">
                    This work takes real time, research, design, and platform costs to maintain.
                    If you want to help us keep documenting the truth, publishing reports, and reaching
                    more families, please consider making a donation.
                  </p>
                  <a
                    href="https://paypal.me/StandwithMeg"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-3.5 rounded-xl font-black text-sm text-white transition-colors bg-red-700 hover:bg-red-600"
                  >
                    Donate Now
                  </a>
                </div>

                {/* ── Next Steps ── */}
                <div className="px-2 py-6" style={{ borderBottom: `1px solid #F0F0F0` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: NAVY }}>
                    Your Next Steps
                  </p>
                  <ol className="space-y-3">
                    {[
                      `Go back and comment "MINE IS ADDED" so others can see this movement is real.`,
                      "Send my.standwithmeg.com/actors to one other family-court parent. Each share gets the next name closer to publicly visible.",
                      "Save your submission ID for your records.",
                    ].map((text, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-600 leading-relaxed">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                          style={{ backgroundColor: NAVY }}>
                          {i + 1}
                        </span>
                        {text}
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                    We may contact you using the email you provided if additional verification is needed
                    for reporting or research.
                  </p>
                </div>

                {/* ── Sign-off ── */}
                <div className="px-2 pt-5 pb-4 text-center">
                  <p className="text-sm font-bold text-gray-700">Thank you for standing up.</p>
                  <p className="text-sm text-gray-500 mt-0.5">Meg &nbsp;·&nbsp; StandWithMeg.com</p>
                </div>

                {/* ── Actions ── */}
                <div className="space-y-3 pt-2 pb-2">
                  <a href="https://standwithmeg.com"
                    className="block w-full text-center py-3.5 rounded-xl font-black text-sm text-white bg-red-700 hover:bg-red-600 transition-colors">
                    Return to StandWithMeg.com
                  </a>
                  <button
                    onClick={clearDraft}
                    className="block w-full py-3 rounded-xl font-bold text-sm transition-colors text-gray-600 hover:bg-gray-50"
                    style={{ border: "1.5px solid #E5E7EB" }}>
                    Submit another story
                  </button>
                </div>

              </div>
            )}

          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Stand With Meg &nbsp;·&nbsp; standwithmeg.com &nbsp;·&nbsp; Courage to Stand, Power to Change
        </p>
      </div>
    </div>
  );
}

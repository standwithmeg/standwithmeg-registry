"use client";

import { useEffect, useState } from "react";
import { COURT_ACTOR_PUBLIC_THRESHOLD } from "../../../lib/court-actors";
import { COURT_ACTOR_ROLE_OPTIONS, courtActorRoleOptionOrOther } from "../../../lib/court-actor-roles";
import { DONATION_URL, EXPLAINER_VIDEO_EMBED_URL } from "../../../lib/site-links";
import { isUnitedStatesCountry } from "../../../lib/survey-location";
import { US_JURISDICTIONS } from "../../../lib/us-jurisdictions";
import { SponsorCtaButton } from "../SponsorCtaButton";
import Link from "next/link";

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

type CourtActorDraft = { id?: string; role: string; name: string; court: string; notes: string };
type ActorSuggestion = {
  name: string;
  role: string;
  court: string | null;
  state: string;
  families: number;
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
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
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
const STORAGE_STEP   = `swm-survey-step-${STORAGE_VERSION}`;
const ACTOR_NOTE_MIN_CHARS = 12;

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(value);
  try { localStorage.setItem(key, serialized); } catch {}
  try { sessionStorage.setItem(key, serialized); } catch {}
}

function removeStorage(key: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}

function fieldString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formFromSubmission(submission: Record<string, unknown>): FormData {
  const outsideCountry = fieldString(submission.outside_us_country);
  return {
    outside_us: outsideCountry ? "yes" : "no",
    outside_us_country: outsideCountry,
    state: fieldString(submission.state_of_occurrence),
    county: fieldString(submission.case_county),
    system: fieldString(submission.system_affected),
    case_status: fieldString(submission.case_status),
    number_of_kids: fieldString(submission.number_of_kids),
    duration: fieldString(submission.time_in_system),
    months_lost: fieldString(submission.months_lost_parenting_time),
    lost_milestones_description: fieldString(submission.lost_milestones_description),
    custody: fieldString(submission.custody_status),
    pro_se: submission.is_pro_se === true ? "yes" : submission.is_pro_se === false ? "no" : fieldString(submission.is_pro_se),
    legal_rep: fieldString(submission.legal_rep_history),
    allegation: fieldString(submission.allegation_type),
    allegation_other_detail: fieldString(submission.allegation_other_detail),
    allegation_root_cause: fieldString(submission.allegation_root_cause),
    other_allegation_details: fieldString(submission.other_allegation_details),
    conflict_of_interest_awareness: fieldString(submission.conflict_of_interest_awareness),
    conflict_description: fieldString(submission.conflict_description),
    federal_funding_influence: fieldString(submission.federal_funding_influence),
    atty_fees: fieldString(submission.attorney_fees),
    gal_fees: fieldString(submission.gal_fees),
    therapy_fees: fieldString(submission.therapy_eval_fees),
    reunif_fees: fieldString(submission.reunification_fees),
    other_fees: fieldString(submission.other_court_actors_fees),
    lost_wages: fieldString(submission.lost_wages),
    asset_loss: fieldString(submission.asset_liquidation_loss),
    quote: fieldString(submission.impact_quote),
    permission: fieldString(submission.permission_to_share) || "anonymous",
    first_name: fieldString(submission.first_name),
    last_name: fieldString(submission.last_name),
    email: fieldString(submission.email),
  };
}

function readInitialStep() {
  const stored = readStorage<number>(STORAGE_STEP, 0);
  return Number.isInteger(stored) && stored >= 0 && stored < STEP_LABELS.length ? stored : 0;
}

export default function SubmitPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [dueProcessChecklist, setDueProcessChecklist] = useState<string[]>([]);
  const [courtActors, setCourtActors] = useState<CourtActorDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [updateLookupOpen, setUpdateLookupOpen] = useState(false);
  const [updateLookupEmail, setUpdateLookupEmail] = useState("");
  const [updateLookupId, setUpdateLookupId] = useState("");
  const [updateLookupError, setUpdateLookupError] = useState<string | null>(null);
  const [updateLookupNotice, setUpdateLookupNotice] = useState<string | null>(null);
  const [sendingUpdateLink, setSendingUpdateLink] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [editingVerificationEmail, setEditingVerificationEmail] = useState<string | null>(null);
  const [actorSuggestions, setActorSuggestions] = useState<Record<number, ActorSuggestion[]>>({});

  useEffect(() => {
    setForm(readStorage<FormData>(STORAGE_FORM, EMPTY));
    setDueProcessChecklist(readStorage<string[]>(STORAGE_DPC, []));
    setCourtActors(readStorage<CourtActorDraft[]>(STORAGE_ACTORS, []).map(actor => ({
      ...actor,
      role: actor.role ? courtActorRoleOptionOrOther(actor.role) : "",
    })));
    setStep(readInitialStep());
    setDraftLoaded(true);
    const params = new URLSearchParams(window.location.search);
    const updateEmail = params.get("update_email") || "";
    const submissionId = params.get("submission_id") || "";
    if (updateEmail || submissionId) {
      setUpdateLookupEmail(updateEmail);
      setUpdateLookupId(submissionId);
      setUpdateLookupOpen(true);
      if (updateEmail && submissionId) {
        void loadExistingSubmission(updateEmail, submissionId);
      }
    }
    // Update links should load exactly once from the URL params on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (draftLoaded && step < STEP_LABELS.length && !submittedId) writeStorage(STORAGE_STEP, step);
  }, [draftLoaded, step, submittedId]);

  function set(f: keyof FormData, v: string) {
    setForm(prev => {
      const next = { ...prev, [f]: v };
      writeStorage(STORAGE_FORM, next);
      return next;
    });
  }

  function toggleDueProcess(option: string) {
    setDueProcessChecklist(prev => {
      const next = prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option];
      writeStorage(STORAGE_DPC, next);
      return next;
    });
  }

  function persistActors(next: CourtActorDraft[]) {
    writeStorage(STORAGE_ACTORS, next);
    return next;
  }
  function addActor() {
    setCourtActors(prev => persistActors([...prev, { role: "", name: "", court: "", notes: "" }]));
  }
  function updateActor(idx: number, field: "role" | "name" | "court" | "notes", value: string) {
    setCourtActors(prev => persistActors(prev.map((a, i) => i === idx ? { ...a, [field]: value } : a)));
  }
  function applyActorSuggestion(idx: number, suggestion: ActorSuggestion) {
    setCourtActors(prev => persistActors(prev.map((a, i) => i === idx ? {
      ...a,
      name: suggestion.name,
      role: suggestion.role ? courtActorRoleOptionOrOther(suggestion.role) : a.role,
      court: suggestion.court || a.court,
    } : a)));
    setActorSuggestions(prev => ({ ...prev, [idx]: [] }));
  }
  function removeActor(idx: number) {
    setCourtActors(prev => persistActors(prev.filter((_, i) => i !== idx)));
  }

  function clearDraft() {
    removeStorage(STORAGE_FORM);
    removeStorage(STORAGE_DPC);
    removeStorage(STORAGE_ACTORS);
    removeStorage(STORAGE_STEP);
    setForm(EMPTY);
    setDueProcessChecklist([]);
    setCourtActors([]);
    setStep(0);
    setSubmittedId(null);
    setEditingSubmissionId(null);
    setEditingVerificationEmail(null);
  }

  async function loadExistingSubmission(lookupEmail = updateLookupEmail, lookupId = updateLookupId) {
    const email = lookupEmail.trim();
    const submissionId = lookupId.trim();
    if (!email || !submissionId) {
      setUpdateLookupError("Enter the email and submission ID from the original survey.");
      return;
    }
    setLoadingExisting(true);
    setUpdateLookupError(null);
    setUpdateLookupNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/survey/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load that submission.");
      const nextForm = formFromSubmission(data.submission || {});
      const nextActors = ((data.court_actors || []) as Array<Record<string, unknown>>).map(actor => ({
        id: fieldString(actor.id),
        role: fieldString(actor.role) ? courtActorRoleOptionOrOther(fieldString(actor.role)) : "",
        name: fieldString(actor.name),
        court: fieldString(actor.court_or_county),
        notes: fieldString(actor.notes),
      }));
      setForm(nextForm);
      setDueProcessChecklist(Array.isArray(data.submission?.due_process_checklist) ? data.submission.due_process_checklist.map(String) : []);
      setCourtActors(nextActors);
      writeStorage(STORAGE_FORM, nextForm);
      writeStorage(STORAGE_DPC, Array.isArray(data.submission?.due_process_checklist) ? data.submission.due_process_checklist.map(String) : []);
      writeStorage(STORAGE_ACTORS, nextActors);
      writeStorage(STORAGE_STEP, 0);
      const resolvedSubmissionId = fieldString(data.submission?.id) || submissionId;
      setEditingSubmissionId(resolvedSubmissionId);
      setEditingVerificationEmail(email.toLowerCase());
      setUpdateLookupEmail(email);
      setUpdateLookupId(resolvedSubmissionId);
      setUpdateLookupOpen(false);
      const nextUrl = `${window.location.pathname}?update_email=${encodeURIComponent(email)}&submission_id=${encodeURIComponent(resolvedSubmissionId)}`;
      window.history.replaceState(null, "", nextUrl);
      setStep(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load that submission.";
      setUpdateLookupError(message);
      setError(message);
    } finally {
      setLoadingExisting(false);
    }
  }

  async function requestUpdateLink() {
    const email = updateLookupEmail.trim();
    if (!email) {
      setUpdateLookupNotice(null);
      setUpdateLookupError("Enter the email you used on your survey first.");
      return;
    }
    setSendingUpdateLink(true);
    setUpdateLookupError(null);
    setUpdateLookupNotice(null);
    try {
      const res = await fetch("/api/survey/update-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the update link.");
      setUpdateLookupNotice(data.message || "If that email is in the registry, an update link is on the way.");
    } catch (err) {
      setUpdateLookupError(err instanceof Error ? err.message : "Could not send the update link.");
    } finally {
      setSendingUpdateLink(false);
    }
  }

  function bind(name: keyof FormData) {
    const props = {
      id: `survey-${name}`,
      name,
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
    if (name !== "state") {
      return { ...props, "aria-label": name.replace(/_/g, " ") };
    }
    return props;
  }

  const outsideUS = form.outside_us === "yes";
  useEffect(() => {
    const state = form.state.trim().toUpperCase();
    if (outsideUS || !state) {
      setActorSuggestions({});
      return;
    }
    const timers = courtActors.map((actor, idx) => {
      const q = actor.name.trim();
      if (q.length < 3) {
        setActorSuggestions(prev => ({ ...prev, [idx]: [] }));
        return null;
      }
      return window.setTimeout(() => {
        fetch(`/api/survey/court-actor-suggestions?state=${encodeURIComponent(state)}&q=${encodeURIComponent(q)}`)
          .then(res => res.json())
          .then(data => {
            setActorSuggestions(prev => ({ ...prev, [idx]: Array.isArray(data.suggestions) ? data.suggestions : [] }));
          })
          .catch(() => {
            setActorSuggestions(prev => ({ ...prev, [idx]: [] }));
          });
      }, 250);
    });
    return () => {
      timers.forEach(timer => { if (timer !== null) window.clearTimeout(timer); });
    };
  }, [courtActors, form.state, outsideUS]);

  function buildSubmissionPayload() {
    return {
      ...(editingSubmissionId ? { submission_id: editingSubmissionId } : {}),
      ...(editingSubmissionId && editingVerificationEmail ? { verification_email: editingVerificationEmail } : {}),
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
      federal_funding_influence: form.federal_funding_influence || "Unsure",
      // court actors — filtered so empty rows don't get sent
      court_actors: courtActors
        .filter(a => a.role.trim() && a.name.trim() && a.notes.trim())
        .map(a => ({
          id: a.id,
          role:  courtActorRoleOptionOrOther(a.role),
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
    };
  }

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
      const res = await fetch(editingSubmissionId ? "/api/survey/update" : "/api/survey", {
        method: editingSubmissionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSubmissionPayload()),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Submission failed."); setSubmitting(false); return; }
      removeStorage(STORAGE_FORM);
      removeStorage(STORAGE_DPC);
      removeStorage(STORAGE_ACTORS);
      removeStorage(STORAGE_STEP);
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
    <main className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>

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
          <div className="flex items-center justify-between gap-3 mb-6">
            <a href="https://standwithmeg.com"
              className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
              style={{ color: "rgba(201,162,39,0.8)" }}>
              ← StandWithMeg.com
            </a>
            <SponsorCtaButton
              label="Become a Sponsor →"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors hover:opacity-90"
            />
          </div>

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
          <p className="author mt-3 text-xs font-semibold text-white/75">
            By <Link href="/about" rel="author" className="underline underline-offset-2">Stand With Meg</Link>
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
        <section className="mb-5 rounded-2xl bg-white p-5 text-sm leading-relaxed text-gray-700 shadow-sm"
          style={{ border: "1px solid #E5E7EB" }}>
          <h2 className="text-base font-black" style={{ color: NAVY }}>How this survey is used</h2>
          <p className="mt-2">
            The Family Rights Survey turns individual family-court and child-welfare experiences into aggregate
            public reporting. Stand With Meg uses submitted answers to build state counts, financial-impact summaries,
            public quotes, court-actor pattern records, and advocacy materials that can be brought to lawmakers,
            reporters, and community leaders.
          </p>
          <p className="mt-2">
            You can submit anonymously for public display. Private contact details are used for verification,
            updates, and registry integrity; they are not published with reports or public actor pages.
          </p>
          <p className="mt-2">
            The form can be updated later with the same email and submission ID, so you do not need perfect answers
            on the first pass. Share what you can document now, skip what is unsafe to share, and return when dates,
            costs, counties, or notes need to be corrected.
          </p>
          <p className="mt-2">
            Stand With Meg reviews submissions for consistency before using them in public dashboards, state reports,
            and court-actor pattern pages. Your answers help identify repeated system issues while keeping private
            family details separate from public advocacy materials.
          </p>
        </section>

        <div className="mb-5 rounded-2xl overflow-hidden bg-white shadow-sm"
          style={{ border: `1px solid ${editingSubmissionId ? "rgba(201,162,39,0.45)" : "#E5E7EB"}` }}>
          <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-black" style={{ color: NAVY }}>
                {editingSubmissionId ? "Updating your existing survey" : "Already submitted?"}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {editingSubmissionId
                  ? "Your answers are loaded. Saving will update this same submission, not create a second family count."
                  : "Load your old answers with your email and submission ID, then add or fix details without starting over."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (editingSubmissionId) {
                  clearDraft();
                  setUpdateLookupEmail("");
                  setUpdateLookupId("");
                } else {
                  setUpdateLookupOpen(v => !v);
                }
              }}
              className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide"
              style={{
                backgroundColor: editingSubmissionId ? "#B91C1C" : NAVY,
                color: "white",
                border: `1px solid ${editingSubmissionId ? "#991B1B" : NAVY}`,
              }}
            >
              {editingSubmissionId ? "Start new survey" : updateLookupOpen ? "Hide" : "Update my survey"}
            </button>
          </div>
          {updateLookupOpen && !editingSubmissionId && (
            <div className="px-5 pb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
              style={{ borderTop: "1px solid #F0F0F0" }}>
              <div className="pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1" style={{ color: NAVY }}>Email used on survey</label>
                <input
                  aria-label="Email used on survey"
                  type="email"
                  value={updateLookupEmail}
                  onChange={e => {
                    setUpdateLookupEmail(e.target.value);
                    setUpdateLookupNotice(null);
                  }}
                  placeholder="your@email.com"
                  className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                  style={{ border: "1.5px solid #E5E7EB" }}
                />
              </div>
              <div className="pt-4">
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1" style={{ color: NAVY }}>Submission ID</label>
                <input
                  aria-label="Submission ID"
                  type="text"
                  value={updateLookupId}
                  onChange={e => {
                    setUpdateLookupId(e.target.value);
                    setUpdateLookupNotice(null);
                  }}
                  placeholder="Paste your saved ID"
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono text-gray-900 bg-white"
                  style={{ border: "1.5px solid #E5E7EB" }}
                />
              </div>
              <div className="pt-4 flex items-end">
                <button
                  type="button"
                  onClick={() => loadExistingSubmission()}
                  disabled={loadingExisting}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-black text-white bg-red-700 disabled:opacity-50"
                >
                  {loadingExisting ? "Loading..." : "Load"}
                </button>
              </div>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={requestUpdateLink}
                  disabled={sendingUpdateLink}
                  className="text-xs font-black underline underline-offset-4 disabled:opacity-50"
                  style={{ color: NAVY }}
                >
                  {sendingUpdateLink ? "Sending update link..." : "Do not have your ID? Email me my update link"}
                </button>
              </div>
              {updateLookupNotice && (
                <div className="sm:col-span-3 rounded-xl px-4 py-3 text-sm font-medium"
                  style={{ backgroundColor: "rgba(30,58,95,0.06)", border: "1.5px solid rgba(30,58,95,0.18)", color: NAVY }}>
                  {updateLookupNotice}
                </div>
              )}
              {updateLookupError && (
                <div className="sm:col-span-3 rounded-xl px-4 py-3 text-sm font-medium text-red-700"
                  style={{ backgroundColor: "rgba(185,28,28,0.06)", border: "1.5px solid #B91C1C" }}>
                  {updateLookupError}
                </div>
              )}
            </div>
          )}
        </div>

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
                        : { backgroundColor: "#E5E7EB", color: "#4B5563" }
                    }
                  >
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span
                    className="text-xs font-semibold hidden sm:inline"
                    style={{
                      color: i === step ? NAVY : i < step ? GOLD : "#4B5563",
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
              <p className="text-sm text-gray-600 ml-4 mb-6">
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
                    <label htmlFor="survey-state" className={labelCls} style={{ color: NAVY }}>
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

                {/* Country — shown when outside US. Native <select> renders as a
                    wheel picker on iOS and a full-screen dropdown on Android,
                    which is what mobile users expect. The previous <datalist>
                    autocomplete didn't surface a dropdown on iOS Safari, so
                    visitors had to type the country freehand — bad for data
                    quality (case/spelling drift) and bad UX. */}
                {outsideUS && (
                  <div>
                    <label className={labelCls} style={{ color: NAVY }}>
                      Country <span className="text-red-700">*</span>
                    </label>
                    <select
                      value={form.outside_us_country}
                      onChange={e => set("outside_us_country", e.target.value)}
                      className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none appearance-none"
                      style={{
                        border: "1.5px solid #E5E7EB",
                        backgroundImage: "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236B7280' d='M6 8L0 0h12z'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 14px center",
                        paddingRight: "36px",
                      }}
                      onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                      onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                      required
                    >
                      <option value="" disabled>Select your country…</option>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                  {outsideUS ? "Province / Region / District" : "County / Parish / Borough"} <span className="text-red-700">*</span>
                  </label>
                  <p className="text-xs text-gray-600 mb-1">
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
                    <p className="text-xs text-gray-600 mt-1">Approximately how many total MONTHS have you been deprived of normal parenting time with your children?</p>
                  </div>
                </div>

                {/* Lost milestones — conditional companion to months_lost */}
                <div>
                  <label className={labelCls} style={{ color: NAVY }}>
                    Description of Lost Milestones{" "}
                    <span className="text-gray-300 font-normal normal-case tracking-normal text-xs">(optional)</span>
                  </label>
                  <p className="text-xs text-gray-600 mb-1">
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
                  <p className="text-xs text-gray-600 mb-2">
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
                    <p className="text-xs text-gray-600 mb-1">(e.g., the Judge and Attorney are in the same private firm)</p>
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
                    <p className="text-xs italic text-gray-600 mb-3">No court actors added yet.</p>
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
                        <select aria-label={`Actor ${i + 1} role`} value={actor.role} onChange={e => updateActor(i, "role", e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                          style={{ border: "1px solid #E5E7EB" }}>
                          <option value="">Role…</option>
                          {COURT_ACTOR_ROLE_OPTIONS.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                        <input type="text" aria-label={`Actor ${i + 1} name`} placeholder="Name" value={actor.name}
                          onChange={e => updateActor(i, "name", e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                          style={{ border: "1px solid #E5E7EB" }} />
                      </div>
                      {(actorSuggestions[i] ?? []).length > 0 && (
                        <div className="mb-2 rounded-lg overflow-hidden"
                          style={{ border: "1px solid rgba(201,162,39,0.28)", backgroundColor: "rgba(201,162,39,0.06)" }}>
                          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: NAVY }}>
                            Possible public match
                          </div>
                          {(actorSuggestions[i] ?? []).map(suggestion => (
                            <button
                              key={`${suggestion.name}-${suggestion.role}-${suggestion.court ?? ""}`}
                              type="button"
                              onClick={() => applyActorSuggestion(i, suggestion)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-white"
                              style={{ borderTop: "1px solid rgba(201,162,39,0.18)" }}
                            >
                              <span className="font-black" style={{ color: NAVY }}>{suggestion.name}</span>
                              <span className="text-gray-500"> · {suggestion.role}</span>
                              {suggestion.court && <span className="text-gray-500"> · {suggestion.court}</span>}
                              <span className="block text-[11px] mt-0.5" style={{ color: GOLD }}>
                                {suggestion.families} {suggestion.families === 1 ? "family" : "families"} already matched publicly. Tap to use this spelling.
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <input type="text" aria-label={`Actor ${i + 1} court or county`} placeholder="Court or County (optional)" value={actor.court}
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
                        aria-label={`What happened with actor ${i + 1}`}
                        placeholder="Required: one short factual sentence. Example: denied my motion without a hearing, ignored evidence, delayed reunification, or handled one issue fairly."
                        value={actor.notes}
                        onChange={e => updateActor(i, "notes", e.target.value)}
                        minLength={ACTOR_NOTE_MIN_CHARS}
                        required
                        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white resize-none"
                        style={{ border: "1px solid #E5E7EB" }} />
                      <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                        Required for each listed actor. Do not include private details about your children or case number.
                        Your name/email will not be published with this actor report.
                      </p>
                    </div>
                  ))}

                  <button type="button" onClick={addActor}
                    className="w-full py-2.5 rounded-lg text-sm font-bold tracking-wide transition-colors"
                    style={{ backgroundColor: "#F8FAFC", color: NAVY, border: `1.5px dashed rgba(30,58,95,0.42)` }}>
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
                  <p className="text-xs mt-1 mb-2" style={{ color: "#4B5563" }}>
                    <strong style={{ color: NAVY }}>Your data is counted in every option below.</strong>{" "}
                    Your numbers always add to the family count, financial totals, months-lost averages, and court-actor patterns.
                    The choice here is only about whether your <em>quote</em> and <em>name</em> appear publicly on the dashboard and state reports.
                  </p>
                  <div className="space-y-2.5 mt-2">
                    {[
                      ["anonymous",  "Show my quote anonymously — no name attached",        "Public dashboard shows: \"— Anonymous, Kansas\" · your quote appears, your name never does."],
                      ["first_name", "Show my quote with my first name only",               "Public dashboard shows: \"— Sarah, Kansas\" · first name + quote appear, last name and identifying details never do."],
                      ["public",     "Show my quote with my full name",                     "Public dashboard shows: \"— Sarah Steele, Kansas\" · full name + quote may be published."],
                      ["data_only",  "Count my data only — do not show my quote anywhere",  "Your numbers are added to all totals. Your quote, name, and county never appear publicly. (Pick this only if you do NOT want your words displayed — your story still strengthens the data.)"],
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
                          <div className="text-xs text-gray-600 mt-0.5">{example}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls} style={{ color: NAVY }}>First Name <span className="text-red-700">*</span></label>
                  <input type="text" aria-label="First name" placeholder="First name"
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
                  <input type="text" aria-label="Last name" placeholder="Last name"
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
                  <p className="text-xs text-gray-600 mb-1">Your email (For verification and case updates only)</p>
                  <input type="email" aria-label="Email" placeholder="your@email.com"
                    value={form.email}
                    onChange={e => set("email", e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none"
                    style={borderDefault}
                    onFocus={e => (e.currentTarget.style.border = "1.5px solid #B91C1C")}
                    onBlur={e => (e.currentTarget.style.border = "1.5px solid #E5E7EB")}
                  />
                </div>

                {/* Donate prompt — gentle ask right before the family submits */}
                <div className="rounded-xl p-4"
                  style={{ backgroundColor: "rgba(201,162,39,0.08)", border: `1.5px solid rgba(201,162,39,0.45)` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: NAVY }}>
                    Before You Submit
                  </p>
                  <p className="text-sm leading-relaxed text-gray-600 mb-3">
                    Stand With Meg is free for every family. Donations are what keep the registry,
                    the state reports, and the court-actor records online, searchable, and public.
                    If you are able, please chip in &mdash; it is what keeps this work alive.
                  </p>
                  <a
                    href={DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-3 rounded-xl font-black text-sm transition-colors hover:opacity-90"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Donate to Keep This Public &rarr;
                  </a>
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
                    {submitting ? "Saving..." : editingSubmissionId ? "Save My Updates" : "Submit My Story"}
                  </button>
                </div>

                <p className="text-xs text-gray-600 text-center pt-1">
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
                    {editingSubmissionId
                      ? "Your Stand With Meg survey has been updated. Your old answers were preserved in revision history, and this still counts as the same family."
                      : "Your story has now been added to the Stand With Meg Family Rights Registry. Every submission helps document what families are living through and strengthens the public record we are building together."}
                  </p>
                </div>

                {/* ── Explainer video — first thing after the success message,
                    so confused families understand the page before scrolling. ── */}
                <div className="px-2 py-6" style={{ borderBottom: `1px solid #F0F0F0` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: NAVY }}>
                    Start Here: Watch This 2-Minute Video
                  </p>
                  <p className="text-sm leading-relaxed text-gray-500 mb-4">
                    A short walkthrough of everything you can now see &mdash; the registry, the
                    state reports, and the data &mdash; and how to put it in front of your state legislators.
                  </p>
                  <div className="rounded-xl overflow-hidden aspect-video"
                    style={{ border: `1px solid rgba(30,58,95,0.12)` }}>
                    <iframe
                      className="w-full h-full"
                      src={EXPLAINER_VIDEO_EMBED_URL}
                      title="Stand With Meg — how to use the registry and reports"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </div>

                {/* ── Donation — moved high: the strongest call to action ── */}
                <div className="my-5 rounded-2xl p-6 text-center"
                  style={{
                    backgroundColor: "rgba(185,28,28,0.06)",
                    border: `2px solid #B91C1C`,
                  }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: "#B91C1C" }}>
                    Keep This Registry Public
                  </p>
                  <h3 className="text-xl font-black leading-tight mb-3" style={{ color: NAVY }}>
                    Your story is in. Now help keep it visible.
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-600 mb-5 max-w-md mx-auto">
                    The registry, the state reports, and the court-actor records stay online,
                    searchable, and free for families because supporters fund them. If this
                    helped you, a donation keeps it here for the next parent who needs it.
                  </p>
                  <a
                    href={DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-4 rounded-xl font-black text-base text-white transition-colors bg-red-700 hover:bg-red-600"
                  >
                    Donate to Stand With Meg &rarr;
                  </a>
                  <p className="text-xs text-gray-600 mt-3">
                    Any amount helps. You can give once or monthly.
                  </p>
                </div>

                {/* ── Next Steps — moved up so families see what to do early ── */}
                <div className="px-2 py-6" style={{ borderBottom: `1px solid #F0F0F0` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: NAVY }}>
                    Your Next Steps
                  </p>
                  <ol className="space-y-3">
                    {[
                      `Go back and comment "MINE IS ADDED" so others can see this movement is real.`,
                      "Send my.standwithmeg.com/actors to one other family-court parent. Each share gets the next name closer to publicly visible.",
                      "Save your submission ID (further down this page) for your records.",
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
                  <p className="text-xs text-gray-600 mt-4 leading-relaxed">
                    We may contact you using the email you provided if additional verification is needed
                    for reporting or research.
                  </p>
                </div>

                {/* ── Court Actor Registry — fresh submitters just named actors
                    on their case; this lets them see whether anyone else has
                    named the same person. localStorage was set in handleSubmit
                    so the gate is auto-passed. ── */}
                <div className="px-2 py-6 rounded-xl mx-0"
                  style={{ borderBottom: `1px solid #F0F0F0`, backgroundColor: "rgba(201,162,39,0.06)" }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GOLD }}>
                    Check the Court Actor Registry
                  </p>
                  <h3 className="text-base font-black mb-2" style={{ color: NAVY }}>
                    See who else named the same judges, GALs, or attorneys.
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-500 mb-4">
                    Every court actor named by Stand With Meg families is now listed in one searchable registry.
                    When {COURT_ACTOR_PUBLIC_THRESHOLD}+ families independently name the same person, their name goes public.
                    You may recognize names from your own case &mdash; and you can add yourself to those reports with one tap.
                  </p>
                  <a
                    href="/actors"
                    className="inline-block w-full text-center py-3.5 rounded-xl font-black text-sm transition-colors"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Browse the Court Actor Registry &rarr;
                  </a>
                  <p className="text-xs text-gray-600 mt-3 leading-relaxed">
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
                  <Link
                    href="/report"
                    className="inline-block w-full text-center py-3 rounded-xl font-black text-sm transition-colors"
                    style={{ backgroundColor: "rgba(30,58,95,0.06)", border: `1.5px solid ${NAVY}`, color: NAVY }}
                  >
                    View State Reports and Dashboard &rarr;
                  </Link>
                </div>

                {/* ── Submission ID — reference info, kept low so it does not
                    clutter the top of the confirmation. ── */}
                {submittedId && (
                  <div className="px-2 py-5" style={{ borderBottom: `1px solid #F0F0F0` }}>
                    <div className="rounded-xl p-4"
                      style={{ backgroundColor: "rgba(30,58,95,0.04)", border: `1px solid rgba(30,58,95,0.12)` }}>
                      <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: NAVY }}>
                        Your Submission ID
                      </p>
                      <code className="text-xs font-mono text-gray-600 break-all">{submittedId}</code>
                      <p className="text-xs text-gray-600 mt-1.5">
                        Save this ID. You can use it to request removal of your submission at any time.
                      </p>
                    </div>
                  </div>
                )}

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
        <p className="text-center text-xs text-gray-600 mt-6">
          Stand With Meg &nbsp;·&nbsp; standwithmeg.com &nbsp;·&nbsp; Courage to Stand, Power to Change
        </p>
      </div>
    </main>
  );
}

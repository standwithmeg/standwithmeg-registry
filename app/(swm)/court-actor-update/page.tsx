"use client";

import { useEffect, useMemo, useState } from "react";

const GOLD = "#C9A227";
const NAVY = "#1E3A5F";
const RED = "#B91C1C";
const ACTOR_NOTE_MIN_CHARS = 12;

const ROLES = [
  "Judge",
  "Attorney (Mine)",
  "Attorney (Opposing)",
  "GAL / Child Representative",
  "Custody Evaluator",
  "Psychological Evaluator",
  "CPS Worker",
  "Therapist / Counselor",
  "Mediator",
  "Reunification Therapist",
  "Other",
];

type ActorForm = {
  role: string;
  name: string;
  court: string;
  notes: string;
};

const EMPTY_ACTOR: ActorForm = {
  role: "",
  name: "",
  court: "",
  notes: "",
};

export default function CourtActorUpdatePage() {
  const [submissionId, setSubmissionId] = useState("");
  const [actorId, setActorId] = useState("");
  const [email, setEmail] = useState("");
  // When a visitor arrives via /actors → "On my case", the actor's state
  // (e.g., "KS") is in the URL. We forward it to the API as a per-actor
  // state override so the new court_actor row is bucketed under the actor's
  // state, NOT the visitor's submission state. Without this, a CA family who
  // recognizes a KS judge on /actors would have the new entry incorrectly
  // tagged CA, splitting the actor across two state buckets.
  const [stateOverride, setStateOverride] = useState<string>("");
  const [actors, setActors] = useState<ActorForm[]>([{ ...EMPTY_ACTOR }]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSubmissionId(params.get("submission") || "");
    setActorId(params.get("actor") || "");

    // /actors browse → "On my case" deep-link pre-fill.
    // The /actors page sends actor_name / actor_role / actor_county so the
    // visitor lands on a partially-filled form instead of a blank one.
    const prefName = params.get("actor_name") || "";
    const prefRole = params.get("actor_role") || "";
    const prefCounty = params.get("actor_county") || "";
    const prefState = (params.get("actor_state") || "").trim().toUpperCase();
    // Validate as a 2-letter US state code (or DC) before trusting it
    if (/^[A-Z]{2}$/.test(prefState)) {
      setStateOverride(prefState);
    }
    if (prefName || prefRole || prefCounty) {
      // Only consider role values that exist in our role list, otherwise leave blank
      const roleMatch = ROLES.find(r => r.toLowerCase() === prefRole.toLowerCase()) || "";
      setActors([{
        role: roleMatch,
        name: prefName,
        court: prefCounty,
        notes: "",
      }]);
    }

    // Auto-fill the email field if the visitor has already verified at the
    // /actors gate (they're signed in via the same email that owns this
    // submission). This avoids making them type it twice. Visitors arriving
    // from the admin nudge email — who haven't gone through the /actors gate —
    // will still see a blank field as before.
    try {
      const stored = localStorage.getItem("swm_actors_access");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.email && typeof parsed.email === "string") {
          setEmail(parsed.email);
        }
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const hasValidLink = useMemo(() => submissionId.length > 0, [submissionId]);

  function updateActor(index: number, field: keyof ActorForm, value: string) {
    setActors(prev => prev.map((actor, i) => i === index ? { ...actor, [field]: value } : actor));
  }

  function addActor() {
    setActors(prev => [...prev, { ...EMPTY_ACTOR }]);
  }

  function removeActor(index: number) {
    setActors(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  function validate() {
    if (!hasValidLink) return "This update link is missing the original submission ID. Please use the link from the Stand With Meg email.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter the same email address you used on the original survey.";
    for (let i = 0; i < actors.length; i += 1) {
      const actor = actors[i];
      if (!actor.role.trim()) return `Court actor #${i + 1} needs a role.`;
      if (!actor.name.trim()) return `Court actor #${i + 1} needs a name.`;
      if (actor.notes.trim().length < ACTOR_NOTE_MIN_CHARS) return `Court actor #${i + 1} needs one short reason/note.`;
    }
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/survey/court-actor-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          actor_id: actorId || null,
          email,
          // Forward the actor's state when the visitor came in via /actors,
          // so the API tags the new court_actor row to the actor's state
          // instead of inheriting the visitor's submission state.
          state_code_override: stateOverride || null,
          court_actors: actors.map(actor => ({
            role: actor.role.trim(),
            name: actor.name.trim(),
            court: actor.court.trim() || null,
            notes: actor.notes.trim(),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save the court actor update.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-10" style={{ backgroundColor: "#F7F5F0" }}>
      <section className="mx-auto max-w-3xl rounded-2xl overflow-hidden bg-white shadow-xl"
        style={{ border: `1px solid rgba(201,162,39,0.32)` }}>
        <div className="px-6 py-6 text-white" style={{ backgroundColor: "#0F1E30" }}>
          <div className="text-xs uppercase tracking-[0.24em] font-bold" style={{ color: GOLD }}>
            Stand With Meg
          </div>
          <h1 className="mt-2 text-2xl md:text-3xl font-black">Court Actor Update</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(245,245,245,0.68)" }}>
            Use this short form only to fix or add court actor details connected to your original survey.
            Your name and email will not be published with any court actor report.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {!hasValidLink && (
            <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700"
              style={{ backgroundColor: "rgba(185,28,28,0.06)", border: `1.5px solid ${RED}` }}>
              This page needs the private update link from the Stand With Meg email. Please open the link from that message.
            </div>
          )}

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700"
              style={{ backgroundColor: "rgba(185,28,28,0.06)", border: `1.5px solid ${RED}` }}>
              {error}
            </div>
          )}

          {sent ? (
            <div className="rounded-xl p-5"
              style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <h2 className="font-black text-lg" style={{ color: NAVY }}>Thank you. Your court actor update was saved.</h2>
              <p className="mt-2 text-sm text-gray-600">
                Stand With Meg will use this update for admin review and pattern reporting. Your identity stays private.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-black uppercase tracking-wide mb-1" style={{ color: NAVY }}>
                  Email used on your original survey <span className="text-red-700">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg px-4 py-3 text-sm text-gray-900 bg-white"
                  style={{ border: "1.5px solid #E5E7EB" }}
                />
                <p className="mt-1 text-xs text-gray-500">
                  This is only used to verify the update belongs to your original submission.
                </p>
              </div>

              {actors.map((actor, index) => (
                <div key={index} className="rounded-xl p-4 bg-gray-50"
                  style={{ border: "1px solid #E5E7EB" }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-black uppercase tracking-wide text-gray-500">Court actor #{index + 1}</div>
                    {actors.length > 1 && (
                      <button type="button" onClick={() => removeActor(index)}
                        className="text-xs font-bold text-red-700 hover:text-red-900">
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-gray-600">
                        Role <span className="text-red-700">*</span>
                      </label>
                      <select
                        value={actor.role}
                        onChange={e => updateActor(index, "role", e.target.value)}
                        className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white"
                        style={{ border: "1px solid #E5E7EB" }}
                      >
                        <option value="">Select role...</option>
                        {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-gray-600">
                        Name <span className="text-red-700">*</span>
                      </label>
                      <input
                        type="text"
                        value={actor.name}
                        onChange={e => updateActor(index, "name", e.target.value)}
                        placeholder="Name of the judge, GAL, attorney, evaluator, etc."
                        className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white"
                        style={{ border: "1px solid #E5E7EB" }}
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-gray-600">
                      Court or county <span className="font-normal normal-case text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={actor.court}
                      onChange={e => updateActor(index, "court", e.target.value)}
                      placeholder="Court, county, or agency"
                      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white"
                      style={{ border: "1px solid #E5E7EB" }}
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs font-bold uppercase tracking-wide mb-1 text-gray-600">
                      What happened with this court actor? <span className="text-red-700">*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={actor.notes}
                      onChange={e => updateActor(index, "notes", e.target.value)}
                      placeholder="One short factual sentence. Example: denied my motion without a hearing, ignored evidence, delayed reunification, or handled one issue fairly."
                      className="w-full rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white resize-none"
                      style={{ border: "1px solid #E5E7EB" }}
                    />
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                      Keep it brief and do not include private details about your children, address, or case number.
                      Harmful, neutral, or positive facts are all okay.
                    </p>
                  </div>
                </div>
              ))}

              <button type="button" onClick={addActor}
                className="w-full py-3 rounded-xl text-sm font-black"
                style={{ color: NAVY, border: `1.5px dashed rgba(30,58,95,0.35)`, backgroundColor: "rgba(30,58,95,0.04)" }}>
                + Add another court actor
              </button>

              <button
                type="button"
                onClick={submit}
                disabled={submitting || !hasValidLink}
                className="w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
                style={{ backgroundColor: RED }}
              >
                {submitting ? "Saving..." : "Submit Court Actor Update"}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

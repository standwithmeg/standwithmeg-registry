"use client";

import { useEffect, useState } from "react";

const GOLD = "#C9A227";
const BG = "#0F1E30";

export type PublicActor = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  count: number;
};

type Props = {
  actors: PublicActor[];
  threshold: number;
};

type AnonymousNote = {
  note: string;
  month: string;
};

export function CourtActorPanel({ actors, threshold }: Props) {
  const [openActor, setOpenActor] = useState<PublicActor | null>(null);

  if (actors.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.22)" }}>
        <div className="px-6 py-4 border-b"
          style={{ borderColor: "rgba(201,162,39,0.16)", backgroundColor: "rgba(30,58,95,0.48)" }}>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-black text-white text-base tracking-wide">Named Court Actor Patterns</h2>
              <p className="text-xs mt-0.5 max-w-2xl" style={{ color: "rgba(245,245,245,0.45)" }}>
                Names appear after {threshold}+ different families independently named the same person in the same state.
                Click any card to read what families wrote — submitter identities are never shown.
              </p>
            </div>
            <div className="text-xs font-black px-3 py-1.5 rounded-md self-start md:self-auto"
              style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "rgb(252,165,165)" }}>
              {actors.length} public {actors.length === 1 ? "pattern" : "patterns"}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-px" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          {actors.slice(0, 24).map((actor, i) => (
            <button
              type="button"
              key={`${actor.state_code ?? "NA"}-${actor.name}-${i}`}
              onClick={() => setOpenActor(actor)}
              className="text-left px-6 py-5 transition-colors hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-amber-300/40"
              style={{ backgroundColor: BG }}
              aria-label={`View what families said about ${actor.name}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-black text-white text-sm truncate">{actor.name}</div>
                  <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5"
                    style={{ color: "rgba(245,245,245,0.5)" }}>
                    <span>{actor.role}</span>
                    {actor.state_code && <span>· {actor.state_code}</span>}
                    {actor.court_or_county && <span>· {actor.court_or_county}</span>}
                  </div>
                </div>
                <div className="text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-md"
                  style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.25)" }}>
                  {actor.count} {actor.count === 1 ? "family" : "families"}
                </div>
              </div>
              <div className="mt-3 text-[11px] font-semibold" style={{ color: GOLD }}>
                Read what families said →
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 py-3 text-[11px] leading-snug"
          style={{ backgroundColor: "rgba(0,0,0,0.22)", color: "rgba(245,245,245,0.35)" }}>
          These are submitted family reports and pattern signals, not court findings or independent legal determinations.
        </div>
      </div>

      {openActor && (
        <CourtActorNotesModal actor={openActor} onClose={() => setOpenActor(null)} />
      )}
    </>
  );
}

type ListModalProps = {
  state: string;
  actors: PublicActor[];
  onClose: () => void;
};

export function CourtActorListModal({ state, actors, onClose }: ListModalProps) {
  const [openActor, setOpenActor] = useState<PublicActor | null>(null);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
          style={{ backgroundColor: BG, border: "1px solid rgba(201,162,39,0.35)", maxHeight: "85vh" }}>

          <div className="px-6 py-4 flex items-start justify-between gap-4"
            style={{ borderBottom: "1px solid rgba(201,162,39,0.2)", backgroundColor: "rgba(30,58,95,0.6)" }}>
            <div className="min-w-0">
              <div className="font-black text-white text-base leading-tight">
                Named Court Actors — {state}
              </div>
              <div className="text-xs mt-1" style={{ color: "rgba(245,245,245,0.55)" }}>
                {actors.length} {actors.length === 1 ? "person" : "people"} named by 3+ different families.
                Click a card to read what families wrote — submitter identities are never shown.
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
              style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4 space-y-3">
            {actors.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
                No public court actor patterns yet for {state}.
              </div>
            )}
            {actors.map((actor, i) => (
              <button
                type="button"
                key={`${actor.state_code ?? "NA"}-${actor.name}-${i}`}
                onClick={() => setOpenActor(actor)}
                className="w-full text-left rounded-lg px-4 py-3 transition-colors hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-amber-300/40"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-white text-sm truncate">{actor.name}</div>
                    <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5"
                      style={{ color: "rgba(245,245,245,0.55)" }}>
                      <span>{actor.role}</span>
                      {actor.court_or_county && <span>· {actor.court_or_county}</span>}
                    </div>
                  </div>
                  <div className="text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-md"
                    style={{ backgroundColor: "rgba(201,162,39,0.12)", color: GOLD, border: "1px solid rgba(201,162,39,0.25)" }}>
                    {actor.count} {actor.count === 1 ? "family" : "families"}
                  </div>
                </div>
                <div className="mt-2 text-[11px] font-semibold" style={{ color: GOLD }}>
                  Read what families said →
                </div>
              </button>
            ))}
          </div>

          <div className="px-6 py-3 text-[11px] leading-snug"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.35)" }}>
            These are submitted family reports and pattern signals, not court findings or independent legal determinations.
          </div>
        </div>
      </div>

      {openActor && (
        <CourtActorNotesModal actor={openActor} onClose={() => setOpenActor(null)} />
      )}
    </>
  );
}

type ModalProps = {
  actor: PublicActor;
  onClose: () => void;
};

export function CourtActorNotesModal({ actor, onClose }: ModalProps) {
  const [notes, setNotes] = useState<AnonymousNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          name: actor.name,
          state: actor.state_code ?? "",
        });
        const res = await fetch(`/api/survey/court-actors/notes?${params.toString()}`);
        const data = await res.json().catch(() => ({ notes: [] }));
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load family reports.");
          return;
        }
        setNotes(Array.isArray(data.notes) ? data.notes : []);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [actor.name, actor.state_code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: BG, border: "1px solid rgba(201,162,39,0.35)", maxHeight: "85vh" }}>

        <div className="px-6 py-4 flex items-start justify-between gap-4"
          style={{ borderBottom: "1px solid rgba(201,162,39,0.2)", backgroundColor: "rgba(30,58,95,0.6)" }}>
          <div className="min-w-0">
            <div className="font-black text-white text-base leading-tight">{actor.name}</div>
            <div className="text-xs mt-1 flex flex-wrap gap-1.5" style={{ color: "rgba(245,245,245,0.55)" }}>
              <span>{actor.role}</span>
              {actor.state_code && <span>· {actor.state_code}</span>}
              {actor.court_or_county && <span>· {actor.court_or_county}</span>}
              <span>· {actor.count} {actor.count === 1 ? "family" : "families"}</span>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
            style={{ color: "rgba(245,245,245,0.5)" }} aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 text-[11px] leading-snug"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.5)" }}>
          What families wrote when they named this person. Submitter identity, county, and contact details are never shown.
          These are submitted family reports and pattern signals, not court findings.
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-3">
          {loading && (
            <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
              Loading family reports…
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-center py-8" style={{ color: "rgb(252,165,165)" }}>
              {error}
            </div>
          )}

          {!loading && !error && notes.length === 0 && (
            <div className="text-sm text-center py-8" style={{ color: "rgba(245,245,245,0.4)" }}>
              No written reports yet. {actor.count} {actor.count === 1 ? "family" : "families"} named this person but did not include a note.
            </div>
          )}

          {!loading && !error && notes.length > 0 && notes.length < actor.count && (
            <div className="text-xs text-center pb-1" style={{ color: "rgba(245,245,245,0.45)" }}>
              Showing {notes.length} of {actor.count} family reports. {actor.count - notes.length}{" "}
              {actor.count - notes.length === 1 ? "family" : "families"} named this person without a written note.
            </div>
          )}

          {!loading && !error && notes.map((n, i) => (
            <div key={i} className="rounded-lg px-4 py-3"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-xs font-semibold mb-1.5" style={{ color: GOLD }}>
                {n.month ? formatMonth(n.month) : "Submitted by a family"}
              </div>
              <div className="text-sm whitespace-pre-wrap" style={{ color: "rgba(245,245,245,0.85)" }}>
                {n.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return "Submitted by a family";
  const [, year, m] = match;
  const date = new Date(Number(year), Number(m) - 1, 1);
  if (isNaN(date.getTime())) return "Submitted by a family";
  return `Submitted ${date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const GOLD = "#C9A227";

const ROLE_OPTIONS: string[] = [
  "Judge",
  "Commissioner",
  "Attorney (Mine)",
  "Attorney (Opposing)",
  "GAL / Child Representative",
  "Custody Evaluator",
  "Psychological Evaluator",
  "CPS Worker",
  "Therapist",
  "Reunification Therapist",
  "Mediator",
  "Other",
];

const STATE_LABEL: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

function locationDisplay(location: string | null): string {
  if (!location) return "";
  return STATE_LABEL[location] ?? location;
}

function cleanRoleForSearch(role: string): string {
  // Strip parenthetical qualifiers like "(Mine)" or "(Opposing)" so the
  // Google query reads naturally — `attorney`, not `attorney (mine)`.
  return role.replace(/\s*\([^)]*\)/g, "").trim();
}

function googleSearchUrlFor(name: string, role: string | null, location: string | null): string {
  const stateName = locationDisplay(location);
  const roleClean = role ? cleanRoleForSearch(role).toLowerCase() : "";
  const parts: string[] = [name];
  if (roleClean) parts.push(roleClean);
  if (stateName) parts.push(`in ${stateName}`);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

type VariantSample = {
  row_id: string;
  name: string;
  role: string;
  court_or_county: string | null;
  reporter_case_county: string | null;
  reporter_email: string | null;
  reporter_name: string | null;
  submission_id: string;
  notes: string | null;
  source: string | null;
  created_at: string | null;
  // 'merge_comments' is set by the comment-merge endpoint, not by the
  // row-review buttons in this panel. Treated like 'duplicate' for
  // family-counting; treated as "merged into a primary" for display.
  review_decision: "duplicate" | "count_separately" | "merge_comments" | null;
  counts_publicly: boolean;
  cluster_email_count: number;
  cluster_submission_count: number;
  // Comment-merge state, populated by the route handler:
  //   merged_into:        primary row id this row's testimony was folded into
  //   merge_primary_for:  row ids that were merged into THIS row (this row IS primary)
  //   merged_comment:     the public-facing combined text (only when this row is primary)
  merged_into?: string | null;
  merge_primary_for?: string[] | null;
  merged_comment?: string | null;
};

type Variant = {
  name_key: string;
  display_name: string;
  roles: Array<{ role: string; count: number }>;
  counties: Array<{ county: string; count: number }>;
  family_count: number;
  row_ids: string[];
  reporter_emails: string[];
  submission_ids: string[];
  sources: string[];
  samples: VariantSample[];
};

type Edge = {
  a: string;
  b: string;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

type ResearchNote = {
  id: string;
  cluster_key: string;
  location_key: string | null;
  name_keys: string[];
  note: string;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Cluster = {
  cluster_key: string;
  location_key: string | null;
  variants: Variant[];
  edges: Edge[];
  highest_confidence: "high" | "medium" | "low";
  total_family_count: number;
  cross_variant_reporters: Array<{ reporter_email: string; variants: string[] }>;
  research_notes: ResearchNote[];
};

type Decision = {
  cluster_key: string;
  location_key: string | null;
  decision: "same_actor" | "keep_separate";
  canonical_name: string | null;
  canonical_role: string | null;
  name_keys: string[];
  variants: unknown;
  note: string | null;
  decided_by: string | null;
  decided_at: string;
  updated_at: string;
};

type Resp = {
  clusters: Cluster[];
  decisions: Decision[];
  cluster_count: number;
  pending_count: number;
  decided_count: number;
  research_available?: boolean;
  error?: string;
};

const CONFIDENCE_STYLE: Record<Cluster["highest_confidence"], { label: string; bg: string; color: string; border: string }> = {
  high:   { label: "High",   bg: "rgba(185,28,28,0.18)", color: "rgb(252,165,165)", border: "rgba(185,28,28,0.4)" },
  medium: { label: "Medium", bg: "rgba(234,179,8,0.16)", color: "rgb(253,224,71)",  border: "rgba(234,179,8,0.4)" },
  low:    { label: "Low",    bg: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.55)", border: "rgba(255,255,255,0.15)" },
};

function uniqueReasons(edges: Edge[]): string[] {
  const set = new Set<string>();
  for (const e of edges) for (const r of e.reasons) set.add(r);
  return Array.from(set);
}

export function PossibleMatchesPanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"high" | "medium" | "all">("all");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);

  // Per-cluster local form state (canonical name + note + decision)
  type FormState = { canonicalName: string; canonicalRole: string; note: string };
  const [forms, setForms] = useState<Record<string, FormState>>({});

  // Per-cluster research-note draft (separate from the decision form so
  // adding a research note while still pondering a decision does not
  // wipe the canonical-name draft).
  type ResearchDraft = { note: string; sourceUrl: string };
  const [researchDrafts, setResearchDrafts] = useState<Record<string, ResearchDraft>>({});

  // Per-cluster expanded testimony toggle (notes/testimony are long).
  const [expandedTestimony, setExpandedTestimony] = useState<Record<string, boolean>>({});

  // Inline merge editor — keyed by the chosen primary row's id. When set,
  // an inline form opens beneath that row letting the admin pick which
  // OTHER rows in the same cluster fold into the primary plus edit the
  // public-facing merged_comment text. Closing/saving clears the key.
  type MergeForm = { mergedRowIds: string[]; mergedComment: string };
  const [mergeOpen, setMergeOpen] = useState<string | null>(null);
  const [mergeForms, setMergeForms] = useState<Record<string, MergeForm>>({});

  function buildAutoMergeComment(primary: VariantSample, others: VariantSample[]): string {
    // Privacy-safe public default: testimony only, separated by paragraph
    // breaks. The admin can edit before saving — and SHOULD strip any names
    // or emails that slipped into a free-text note.
    const parts: string[] = [];
    const allRows = [primary, ...others];
    for (const r of allRows) {
      const text = (r.notes ?? "").trim();
      if (text) parts.push(text);
    }
    return parts.join("\n\n");
  }

  function ensureMergeForm(primary: VariantSample, candidates: VariantSample[]): MergeForm {
    const existing = mergeForms[primary.row_id];
    if (existing) return existing;
    // If this row already IS a primary, pre-fill from saved state.
    if (primary.merge_primary_for && primary.merge_primary_for.length > 0 && primary.merged_comment) {
      return {
        mergedRowIds: [...primary.merge_primary_for],
        mergedComment: primary.merged_comment,
      };
    }
    // Otherwise, default to merging in everything from the same reporter email.
    const sameReporter = candidates.filter(
      c => c.row_id !== primary.row_id
        && primary.reporter_email
        && c.reporter_email
        && c.reporter_email.toLowerCase() === primary.reporter_email.toLowerCase(),
    );
    const defaults = sameReporter.length > 0 ? sameReporter : [];
    return {
      mergedRowIds: defaults.map(r => r.row_id),
      mergedComment: buildAutoMergeComment(primary, defaults),
    };
  }

  function setMergeForm(rowId: string, patch: Partial<MergeForm>) {
    setMergeForms(prev => {
      const base = prev[rowId] ?? { mergedRowIds: [], mergedComment: "" };
      return { ...prev, [rowId]: { ...base, ...patch } };
    });
  }

  function toggleMergeRow(primary: VariantSample, candidates: VariantSample[], rowId: string) {
    const form = ensureMergeForm(primary, candidates);
    const isIncluded = form.mergedRowIds.includes(rowId);
    const nextIds = isIncluded
      ? form.mergedRowIds.filter(id => id !== rowId)
      : [...form.mergedRowIds, rowId];
    const others = candidates.filter(c => nextIds.includes(c.row_id));
    setMergeForm(primary.row_id, {
      mergedRowIds: nextIds,
      // Only auto-rebuild the comment if the admin has not started editing
      // away from the auto value. Detection: current value equals what we'd
      // build for the previous selection — meaning admin hasn't edited.
      mergedComment: form.mergedComment === buildAutoMergeComment(primary, candidates.filter(c => form.mergedRowIds.includes(c.row_id)))
        ? buildAutoMergeComment(primary, others)
        : form.mergedComment,
    });
  }

  async function saveMerge(primary: VariantSample) {
    const form = mergeForms[primary.row_id];
    if (!form || form.mergedRowIds.length === 0) {
      window.alert("Pick at least one other row to merge into this primary.");
      return;
    }
    if (!form.mergedComment.trim()) {
      window.alert("Merged comment cannot be empty.");
      return;
    }
    setBusyKey(`merge:${primary.row_id}`);
    try {
      const res = await fetch("/api/admin/court-actors/comment-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_row_id: primary.row_id,
          merged_row_ids: form.mergedRowIds,
          merged_comment: form.mergedComment.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Merge save failed.");
        return;
      }
      if (json.warning) window.alert(json.warning);
      setMergeOpen(null);
      setMergeForms(prev => {
        const next = { ...prev };
        delete next[primary.row_id];
        return next;
      });
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  async function undoMerge(primaryRowId: string) {
    if (!window.confirm("Remove this comment-merge? The merged rows will re-enter family counts and the merged_comment override goes away. Original testimony is never touched.")) return;
    setBusyKey(`merge:${primaryRowId}`);
    try {
      const res = await fetch("/api/admin/court-actors/comment-merge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_row_id: primaryRowId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Undo failed.");
        return;
      }
      if (json.warning) window.alert(json.warning);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/court-actors/possible-matches");
      const json = (await res.json()) as Resp;
      if (!res.ok) {
        setError(json.error || "Failed to load possible matches.");
        setData(null);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function defaultFormFor(c: Cluster): FormState {
    // Default canonical name = the variant with the most families.
    const top = c.variants[0]?.display_name ?? "";
    const allRoles = new Map<string, number>();
    for (const v of c.variants) for (const r of v.roles) allRoles.set(r.role, (allRoles.get(r.role) ?? 0) + r.count);
    const role = Array.from(allRoles.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    // Pin to a known role option when possible, otherwise leave blank so
    // the dropdown shows "(no canonical role)" until the admin chooses.
    const roleSafe = ROLE_OPTIONS.includes(role) ? role : "";
    return { canonicalName: top, canonicalRole: roleSafe, note: "" };
  }

  function ensureForm(c: Cluster): FormState {
    return forms[c.cluster_key] ?? defaultFormFor(c);
  }

  // Critical: setForm merges onto the *cluster-aware* default (not an
  // empty string) so editing the canonical name does not clear a
  // canonical role that was auto-suggested but never typed yet.
  function setForm(c: Cluster, patch: Partial<FormState>) {
    setForms(prev => {
      const base = prev[c.cluster_key] ?? defaultFormFor(c);
      return { ...prev, [c.cluster_key]: { ...base, ...patch } };
    });
  }

  async function decide(c: Cluster, decision: "same_actor" | "keep_separate") {
    const form = ensureForm(c);
    if (decision === "same_actor" && !form.canonicalName.trim()) {
      window.alert("Choose a canonical name before marking as same actor.");
      return;
    }
    setBusyKey(c.cluster_key);
    try {
      const res = await fetch("/api/admin/court-actors/possible-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_key: c.cluster_key,
          location_key: c.location_key,
          decision,
          canonical_name: decision === "same_actor" ? form.canonicalName.trim() : null,
          canonical_role: decision === "same_actor" ? (form.canonicalRole.trim() || null) : null,
          name_keys: c.variants.map(v => v.name_key),
          variants: c.variants.map(v => ({
            name: v.display_name,
            name_key: v.name_key,
            roles: v.roles,
            counties: v.counties,
            family_count: v.family_count,
            location_key: c.location_key,
          })),
          note: form.note.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Save failed.");
        return;
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  function ensureResearchDraft(c: Cluster): ResearchDraft {
    return researchDrafts[c.cluster_key] ?? { note: "", sourceUrl: "" };
  }

  function setResearchDraft(clusterKey: string, patch: Partial<ResearchDraft>) {
    setResearchDrafts(prev => ({
      ...prev,
      [clusterKey]: { ...(prev[clusterKey] ?? { note: "", sourceUrl: "" }), ...patch },
    }));
  }

  async function saveResearchNote(c: Cluster) {
    const draft = ensureResearchDraft(c);
    const note = draft.note.trim();
    if (!note) {
      window.alert("Add a research note before saving.");
      return;
    }
    const url = draft.sourceUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      window.alert("Source URL must start with http:// or https://");
      return;
    }
    setBusyKey(`research:${c.cluster_key}`);
    try {
      const res = await fetch("/api/admin/court-actors/cluster-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cluster_key: c.cluster_key,
          location_key: c.location_key,
          name_keys: c.variants.map(v => v.name_key),
          note,
          source_url: url || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Save failed.");
        return;
      }
      setResearchDrafts(prev => ({ ...prev, [c.cluster_key]: { note: "", sourceUrl: "" } }));
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  async function markRowReview(rowId: string, decision: "duplicate" | "count_separately" | null) {
    setBusyKey(`row-review:${rowId}`);
    try {
      let res: Response;
      if (decision === null) {
        res = await fetch("/api/admin/court-actors/row-review", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ row_id: rowId }),
        });
      } else {
        res = await fetch("/api/admin/court-actors/row-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ row_id: rowId, decision }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Save failed.");
        return;
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteResearchNote(noteId: string, clusterKey: string) {
    if (!window.confirm("Delete this research note? The audit trail entry is permanent.")) return;
    setBusyKey(`research:${clusterKey}:${noteId}`);
    try {
      const res = await fetch("/api/admin/court-actors/cluster-research", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: noteId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Delete failed.");
        return;
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  async function reopen(d: Decision) {
    if (!window.confirm(`Reopen this cluster (${d.canonical_name || d.cluster_key})? It will reappear under Pending Review.`)) return;
    setBusyKey(d.cluster_key);
    try {
      const res = await fetch("/api/admin/court-actors/possible-matches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster_key: d.cluster_key }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Reopen failed.");
        return;
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusyKey(null);
    }
  }

  const allLocations = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const c of data.clusters) if (c.location_key) set.add(c.location_key);
    for (const d of data.decisions) if (d.location_key) set.add(d.location_key);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as Cluster[];
    return data.clusters.filter(c => {
      if (filter !== "all" && c.highest_confidence !== filter) return false;
      if (locationFilter && c.location_key !== locationFilter) return false;
      return true;
    });
  }, [data, filter, locationFilter]);

  return (
    <div>
      <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.12)" }}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.6)" }}>
            Close-spelling variants in the same location
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(245,245,245,0.4)" }}>
            Nothing here is merged automatically. Review each cluster and decide whether the variants are the same person or should stay separate.
          </p>
          {data && (
            <p className="text-[11px] mt-1" style={{ color: "rgba(245,245,245,0.55)" }}>
              {data.pending_count} pending · {data.decided_count} already decided · {data.cluster_count} total clusters detected
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded-md"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(245,245,245,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <option value="">All locations</option>
            {allLocations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <div className="flex items-center rounded-lg overflow-hidden"
            style={{ border: `1px solid rgba(201,162,39,0.3)`, backgroundColor: "rgba(255,255,255,0.04)" }}>
            {(["high", "medium", "all"] as const).map(val => (
              <button key={val} onClick={() => setFilter(val)}
                className="text-xs px-3 py-1.5 font-bold whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: filter === val ? "rgba(201,162,39,0.18)" : "transparent",
                  color: filter === val ? GOLD : "rgba(245,245,245,0.55)",
                }}>
                {val === "all" ? "All confidence" : `${val[0].toUpperCase()}${val.slice(1)} only`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowDecided(v => !v)}
            className="text-xs px-3 py-1.5 rounded-md font-bold transition-colors"
            style={{
              backgroundColor: showDecided ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.05)",
              color: showDecided ? GOLD : "rgba(245,245,245,0.6)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}>
            {showDecided ? "Hide decided" : "Show decided"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs px-3 py-1.5 rounded-md font-bold transition-colors"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              color: "rgba(245,245,245,0.7)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}>
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="px-6 py-8 text-center text-sm" style={{ color: "rgba(245,245,245,0.4)" }}>
          Loading possible matches…
        </div>
      )}
      {error && !loading && (
        <div className="px-6 py-8 text-sm" style={{ color: "rgb(252,165,165)" }}>
          {error}
        </div>
      )}
      {!loading && !error && data && filtered.length === 0 && !showDecided && (
        <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(245,245,245,0.4)" }}>
          No pending close-spelling matches at this confidence level.
        </div>
      )}

      {!loading && !error && data && filtered.map((c, i) => {
        const conf = CONFIDENCE_STYLE[c.highest_confidence];
        const reasons = uniqueReasons(c.edges);
        const form = ensureForm(c);
        const draft = ensureResearchDraft(c);
        const busy = busyKey === c.cluster_key;
        const researchBusy = busyKey === `research:${c.cluster_key}`;
        const expanded = expandedTestimony[c.cluster_key] ?? false;
        const crossVariant = c.cross_variant_reporters ?? [];
        const researchNotes = c.research_notes ?? [];
        return (
          <div key={c.cluster_key} className="px-6 py-4"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                style={{ backgroundColor: conf.bg, color: conf.color, border: `1px solid ${conf.border}` }}>
                {conf.label} confidence
              </span>
              <span className="text-xs font-bold" style={{ color: GOLD }}>
                {c.location_key ?? "(no location)"}
              </span>
              <span className="text-[11px]" style={{ color: "rgba(245,245,245,0.55)" }}>
                {c.variants.length} variants · would total {c.total_family_count} {c.total_family_count === 1 ? "family" : "families"} if merged
              </span>
              <button
                type="button"
                onClick={() => setExpandedTestimony(prev => ({ ...prev, [c.cluster_key]: !expanded }))}
                className="text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors"
                style={{
                  backgroundColor: expanded ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.05)",
                  color: expanded ? GOLD : "rgba(245,245,245,0.6)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}>
                {expanded ? "Hide testimony" : "Show testimony"}
              </button>
            </div>
            {reasons.length > 0 && (
              <div className="text-[11px] mb-2" style={{ color: "rgba(245,245,245,0.55)" }}>
                Why flagged: {reasons.join("; ")}
              </div>
            )}

            {crossVariant.length > 0 && (
              <div className="text-[11px] mb-2 px-2.5 py-1.5 rounded-md"
                style={{ backgroundColor: "rgba(234,179,8,0.10)", color: "rgb(253,224,71)", border: "1px solid rgba(234,179,8,0.3)" }}>
                <strong>Same-family signal:</strong> {crossVariant.length === 1 ? "1 reporter" : `${crossVariant.length} reporters`} typed more than one spelling — likely typos within one family, already deduped to one family per spelling pair.
                <ul className="mt-0.5 list-disc list-inside">
                  {crossVariant.slice(0, 6).map(r => (
                    <li key={r.reporter_email}>{r.reporter_email} → {r.variants.length} variants</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 mb-3">
              {c.variants.map(v => {
                const sample = v.samples?.[0];
                const samplesToShow = expanded ? (v.samples ?? []) : sample ? [sample] : [];
                // Variant-level Google search uses the variant's most-frequent
                // submitted role, the displayed (reporter) name, and the
                // full state name when location_key is a US state.
                const topVariantRole = v.roles?.[0]?.role ?? null;
                const variantGoogleUrl = googleSearchUrlFor(v.display_name, topVariantRole, c.location_key);
                return (
                  <div key={v.name_key} className="px-3 py-2 rounded-lg"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <span className="font-semibold text-sm text-white">{v.display_name}</span>
                        <span className="text-[11px] ml-2" style={{ color: "rgba(245,245,245,0.45)" }}>
                          key: {v.name_key}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={variantGoogleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded-md font-bold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.3)" }}
                          title={`Google: ${v.display_name}${topVariantRole ? " " + cleanRoleForSearch(topVariantRole).toLowerCase() : ""} in ${locationDisplay(c.location_key) || "this location"}`}>
                          Google
                        </a>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD }}>
                          {v.family_count} {v.family_count === 1 ? "family" : "families"}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: "rgba(245,245,245,0.55)" }}>
                      Roles: {v.roles.map(r => `${r.role} ×${r.count}`).join(", ") || "—"}
                    </div>
                    {v.counties.length > 0 && (
                      <div className="text-[11px]" style={{ color: "rgba(245,245,245,0.45)" }}>
                        Counties/courts: {v.counties.map(cc => `${cc.county} ×${cc.count}`).join(", ")}
                      </div>
                    )}
                    {v.reporter_emails.length > 0 && (
                      <div className="text-[10px] mt-0.5" style={{ color: "rgba(245,245,245,0.35)" }}>
                        Reporters (admin only): {v.reporter_emails.slice(0, 6).join(", ")}{v.reporter_emails.length > 6 ? ` +${v.reporter_emails.length - 6} more` : ""}
                      </div>
                    )}

                    {samplesToShow.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {samplesToShow.map(s => {
                          const rowBusy = busyKey === `row-review:${s.row_id}` || busyKey === `merge:${s.row_id}`;
                          const isDup = s.review_decision === "duplicate";
                          const isSep = s.review_decision === "count_separately";
                          const isMerged = s.review_decision === "merge_comments" || Boolean(s.merged_into);
                          const isPrimary = Array.isArray(s.merge_primary_for) && s.merge_primary_for.length > 0;
                          const sameEmailWarn = s.cluster_email_count > 1;
                          const sameSubWarn = s.cluster_submission_count > 1;
                          // The full sample list across all variants — used by the inline merge editor
                          // to pick rows to fold into this primary, regardless of which variant they live under.
                          const allClusterSamples: VariantSample[] = c.variants.flatMap(vv => vv.samples ?? []);
                          const mergeIsOpen = mergeOpen === s.row_id;
                          const mergeForm = mergeIsOpen
                            ? ensureMergeForm(s, allClusterSamples)
                            : { mergedRowIds: [], mergedComment: "" };
                          return (
                            <div key={s.row_id} className="px-2.5 py-1.5 rounded"
                              style={{
                                backgroundColor: isDup || isMerged ? "rgba(120,120,120,0.10)" : "rgba(0,0,0,0.18)",
                                border: isDup
                                  ? "1px dashed rgba(255,255,255,0.2)"
                                  : isMerged
                                    ? "1px dashed rgba(56,189,248,0.35)"
                                    : isPrimary
                                      ? "1px solid rgba(56,189,248,0.5)"
                                      : "1px solid rgba(255,255,255,0.05)",
                                opacity: isDup || isMerged ? 0.7 : 1,
                              }}>
                              <div className="text-[10px] mb-0.5 flex items-center gap-2 flex-wrap" style={{ color: "rgba(245,245,245,0.55)" }}>
                                <span><strong>{s.reporter_name || "(no name on file)"}</strong> &lt;{s.reporter_email || "no email"}&gt;</span>
                                {s.court_or_county && <span>· actor county: {s.court_or_county}</span>}
                                {s.reporter_case_county && <span>· case county: {s.reporter_case_county}</span>}
                                <span>· role: {s.role}</span>
                                {s.created_at && <span>· {new Date(s.created_at).toLocaleDateString()}</span>}
                                {s.source && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={s.source === "form_direct"
                                      ? { backgroundColor: "rgba(74,222,128,0.15)", color: "rgb(134,239,172)" }
                                      : { backgroundColor: "rgba(59,130,246,0.18)", color: "rgb(147,197,253)" }}>
                                    {s.source}
                                  </span>
                                )}
                                {s.counts_publicly && !isDup ? (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "rgb(134,239,172)" }}>
                                    counts
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={{ backgroundColor: "rgba(120,120,120,0.18)", color: "rgba(245,245,245,0.55)" }}>
                                    not counting
                                  </span>
                                )}
                                {isDup && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={{ backgroundColor: "rgba(252,165,165,0.15)", color: "rgb(252,165,165)" }}>
                                    duplicate
                                  </span>
                                )}
                                {isSep && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={{ backgroundColor: "rgba(201,162,39,0.18)", color: GOLD }}>
                                    count separately
                                  </span>
                                )}
                                {isMerged && !isPrimary && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={{ backgroundColor: "rgba(56,189,248,0.16)", color: "rgb(125,211,252)" }}
                                    title={`Testimony merged into row ${s.merged_into}`}>
                                    merged → {s.merged_into?.slice(0, 8)}…
                                  </span>
                                )}
                                {isPrimary && (
                                  <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                    style={{ backgroundColor: "rgba(56,189,248,0.22)", color: "rgb(186,230,253)" }}
                                    title={`Primary of a comment merge — combines testimony from ${s.merge_primary_for!.length} other row(s)`}>
                                    primary +{s.merge_primary_for!.length}
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] mb-1 flex items-center gap-2 flex-wrap" style={{ color: "rgba(245,245,245,0.35)" }}>
                                <span>row id: {s.row_id}</span>
                                <span>· submission: {s.submission_id}</span>
                              </div>
                              {(sameEmailWarn || sameSubWarn) && (
                                <div className="text-[10px] mb-1" style={{ color: "rgb(253,224,71)" }}>
                                  {sameEmailWarn && (
                                    <span>⚠ Same email reported {s.cluster_email_count} rows in this cluster. </span>
                                  )}
                                  {sameSubWarn && (
                                    <span>⚠ Same submission has {s.cluster_submission_count} actor rows in this cluster.</span>
                                  )}
                                </div>
                              )}
                              {s.notes ? (
                                <div className="text-[11px] italic" style={{ color: "rgba(245,245,245,0.78)" }}>
                                  {`"${s.notes}"`}
                                </div>
                              ) : (
                                <div className="text-[10px]" style={{ color: "rgba(245,245,245,0.35)" }}>(no testimony note)</div>
                              )}
                              {isPrimary && s.merged_comment && (
                                <div className="mt-1.5 px-2 py-1.5 rounded text-[11px]"
                                  style={{ backgroundColor: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.25)", color: "rgba(245,245,245,0.85)" }}>
                                  <div className="text-[9px] mb-1 font-bold uppercase" style={{ color: "rgb(125,211,252)" }}>
                                    Public merged comment (replaces this row&apos;s note in PDFs/dashboards)
                                  </div>
                                  <div className="whitespace-pre-wrap">{s.merged_comment}</div>
                                </div>
                              )}
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  disabled={rowBusy || isDup || isMerged}
                                  onClick={() => void markRowReview(s.row_id, "duplicate")}
                                  title="Do not count the extra row. Testimony stays in court_actors but is hidden from public output."
                                  className="text-[10px] px-2 py-0.5 rounded font-bold transition-opacity disabled:opacity-50"
                                  style={{ backgroundColor: "rgba(120,120,120,0.18)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.18)" }}>
                                  {rowBusy ? "…" : "Mark duplicate"}
                                </button>
                                <button
                                  type="button"
                                  disabled={rowBusy || isSep || isMerged}
                                  onClick={() => void markRowReview(s.row_id, "count_separately")}
                                  title="Same email but different court matter — count as its own family."
                                  className="text-[10px] px-2 py-0.5 rounded font-bold transition-opacity disabled:opacity-50"
                                  style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: "1px solid rgba(201,162,39,0.35)" }}>
                                  {rowBusy ? "…" : "Count separately"}
                                </button>
                                <button
                                  type="button"
                                  disabled={rowBusy || isDup || isMerged}
                                  onClick={() => setMergeOpen(prev => prev === s.row_id ? null : s.row_id)}
                                  title="Count once but combine multiple comments from this reporter into one merged display note (preserves both testimonies)."
                                  className="text-[10px] px-2 py-0.5 rounded font-bold transition-opacity disabled:opacity-50"
                                  style={{ backgroundColor: "rgba(56,189,248,0.15)", color: "rgb(125,211,252)", border: "1px solid rgba(56,189,248,0.35)" }}>
                                  {isPrimary ? "Edit merged comment" : "Merge comments"}
                                </button>
                                {(isDup || isSep) && (
                                  <button
                                    type="button"
                                    disabled={rowBusy}
                                    onClick={() => void markRowReview(s.row_id, null)}
                                    title="Clear the row decision (back to normal email|location dedupe)."
                                    className="text-[10px] px-2 py-0.5 rounded font-bold transition-opacity disabled:opacity-50"
                                    style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                    {rowBusy ? "…" : "Reset to normal"}
                                  </button>
                                )}
                                {isPrimary && (
                                  <button
                                    type="button"
                                    disabled={rowBusy}
                                    onClick={() => void undoMerge(s.row_id)}
                                    title="Remove this comment-merge. Merged rows re-enter family counts. Original testimony was never touched."
                                    className="text-[10px] px-2 py-0.5 rounded font-bold transition-opacity disabled:opacity-50"
                                    style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                    {rowBusy ? "…" : "Undo merge"}
                                  </button>
                                )}
                              </div>
                              {mergeIsOpen && (
                                <div className="mt-2 px-2.5 py-2 rounded"
                                  style={{ backgroundColor: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.3)" }}>
                                  <div className="text-[10px] mb-1.5 font-bold uppercase" style={{ color: "rgb(125,211,252)" }}>
                                    Merge other rows into THIS primary
                                  </div>
                                  <div className="text-[10px] mb-2" style={{ color: "rgba(245,245,245,0.6)" }}>
                                    Pick the rows whose testimony should fold into this one. Rows from the same reporter email are pre-selected. The merged comment below replaces this row&apos;s display note in PDFs and dashboards. Original notes stay preserved in <code>court_actors</code>.
                                  </div>
                                  <div className="space-y-1 mb-2">
                                    {allClusterSamples.filter(o => o.row_id !== s.row_id).map(o => {
                                      const checked = mergeForm.mergedRowIds.includes(o.row_id);
                                      const isOtherMerged = Boolean(o.merged_into) && o.merged_into !== s.row_id;
                                      return (
                                        <label key={o.row_id}
                                          className="flex items-start gap-2 px-2 py-1 rounded cursor-pointer"
                                          style={{ backgroundColor: checked ? "rgba(56,189,248,0.1)" : "transparent" }}
                                          title={isOtherMerged ? `Already merged into row ${o.merged_into}` : ""}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={isOtherMerged}
                                            onChange={() => toggleMergeRow(s, allClusterSamples, o.row_id)}
                                            className="mt-0.5"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-[10px]" style={{ color: "rgba(245,245,245,0.7)" }}>
                                              <strong>{o.reporter_name || "(no name)"}</strong> &lt;{o.reporter_email || "no email"}&gt;
                                              {o.created_at && <span> · {new Date(o.created_at).toLocaleDateString()}</span>}
                                              <span> · row {o.row_id.slice(0, 8)}…</span>
                                              {isOtherMerged && (
                                                <span className="ml-1 text-[9px] px-1 py-0.5 rounded font-bold uppercase"
                                                  style={{ backgroundColor: "rgba(120,120,120,0.18)", color: "rgba(245,245,245,0.55)" }}>
                                                  already merged elsewhere
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-[10px] italic truncate" style={{ color: "rgba(245,245,245,0.55)" }}>
                                              {o.notes ? `"${o.notes.slice(0, 140)}${o.notes.length > 140 ? "…" : ""}"` : "(no testimony note)"}
                                            </div>
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                  <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: "rgb(125,211,252)" }}>
                                    Merged comment (public — edit before saving)
                                  </label>
                                  <textarea
                                    value={mergeForm.mergedComment}
                                    onChange={e => setMergeForm(s.row_id, { mergedComment: e.target.value })}
                                    rows={6}
                                    placeholder="Auto-built from selected rows. Strip any names/emails before saving."
                                    className="w-full text-[11px] rounded p-2 font-mono"
                                    style={{ backgroundColor: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(245,245,245,0.9)" }}
                                  />
                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={rowBusy || mergeForm.mergedRowIds.length === 0 || !mergeForm.mergedComment.trim()}
                                      onClick={() => void saveMerge(s)}
                                      className="text-[10px] px-3 py-1 rounded font-bold transition-opacity disabled:opacity-50"
                                      style={{ backgroundColor: "rgba(56,189,248,0.25)", color: "rgb(186,230,253)", border: "1px solid rgba(56,189,248,0.5)" }}>
                                      {rowBusy ? "Saving…" : "Save merge"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={rowBusy}
                                      onClick={() => { setMergeOpen(null); setMergeForms(prev => { const n = { ...prev }; delete n[s.row_id]; return n; }); }}
                                      className="text-[10px] px-3 py-1 rounded font-bold transition-opacity"
                                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!expanded && (v.samples?.length ?? 0) > 1 && (
                          <button
                            type="button"
                            onClick={() => setExpandedTestimony(prev => ({ ...prev, [c.cluster_key]: true }))}
                            className="text-[10px] underline underline-offset-2"
                            style={{ color: "rgba(245,245,245,0.55)" }}>
                            +{(v.samples?.length ?? 0) - 1} more under this spelling
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Research notes — durable, audit-trailed, do not affect counts. */}
            <div className="mb-3 px-3 py-2 rounded-lg"
              style={{ backgroundColor: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "rgba(245,245,245,0.55)" }}>
                Research notes ({researchNotes.length})
              </div>
              {researchNotes.length === 0 && (
                <div className="text-[11px] mb-2" style={{ color: "rgba(245,245,245,0.4)" }}>
                  No research notes yet. Save your DOPL/judicial-directory/Google findings here before deciding.
                </div>
              )}
              {researchNotes.length > 0 && (
                <ul className="space-y-1.5 mb-2">
                  {researchNotes.map(n => (
                    <li key={n.id} className="text-[11px] px-2 py-1.5 rounded"
                      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ color: "rgba(245,245,245,0.85)" }}>{n.note}</div>
                      {n.source_url && (
                        <a href={n.source_url} target="_blank" rel="noopener noreferrer"
                          className="underline underline-offset-2 break-all"
                          style={{ color: "rgb(147,197,253)" }}>
                          {n.source_url}
                        </a>
                      )}
                      <div className="mt-0.5 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px]" style={{ color: "rgba(245,245,245,0.4)" }}>
                          by {n.created_by ?? "?"} · {new Date(n.created_at).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          disabled={busyKey === `research:${c.cluster_key}:${n.id}`}
                          onClick={() => void deleteResearchNote(n.id, c.cluster_key)}
                          className="text-[10px] underline underline-offset-2 disabled:opacity-50"
                          style={{ color: "rgb(252,165,165)" }}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-end gap-2 flex-wrap">
                <label className="flex flex-col text-[10px] flex-1" style={{ color: "rgba(245,245,245,0.5)", minWidth: 240 }}>
                  Add a research note
                  <textarea
                    value={draft.note}
                    onChange={e => setResearchDraft(c.cluster_key, { note: e.target.value })}
                    placeholder="e.g. Utah DOPL active license confirmed for Kyle Max Hancock, Wellsville. Need reporter confirmation re: Cache vs Weber."
                    rows={2}
                    className="text-[11px] px-2 py-1 rounded-md mt-0.5"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}
                  />
                </label>
                <label className="flex flex-col text-[10px]" style={{ color: "rgba(245,245,245,0.5)" }}>
                  Source URL (optional)
                  <input
                    type="url"
                    value={draft.sourceUrl}
                    onChange={e => setResearchDraft(c.cluster_key, { sourceUrl: e.target.value })}
                    placeholder="https://secure.utah.gov/llv/search/…"
                    className="text-[11px] px-2 py-1 rounded-md mt-0.5"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.15)", minWidth: 240 }}
                  />
                </label>
                <button
                  type="button"
                  disabled={researchBusy}
                  onClick={() => void saveResearchNote(c)}
                  className="text-[11px] px-3 py-1.5 rounded-md font-bold transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "rgba(59,130,246,0.18)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.35)" }}>
                  {researchBusy ? "…" : "Save research note"}
                </button>
              </div>
              {data?.research_available === false && (
                <div className="text-[10px] mt-2" style={{ color: "rgb(252,165,165)" }}>
                  Run Supabase migration 021 to enable research notes.
                </div>
              )}
            </div>

            {/* All-reported-roles summary across the entire cluster.
                Even if the admin picks one canonical role, the role
                history is preserved so a person who was an attorney
                and later a commissioner is still legible. */}
            {(() => {
              const acc = new Map<string, number>();
              for (const v of c.variants) for (const r of v.roles) acc.set(r.role, (acc.get(r.role) ?? 0) + r.count);
              const sorted = Array.from(acc.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
              if (sorted.length === 0) return null;
              return (
                <div className="text-[11px] mb-2" style={{ color: "rgba(245,245,245,0.55)" }}>
                  All reported roles across this cluster: {sorted.map(([role, count]) => `${role} ×${count}`).join(", ")}
                  {sorted.length > 1 && (
                    <span style={{ color: "rgb(253,224,71)" }}> · multiple roles reported — preserve role history</span>
                  )}
                </div>
              );
            })()}

            {/* Canonical search button — uses the canonical name + selected role. */}
            <div className="mb-2">
              <a
                href={googleSearchUrlFor(form.canonicalName || c.variants[0]?.display_name || "", form.canonicalRole || c.variants[0]?.roles?.[0]?.role || null, c.location_key)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-2 py-1 rounded-md font-bold inline-block transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(59,130,246,0.18)", color: "rgb(147,197,253)", border: "1px solid rgba(59,130,246,0.35)" }}>
                Search Google for canonical name + role + state
              </a>
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <label className="flex flex-col text-[11px]" style={{ color: "rgba(245,245,245,0.55)" }}>
                Canonical name
                <input
                  type="text"
                  value={form.canonicalName}
                  onChange={e => setForm(c, { canonicalName: e.target.value })}
                  className="text-sm px-2 py-1 rounded-md mt-0.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.15)", minWidth: 200 }}
                />
              </label>
              <label className="flex flex-col text-[11px]" style={{ color: "rgba(245,245,245,0.55)" }}>
                Canonical role (current/public)
                <select
                  value={form.canonicalRole}
                  onChange={e => setForm(c, { canonicalRole: e.target.value })}
                  className="text-sm px-2 py-1 rounded-md mt-0.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.15)", minWidth: 200 }}>
                  <option value="">(no canonical role)</option>
                  {ROLE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {form.canonicalRole && !ROLE_OPTIONS.includes(form.canonicalRole) && (
                    <option value={form.canonicalRole}>{form.canonicalRole} (custom)</option>
                  )}
                </select>
              </label>
              <label className="flex flex-col text-[11px] flex-1" style={{ color: "rgba(245,245,245,0.55)", minWidth: 200 }}>
                Decision note (optional)
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm(c, { note: e.target.value })}
                  placeholder="Why this is the same person, or why not"
                  className="text-sm px-2 py-1 rounded-md mt-0.5"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(c, "same_actor")}
                  className="text-xs px-3 py-1.5 rounded-md font-bold transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "rgba(74,222,128,0.18)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.35)" }}>
                  {busy ? "…" : "Mark same actor"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(c, "keep_separate")}
                  className="text-xs px-3 py-1.5 rounded-md font-bold transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.7)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  {busy ? "…" : "Keep separate"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {showDecided && data && data.decisions.length > 0 && (
        <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="px-6 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(245,245,245,0.5)" }}>
            Decided ({data.decisions.length})
          </div>
          {data.decisions.map((d, i) => (
            <div key={d.cluster_key} className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                    style={d.decision === "same_actor"
                      ? { backgroundColor: "rgba(74,222,128,0.15)", color: "rgb(134,239,172)", border: "1px solid rgba(74,222,128,0.3)" }
                      : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.55)", border: "1px solid rgba(255,255,255,0.15)" }}>
                    {d.decision === "same_actor" ? "Same actor" : "Keep separate"}
                  </span>
                  <span className="text-xs font-bold" style={{ color: GOLD }}>{d.location_key ?? "(no location)"}</span>
                  <span className="text-sm font-semibold text-white">
                    {d.canonical_name || "(separate)"}
                  </span>
                  {d.canonical_role && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(245,245,245,0.7)" }}>
                      {d.canonical_role}
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "rgba(245,245,245,0.45)" }}>
                  Variants: {d.name_keys.join(", ")}
                </div>
                {d.note && (
                  <div className="text-[11px] mt-1 italic" style={{ color: "rgba(245,245,245,0.55)" }}>
                    Note: {d.note}
                  </div>
                )}
                <div className="text-[10px] mt-1" style={{ color: "rgba(245,245,245,0.35)" }}>
                  Decided by {d.decided_by ?? "?"} on {new Date(d.decided_at).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                disabled={busyKey === d.cluster_key}
                onClick={() => void reopen(d)}
                className="text-xs px-3 py-1.5 rounded-md font-bold transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(245,245,245,0.65)", border: "1px solid rgba(255,255,255,0.18)" }}>
                {busyKey === d.cluster_key ? "…" : "Reopen"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

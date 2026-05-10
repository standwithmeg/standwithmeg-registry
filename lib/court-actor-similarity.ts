/**
 * Court actor similarity utilities — used to surface possible duplicate
 * spellings to the admin for review. Suggestions only; nothing here
 * silently merges names. Merging only happens when the admin saves a
 * 'same_actor' decision in court_actor_alias_decisions and that decision
 * is applied at read time by the counting code.
 *
 * Library policy:
 * - Conservative: prefer false negatives (a missed pair the admin can
 *   still spot manually) over false positives (collapsing two distinct
 *   judges into one).
 * - Per-location: similarity clusters never cross location_key. Admin
 *   reviewing Utah variants should not see Florida variants in the
 *   same suggestion.
 * - Reasoned: every flag includes machine-readable reasons so the UI
 *   can explain "one-letter typo", "same last name", etc.
 */

import { actorNameKey, actorLooseNameKey, resolveFamilyKey, type CourtActorRowReviewDecision } from "./court-actors";

// ---------------------------------------------------------------------
// Edit distance (Damerau-Levenshtein with transpositions, e.g. "Cathrin"
// vs "Cathrine" = 1, "ie" vs "ei" = 1).
// ---------------------------------------------------------------------
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const matrix: number[][] = Array.from({ length: al + 1 }, () =>
    new Array<number>(bl + 1).fill(0),
  );
  for (let i = 0; i <= al; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bl; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= al; i += 1) {
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }

  return matrix[al][bl];
}

function tokens(name: string): string[] {
  return actorNameKey(name).split(" ").filter(Boolean);
}

// First-name nicknames seen in Stand With Meg court actor data and the
// general Anglo-American legal name stock. Conservative — only one-way
// canonicalization (alias → canonical). Extending this list is fine;
// removing entries silently changes counts for established actors.
const NICKNAME_GROUPS: string[][] = [
  ["andrew", "andy", "drew"],
  ["catherine", "cathrin", "cathrine", "cathy", "kathy", "katherine", "kate"],
  ["christopher", "chris", "kris"],
  ["daniel", "dan", "danny"],
  ["david", "dave"],
  ["elizabeth", "liz", "beth", "betty", "eliza"],
  ["james", "jim", "jimmy", "jamie"],
  ["jennifer", "jen", "jenny"],
  ["jonathan", "john", "johnny", "jon"],
  ["joseph", "joe", "joey"],
  ["kevin", "keven", "kev"],
  ["matthew", "matt", "matty"],
  ["michael", "mike", "mikey"],
  ["nicholas", "nick", "nicky"],
  ["patricia", "pat", "patty", "trisha"],
  ["rebecca", "becky", "becca"],
  ["richard", "rick", "ricky", "dick"],
  ["robert", "rob", "bob", "bobby"],
  ["stephen", "steven", "steve"],
  ["thomas", "tom", "tommy"],
  ["timothy", "tim", "timmy"],
  ["william", "will", "bill", "billy"],
];

const NICKNAME_INDEX: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const group of NICKNAME_GROUPS) {
    const set = new Set(group);
    for (const name of group) m.set(name, set);
  }
  return m;
})();

function shareNicknameGroup(a: string, b: string): boolean {
  const ga = NICKNAME_INDEX.get(a);
  if (!ga) return false;
  return ga.has(b);
}

// ---------------------------------------------------------------------
// Pairwise similarity. Returns null if the two normalized names are
// not similar enough to flag, otherwise a {confidence, reasons} record.
//
// Names passed here should already share a location_key. We never
// flag cross-location pairs without the admin asking for it.
// ---------------------------------------------------------------------
export type SimilarityHit = {
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

export function nameSimilarity(rawA: string, rawB: string): SimilarityHit | null {
  const ka = actorNameKey(rawA);
  const kb = actorNameKey(rawB);
  if (!ka || !kb) return null;
  if (ka === kb) {
    // Existing exact-key merge already collapses these — no review needed.
    return null;
  }

  // Loose keys collapse runs of repeated letters in long tokens. If the
  // loose keys match exactly, that is the existing automatic merge and
  // not a "review me" candidate.
  const la = actorLooseNameKey(rawA);
  const lb = actorLooseNameKey(rawB);
  if (la === lb) return null;

  const reasons: string[] = [];

  const ta = tokens(rawA);
  const tb = tokens(rawB);
  if (ta.length === 0 || tb.length === 0) return null;

  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  const firstA = ta[0];
  const firstB = tb[0];

  const lastEd = damerauLevenshtein(lastA, lastB);
  const firstEd = damerauLevenshtein(firstA, firstB);
  const fullEd = damerauLevenshtein(ka, kb);

  let lastSimilar = false;
  if (lastA === lastB) {
    reasons.push("same last name");
    lastSimilar = true;
  } else if (lastA.length >= 4 && lastB.length >= 4 && lastEd === 1) {
    reasons.push("last-name one-letter typo");
    lastSimilar = true;
  } else if (lastA.length >= 6 && lastB.length >= 6 && lastEd <= 2) {
    reasons.push("last-name close spelling");
    lastSimilar = true;
  }

  let firstSimilar = false;
  if (firstA === firstB) {
    reasons.push("same first name");
    firstSimilar = true;
  } else if (shareNicknameGroup(firstA, firstB)) {
    reasons.push("first-name nickname/variant");
    firstSimilar = true;
  } else if (firstA.length >= 3 && firstB.length >= 3 && firstEd === 1) {
    reasons.push("first-name one-letter typo");
    firstSimilar = true;
  } else if (firstA[0] === firstB[0] && (firstA.length <= 2 || firstB.length <= 2)) {
    reasons.push("first-name initial vs full");
    firstSimilar = true;
  }

  // Decide confidence.
  let confidence: SimilarityHit["confidence"] | null = null;

  // Strong: same last name + first-name match/nickname/typo.
  if (lastA === lastB && firstSimilar) {
    confidence = "high";
  } else if (lastSimilar && firstA === firstB) {
    confidence = "high";
  } else if (lastSimilar && firstSimilar) {
    confidence = "medium";
  }

  // Whole-string single-edit catch (e.g. one stray letter anywhere in
  // a long-ish name). Useful for "Cathrin Conklin" vs "Cathrine Conklin"
  // when token boundaries differ.
  if (!confidence && fullEd === 1 && ka.length >= 6 && kb.length >= 6) {
    reasons.push("one-letter typo across full name");
    confidence = "high";
  } else if (!confidence && fullEd === 2 && ka.length >= 8 && kb.length >= 8) {
    reasons.push("two-letter typo across full name");
    confidence = "medium";
  }

  // One side has only a last name after title-stripping. After actorNameKey
  // strips role prefixes, "Magistrate Blevins" collapses to ["blevins"] while
  // "Angela Blevins" stays ["angela", "blevins"]. Same (or close-spelling)
  // last name + a single-token variant is a real "needs admin review"
  // signal — usually one reporter only knew the actor's title + surname,
  // possibly with a small typo. Examples we want to catch:
  //   "Mary Mattivi" vs "Mativi"        (Kansas: surname typo + missing first)
  //   "Magistrate Blevins" vs "Angela Blevins"  (already caught by lastA===lastB)
  if (!confidence && ta.length !== tb.length && (ta.length === 1 || tb.length === 1)) {
    const single = ta.length === 1 ? ta[0] : tb[0];
    const multiLast = ta.length === 1 ? lastB : lastA;
    if (single && multiLast && single.length >= 4 && multiLast.length >= 4) {
      if (single === multiLast) {
        reasons.push("one variant has no first name, same last name");
        confidence = "medium";
      } else {
        const ed = damerauLevenshtein(single, multiLast);
        if (ed === 1) {
          reasons.push("one variant has no first name, last-name one-letter typo");
          confidence = "medium";
        } else if (ed === 2 && single.length >= 6 && multiLast.length >= 6) {
          reasons.push("one variant has no first name, last-name close spelling");
          confidence = "low";
        }
      }
    }
  }

  // Same number of tokens, all but one identical, differing token edit
  // distance ≤ 2 (e.g. middle initial vs middle name, hyphenated drop,
  // misspelled middle).
  if (!confidence && ta.length === tb.length && ta.length >= 2) {
    let differing = 0;
    let differingPair: [string, string] | null = null;
    for (let i = 0; i < ta.length; i += 1) {
      if (ta[i] !== tb[i]) {
        differing += 1;
        differingPair = [ta[i], tb[i]];
      }
    }
    if (differing === 1 && differingPair) {
      const ed = damerauLevenshtein(differingPair[0], differingPair[1]);
      if (ed <= 1) {
        reasons.push("one token differs by ≤1 letter");
        confidence = "high";
      } else if (ed <= 2) {
        reasons.push("one token differs by ≤2 letters");
        confidence = "medium";
      }
    }
  }

  if (!confidence) return null;
  return { confidence, reasons };
}

// ---------------------------------------------------------------------
// Cluster builder. Groups raw rows into per-location clusters of names
// that bucket together (existing automatic merge — these stay merged)
// and additional similarity edges that the admin should review.
//
// Output: one cluster per connected component within a location.
// ---------------------------------------------------------------------
export type ActorRowForClustering = {
  id: string;
  name: string;
  role: string;
  location_key: string | null;
  court_or_county: string | null;
  source: string | null;
  submission_id: string;
  reporter_email: string | null;
  reporter_name?: string | null;
  reporter_case_county?: string | null;
  notes?: string | null;
  created_at?: string | null;
  review_decision?: CourtActorRowReviewDecision;
};

export type ClusterVariantSample = {
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
  review_decision: CourtActorRowReviewDecision;
  // True when this row currently contributes to the bucket family count.
  // False for duplicate-marked rows or non-form_direct rows under public
  // counting rules. The UI uses this to badge each row clearly.
  counts_publicly: boolean;
  // How many other rows in the SAME cluster share this email or
  // submission_id. >1 means "this reporter / submission is repeated."
  cluster_email_count: number;
  cluster_submission_count: number;
  // Comment-merge state, populated by the route handler from
  // court_actor_comment_merges. Default null when no merge involves this row.
  //   merged_into:        primary row id this row's testimony was folded into.
  //   merge_primary_for:  row ids merged into this row (this row IS the primary).
  //   merged_comment:     when this row IS the primary, the public-facing combined text.
  merged_into?: string | null;
  merge_primary_for?: string[] | null;
  merged_comment?: string | null;
};

export type ClusterVariant = {
  name_key: string;            // actorLooseNameKey
  display_name: string;        // most frequent original casing in this variant
  roles: Array<{ role: string; count: number }>;
  counties: Array<{ county: string; count: number }>;
  family_count: number;        // distinct families per variant (email|location, fallback submission_id)
  row_ids: string[];
  reporter_emails: string[];
  submission_ids: string[];
  sources: string[];
  // One row per underlying court_actors record, in chronological order, so
  // the admin can read the testimony and county/role context that backs
  // the bucket. Trimmed to a sensible cap (set in the cluster builder).
  samples: ClusterVariantSample[];
};

export type SuggestedCluster = {
  cluster_key: string;
  location_key: string | null;
  variants: ClusterVariant[];
  edges: Array<{
    a: string;                 // name_key
    b: string;                 // name_key
    confidence: "high" | "medium" | "low";
    reasons: string[];
  }>;
  highest_confidence: "high" | "medium" | "low";
  total_family_count: number;  // distinct families across all variants in cluster
  // Reporter emails that appear under more than one spelling variant in this
  // cluster. Strong "same person, same family typed two spellings" signal —
  // and a reminder that those rows already dedupe to one family before merge.
  cross_variant_reporters: Array<{ reporter_email: string; variants: string[] }>;
};

function familyKeyFromRow(row: ActorRowForClustering): string | null {
  return resolveFamilyKey({
    row_id: row.id,
    reporter_email: row.reporter_email,
    submission_id: row.submission_id,
    location_key: row.location_key,
    review_decision: row.review_decision,
  });
}

// Build a deterministic cluster_key from sorted unique name_keys + location.
// Used to look up an existing alias decision for this exact suggestion.
export function buildClusterKey(name_keys: string[], location_key: string | null): string {
  const sorted = Array.from(new Set(name_keys.filter(Boolean))).sort();
  return `${sorted.join("|")}|@${location_key ?? ""}`;
}

export function buildSuggestedClusters(
  rows: ActorRowForClustering[],
  options?: {
    onlyFormDirect?: boolean; // default true — public-safe data only
  },
): SuggestedCluster[] {
  const onlyFormDirect = options?.onlyFormDirect ?? true;

  // Group by (location_key) → variant (name_key) → aggregated stats.
  type VariantAcc = {
    name_key: string;
    name_counts: Map<string, number>;
    role_counts: Map<string, number>;
    county_counts: Map<string, number>;
    families: Set<string>;
    row_ids: Set<string>;
    submission_ids: Set<string>;
    reporter_emails: Set<string>;
    sources: Set<string>;
    samples: ClusterVariantSample[];
  };

  const byLocation = new Map<string, Map<string, VariantAcc>>();

  for (const row of rows) {
    if (onlyFormDirect && (row.source ?? "form_direct") !== "form_direct") continue;
    if (!row.role || !row.name) continue;
    const loc = row.location_key ?? "";
    if (!loc) continue;
    const nameKey = actorLooseNameKey(row.name);
    if (!nameKey) continue;

    let bucket = byLocation.get(loc);
    if (!bucket) {
      bucket = new Map<string, VariantAcc>();
      byLocation.set(loc, bucket);
    }
    let variant = bucket.get(nameKey);
    if (!variant) {
      variant = {
        name_key: nameKey,
        name_counts: new Map<string, number>(),
        role_counts: new Map<string, number>(),
        county_counts: new Map<string, number>(),
        families: new Set<string>(),
        row_ids: new Set<string>(),
        submission_ids: new Set<string>(),
        reporter_emails: new Set<string>(),
        sources: new Set<string>(),
        samples: [],
      };
      bucket.set(nameKey, variant);
    }
    // Don't let role/county aggregates be inflated by rows that are
    // explicitly excluded from counting.
    const counted = row.review_decision !== "duplicate";
    if (counted) {
      variant.name_counts.set(row.name, (variant.name_counts.get(row.name) ?? 0) + 1);
      variant.role_counts.set(row.role, (variant.role_counts.get(row.role) ?? 0) + 1);
      if (row.court_or_county) {
        variant.county_counts.set(
          row.court_or_county,
          (variant.county_counts.get(row.court_or_county) ?? 0) + 1,
        );
      }
    }

    const fk = familyKeyFromRow(row);
    if (fk !== null) variant.families.add(fk);

    variant.row_ids.add(row.id);
    variant.submission_ids.add(row.submission_id);
    if (row.reporter_email) variant.reporter_emails.add(row.reporter_email);
    variant.sources.add(row.source ?? "form_direct");
    variant.samples.push({
      row_id: row.id,
      name: row.name,
      role: row.role,
      court_or_county: row.court_or_county,
      reporter_case_county: row.reporter_case_county ?? null,
      reporter_email: row.reporter_email ?? null,
      reporter_name: row.reporter_name ?? null,
      submission_id: row.submission_id,
      notes: row.notes ?? null,
      source: row.source ?? "form_direct",
      created_at: row.created_at ?? null,
      review_decision: row.review_decision ?? null,
      // counts_publicly mirrors familyKeyFromRow — null FK == not counting.
      counts_publicly: fk !== null,
      cluster_email_count: 0,        // filled in after the cluster is built
      cluster_submission_count: 0,   // filled in after the cluster is built
    });
  }

  // For each location, build similarity edges across distinct name_keys.
  type Edge = SuggestedCluster["edges"][number];
  const clusters: SuggestedCluster[] = [];

  for (const [location, variantMap] of Array.from(byLocation.entries())) {
    const variantList = Array.from(variantMap.values());
    if (variantList.length < 2) continue;

    // Use the most-frequent original casing per variant as the "raw" name
    // for similarity comparison so we keep the spelling the reporter used.
    const rawByKey = new Map<string, string>();
    for (const v of variantList) {
      let bestName = "";
      let bestCount = -1;
      for (const entry of Array.from(v.name_counts.entries())) {
        const [name, count] = entry;
        if (count > bestCount) {
          bestCount = count;
          bestName = name;
        }
      }
      rawByKey.set(v.name_key, bestName || v.name_key);
    }

    const edges: Edge[] = [];
    for (let i = 0; i < variantList.length; i += 1) {
      for (let j = i + 1; j < variantList.length; j += 1) {
        const a = variantList[i].name_key;
        const b = variantList[j].name_key;
        const hit = nameSimilarity(rawByKey.get(a)!, rawByKey.get(b)!);
        if (!hit) continue;
        edges.push({ a, b, confidence: hit.confidence, reasons: hit.reasons });
      }
    }
    if (edges.length === 0) continue;

    // Union-find to build connected components from the similarity edges.
    const parent = new Map<string, string>();
    for (const v of variantList) parent.set(v.name_key, v.name_key);
    const find = (k: string): string => {
      let cur = k;
      while (parent.get(cur) !== cur) {
        const next = parent.get(cur)!;
        parent.set(cur, parent.get(next)!);
        cur = parent.get(cur)!;
      }
      return cur;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const e of edges) union(e.a, e.b);

    const componentMap = new Map<string, Set<string>>();
    for (const v of variantList) {
      const root = find(v.name_key);
      let members = componentMap.get(root);
      if (!members) {
        members = new Set<string>();
        componentMap.set(root, members);
      }
      members.add(v.name_key);
    }

    const variantsByKey = new Map(variantList.map(v => [v.name_key, v] as const));

    for (const memberKeys of Array.from(componentMap.values())) {
      if (memberKeys.size < 2) continue;
      const memberList = Array.from(memberKeys);
      const componentEdges = edges.filter(e => memberKeys.has(e.a) && memberKeys.has(e.b));

      const confidenceRank: Record<SimilarityHit["confidence"], number> = {
        high: 3,
        medium: 2,
        low: 1,
      };
      let highest: SimilarityHit["confidence"] = "low";
      for (const e of componentEdges) {
        if (confidenceRank[e.confidence] > confidenceRank[highest]) {
          highest = e.confidence;
        }
      }

      // Cluster-level email/submission frequency for per-row warnings.
      const emailCount = new Map<string, number>();
      const submissionCount = new Map<string, number>();
      for (const key of memberList) {
        const v = variantsByKey.get(key)!;
        for (const s of v.samples) {
          const e = s.reporter_email?.trim().toLowerCase();
          if (e) emailCount.set(e, (emailCount.get(e) ?? 0) + 1);
          if (s.submission_id) submissionCount.set(s.submission_id, (submissionCount.get(s.submission_id) ?? 0) + 1);
        }
      }

      const SAMPLE_CAP = 25;
      const variants: ClusterVariant[] = memberList.map(key => {
        const v = variantsByKey.get(key)!;
        const rolesSorted = Array.from(v.role_counts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([role, count]) => ({ role, count }));
        const countiesSorted = Array.from(v.county_counts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([county, count]) => ({ county, count }));
        const namesSorted = Array.from(v.name_counts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const samplesEnriched: ClusterVariantSample[] = v.samples.map(s => ({
          ...s,
          cluster_email_count: s.reporter_email
            ? (emailCount.get(s.reporter_email.trim().toLowerCase()) ?? 1)
            : 0,
          cluster_submission_count: s.submission_id
            ? (submissionCount.get(s.submission_id) ?? 1)
            : 0,
        }));
        const samplesSorted = samplesEnriched.sort((a, b) => {
          const ad = a.created_at ? Date.parse(a.created_at) : 0;
          const bd = b.created_at ? Date.parse(b.created_at) : 0;
          return ad - bd;
        }).slice(0, SAMPLE_CAP);
        return {
          name_key: v.name_key,
          display_name: namesSorted[0]?.[0] ?? v.name_key,
          roles: rolesSorted,
          counties: countiesSorted,
          family_count: v.families.size,
          row_ids: Array.from(v.row_ids),
          reporter_emails: Array.from(v.reporter_emails),
          submission_ids: Array.from(v.submission_ids),
          sources: Array.from(v.sources),
          samples: samplesSorted,
        };
      }).sort((a, b) => b.family_count - a.family_count || a.display_name.localeCompare(b.display_name));

      // Distinct families across all variants in this cluster.
      const allFamilies = new Set<string>();
      for (const key of memberList) {
        const v = variantsByKey.get(key)!;
        for (const fam of Array.from(v.families)) allFamilies.add(fam);
      }

      // Same-reporter cross-variant detection: which reporters typed more
      // than one spelling? That is a strong "single family, two spellings"
      // signal — and it's reassuring (or worrying, depending on context)
      // for an admin to see explicitly.
      const reporterToVariants = new Map<string, Set<string>>();
      for (const key of memberList) {
        const v = variantsByKey.get(key)!;
        for (const email of Array.from(v.reporter_emails)) {
          const lower = email.trim().toLowerCase();
          if (!lower) continue;
          let set = reporterToVariants.get(lower);
          if (!set) { set = new Set<string>(); reporterToVariants.set(lower, set); }
          set.add(v.name_key);
        }
      }
      const cross_variant_reporters: SuggestedCluster["cross_variant_reporters"] = [];
      for (const [email, vSet] of Array.from(reporterToVariants.entries())) {
        if (vSet.size >= 2) cross_variant_reporters.push({ reporter_email: email, variants: Array.from(vSet).sort() });
      }
      cross_variant_reporters.sort((a, b) => b.variants.length - a.variants.length || a.reporter_email.localeCompare(b.reporter_email));

      const cluster_key = buildClusterKey(memberList, location || null);
      clusters.push({
        cluster_key,
        location_key: location || null,
        variants,
        edges: componentEdges,
        highest_confidence: highest,
        total_family_count: allFamilies.size,
        cross_variant_reporters,
      });
    }
  }

  // Sort: high confidence first, then by potential family rollup, then location.
  const rank: Record<SuggestedCluster["highest_confidence"], number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  clusters.sort((a, b) => {
    const r = rank[b.highest_confidence] - rank[a.highest_confidence];
    if (r !== 0) return r;
    const f = b.total_family_count - a.total_family_count;
    if (f !== 0) return f;
    return (a.location_key ?? "").localeCompare(b.location_key ?? "");
  });

  return clusters;
}

// ---------------------------------------------------------------------
// Alias resolver — applied at read time when computing public/admin
// counts. Builds a map keyed by `${name_key}|${location_key}` to a
// canonical resolution. Only 'same_actor' decisions affect counting;
// 'keep_separate' is purely a UI suppression signal.
// ---------------------------------------------------------------------
export type AliasDecisionRow = {
  cluster_key: string;
  location_key: string | null;
  decision: "same_actor" | "keep_separate";
  canonical_name: string | null;
  canonical_role: string | null;
  name_keys: string[];
};

export type AliasResolution = {
  canonical_name_key: string;
  canonical_name: string;
  canonical_role: string | null;
  cluster_key: string;
};

export class AliasResolver {
  private byNameKeyAndLocation: Map<string, AliasResolution>;
  private decidedClusterKeys: Set<string>;

  constructor(decisions: AliasDecisionRow[]) {
    this.byNameKeyAndLocation = new Map();
    this.decidedClusterKeys = new Set();
    for (const d of decisions) {
      this.decidedClusterKeys.add(d.cluster_key);
      if (d.decision !== "same_actor") continue;
      if (!d.canonical_name) continue;
      const canonicalNameKey = actorLooseNameKey(d.canonical_name);
      if (!canonicalNameKey) continue;
      for (const nameKey of d.name_keys) {
        const k = `${nameKey}|${d.location_key ?? ""}`;
        this.byNameKeyAndLocation.set(k, {
          canonical_name_key: canonicalNameKey,
          canonical_name: d.canonical_name,
          canonical_role: d.canonical_role ?? null,
          cluster_key: d.cluster_key,
        });
      }
      // Make sure the canonical name itself maps to itself, so its rows
      // join the same bucket even if not explicitly listed.
      const selfKey = `${canonicalNameKey}|${d.location_key ?? ""}`;
      if (!this.byNameKeyAndLocation.has(selfKey)) {
        this.byNameKeyAndLocation.set(selfKey, {
          canonical_name_key: canonicalNameKey,
          canonical_name: d.canonical_name,
          canonical_role: d.canonical_role ?? null,
          cluster_key: d.cluster_key,
        });
      }
    }
  }

  resolve(rawName: string, locationKey: string | null): AliasResolution | null {
    const nk = actorLooseNameKey(rawName);
    if (!nk) return null;
    return this.byNameKeyAndLocation.get(`${nk}|${locationKey ?? ""}`) ?? null;
  }

  hasDecision(clusterKey: string): boolean {
    return this.decidedClusterKeys.has(clusterKey);
  }
}

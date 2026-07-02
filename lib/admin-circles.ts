import "server-only";

import { createAdminSupabaseClient } from "./supabase-admin";
import { actorKey, parseActorKey } from "./connection-circle-matching";
import { loadCourtActorBuckets, type CourtActorBucket } from "./court-actor-buckets";

export type AdminCircleParent = {
  email: string;
  pseudonym: string;
  has_handle: boolean;
  state: string | null;
  case_year: number | null;
  submission_count: number;
};

export type AdminCircleDetail = {
  actor: { name: string; state: string | null; role: string };
  parents: AdminCircleParent[];
  joined_handles: number;
  accepted_intros: number;
};

const DEMO_ACTORS: Record<string, { name: string; state: string; role: string }> = {
  jane: { name: "Jane Doe", state: "TX", role: "Guardian ad Litem" },
  kevin: { name: "Kevin Paul", state: "FL", role: "Judge" },
};

const DEMO_PARENTS: Record<string, AdminCircleParent[]> = {
  jane: [
    { email: "demo-texasmom@example.com", pseudonym: "TexasMom", has_handle: true, state: "TX", case_year: 2023, submission_count: 1 },
    { email: "demo-houstondad@example.com", pseudonym: "HoustonDad", has_handle: true, state: "TX", case_year: 2022, submission_count: 2 },
    { email: "demo-saparent@example.com", pseudonym: "SAParent2024", has_handle: true, state: "TX", case_year: 2024, submission_count: 1 },
    { email: "demo-friscofam@example.com", pseudonym: "FriscoFam", has_handle: false, state: "TX", case_year: 2023, submission_count: 1 },
    { email: "demo-austinadvocate@example.com", pseudonym: "AustinAdvocate", has_handle: true, state: "TX", case_year: 2021, submission_count: 3 },
    { email: "demo-dfwmama@example.com", pseudonym: "DFWmama", has_handle: true, state: "TX", case_year: 2024, submission_count: 1 },
    { email: "demo-corpusbound@example.com", pseudonym: "CorpusBound", has_handle: false, state: "TX", case_year: 2022, submission_count: 1 },
    { email: "demo-hillcountry@example.com", pseudonym: "HillCountryDad", has_handle: true, state: "TX", case_year: 2023, submission_count: 1 },
    { email: "demo-lonestar@example.com", pseudonym: "LonestarParent", has_handle: true, state: "TX", case_year: 2025, submission_count: 1 },
    { email: "demo-bexar@example.com", pseudonym: "BexarCountyMom", has_handle: true, state: "TX", case_year: 2020, submission_count: 2 },
    { email: "demo-rio@example.com", pseudonym: "RioGrandeParent", has_handle: false, state: "TX", case_year: 2023, submission_count: 1 },
    { email: "demo-elpaso@example.com", pseudonym: "ElPasoVoice", has_handle: true, state: "TX", case_year: 2024, submission_count: 1 },
  ],
  kevin: [
    { email: "demo-floridamom@example.com", pseudonym: "FloridaMom", has_handle: true, state: "FL", case_year: 2023, submission_count: 1 },
    { email: "demo-tampadad@example.com", pseudonym: "TampaDad", has_handle: true, state: "FL", case_year: 2022, submission_count: 2 },
    { email: "demo-orlandoparent@example.com", pseudonym: "OrlandoParent", has_handle: true, state: "FL", case_year: 2024, submission_count: 1 },
    { email: "demo-miamiadvocate@example.com", pseudonym: "MiamiAdvocate", has_handle: false, state: "FL", case_year: 2023, submission_count: 1 },
    { email: "demo-jaxmom@example.com", pseudonym: "JaxMom", has_handle: true, state: "FL", case_year: 2021, submission_count: 3 },
    { email: "demo-panhandle@example.com", pseudonym: "PanhandleDad", has_handle: true, state: "FL", case_year: 2024, submission_count: 1 },
    { email: "demo-tallahassee@example.com", pseudonym: "TallyParent", has_handle: false, state: "FL", case_year: 2022, submission_count: 1 },
    { email: "demo-gulfcoast@example.com", pseudonym: "GulfCoastMom", has_handle: true, state: "FL", case_year: 2023, submission_count: 1 },
    { email: "demo-stpete@example.com", pseudonym: "StPeteVoice", has_handle: true, state: "FL", case_year: 2025, submission_count: 1 },
    { email: "demo-broward@example.com", pseudonym: "BrowardDad", has_handle: true, state: "FL", case_year: 2020, submission_count: 2 },
    { email: "demo-keys@example.com", pseudonym: "KeysParent", has_handle: false, state: "FL", case_year: 2023, submission_count: 1 },
    { email: "demo-ocla@example.com", pseudonym: "OclaAdvocate", has_handle: true, state: "FL", case_year: 2024, submission_count: 1 },
  ],
};

export function getDemoCircleDetail(demoKey = "jane"): AdminCircleDetail {
  const key = demoKey.toLowerCase();
  const actor = DEMO_ACTORS[key] ?? DEMO_ACTORS.jane;
  const parents = DEMO_PARENTS[key] ?? DEMO_PARENTS.jane;
  return {
    actor,
    parents,
    joined_handles: parents.filter(p => p.has_handle).length,
    accepted_intros: 3,
  };
}

export function getDemoMessages(actorName: string) {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  return [
    {
      id: "demo-1",
      handle: "Meg",
      body: `Welcome to the ${actorName} circle. This is a safe place to compare public process patterns by handle — no names or case numbers.`,
      created_at: hoursAgo(48),
      mine: true,
      sender_email: "founder@standwithmeg.com",
    },
    {
      id: "demo-2",
      handle: "TexasMom",
      body: "Hi everyone. Has anyone else noticed this GAL recommending the same evaluator in every case?",
      created_at: hoursAgo(36),
      mine: false,
      sender_email: "demo-texasmom@example.com",
    },
    {
      id: "demo-3",
      handle: "HoustonDad",
      body: "Yes — we saw that pattern too. It helped us prepare for what to expect at the hearing.",
      created_at: hoursAgo(30),
      mine: false,
      sender_email: "demo-houstondad@example.com",
    },
    {
      id: "demo-4",
      handle: "SAParent2024",
      body: "I am new here. How do I request an email intro with another parent?",
      created_at: hoursAgo(12),
      mine: false,
      sender_email: "demo-saparent@example.com",
    },
    {
      id: "demo-5",
      handle: "Meg",
      body: "Great question — click the Request to connect button on any parent who has a handle. Both sides have to agree before emails are shared.",
      created_at: hoursAgo(10),
      mine: true,
      sender_email: "founder@standwithmeg.com",
    },
    {
      id: "demo-6",
      handle: "AustinAdvocate",
      body: "Thank you for making this space. It is the first time I have felt less alone in the process.",
      created_at: hoursAgo(2),
      mine: false,
      sender_email: "demo-austinadvocate@example.com",
    },
  ];
}

function bucketSignature(bucket: CourtActorBucket) {
  return {
    name: bucket.displayName.trim(),
    state: bucket.state_code,
    role: bucket.roleSummary,
  };
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

/**
 * Founder view of every family that reported a given court actor. Bypasses
 * normal membership checks and returns real emails (admin-only) alongside the
 * pseudonymous info members see.
 */
export async function adminGetCircleActorDetail(actorKeyValue: string): Promise<AdminCircleDetail | null> {
  const parsed = parseActorKey(actorKeyValue);
  if (!parsed) return null;

  const buckets = await loadCourtActorBuckets();
  const bucket = Array.from(buckets.values()).find(b => actorKey(bucketSignature(b)) === actorKeyValue);
  if (!bucket) {
    // No canonical bucket for this actor; return the parsed identity with empty parents.
    return {
      actor: parsed,
      parents: [],
      joined_handles: 0,
      accepted_intros: 0,
    };
  }

  const emails = Array.from(new Set(
    Array.from(bucket.families.values())
      .map(f => f.email?.toLowerCase())
      .filter((e): e is string => Boolean(e)),
  ));

  const admin = createAdminSupabaseClient();

  const [{ data: subs, error: subsErr }, { data: pseudonyms, error: pseudoErr }, { count: acceptedCount, error: reqErr }] = await Promise.all([
    emails.length > 0
      ? admin
          .from("survey_submissions")
          .select("id, email, state_of_occurrence, created_at")
          .in("email", emails)
      : Promise.resolve({ data: [], error: null }),
    emails.length > 0
      ? admin.from("connection_circle_pseudonyms").select("email, handle").in("email", emails)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("connection_circle_requests")
      .select("id", { count: "exact", head: true })
      .ilike("actor_name", parsed.name)
      .eq("actor_role", parsed.role)
      .eq("status", "accepted"),
  ]);

  if (subsErr) throw new Error(`parents submissions lookup failed: ${subsErr.message}`);
  if (pseudoErr) throw new Error(`parents pseudonym lookup failed: ${pseudoErr.message}`);
  if (reqErr) throw new Error(`parents request lookup failed: ${reqErr.message}`);

  const handleByEmail = new Map<string, string>();
  for (const p of (pseudonyms ?? []) as { email: string; handle: string }[]) {
    handleByEmail.set(p.email.toLowerCase(), p.handle);
  }

  const perEmail = new Map<string, {
    state: string | null;
    earliestYear: number | null;
    submissionCount: number;
  }>();
  for (const row of (subs ?? []) as { email: string; state_of_occurrence: string | null; created_at: string | null }[]) {
    const e = row.email.toLowerCase();
    if (!emails.includes(e)) continue;
    const y = yearOf(row.created_at);
    const cur = perEmail.get(e);
    if (!cur) {
      perEmail.set(e, { state: row.state_of_occurrence, earliestYear: y, submissionCount: 1 });
    } else {
      cur.submissionCount += 1;
      if (y && (!cur.earliestYear || y < cur.earliestYear)) cur.earliestYear = y;
      if (!cur.state && row.state_of_occurrence) cur.state = row.state_of_occurrence;
    }
  }

  const parents: AdminCircleParent[] = [];
  for (const [email, summary] of perEmail.entries()) {
    const handle = handleByEmail.get(email);
    parents.push({
      email,
      pseudonym: handle ?? "(no handle yet)",
      has_handle: Boolean(handle),
      state: summary.state,
      case_year: summary.earliestYear,
      submission_count: summary.submissionCount,
    });
  }
  parents.sort((a, b) => a.pseudonym.localeCompare(b.pseudonym));

  return {
    actor: bucketSignature(bucket),
    parents,
    joined_handles: parents.filter(p => p.has_handle).length,
    accepted_intros: acceptedCount ?? 0,
  };
}

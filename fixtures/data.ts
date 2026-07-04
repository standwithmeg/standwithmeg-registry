// ============================================================
// PREVIEW FIXTURES — 100% INVENTED SAMPLE DATA.
// No real court actors, no real families, no real emails,
// no real case details. Children referenced by initials only.
// Every name below was invented for this design preview.
// ============================================================

export interface Actor {
  slug: string;
  firstName: string;
  lastName: string;
  role: string;
  roleIcon: "judge" | "therapist" | "gal" | "attorney" | "cps";
  county: string;
  state: string;
  stateAbbr: string;
  familyCount: number;
  public: boolean;
  firstReported: string;
  quotes: string[];
}

export const ACTORS: Actor[] = [
  {
    slug: "marcus-ashgrove",
    firstName: "MARCUS T.",
    lastName: "ASHGROVE",
    role: "Family Court Judge",
    roleIcon: "judge",
    county: "Halbrook County",
    state: "Ohio",
    stateAbbr: "OH",
    familyCount: 9,
    public: true,
    firstReported: "2025-11-14",
    quotes: [
      "One family reported their evidence folder was never opened during a four-hour hearing.",
      "Families reported hearings rescheduled five times while temporary orders stayed in place.",
      "A family wrote that their child, M.R., went eleven months without a scheduled call.",
    ],
  },
  {
    slug: "delia-pemberley",
    firstName: "DELIA",
    lastName: "PEMBERLEY",
    role: "Custody Evaluator",
    roleIcon: "therapist",
    county: "Sable Ridge County",
    state: "Ohio",
    stateAbbr: "OH",
    familyCount: 6,
    public: true,
    firstReported: "2026-01-08",
    quotes: [
      "Families reported evaluations billed at $9,000 that consisted of a single 40-minute session.",
      "One family reported the final evaluation quoted a parent they said was never interviewed.",
    ],
  },
  {
    slug: "raymond-colding",
    firstName: "RAYMOND",
    lastName: "COLDING",
    role: "Guardian ad Litem",
    roleIcon: "gal",
    county: "Weatherlyn County",
    state: "Texas",
    stateAbbr: "TX",
    familyCount: 7,
    public: true,
    firstReported: "2025-09-30",
    quotes: [
      "Families reported the guardian never visited either home before filing recommendations.",
      "One family reported invoices for home visits their doorbell camera never recorded.",
    ],
  },
  {
    slug: "susannah-vantrease",
    firstName: "SUSANNAH",
    lastName: "VANTREASE",
    role: "Family Law Attorney",
    roleIcon: "attorney",
    county: "Croft Basin County",
    state: "Texas",
    stateAbbr: "TX",
    familyCount: 5,
    public: true,
    firstReported: "2026-02-21",
    quotes: [
      "Families reported retainers exhausted within weeks on filings that were never submitted.",
      "One family reported being billed $415 for a phone call that lasted four minutes.",
    ],
  },
  {
    slug: "hollis-brandreth",
    firstName: "HOLLIS",
    lastName: "BRANDRETH",
    role: "Court-Appointed Therapist",
    roleIcon: "therapist",
    county: "Ferncliff County",
    state: "Kansas",
    stateAbbr: "KS",
    familyCount: 8,
    public: true,
    firstReported: "2025-10-17",
    quotes: [
      "Families reported reunification sessions cancelled if a parent asked questions about billing.",
      "One family reported their child, J.T., was interviewed alone for three hours without notice.",
      "Families reported progress reports copied word-for-word between different families' cases.",
    ],
  },
  {
    slug: "everett-quillfeather",
    firstName: "EVERETT",
    lastName: "QUILLFEATHER",
    role: "Family Court Magistrate",
    roleIcon: "judge",
    county: "Dunmore Flats County",
    state: "Kansas",
    stateAbbr: "KS",
    familyCount: 4,
    public: true,
    firstReported: "2026-03-02",
    quotes: [
      "One family reported a ruling issued nine minutes after a 200-page filing was submitted.",
      "Families reported being told transcripts were unavailable for their own hearings.",
    ],
  },
  {
    slug: "petra-mossbank",
    firstName: "PETRA",
    lastName: "MOSSBANK",
    role: "CPS Caseworker",
    roleIcon: "cps",
    county: "Lark Hollow County",
    state: "North Carolina",
    stateAbbr: "NC",
    familyCount: 6,
    public: true,
    firstReported: "2025-12-05",
    quotes: [
      "Families reported home-study reports describing rooms that do not exist in their homes.",
      "One family reported a safety plan they were never shown until it appeared in court.",
    ],
  },
  {
    slug: "gideon-farrowmere",
    firstName: "GIDEON",
    lastName: "FARROWMERE",
    role: "Guardian ad Litem",
    roleIcon: "gal",
    county: "Tarrow Creek County",
    state: "North Carolina",
    stateAbbr: "NC",
    familyCount: 3,
    public: true,
    firstReported: "2026-04-11",
    quotes: [
      "Families reported recommendations filed before the guardian met the children involved.",
    ],
  },

  {
    slug: "willa-thornberry",
    firstName: "WILLA",
    lastName: "THORNBERRY",
    role: "Family Court Justice",
    roleIcon: "judge",
    county: "Maplecrest Region, Ontario",
    state: "Canada",
    stateAbbr: "CAN",
    familyCount: 5,
    public: true,
    firstReported: "2026-05-19",
    quotes: [
      "Families reported orders issued in English-only hearings for francophone parents without an interpreter present.",
      "One family reported waiting fourteen months for a case conference while access stayed suspended.",
    ],
  },
  {
    slug: "duncan-ilfracombe",
    firstName: "DUNCAN",
    lastName: "ILFRACOMBE",
    role: "Family Report Writer",
    roleIcon: "therapist",
    county: "Wattle Creek Shire, NSW",
    state: "Australia",
    stateAbbr: "AUS",
    familyCount: 4,
    public: true,
    firstReported: "2026-06-08",
    quotes: [
      "Families reported a $12,000 family report built from a single one-hour observation.",
      "One family reported the report writer never contacted the school, then quoted the school in his findings.",
    ],
  },
];

export const NATIONAL_STATS = {
  families: 214,
  states: 41,
  countries: 11,
  reportedLosses: 18400000,
  publicActors: 10,
  pdfDownloads: 5120,
};

export interface StateRow {
  state: string;
  abbr: string;
  families: number;
  reportedLosses: number;
  publicActors: number;
  hasPdf: boolean;
  latest: string; // most recent submission — proof the record keeps growing
  international?: boolean;
}

// PDF unlocks at 30+ family submissions — and rebuilds on every new one.
export const PDF_THRESHOLD = 30;

export const STATE_ROWS: StateRow[] = [
  { state: "Texas", abbr: "TX", families: 44, reportedLosses: 4900000, publicActors: 2, hasPdf: true, latest: "2h ago" },
  { state: "Ohio", abbr: "OH", families: 38, reportedLosses: 3200000, publicActors: 2, hasPdf: true, latest: "6h ago" },
  { state: "Kansas", abbr: "KS", families: 31, reportedLosses: 2700000, publicActors: 2, hasPdf: true, latest: "45m ago" },
  { state: "Canada", abbr: "CAN", families: 31, reportedLosses: 1900000, publicActors: 1, hasPdf: true, latest: "1d ago", international: true },
  { state: "North Carolina", abbr: "NC", families: 27, reportedLosses: 2100000, publicActors: 2, hasPdf: false, latest: "3h ago" },
  { state: "Australia", abbr: "AUS", families: 25, reportedLosses: 1000000, publicActors: 1, hasPdf: false, latest: "12h ago", international: true },
  { state: "Montana", abbr: "MT", families: 19, reportedLosses: 1400000, publicActors: 0, hasPdf: false, latest: "2d ago" },
  { state: "Vermont", abbr: "VT", families: 12, reportedLosses: 800000, publicActors: 0, hasPdf: false, latest: "4d ago" },
];

export const MOVEMENT_QUOTES = [
  "I thought it was just my case. Then I found two hundred families describing my exact story.",
  "Filling out the survey took nine minutes. It was the first time anyone asked for the whole timeline.",
  "When our county hit the threshold, three other parents reached out in the first week.",
];

// ---------- Circles ----------

export interface CircleMember {
  id: string;
  displayName: string;
  plan: "monthly" | "yearly";
  sharedActor: string;
  joined: string;
}

export const CIRCLE_MEMBERS: CircleMember[] = [
  { id: "m1", displayName: "R. from Halbrook Co.", plan: "monthly", sharedActor: "marcus-ashgrove", joined: "2026-02-10" },
  { id: "m2", displayName: "K. from Sable Ridge", plan: "yearly", sharedActor: "marcus-ashgrove", joined: "2026-03-01" },
  { id: "m3", displayName: "T. from Ferncliff", plan: "monthly", sharedActor: "hollis-brandreth", joined: "2026-01-22" },
  { id: "m4", displayName: "A. from Weatherlyn", plan: "monthly", sharedActor: "raymond-colding", joined: "2026-04-05" },
];

export interface ChatMessage {
  id: string;
  author: string;
  isMeg?: boolean;
  time: string;
  text: string;
}

export const CIRCLE_CHAT: ChatMessage[] = [
  { id: "c1", author: "R. from Halbrook Co.", time: "Mon 7:41 PM", text: "Continuance number six today. Anyone else get the 'docket congestion' letter this month?" },
  { id: "c2", author: "K. from Sable Ridge", time: "Mon 7:58 PM", text: "Twice this spring. I started bringing a printed timeline to every hearing — it changed how the clerk talked to me." },
  { id: "c3", author: "Meg", isMeg: true, time: "Mon 8:14 PM", text: "Three families in this circle have reported the same continuance pattern. I'm adding it to the county timeline this week — keep the letters, they matter." },
  { id: "c4", author: "R. from Halbrook Co.", time: "Mon 8:20 PM", text: "That's the first time this has felt like a pattern instead of my bad luck. Thank you." },
  { id: "c5", author: "K. from Sable Ridge", time: "Tue 6:02 AM", text: "Sharing my hearing-prep checklist in case it helps anyone before Thursday." },
];

export const ASK_MEG_THREADS = [
  {
    q: "My evaluator filed a report quoting a session that never happened. What records should I gather first?",
    status: "answered",
    a: "Start with the billing statement and any portal logs showing session dates — then match them against your own calendar and messages. You're building a timeline, not an argument. Three families in your state have reported the same pattern, so your documentation strengthens more than your own case.",
  },
  { q: "Is there a template for requesting my full case file from the county?", status: "waiting", a: null },
];

// ---------- Admin ----------

export interface QueueItem {
  id: string;
  kind: "social" | "match" | "survey" | "job";
  title: string;
  detail: string;
  state?: string;
  confidence?: "high" | "medium" | "low";
  status: string;
}

export const ADMIN_TODAY: QueueItem[] = [
  { id: "q1", kind: "social", title: "Hollis Brandreth — post package ready", detail: "Photo approved · slides current · auto-publishes at 2:00 PM", state: "KS", status: "ready" },
  { id: "q2", kind: "match", title: "Possible match: 'E. Quillfeather' ↔ 'Everett Quillfeather'", detail: "Same county, same role, 2 submissions", state: "KS", confidence: "high", status: "review" },
  { id: "q3", kind: "survey", title: "3 new surveys to review", detail: "OH ×2, NC ×1 — one names a new actor", status: "review" },
  { id: "q4", kind: "job", title: "Kansas PDF regenerated", detail: "Finished 8:12 AM · 42s · triggered by photo assignment", state: "KS", status: "done" },
  { id: "q5", kind: "match", title: "Possible match: 'P. Mossbank' ↔ 'Petra Mossbank'", detail: "County differs (Lark Hollow vs. Larkhollow), likely spelling", state: "NC", confidence: "medium", status: "review" },
];

export const POSTED_HISTORY = [
  { id: "p1", actor: "Petra Mossbank", state: "NC", when: "Yesterday 4:02 PM", platforms: "FB · IG · X", location: "Lark Hollow County", legislatorsTagged: true },
  { id: "p2", actor: "Susannah Vantrease", state: "TX", when: "Mon 11:30 AM", platforms: "FB · IG", location: "", legislatorsTagged: false },
  { id: "p3", actor: "Gideon Farrowmere", state: "NC", when: "Jun 28 2:15 PM", platforms: "FB · IG · X", location: "Tarrow Creek County", legislatorsTagged: true },
];

export const SURVEYS_TO_REVIEW = [
  { id: "s1", state: "OH", county: "Halbrook", role: "Judge", excerpt: "Our hearing was moved five times in eight months while the temporary order stayed…", flagged: false },
  { id: "s2", state: "OH", county: "Sable Ridge", role: "Evaluator", excerpt: "The evaluation cost $8,600 and the report misspelled our child's initials…", flagged: true },
  { id: "s3", state: "NC", county: "Tarrow Creek", role: "GAL", excerpt: "The recommendation was filed before anyone had met our kids…", flagged: false },
];

// ---------- Legislators (invented for preview) ----------
// Every state gets its two U.S. congress members (one D, one R) plus a bench
// of state-level legislators. The state bench ROTATES: each new post in a
// state uses the next pair so the same two people aren't tagged every time.

export interface Legislator {
  name: string;
  party: "D" | "R";
  level: "federal" | "state";
  fb: string;
  ig: string;
  x: string;
}

export const LEGISLATORS: Record<string, { federal: Legislator[]; state: Legislator[] }> = {
  OH: {
    federal: [
      { name: "Sen. Carol Renwick", party: "D", level: "federal", fb: "SenRenwick", ig: "sen.renwick", x: "SenRenwick" },
      { name: "Rep. Dale Ostrander", party: "R", level: "federal", fb: "RepOstrander", ig: "rep.ostrander", x: "RepOstrander" },
    ],
    state: [
      { name: "St. Sen. Mia Calloway", party: "D", level: "state", fb: "CallowayOH", ig: "calloway.oh", x: "CallowayOH" },
      { name: "St. Rep. Ed Brantley", party: "R", level: "state", fb: "BrantleyOH", ig: "brantley.oh", x: "BrantleyOH" },
      { name: "St. Sen. Ruth Okafor", party: "R", level: "state", fb: "OkaforOH", ig: "okafor.oh", x: "OkaforOH" },
      { name: "St. Rep. Sam Teller", party: "D", level: "state", fb: "TellerOH", ig: "teller.oh", x: "TellerOH" },
    ],
  },
  TX: {
    federal: [
      { name: "Sen. Rosa Delgado", party: "D", level: "federal", fb: "SenDelgado", ig: "sen.delgado", x: "SenDelgado" },
      { name: "Rep. Hank Boswell", party: "R", level: "federal", fb: "RepBoswell", ig: "rep.boswell", x: "RepBoswell" },
    ],
    state: [
      { name: "St. Rep. Lena Vasquez", party: "D", level: "state", fb: "VasquezTX", ig: "vasquez.tx", x: "VasquezTX" },
      { name: "St. Sen. Cody Merritt", party: "R", level: "state", fb: "MerrittTX", ig: "merritt.tx", x: "MerrittTX" },
      { name: "St. Rep. Joy Ihejirika", party: "R", level: "state", fb: "IhejirikaTX", ig: "ihejirika.tx", x: "IhejirikaTX" },
      { name: "St. Sen. Ben Ludlow", party: "D", level: "state", fb: "LudlowTX", ig: "ludlow.tx", x: "LudlowTX" },
    ],
  },
  KS: {
    federal: [
      { name: "Sen. Grant Whitfield", party: "R", level: "federal", fb: "SenWhitfield", ig: "sen.whitfield", x: "SenWhitfield" },
      { name: "Rep. Elena Marsh", party: "D", level: "federal", fb: "RepMarsh", ig: "rep.marsh", x: "RepMarsh" },
    ],
    state: [
      { name: "St. Sen. Ada Pruitt", party: "R", level: "state", fb: "PruittKS", ig: "pruitt.ks", x: "PruittKS" },
      { name: "St. Rep. Gus Halloran", party: "D", level: "state", fb: "HalloranKS", ig: "halloran.ks", x: "HalloranKS" },
      { name: "St. Rep. Ivy Sandoval", party: "D", level: "state", fb: "SandovalKS", ig: "sandoval.ks", x: "SandovalKS" },
      { name: "St. Sen. Roy Kessler", party: "R", level: "state", fb: "KesslerKS", ig: "kessler.ks", x: "KesslerKS" },
    ],
  },
  NC: {
    federal: [
      { name: "Sen. Faith Alcott", party: "R", level: "federal", fb: "SenAlcott", ig: "sen.alcott", x: "SenAlcott" },
      { name: "Rep. Marcus Onwudiwe", party: "D", level: "federal", fb: "RepOnwudiwe", ig: "rep.onwudiwe", x: "RepOnwudiwe" },
    ],
    state: [
      { name: "St. Rep. Tess Grimaldi", party: "D", level: "state", fb: "GrimaldiNC", ig: "grimaldi.nc", x: "GrimaldiNC" },
      { name: "St. Sen. Wade Foxworth", party: "R", level: "state", fb: "FoxworthNC", ig: "foxworth.nc", x: "FoxworthNC" },
      { name: "St. Sen. Nell Abernathy", party: "D", level: "state", fb: "AbernathyNC", ig: "abernathy.nc", x: "AbernathyNC" },
      { name: "St. Rep. Cyrus Veldman", party: "R", level: "state", fb: "VeldmanNC", ig: "veldman.nc", x: "VeldmanNC" },
    ],
  },
};

// Rotation: post N in a state uses state-bench pair (N % 2) — pair A is
// indexes 0+1, pair B is indexes 2+3 — so back-to-back actors in the same
// state never tag the same state legislators twice in a row.
export function legislatorsForPost(stateAbbr: string, postIndexInState: number) {
  const bench = LEGISLATORS[stateAbbr];
  if (!bench) return { federal: [], state: [], rotationNote: "" };
  const pair = postIndexInState % 2 === 0 ? bench.state.slice(0, 2) : bench.state.slice(2, 4);
  return {
    federal: bench.federal,
    state: pair,
    rotationNote: postIndexInState % 2 === 0 ? "state pair A (rotates next post)" : "state pair B (rotated — pair A was used last post)",
  };
}

// ---------- Donors (invented) ----------
export const DONORS = [
  { id: "d1", name: "Karen W.", amount: 25, kind: "one-time", when: "Today 9:14 AM", thanked: false },
  { id: "d2", name: "The Millbrook Family", amount: 10, kind: "monthly", when: "Yesterday 6:40 PM", thanked: false },
  { id: "d3", name: "Anonymous", amount: 100, kind: "one-time", when: "Yesterday 2:05 PM", thanked: true },
  { id: "d4", name: "Dave R.", amount: 5, kind: "monthly", when: "Jun 30 11:22 AM", thanked: true },
];

// ---------- Photo request emails (invented) ----------
export const PHOTO_REQUESTS = [
  { id: "pr1", actor: "Gideon Farrowmere", state: "NC", sentTo: "the 3 families who named him", sent: "Jun 29", status: "awaiting" },
  { id: "pr2", actor: "Everett Quillfeather", state: "KS", sentTo: "the 4 families who named him", sent: "Jun 25", status: "photo received ✓" },
  { id: "pr3", actor: "Monique Tarwater (pending threshold)", state: "TX", sentTo: "queued — sends when actor goes public", sent: "—", status: "queued" },
];

// ---------- Possible-match detail (invented) ----------
// Mirrors the live reporting-audit clusters: every fact Meg needs to decide
// a merge without leaving the card — roles, counties, the survey itself,
// plus tools to fix spelling, change the title, and log research.

export interface MatchVariant {
  name: string;
  key: string;
  roles: string;
  counties: string;
  reporter: string; // admin-only
  permission: "public" | "anonymous" | "first-name";
  quote: string;
  submitted: string;
}

export interface MatchDetail {
  id: string;
  confidence: "high" | "medium";
  whyFlagged: string;
  state: string;
  wouldTotal: number;
  suggestedName: string;
  suggestedRole: string;
  variants: MatchVariant[];
}

export const MATCH_DETAILS: MatchDetail[] = [
  {
    id: "q2",
    confidence: "high",
    whyFlagged: "first-initial variant; same county, same role family",
    state: "KS",
    wouldTotal: 4,
    suggestedName: "Everett Quillfeather",
    suggestedRole: "Family Court Magistrate",
    variants: [
      {
        name: "Everett Quillfeather",
        key: "everett quillfeather",
        roles: "Magistrate ×3",
        counties: "Dunmore Flats ×3",
        reporter: "3 reporter emails (admin only)",
        permission: "anonymous",
        quote: "One family reported a ruling issued nine minutes after a 200-page filing was submitted.",
        submitted: "3/2/2026 – 6/18/2026",
      },
      {
        name: "E. Quillfeather",
        key: "e quillfeather",
        roles: "Judge ×1",
        counties: "Dunmore Flats ×1",
        reporter: "1 reporter email (admin only)",
        permission: "public",
        quote: "He never once looked up from the bench while my attorney was speaking.",
        submitted: "6/29/2026",
      },
    ],
  },
  {
    id: "q5",
    confidence: "medium",
    whyFlagged: "county spelling differs (Lark Hollow vs. Larkhollow); same role, same state",
    state: "NC",
    wouldTotal: 7,
    suggestedName: "Petra Mossbank",
    suggestedRole: "CPS Caseworker",
    variants: [
      {
        name: "Petra Mossbank",
        key: "petra mossbank",
        roles: "CPS Worker ×6",
        counties: "Lark Hollow County ×6",
        reporter: "6 reporter emails (admin only)",
        permission: "anonymous",
        quote: "Families reported home-study reports describing rooms that do not exist in their homes.",
        submitted: "12/5/2025 – 6/20/2026",
      },
      {
        name: "P. Mossbank",
        key: "p mossbank",
        roles: "CPS Worker ×1",
        counties: "Larkhollow ×1",
        reporter: "1 reporter email (admin only)",
        permission: "first-name",
        quote: "The safety plan appeared in court before anyone showed it to us.",
        submitted: "7/1/2026",
      },
    ],
  },
];

export const CANONICAL_ROLES = [
  "Family Court Judge",
  "Family Court Magistrate",
  "Guardian ad Litem",
  "GAL / Child Representative",
  "Custody Evaluator",
  "Court-Appointed Therapist",
  "Family Law Attorney",
  "CPS Caseworker",
];

// ---------- Any-survey search (delete / edit on request) ----------
export const ALL_SURVEYS = [
  { id: "as1", who: "Dana (OH)", email: "d***a@—.com", actor: "Marcus T. Ashgrove", county: "Halbrook", status: "counted", date: "Nov 2025" },
  { id: "as2", who: "Rob (KS)", email: "r***7@—.com", actor: "Hollis Brandreth", county: "Ferncliff", status: "counted", date: "Jan 2026" },
  { id: "as3", who: "Priya (TX)", email: "p***i@—.com", actor: "Raymond Colding", county: "Weatherlyn", status: "counted", date: "Feb 2026" },
  { id: "as4", who: "Chris (NC)", email: "c***k@—.com", actor: "Petra Mossbank", county: "Lark Hollow", status: "pending review", date: "Jun 2026" },
];

// ---------- Circles command center ----------
export const CIRCLE_STATS = { members: 29, monthly: 21, yearly: 8, messagesToday: 5, newThisWeek: 3 };

export const CIRCLE_ROOMS = [
  { key: "ashgrove-oh", label: "Ashgrove Circle · Halbrook Co., OH", members: 9, msgsToday: 3, lastActivity: "8:14 AM" },
  { key: "brandreth-ks", label: "Brandreth Circle · Ferncliff Co., KS", members: 8, msgsToday: 2, lastActivity: "7:41 AM" },
  { key: "colding-tx", label: "Colding Circle · Weatherlyn Co., TX", members: 7, msgsToday: 0, lastActivity: "Yesterday" },
  { key: "thornberry-can", label: "Thornberry Circle · Ontario, Canada", members: 5, msgsToday: 0, lastActivity: "Mon" },
];

export const NEW_CIRCLE_MEMBERS = [
  { id: "nm1", handle: "QuietDad_KS", room: "Brandreth Circle · KS", joined: "Today 7:02 AM", welcomed: false },
  { id: "nm2", handle: "GrandmaOnRecord", room: "Ashgrove Circle · OH", joined: "Yesterday 9:20 PM", welcomed: false },
  { id: "nm3", handle: "Maple_Mom_ON", room: "Thornberry Circle · Canada", joined: "Yesterday 4:11 PM", welcomed: false },
];

export const MEG_WELCOME_TEMPLATE = (handle: string, room: string) =>
  `Welcome to the circle, ${handle} — I'm Meg, from Stand With Meg. Everyone in this room reported the same court actor you did. You're not crazy, you're not alone, and you never were. Say hello whenever you're ready — I read every room, and I'm glad you're here.`;

// ---------- Partner program management (partners SELL the sponsor ads) ----------
export const PARTNER_APPS = [
  { id: "pa1", name: "Tanya R.", state: "KS", pitch: "Runs the Wichita moms network — knows every family business on the east side.", applied: "Yesterday 2:10 PM", status: "new" },
  { id: "pa2", name: "Marcus D.", state: "OH", pitch: "Former chamber-of-commerce board member, Halbrook County.", applied: "Jun 30", status: "new" },
];

// One card per approved partner: their link, their numbers, what you owe them.
export const ACTIVE_PARTNERS = [
  {
    id: "ap1",
    name: "Elise W.",
    state: "TX",
    refLink: "standwithmeg.com/sponsor?ref=elise-tx",
    slotsSold: 2,
    monthlyBook: 378,
    commissionRate: 0.2, // Sales Partner: 20% recurring (+10% fast-start on first payment)
    owedThisMonth: 75.6,
    lastSale: "Jun 21 — TX Community Supporter ($129/mo)",
  },
];

// Based on Meg's real approved-reply template in
// standwithmeg-sponsorship/partner-application-reply-templates.md
export const PARTNER_WELCOME_EMAIL = (name: string, state: string, link: string) =>
  `Hi ${name} — thank you for applying to be a State Partner, and welcome aboard. I read your "why," and you're exactly the kind of person we want standing with families in ${state}.\n\nEverything you need to start is attached: your Partner Starter Kit — the sales script, the brand kit, and a simple first-7-days plan. Start with the README and you'll be ready to go. Your personal link is ${link} — any sponsor who signs through it is credited to you automatically.\n\nTwo rules we never bend: mission-aligned businesses only (law firms are allowed but vetted closely — flag interested firms to me, don't pitch cold), and every sponsor is approved by us before they go live.\n\nYou sign a sponsor once, and you earn every month they stay. Reach out the second you have a question — there's a team behind you.\n\nLet's go make ${state} proud.\n\n— Meg`;

export interface SponsorSlot {
  id: string;
  level: string;
  appearsOn: string;
  holder: string | null;
  soldBy: string | null;
  monthly: number | null;
  adPlaced: boolean;
}

// Real inventory + pricing from standwithmeg-sponsorship-business-plan.md:
// Movement Partner $4,900 · Nat'l Presenting $2,900 · Nat'l Co $1,900 ·
// State Exclusive $179–399 · Community Supporter (3/state) $99–179
export const SPONSOR_SLOTS: SponsorSlot[] = [
  { id: "sl0", level: "Movement Partner (national + social)", appearsOn: "Everything national + social features · $4,900/mo", holder: null, soldBy: null, monthly: null, adPlaced: false },
  { id: "sl1", level: "National · Presenting", appearsOn: "Every report page + every PDF cover · $2,900/mo", holder: null, soldBy: null, monthly: null, adPlaced: false },
  { id: "sl2", level: "National · Co-Sponsor", appearsOn: "Every report page + every PDF cover · $1,900/mo", holder: null, soldBy: null, monthly: null, adPlaced: false },
  { id: "sl3", level: "TX · State Exclusive", appearsOn: "TX report page (big slot) + TX PDF cover · $179–399", holder: "Bluebonnet Family Wellness (sample)", soldBy: "Elise W.", monthly: 249, adPlaced: true },
  { id: "sl4", level: "TX · Community Supporter 1 of 3", appearsOn: "TX report page (small slot) · $99–179", holder: "Lone Star Tutoring (sample)", soldBy: "Elise W.", monthly: 129, adPlaced: false },
  { id: "sl5", level: "KS · State Exclusive", appearsOn: "KS report page (big slot) + KS PDF cover · $179–399", holder: null, soldBy: null, monthly: null, adPlaced: false },
  { id: "sl6", level: "OH · State Exclusive", appearsOn: "OH report page (big slot) + OH PDF cover · $179–399", holder: null, soldBy: null, monthly: null, adPlaced: false },
];

export const SINCE_YESTERDAY = [
  { n: "3", label: "new surveys" },
  { n: "2", label: "donations · $35" },
  { n: "1", label: "post published" },
  { n: "2", label: "matches flagged" },
];

// ---------- Posting kit (invented handles; real ones come from the pipeline) ----------

export const STATE_CAPITOLS: Record<string, string> = {
  OH: "Ohio Statehouse, Columbus, OH",
  TX: "Texas State Capitol, Austin, TX",
  KS: "Kansas State Capitol, Topeka, KS",
  NC: "North Carolina State Capitol, Raleigh, NC",
  CAN: "Parliament Hill, Ottawa, ON",
  AUS: "Parliament House, Canberra ACT",
};

const ROLE_EMOJI: Record<string, string> = {
  judge: "⚖️", therapist: "🩺", gal: "🛡️", attorney: "📜", cps: "📋",
};

/** Rotating headline pool — adapted from the brand system's locked
    NEW-IN-STATE rule: state FIRST so families instantly know it's theirs,
    then name + title. Never repeat the same variant back-to-back. */
export function captionHeadline(actor: Actor, variant: number): string {
  const roleShort = actor.role.replace(/^(Family Court|Court-Appointed|Family Law|Family Report) /, "").toUpperCase();
  const name = `${actor.firstName} ${actor.lastName}`.toUpperCase();
  const st = actor.state.toUpperCase();
  const county = actor.county.split(",")[0].toUpperCase();
  const pool = [
    `⚠️ 🚨 ${st} — ${roleShort} ${name} IS NOW ON THE PUBLIC RECORD 🚨 ⚠️`,
    `🚨 NEW NAME ON ${st}'S PUBLIC RECORD: ${roleShort} ${name} 🚨`,
    `🚨 ${county}, ${st} — NEW NAME ON THE RECORD: ${roleShort} ${name} 🚨`,
    `🚨 ${st} COURT WATCH: ${roleShort} ${name} JUST CROSSED THE THRESHOLD 🚨`,
    `🚨 THE ${st} LIST JUST GREW — ${roleShort} ${name} 🚨`,
    `🚨 BREAKING: ${st} PUBLIC RECORD UPDATE — ${roleShort} ${name} 🚨`,
    `⚠️ ${actor.familyCount} FAMILIES. ONE NAME. ${roleShort} ${name} — ${st} ⚠️`,
    `🚨 ${st} FAMILIES NAMED THIS ${roleShort}. NOW IT'S PUBLIC: ${name} 🚨`,
  ];
  return pool[variant % pool.length];
}

export const HEADLINE_VARIANT_COUNT = 8;

/** Meg's personal-share caption — her exact structure, filled per actor.
    Used when sharing from the business page to her personal profile. */
export function personalShareCaption(actor: Actor, headlineVariant = 0): string {
  const row = STATE_ROWS.find((r) => r.abbr === actor.stateAbbr);
  const emoji = ROLE_EMOJI[actor.roleIcon] ?? "⚖️";
  const roleShort = actor.role.replace(/^(Family Court|Court-Appointed|Family Law|Family Report) /, "");
  const quotes = actor.quotes.slice(0, 2)
    .map((q) => `“${q}” — Anonymous Parent · ${actor.stateAbbr}`)
    .join("\n");
  const nameTag = actor.role.split(" ")[0] + (actor.firstName + actor.lastName).replace(/[^A-Za-z]/g, "");
  const countyTag = actor.county.replace(/[^A-Za-z]/g, "");
  return [
    captionHeadline(actor, headlineVariant),
    ``,
    `${emoji} ${actor.firstName} ${actor.lastName} — ${roleShort} — ${actor.county}, ${actor.state} — has now been named on the public record by ${actor.familyCount} families at Stand With Meg.`,
    ``,
    `${actor.firstName} ${actor.lastName} is a ${actor.role.toLowerCase()} in ${actor.county}, ${actor.state}. ${actor.familyCount} separate ${actor.state} families placed their names in the Stand With Meg registry, independently — reporting concerns about their experience in court.`,
    ``,
    `In their own words:`,
    ``,
    quotes,
    ``,
    `If you've faced ${roleShort} ${actor.firstName} ${actor.lastName} in ${actor.county}, ${actor.state} — mothers and fathers alike — your story belongs on the public record. There's a short walkthrough video right on the page that shows you exactly how to add it 👇`,
    ``,
    `📊 What ${actor.state} families report:`,
    `• ${row?.families ?? "—"} families on the record`,
    `• ${row ? money(row.reportedLosses) : "—"} in reported family losses`,
    ``,
    `${NATIONAL_STATS.families} families nationwide — and now global. Not an isolated incident. A pattern.`,
    ``,
    `standwithmeg.com`,
    ``,
    `🤍 Stand With Meg — putting the family court on the public record, one family at a time. Subscribe, share, and donate at standwithmeg.com to keep these names searchable.`,
    ``,
    `FAMILY-REPORTED SUBMISSIONS.`,
    ``,
    `#StandWithMeg #${nameTag} #${actor.stateAbbr}FamilyCourt #${countyTag} #FamilyCourtAccountability`,
  ].join("\n");
}

/** Auto-SEO description for each slide — attach at publish so Meg never
    hand-types Facebook photo descriptions again. */
export function slideDescriptions(actor: Actor): { frame: string; text: string }[] {
  const base = `${actor.firstName} ${actor.lastName}, ${actor.role}, ${actor.county}, ${actor.state}`;
  const out: { frame: string; text: string }[] = [
    { frame: "Cover", text: `${base} — named on the Stand With Meg public record by ${actor.familyCount} families. Family-reported submissions.` },
  ];
  actor.quotes.forEach((q, i) => out.push({
    frame: `Quotes ${i + 1}`,
    text: `What families say about ${base}: “${q.slice(0, 120)}” — family-reported to the Stand With Meg registry.`,
  }));
  out.push(
    { frame: "State stats", text: `${actor.state} family-court accountability numbers from the Stand With Meg registry — families reporting, reported losses, and court actors on the public record.` },
    { frame: "Global pattern", text: `${NATIONAL_STATS.families} families nationwide and worldwide have reported their family-court experience to Stand With Meg. Not an isolated incident — a pattern.` },
    { frame: "Keep us quiet", text: `They thought they could keep families quiet. Stand With Meg puts family court on the public record.` },
    { frame: "Meg host card", text: `Meg — investigative journalist documenting the family-court public record at standwithmeg.com.` },
    { frame: "Follow + survey", text: `Add your case to the Stand With Meg Family Rights Survey at standwithmeg.com/survey — your story is a data point.` },
  );
  return out;
}

export function money(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

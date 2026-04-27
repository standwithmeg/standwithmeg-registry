import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-admin";
import { isAdminEmail } from "../../../../../lib/require-auth";
import { actorBucketKey } from "../../../../../lib/court-actors";

export const runtime = "nodejs";

const DEFAULT_EXPORT_THRESHOLD = 1;
const PUBLIC_NAMING_THRESHOLD = 5;

type ActorRow = {
  role: string;
  name: string;
  court_or_county: string | null;
  state_code: string | null;
  submission_id: string;
  survey_submissions:
    | { email: string | null; state_of_occurrence: string | null }
    | { email: string | null; state_of_occurrence: string | null }[]
    | null;
};

type PatternRow = {
  name: string;
  role: string;
  state: string;
  families: number;
  needed_for_public: number;
  counties: string;
};

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && !!user?.email && isAdminEmail(user.email);
}

function joinedSubmission(row: ActorRow) {
  const joined = Array.isArray(row.survey_submissions)
    ? row.survey_submissions[0]
    : row.survey_submissions;
  return joined ?? null;
}

function actorState(row: ActorRow) {
  const direct = row.state_code?.trim().toUpperCase();
  if (direct) return direct;
  return joinedSubmission(row)?.state_of_occurrence?.trim().toUpperCase() || "";
}

function familyKey(row: ActorRow) {
  const state = actorState(row);
  const email = joinedSubmission(row)?.email?.trim().toLowerCase();
  return email ? `${email}|${state}` : `submission:${row.submission_id}`;
}

function mostFrequent(counter: Map<string, number>) {
  let best = "";
  let max = 0;
  for (const [value, count] of counter) {
    if (count > max) {
      best = value;
      max = count;
    }
  }
  return best;
}

function roleSummary(roles: Map<string, number>) {
  const sorted = [...roles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "Court Actor";
  if (sorted.length === 1) return sorted[0][0];
  return `${sorted[0][0]} + ${sorted.length - 1} role${sorted.length === 2 ? "" : "s"}`;
}

async function fetchPatternRows(threshold: number, stateFilter: string | null): Promise<PatternRow[]> {
  const adminSupabase = createAdminSupabaseClient();
  const all: ActorRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await adminSupabase
      .from("court_actors")
      .select("role,name,court_or_county,state_code,submission_id,survey_submissions(email,state_of_occurrence)")
      .eq("source", "form_direct")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as unknown as ActorRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  type Bucket = {
    roleCounts: Map<string, number>;
    nameCounts: Map<string, number>;
    families: Set<string>;
    countyFamilies: Map<string, Set<string>>;
    state: string;
  };

  const buckets = new Map<string, Bucket>();
  for (const row of all) {
    const state = actorState(row);
    if (!state || !row.role || !row.name) continue;
    if (stateFilter && state !== stateFilter) continue;

    const bucketKey = actorBucketKey(row.name, row.role, state);
    if (!bucketKey.split("|")[0]) continue;

    const key = familyKey(row);
    const bucket = buckets.get(bucketKey) ?? {
      roleCounts: new Map<string, number>(),
      nameCounts: new Map<string, number>(),
      families: new Set<string>(),
      countyFamilies: new Map<string, Set<string>>(),
      state,
    };

    bucket.families.add(key);
    bucket.roleCounts.set(row.role, (bucket.roleCounts.get(row.role) ?? 0) + 1);
    bucket.nameCounts.set(row.name, (bucket.nameCounts.get(row.name) ?? 0) + 1);

    const county = row.court_or_county?.trim() || "County not listed";
    const countySet = bucket.countyFamilies.get(county) ?? new Set<string>();
    countySet.add(key);
    bucket.countyFamilies.set(county, countySet);
    buckets.set(bucketKey, bucket);
  }

  return [...buckets.values()]
    .filter(bucket => bucket.families.size >= threshold)
    .map(bucket => ({
      name: mostFrequent(bucket.nameCounts) || "Named court actor",
      role: roleSummary(bucket.roleCounts),
      state: bucket.state,
      families: bucket.families.size,
      needed_for_public: Math.max(0, PUBLIC_NAMING_THRESHOLD - bucket.families.size),
      counties: [...bucket.countyFamilies.entries()]
        .map(([county, families]) => ({ county, count: families.size }))
        .sort((a, b) => b.count - a.count || a.county.localeCompare(b.county))
        .map(entry => `${entry.county} (${entry.count})`)
        .join(", "),
    }))
    .sort((a, b) => b.families - a.families || a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
}

function pdfText(text: string) {
  const bytes = Buffer.from(`\uFEFF${text}`, "utf16le");
  const swapped = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return `<${swapped.toString("hex").toUpperCase()}>`;
}

function drawText(x: number, y: number, text: string, size = 9, font = "F1", color = "0 0 0") {
  return `${color} rg\nBT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm ${pdfText(text)} Tj ET\n`;
}

function drawLine(x1: number, y1: number, x2: number, y2: number, color = "0.75 0.75 0.75", width = 0.5) {
  return `${color} RG ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}

function drawRect(x: number, y: number, w: number, h: number, color = "0.95 0.95 0.95") {
  return `${color} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f\n`;
}

function wrapText(text: string, maxChars: number) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildPdf(patterns: PatternRow[], threshold: number, stateFilter: string | null) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 42;
  const tableWidth = pageWidth - margin * 2;
  const cream = "0.984 0.968 0.925";
  const navy = "0.05 0.10 0.18";
  const red = "0.72 0.09 0.09";
  const gold = "0.78 0.62 0.15";
  const muted = "0.31 0.36 0.43";
  const cols = {
    actor: { x: margin, w: 178 },
    role: { x: margin + 180, w: 96 },
    state: { x: margin + 278, w: 42 },
    families: { x: margin + 322, w: 56 },
    needed: { x: margin + 380, w: 74 },
    counties: { x: margin + 456, w: tableWidth - 456 },
  };
  const pages: string[] = [];
  let ops = "";
  let y = pageHeight - margin;
  const totalFamilyReports = patterns.reduce((sum, row) => sum + row.families, 0);
  const publicReady = patterns.filter(row => row.needed_for_public === 0).length;
  const statesCovered = new Set(patterns.map(row => row.state)).size;

  function statBox(x: number, yTop: number, width: number, label: string, value: string, color = navy) {
    ops += drawRect(x, yTop - 42, width, 42, "1 0.985 0.94");
    ops += drawLine(x, yTop - 42, x + width, yTop - 42, gold, 1.2);
    ops += drawText(x + 8, yTop - 16, value, 15, "F2", color);
    ops += drawText(x + 8, yTop - 31, label, 7.5, "F2", muted);
  }

  function tableHeader() {
    ops += drawRect(margin, y - 21, tableWidth, 21, navy);
    ops += drawText(cols.actor.x + 4, y - 14, "Court actor", 8, "F2", "1 1 1");
    ops += drawText(cols.role.x + 4, y - 14, "Role", 8, "F2", "1 1 1");
    ops += drawText(cols.state.x + 4, y - 14, "State", 8, "F2", "1 1 1");
    ops += drawText(cols.families.x + 4, y - 14, "Families", 8, "F2", "1 1 1");
    ops += drawText(cols.needed.x + 4, y - 14, "Needs", 8, "F2", "1 1 1");
    ops += drawText(cols.counties.x + 4, y - 14, "County / court reports", 8, "F2", "1 1 1");
    y -= 25;
  }

  function pageHeader(firstPage: boolean) {
    ops += drawRect(0, 0, pageWidth, pageHeight, cream);
    ops += drawRect(0, pageHeight - 18, pageWidth, 18, navy);
    ops += drawLine(margin, pageHeight - 31, pageWidth - margin, pageHeight - 31, gold, 1.3);
    if (firstPage) {
      ops += drawText(margin, y, "Stand With Meg", 10, "F2", red);
      y -= 20;
      ops += drawText(margin, y, "Named Court Actor Pattern Report", 21, "F2", navy);
      y -= 18;
      const scope = stateFilter ? `${stateFilter} only` : "all states";
      ops += drawText(
        margin,
        y,
        `Admin pattern export from counted survey court-actor rows (${scope}); includes actors reported by ${threshold}+ independent family.`,
        9,
        "F1",
        muted
      );
      y -= 14;
      ops += drawText(
        margin,
        y,
        `Public naming threshold remains ${PUBLIC_NAMING_THRESHOLD} independent families. Reporter names, emails, notes, and private details are excluded.`,
        9,
        "F1",
        muted
      );
      y -= 18;
      const boxWidth = 160;
      statBox(margin, y, boxWidth, "ACTOR PATTERNS", String(patterns.length), navy);
      statBox(margin + boxWidth + 10, y, boxWidth, "FAMILY REPORTS", String(totalFamilyReports), red);
      statBox(margin + (boxWidth + 10) * 2, y, boxWidth, "AT PUBLIC THRESHOLD", String(publicReady), navy);
      statBox(margin + (boxWidth + 10) * 3, y, boxWidth, "STATES", String(statesCovered), navy);
      y -= 60;
    } else {
      ops += drawText(margin, y, "Named Court Actor Pattern Report", 11, "F2", navy);
      y -= 18;
    }
    tableHeader();
  }

  function finishPage() {
    pages.push(ops);
    ops = "";
    y = pageHeight - margin;
  }

  pageHeader(true);

  if (patterns.length === 0) {
    ops += drawText(margin, y - 20, "No court actor patterns currently meet this threshold.", 12, "F2", muted);
    finishPage();
  } else {
    patterns.forEach((row, index) => {
      const actorLines = wrapText(row.name, 30);
      const roleLines = wrapText(row.role, 16);
      const countyLines = wrapText(row.counties, 42);
      const lines = Math.max(actorLines.length, roleLines.length, countyLines.length, 1);
      const rowHeight = Math.max(30, lines * 11 + 12);

      if (y - rowHeight < margin + 24) {
        finishPage();
        pageHeader(false);
      }

      if (index % 2 === 0) ops += drawRect(margin, y - rowHeight + 4, tableWidth, rowHeight, "1 0.985 0.94");
      ops += drawLine(margin, y - rowHeight + 4, margin + tableWidth, y - rowHeight + 4, "0.82 0.78 0.70", 0.4);

      const textY = y - 10;
      const needed = row.needed_for_public === 0 ? "Public" : `+${row.needed_for_public}`;
      actorLines.forEach((line, i) => { ops += drawText(cols.actor.x + 4, textY - i * 11, line, 8.5, i === 0 ? "F2" : "F1", navy); });
      roleLines.forEach((line, i) => { ops += drawText(cols.role.x + 4, textY - i * 11, line, 8, "F1", "0.15 0.15 0.15"); });
      ops += drawText(cols.state.x + 4, textY, row.state, 8.5, "F2", red);
      ops += drawText(cols.families.x + 4, textY, String(row.families), 8.5, "F2", navy);
      ops += drawText(cols.needed.x + 4, textY, needed, 8.5, "F2", row.needed_for_public === 0 ? red : gold);
      countyLines.forEach((line, i) => { ops += drawText(cols.counties.x + 4, textY - i * 11, line, 8, "F1", "0.15 0.15 0.15"); });
      y -= rowHeight;
    });
    finishPage();
  }

  const generated = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const pageContents = pages.map((content, i) => {
    const footer = drawLine(margin, 30, pageWidth - margin, 30, "0.82 0.78 0.70", 0.4)
      + drawText(margin, 18, `Generated ${generated} from live Stand With Meg survey data`, 7, "F1", muted)
      + drawText(pageWidth - margin - 60, 18, `Page ${i + 1} of ${pages.length}`, 7, "F1", muted);
    return content + footer;
  });

  const objects: string[] = [];
  const reserve = () => { objects.push(""); return objects.length; };
  const setObject = (id: number, value: string) => { objects[id - 1] = value; };

  const catalogId = reserve();
  const pagesId = reserve();
  const fontRegularId = reserve();
  const fontBoldId = reserve();
  setObject(fontRegularId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  setObject(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageIds: number[] = [];
  for (const content of pageContents) {
    const contentId = reserve();
    setObject(contentId, `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
    const pageId = reserve();
    pageIds.push(pageId);
    setObject(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
  }

  setObject(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  setObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsedThreshold = Number.parseInt(searchParams.get("threshold") || "", 10);
    const threshold = Number.isFinite(parsedThreshold)
      ? Math.max(1, Math.min(100, parsedThreshold))
      : DEFAULT_EXPORT_THRESHOLD;
    const state = searchParams.get("state")?.trim().toUpperCase() || null;
    const stateFilter = state && /^[A-Z]{2}$/.test(state) ? state : null;

    const patterns = await fetchPatternRows(threshold, stateFilter);
    const pdf = buildPdf(patterns, threshold, stateFilter);
    const suffix = stateFilter ? `-${stateFilter}` : "";

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="stand-with-meg-court-actor-patterns${suffix}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/admin/court-actors/patterns-pdf error:", err);
    return Response.json({ error: "Failed to generate court actor PDF." }, { status: 500 });
  }
}

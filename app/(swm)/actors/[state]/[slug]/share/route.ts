import { NextResponse } from "next/server";
import { loadCourtActorManifestFromDisk } from "../../../../../../lib/court-actor-manifest-disk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  new_hampshire: "NH",
  new_jersey: "NJ",
  new_mexico: "NM",
  new_york: "NY",
  north_carolina: "NC",
  north_dakota: "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  rhode_island: "RI",
  south_carolina: "SC",
  south_dakota: "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  west_virginia: "WV",
  wisconsin: "WI",
  wyoming: "WY",
  district_of_columbia: "DC",
};

function normalizeStateSegment(value: string) {
  return value.trim().toLowerCase().replace(/-/g, "_");
}

function stateSegmentToAbbr(value: string) {
  const normalized = normalizeStateSegment(value);
  if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return STATE_TO_ABBR[normalized] ?? null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ state: string; slug: string }> },
) {
  const { state, slug } = await context.params;
  const stateAbbr = stateSegmentToAbbr(state);
  const safeSlug = slug.trim().toLowerCase();

  if (!stateAbbr || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(safeSlug)) {
    return NextResponse.redirect(new URL("/report#court-actors", request.url));
  }

  const manifest = await loadCourtActorManifestFromDisk().catch(() => ({ actors: [] }));
  const entry = (manifest.actors ?? []).find(actor =>
    actor.slug === safeSlug && String(actor.state_abbr ?? "").toUpperCase() === stateAbbr && actor.share_url
  );

  if (!entry?.share_url) {
    return NextResponse.redirect(new URL("/report#court-actors", request.url));
  }

  return NextResponse.redirect(new URL(entry.share_url, request.url));
}

// Shared CDN cache policy for the public, no-PII report endpoints that the
// dashboard fetches on every page load (/api/survey, /api/survey/quotes,
// /api/survey/quote-counts, /api/survey/court-actors).
//
// Why this exists: without caching, every visit — and every bot crawl — runs
// the underlying Supabase aggregate queries fresh (quote-counts alone paginates
// through every approved row). Under load that overwhelms the database and
// forces the report page into its static-snapshot fallback, which is the
// "flapping" the public page was doing. Letting Vercel's edge cache the result
// for a short window means Supabase is queried roughly once per minute per
// region instead of once per request.
//
// stale-while-revalidate keeps serving the last good response while a fresh
// copy is fetched in the background, so a brief slow patch on Supabase no
// longer makes the public page break — visitors keep seeing good data.
//
// max-age=0 on Cache-Control means browsers always revalidate (so a manual
// refresh feels live), while s-maxage lets the shared CDN do the heavy lifting.
export const PUBLIC_REPORT_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

// Cache policy for the STATIC-SNAPSHOT fallback responses these same endpoints
// return when Supabase is unreachable. The headers above must never be used for
// the fallback: s-maxage=60 + stale-while-revalidate=300 would pin a degraded
// snapshot at the edge for up to ~6 minutes, so a momentary Supabase blip turns
// into minutes of wrong state/country counts, stale court actors, and a missing
// dollar total for every visitor — the recurring "site is broken" report.
//
// A short window with NO stale-while-revalidate still absorbs a request
// stampede during a real outage (≈one origin attempt per region per window),
// but lets the edge re-fetch live data within seconds of Supabase recovering
// instead of serving the snapshot long after the database is healthy again.
export const PUBLIC_REPORT_FALLBACK_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=10",
  "CDN-Cache-Control": "public, s-maxage=10",
  "Vercel-CDN-Cache-Control": "public, s-maxage=10",
};

export function corsJsonResponse(request: Request, body: unknown, status = 200): Response {
  const origin = request.headers.get("origin") || "";
  const allowed =
    origin.includes("standwithmeg.com") ||
    origin.includes("netlify.app") ||
    origin.includes("localhost");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return corsJsonResponse(request, { ok: true });
}
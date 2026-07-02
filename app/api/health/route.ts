export const dynamic = "force-dynamic";

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export async function GET() {
  const commit = env("VERCEL_GIT_COMMIT_SHA")
    ?? env("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA")
    ?? env("GITHUB_SHA")
    ?? null;

  return Response.json({
    ok: true,
    service: "standwithmeg-registry",
    commit,
    branch: env("VERCEL_GIT_COMMIT_REF") ?? env("GITHUB_REF_NAME"),
    environment: env("VERCEL_ENV") ?? env("NODE_ENV"),
    checked_at: new Date().toISOString(),
  });
}

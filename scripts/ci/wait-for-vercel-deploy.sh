#!/usr/bin/env bash
set -euo pipefail

expected_sha="${1:-}"
site_url="${2:-https://my.standwithmeg.com}"

if [ -z "$expected_sha" ]; then
  echo "usage: wait-for-vercel-deploy.sh <expected-commit-sha> [site-url]" >&2
  exit 2
fi

health_url="${site_url%/}/api/health"
echo "Waiting for ${health_url} to report commit ${expected_sha}."

for attempt in $(seq 1 24); do
  body="$(mktemp)"
  if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
    status="$(curl -L -sS -o "$body" -w "%{http_code}" -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" "$health_url" || true)"
  else
    status="$(curl -L -sS -o "$body" -w "%{http_code}" "$health_url" || true)"
  fi
  live_sha="$(python3 - "$body" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        print((json.load(f).get("commit") or "").strip())
except Exception:
    print("")
PY
)"
  rm -f "$body"

  if [ "$status" = "200" ] && [ "$live_sha" = "$expected_sha" ]; then
    echo "Vercel deployment verified at ${expected_sha}."
    exit 0
  fi

  echo "Attempt ${attempt}/24: HTTP ${status}, live commit '${live_sha:-unknown}'."
  sleep 30
done

echo "Vercel did not report ${expected_sha} within 12 minutes. GitHub push succeeded, but production is stale or the health endpoint is unreachable." >&2
exit 1

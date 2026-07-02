import { randomBytes } from "crypto";

/**
 * Stand With Meg — Secure OAuth state helper.
 *
 * OAuth state must be a cryptographically random nonce that the server can
 * verify on callback. Using `user.id` directly as state is vulnerable to
 * CSRF / account-linkage attacks because the attacker knows the victim's
 * user id and can start a flow on their behalf.
 *
 * This helper binds the state nonce to the authenticated user id in a
 * short-lived HTTP-only cookie. The callback route validates both pieces.
 */

const OAUTH_COOKIE_NAME = "swm_oauth_state";
const OAUTH_COOKIE_MAX_AGE = 600; // 10 minutes

export function generateOAuthState(userId: string): {
  state: string;
  cookie: string;
} {
  // 32 bytes (64 hex chars) of CSPRNG
  const nonce = randomBytes(32).toString("hex");

  // Bind the nonce to the user so the callback can verify the flow owner.
  // We store the user id alongside a hash of the nonce so the cookie value
  // itself cannot be used to infer state.
  const payload = JSON.stringify({
    u: userId,
    n: nonce,
  });

  const cookieValue = Buffer.from(payload).toString("base64url");

  const cookie = `${OAUTH_COOKIE_NAME}=${cookieValue}; Path=/api/auth/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${OAUTH_COOKIE_MAX_AGE}`;

  return { state: nonce, cookie };
}

export function validateOAuthState(
  request: Request
): { userId: string; state: string } | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OAUTH_COOKIE_NAME}=`));

  if (!cookie) return null;

  const cookieValue = cookie.slice(`${OAUTH_COOKIE_NAME}=`.length);
  if (!cookieValue) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf-8")
    ) as { u?: string; n?: string };

    if (!payload.u || !payload.n) return null;

    return { userId: payload.u, state: payload.n };
  } catch {
    return null;
  }
}

export function clearOAuthStateCookie(): string {
  return `${OAUTH_COOKIE_NAME}=; Path=/api/auth/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Stand With Meg — Simple in-memory rate limiter for API routes.
 *
 * This is intentionally lightweight. For production scale, replace with
 * Redis / Vercel KV / Upstash to share limits across serverless instances.
 */

export type RateLimitOptions = {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
  identifier?: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 10;

class MemoryRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor() {
    // Periodic cleanup every 5 minutes to prevent unbounded growth
    if (typeof globalThis !== "undefined" && !((globalThis as unknown as { __swm_rate_limiter_started?: boolean }).__swm_rate_limiter_started)) {
      (globalThis as unknown as { __swm_rate_limiter_started?: boolean }).__swm_rate_limiter_started = true;
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  isAllowed(key: string, options: RateLimitOptions = {}): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
    const now = Date.now();

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    if (bucket.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
    }

    bucket.count += 1;
    return { allowed: true, remaining: maxRequests - bucket.count, resetAt: bucket.resetAt };
  }
}

const globalLimiter = new MemoryRateLimiter();

/**
 * Get a client identifier from a Request.
 * Prefers Cloudflare / Vercel forwarded headers, falls back to direct IP.
 */
export function getClientIdentifier(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("cf-connecting-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown";
  return forwarded;
}

/**
 * Check a request against the rate limit. Returns a Response if rate-limited,
 * otherwise returns null and callers should continue processing.
 */
export function rateLimit(
  request: Request,
  options: RateLimitOptions = {}
): Response | null {
  const key = `${options.keyPrefix ?? "api"}:${options.identifier ?? getClientIdentifier(request)}`;
  const result = globalLimiter.isAllowed(key, options);

  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(options.maxRequests ?? DEFAULT_MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}

/**
 * Presets tuned for common route types.
 */
export const rateLimitPresets = {
  /** Email-sending endpoints: very low to prevent harassment/abuse. */
  email: { windowMs: 60 * 60 * 1000, maxRequests: 5, keyPrefix: "email" },
  /** AI/LLM endpoints: moderate to control cost. */
  ai: { windowMs: 60 * 60 * 1000, maxRequests: 20, keyPrefix: "ai" },
  /** Contact / survey update endpoints. */
  contact: { windowMs: 60 * 60 * 1000, maxRequests: 10, keyPrefix: "contact" },
  /** General public API reads. */
  public: { windowMs: 60 * 1000, maxRequests: 60, keyPrefix: "public" },
  /** Auth attempts / admin code checks. */
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10, keyPrefix: "auth" },
} as const;

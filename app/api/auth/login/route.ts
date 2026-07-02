import { createServerSupabaseClient } from "../../../../lib/supabase";
import { rateLimit, rateLimitPresets } from "../../../../lib/rate-limit";

const LOGIN_TIMEOUT_MS = 15_000;

class LoginTimeoutError extends Error {
  constructor() {
    super("LOGIN_TIMEOUT");
    this.name = "LoginTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new LoginTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, rateLimitPresets.auth);
    if (limited) return limited;

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      LOGIN_TIMEOUT_MS,
    );

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return Response.json({ error: "Incorrect email or password." }, { status: 401 });
      }
      if (error.message.toLowerCase().includes("fetch failed")) {
        return Response.json(
          { error: "Authentication is not responding right now. Please refresh and try again." },
          { status: 503 },
        );
      }
      return Response.json({ error: error.message }, { status: 401 });
    }

    return Response.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
    });
  } catch (err) {
    if (err instanceof LoginTimeoutError) {
      return Response.json(
        { error: "Login is temporarily unavailable because authentication is not responding. Please try again." },
        { status: 504 },
      );
    }
    console.error("Login error:", err);
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}

const DEFAULT_SUPABASE_READ_TIMEOUT_MS = 5_000;

export class SupabaseReadTimeoutError extends Error {
  constructor(label: string, timeoutMs = DEFAULT_SUPABASE_READ_TIMEOUT_MS) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "SupabaseReadTimeoutError";
  }
}

export async function withSupabaseReadTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  timeoutMs = DEFAULT_SUPABASE_READ_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new SupabaseReadTimeoutError(label, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

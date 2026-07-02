/**
 * Stub the Next.js `server-only` package when running scripts outside the
 * Next.js runtime. This lets server-only helpers (e.g. supabase-admin) be
 * imported safely by Node/tsx without throwing "This module cannot be imported
 * from a Client Component module".
 */
import Module from "module";

type ModuleLoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;

const originalLoad = (Module as unknown as { _load: ModuleLoadFn })._load;
(Module as unknown as { _load: ModuleLoadFn })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain) as unknown;
};

export function parseActorKeyClient(key: string): { name: string; state: string | null; role: string } | null {
  try {
    const normalized = key.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((key.length + 3) % 4);
    const decoded = atob(normalized);
    const [name, state, role] = decoded.split("|");
    if (!name || !role) return null;
    return { name, state: state || null, role };
  } catch {
    return null;
  }
}

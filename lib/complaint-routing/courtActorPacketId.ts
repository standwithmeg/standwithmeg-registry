// Pure ID/URL derivation for court-actor complaint packets.
// Client-safe — no server-only imports. Used by both server pages and
// client components so the URL scheme stays consistent.

export function courtActorSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function courtActorPacketId(actor: {
  name: string;
  location_key?: string | null;
  state_code?: string | null;
}): string {
  const location = (actor.location_key || actor.state_code || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return `${location}-${courtActorSlug(actor.name)}`;
}

export function courtActorComplaintPacketUrl(actor: {
  name: string;
  location_key?: string | null;
  state_code?: string | null;
}): string {
  return `/reports/actors/${courtActorPacketId(actor)}/complaint-packet`;
}

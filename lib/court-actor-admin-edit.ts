export type CourtActorEditUpdate = {
  name?: string;
  role?: string;
  court_or_county?: string | null;
};

export function normalizeCourtActorEditFields(fields: unknown): { update: CourtActorEditUpdate } | { error: string } {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return { error: "fields is required." };
  }

  const raw = fields as Record<string, unknown>;
  const update: CourtActorEditUpdate = {};

  if (Object.prototype.hasOwnProperty.call(raw, "name")) {
    if (typeof raw.name !== "string") return { error: "name must be a string." };
    const name = raw.name.trim().replace(/\s+/g, " ");
    if (!name) return { error: "name cannot be empty." };
    update.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(raw, "role")) {
    if (typeof raw.role !== "string") return { error: "role must be a string." };
    const role = raw.role.trim().replace(/\s+/g, " ");
    if (!role) return { error: "role cannot be empty." };
    update.role = role;
  }

  if (Object.prototype.hasOwnProperty.call(raw, "court_or_county")) {
    if (raw.court_or_county === null) {
      update.court_or_county = null;
    } else {
      if (typeof raw.court_or_county !== "string") return { error: "court_or_county must be a string or null." };
      const court = raw.court_or_county.trim().replace(/\s+/g, " ");
      if (!court) return { error: "court_or_county cannot be empty; send null instead." };
      update.court_or_county = court;
    }
  }

  if (Object.keys(update).length === 0) {
    return { error: "At least one editable field is required." };
  }

  return { update };
}

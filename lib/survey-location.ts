export const US_STATE_MISSING_LABEL = "United States - state missing";

const US_COUNTRY_ALIASES = new Set([
  "america",
  "the united states",
  "the united states of america",
  "u s",
  "u s a",
  "united states",
  "united states of america",
  "us",
  "usa",
]);

export function normalizeLocationText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeLocationState(value: unknown): string {
  return normalizeLocationText(value).toUpperCase();
}

export function isUnitedStatesCountry(value: unknown): boolean {
  const normalized = normalizeLocationText(value)
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

  return US_COUNTRY_ALIASES.has(normalized);
}

export function normalizeOutsideCountryForReporting(value: unknown): string {
  const country = normalizeLocationText(value);
  if (!country) return "";
  return isUnitedStatesCountry(country) ? US_STATE_MISSING_LABEL : country;
}

export function reportingLocationFromParts(state: unknown, outsideCountry: unknown): string {
  const stateCode = normalizeLocationState(state);
  if (stateCode) return stateCode;
  return normalizeOutsideCountryForReporting(outsideCountry);
}

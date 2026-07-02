const COUNTY_ABBREVIATIONS: Record<string, string> = {
  joco: "Johnson County",
};

const COUNTY_NAME_FIXES: Record<string, string> = {
  sedgewick: "Sedgwick",
};

const NON_COUNTY_TERMS = /\b(court|courthouse|district|judicial|agency|department|dcf|dcyf|cps|family court|multiple county courts)\b/i;

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      const lower = word.toLowerCase();
      if (/^(i|ii|iii|iv|vi|vii|viii|ix|x)$/i.test(word)) return word.toUpperCase();
      if (lower === "cinc") return "CINC";
      if (lower === "co") return "Co.";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function formatCourtActorLocationLabel(value: string | null | undefined): string | null {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase().replace(/[.]/g, "");
  const abbreviation = COUNTY_ABBREVIATIONS[lower];
  if (abbreviation) return abbreviation;

  const countyMatch = raw.match(/^(.+?)\s+county\b/i);
  if (countyMatch) {
    const countyName = titleCaseWords(countyMatch[1]);
    return `${COUNTY_NAME_FIXES[countyName.toLowerCase()] ?? countyName} County`;
  }

  if (/\bcounty\b/i.test(raw)) {
    return titleCaseWords(raw);
  }

  const judicialCountyMatch = raw.match(/^([A-Za-z][A-Za-z .'-]+?)\s+(?:\d+(?:st|nd|rd|th)\s+)?judicial\s+district\b/i);
  if (judicialCountyMatch) {
    const countyName = titleCaseWords(judicialCountyMatch[1]);
    return `${COUNTY_NAME_FIXES[countyName.toLowerCase()] ?? countyName} County`;
  }

  if (NON_COUNTY_TERMS.test(raw)) {
    return titleCaseWords(raw);
  }

  if (/^[A-Za-z][A-Za-z .'-]*$/.test(raw)) {
    const countyName = titleCaseWords(raw);
    return `${COUNTY_NAME_FIXES[countyName.toLowerCase()] ?? countyName} County`;
  }

  return titleCaseWords(raw);
}

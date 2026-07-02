export const INSTAGRAM_CAPTION_MAX_CHARS = 2000;

const INSTAGRAM_TRUNCATION_SUFFIX = "\n\n...\n\nRead/add your story: standwithmeg.com";

function normalizeCaption(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function truncateAtBoundary(text: string, maxChars: number): string {
  const normalized = normalizeCaption(text);
  if (normalized.length <= maxChars) return normalized;

  const suffix = INSTAGRAM_TRUNCATION_SUFFIX;
  const budget = Math.max(0, maxChars - suffix.length);
  const hardCut = normalized.slice(0, budget);
  const boundary = Math.max(
    hardCut.lastIndexOf("\n\n"),
    hardCut.lastIndexOf("\n"),
    hardCut.lastIndexOf(". "),
    hardCut.lastIndexOf(" ")
  );
  const cut = boundary > Math.floor(budget * 0.65) ? hardCut.slice(0, boundary) : hardCut;
  return `${cut.trim()}${suffix}`.slice(0, maxChars);
}

export function enforceInstagramCaptionLimit(text: string): string {
  return truncateAtBoundary(text, INSTAGRAM_CAPTION_MAX_CHARS);
}

export function appendInstagramSectionsWithinLimit(base: string, sections: string[]): string {
  let caption = enforceInstagramCaptionLimit(base);
  for (const section of sections.map(normalizeCaption).filter(Boolean)) {
    const candidate = `${caption}\n\n${section}`;
    if (candidate.length <= INSTAGRAM_CAPTION_MAX_CHARS) {
      caption = candidate;
    }
  }
  return caption;
}


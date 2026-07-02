// Tiny pub/sub so a "Sponsor this →" card click can pre-fill the form, even
// though the picker and the form are far apart in the page tree.

export interface SponsorPrefill {
  tier: string; // must match a form dropdown value
  stateAbbr: string; // "" for national/movement tiers
  stateName: string; // "" for national/movement tiers
  price: string; // "$299/mo"
}

const listeners = new Set<(p: SponsorPrefill) => void>();

export function setSponsorPrefill(p: SponsorPrefill): void {
  listeners.forEach((l) => l(p));
}

export function subscribeSponsorPrefill(l: (p: SponsorPrefill) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

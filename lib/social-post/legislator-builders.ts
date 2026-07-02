export type LegislatorSocialLink = {
  platform: "X" | "Facebook" | "Instagram" | "Official" | "Campaign";
  handle?: string;
  url: string;
};

export function enrichSocials<T extends {
  handle?: string;
  profile_url?: string;
  socials?: LegislatorSocialLink[];
}>(pick: T): T {
  if (pick.socials && pick.socials.length > 0) {
    return pick.profile_url ? pick : { ...pick, profile_url: pick.socials[0].url };
  }
  if (pick.profile_url) {
    const url = pick.profile_url;
    const platform: LegislatorSocialLink["platform"] = url.includes("facebook.com")
      ? "Facebook"
      : url.includes("instagram.com")
        ? "Instagram"
        : url.includes("x.com") || url.includes("twitter.com")
          ? "X"
          : "Official";
    return {
      ...pick,
      socials: [{ platform, handle: pick.handle, url: pick.profile_url }],
    };
  }
  if (pick.handle?.startsWith("@")) {
    const url = `https://x.com/${pick.handle.slice(1)}`;
    return {
      ...pick,
      profile_url: url,
      socials: [{ platform: "X", handle: pick.handle, url }],
    };
  }
  return pick;
}

export function formatSocialLinkLine(
  name: string,
  title: string,
  pick: { handle?: string; profile_url?: string; socials?: LegislatorSocialLink[] },
): string {
  const enriched = enrichSocials(pick);
  const links = enriched.socials ?? [];
  if (links.length === 0) {
    return `${name} (${title})`;
  }
  const linkText = links.map(link => `${link.platform}: ${link.url}`).join(" · ");
  return `${name} (${title}) — ${linkText}`;
}
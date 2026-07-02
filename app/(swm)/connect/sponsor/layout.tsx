import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sponsor Connection Circles Access",
  description: "Sponsor Connection Circles access for parents who cannot pay while protecting their identity, court actor list, and case details.",
  alternates: { canonical: "/connect/sponsor" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/connect/sponsor",
    siteName: "Stand With Meg",
    title: "Sponsor Connection Circles Access",
    description: "Sponsor Connection Circles access for parents who cannot pay while protecting their identity, court actor list, and case details.",
    images: [{ url: "/swm/swm-banner.png", width: 1366, height: 768, alt: "Stand With Meg national movement banner" }],
  },
};

export default function ConnectSponsorLayout({ children }: { children: React.ReactNode }) {
  return children;
}

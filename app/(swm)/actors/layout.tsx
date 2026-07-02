import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Court Actor Registry",
  description:
    "Browse Stand With Meg court actor pattern reports submitted by families, with public naming governed by independent-family thresholds.",
  alternates: {
    canonical: "/actors",
  },
  openGraph: {
    url: "/actors",
    title: "Court Actor Registry | Stand With Meg",
    description:
      "A protected registry of court actors named by families through Stand With Meg, built to reveal repeated patterns without exposing submitter identities.",
    images: [
      {
        url: "/swm/swm-banner.png",
        width: 1366,
        height: 768,
        alt: "Stand With Meg court actor registry banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Court Actor Registry | Stand With Meg",
    description:
      "See court actor pattern reports from Stand With Meg families after sharing your own story.",
    images: ["/swm/swm-banner.png"],
  },
};

export default function ActorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

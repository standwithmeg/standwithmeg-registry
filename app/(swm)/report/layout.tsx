import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family Court Impact Dashboard",
  description:
    "Explore Stand With Meg movement data by state, including documented family experiences, reported losses, state report thresholds, and public family quotes.",
  alternates: {
    canonical: "/report",
  },
  openGraph: {
    url: "/report",
    title: "Family Court Impact Dashboard | Stand With Meg",
    description:
      "Real family court and child welfare data from families documenting what happened in their state.",
    images: [
      {
        url: "/swm/swm-banner.png",
        width: 1366,
        height: 768,
        alt: "Stand With Meg public dashboard banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Family Court Impact Dashboard | Stand With Meg",
    description:
      "See the state-by-state family rights registry and add your story.",
    images: ["/swm/swm-banner.png"],
  },
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}

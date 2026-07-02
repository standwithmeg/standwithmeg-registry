import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Court Actor Update",
  description: "Privately update or add court actor details connected to an existing Stand With Meg survey submission while keeping family identity protected.",
  alternates: { canonical: "/court-actor-update" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/court-actor-update",
    siteName: "Stand With Meg",
    title: "Court Actor Update",
    description: "Privately update or add court actor details connected to an existing Stand With Meg survey submission while keeping family identity protected.",
    images: [{ url: "/swm/swm-banner.png", width: 1366, height: 768, alt: "Stand With Meg national movement banner" }],
  },
};

export default function CourtActorUpdateLayout({ children }: { children: React.ReactNode }) {
  return children;
}

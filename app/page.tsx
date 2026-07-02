import type { Metadata } from "next";
import ImpactPage from "./(swm)/report/page";
import { SwmBodyColor } from "./(swm)/swm-body-color";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Stand With Meg Family Rights Registry",
  description:
    "Open the Stand With Meg Family Rights Registry dashboard, share a family-court story, search public court actors, or support the report.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/",
    siteName: "Stand With Meg",
    title: "Stand With Meg Family Rights Registry",
    description:
      "A public dashboard documenting family court and child-welfare experiences by state.",
    images: [{ url: "/swm/swm-banner.png", width: 1366, height: 768, alt: "Stand With Meg national movement banner" }],
  },
};

export default function RootPage() {
  return (
    <>
      <SwmBodyColor />
      <ImpactPage />
    </>
  );
}

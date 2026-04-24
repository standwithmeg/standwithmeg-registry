import type { Metadata } from "next";
import { SwmBodyColor } from "./swm-body-color";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Stand With Meg — Courage to Stand, Power to Change",
    template: "%s | Stand With Meg",
  },
  description:
    "Document family court and child welfare experiences through the Stand With Meg Family Rights Survey and public movement dashboard.",
  applicationName: "Stand With Meg Family Rights Registry",
  authors: [{ name: "Stand With Meg" }],
  creator: "Stand With Meg",
  publisher: "Stand With Meg",
  alternates: {
    canonical: "/report",
  },
  openGraph: {
    type: "website",
    url: "/report",
    siteName: "Stand With Meg",
    title: "Stand With Meg Family Rights Registry",
    description:
      "A national registry documenting family court and child welfare experiences so families can turn isolated stories into public evidence.",
    images: [
      {
        url: "/swm/swm-banner.png",
        width: 1366,
        height: 768,
        alt: "Stand With Meg national movement banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stand With Meg Family Rights Registry",
    description:
      "Share your family court or child welfare story and help build the public record.",
    images: ["/swm/swm-banner.png"],
  },
};

export default function SwmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SwmBodyColor />
      {children}
    </>
  );
}

import type { Metadata } from "next";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com").replace(/\/+$/, "");
const OG_IMAGE_PATH = "/swm/swm-circles-promo-v2.png";
const OG_TITLE = "Join Stand With Meg Connection Circles";
const OG_DESCRIPTION = "A private, anonymous circle for families who survived the same courtroom. Come find your people.";

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [
      {
        url: `${APP_URL}${OG_IMAGE_PATH}`,
        width: 1200,
        height: 630,
        alt: OG_TITLE,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [`${APP_URL}${OG_IMAGE_PATH}`],
  },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

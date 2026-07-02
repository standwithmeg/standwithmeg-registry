import type { Metadata } from "next";
import type { ReactNode } from "react";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com").replace(/\/+$/, "");
const OG_IMAGE_PATH = "/swm/Thumbnail_court_circle.png";
const OG_TITLE = "Stand With Meg — Connection Circles promo";
const OG_DESCRIPTION =
  "Enter your promo code to claim Stand With Meg Connection Circles access. A private, anonymous circle for families who survived the same courtroom.";

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [
      {
        url: `${APP_URL}${OG_IMAGE_PATH}`,
        width: 1731,
        height: 909,
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

export default function PromoLayout({ children }: { children: ReactNode }) {
  return children;
}

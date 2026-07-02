import type { Metadata } from "next";
import PromoPageClient from "./PromoPageClient";

const APP_ORIGIN = "https://my.standwithmeg.com";
const THUMBNAIL = "/swm/Thumbnail_court_circle.png";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ code?: string }> }): Promise<Metadata> {
  const { code } = await searchParams;
  const promoCode = code?.trim().toUpperCase() || "";
  const title = promoCode
    ? `Stand With Meg — ${promoCode}: 1 month FREE Connection Circles`
    : "Stand With Meg — Connection Circles promo";
  const description = promoCode
    ? `Claim promo code ${promoCode} for one free month of Stand With Meg Connection Circles.`
    : "Enter your promo code to claim Stand With Meg Connection Circles access.";
  const imageUrl = `${APP_ORIGIN}${THUMBNAIL}`;
  const pageUrl = promoCode
    ? `${APP_ORIGIN}/connect/promo?code=${encodeURIComponent(promoCode)}`
    : `${APP_ORIGIN}/connect/promo`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "Stand With Meg",
      images: [
        {
          url: imageUrl,
          width: 1731,
          height: 909,
          alt: "Stand With Meg Connection Circles — join the circle",
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function PromoPage() {
  return <PromoPageClient />;
}

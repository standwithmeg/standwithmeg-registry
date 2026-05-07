import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Family Rights Survey",
  description:
    "Share your family court or child welfare story in the Stand With Meg registry. Choose anonymous, first-name, public, or data-only options.",
  alternates: {
    canonical: "/survey",
  },
  openGraph: {
    url: "/survey",
    title: "Family Rights Survey | Stand With Meg",
    description:
      "Add your story to the national registry documenting family court and child welfare experiences.",
    images: [
      {
        url: "/swm/meg-hero.png",
        width: 1536,
        height: 1024,
        alt: "Stand With Meg survey hero image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Family Rights Survey | Stand With Meg",
    description:
      "Share your story and help build the public record for family court reform.",
    images: ["/swm/meg-hero.png"],
  },
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import "./globals.css";
import "./dossier.css";
import type { Metadata } from "next";
import { Anton, Oswald, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

// Dossier design system fonts — variables must live on <html> so the
// [data-theme] tokens in dossier.css can resolve them (preview-proven gotcha).
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const oswald = Oswald({ weight: ["600", "700"], subsets: ["latin"], variable: "--font-oswald" });
const fraunces = Fraunces({ weight: ["400", "600"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fraunces" });
const inter = Inter({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono" });

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Stand With Meg Family Rights Registry",
  authors: [{ name: "Stand With Meg", url: "https://standwithmeg.com" }],
  creator: "Stand With Meg",
  publisher: "Stand With Meg",
  appleWebApp: {
    capable: true,
    title: "Connection Circles",
    statusBarStyle: "black-translucent",
  },
  themeColor: "#0A1A2B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Stand With Meg Family Rights Registry",
    url: siteUrl,
    publisher: {
      "@type": "Organization",
      name: "Stand With Meg",
      url: "https://standwithmeg.com",
    },
  };

  return (
    <html
      lang="en"
      data-theme="dossier"
      className={`h-full antialiased ${anton.variable} ${oswald.variable} ${fraunces.variable} ${inter.variable} ${mono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}

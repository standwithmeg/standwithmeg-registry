import "./globals.css";
import type { Metadata } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

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
    <html lang="en" className="h-full antialiased">
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

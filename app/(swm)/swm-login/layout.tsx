import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Authorized Stand With Meg administrator login.",
  alternates: {
    canonical: "/swm-login",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function SwmLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

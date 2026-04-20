import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Court Guide — Real Law. Plain English.",
  description:
    "The court system wasn't designed to explain itself to you. My Court Guide is grounded in real law and built for people navigating any legal situation without an attorney.",
};

export default function McgLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

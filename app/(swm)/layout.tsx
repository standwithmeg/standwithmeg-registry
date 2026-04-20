import type { Metadata } from "next";
import { SwmBodyColor } from "./swm-body-color";

export const metadata: Metadata = {
  title: "Stand With Meg — Courage to Stand, Power to Change",
  description:
    "A national advocacy platform documenting what families are experiencing in the family court and child welfare system. Share your story. Stand With Meg.",
};

export default function SwmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SwmBodyColor />
      {children}
    </>
  );
}

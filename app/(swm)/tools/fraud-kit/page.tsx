import type { Metadata } from "next";
import { FraudKitClient } from "./FraudKitClient";

export const metadata: Metadata = {
  title: "The Report Kit | The Shawn Lee Report",
  description:
    "Full fraud documentation course with Shawn Lee and Meg — worksheets, examples, and lifetime updates. $79 one-time. Educational, not legal advice.",
  alternates: { canonical: "/tools/fraud-kit" },
};

export default function FraudKitPage() {
  return <FraudKitClient />;
}
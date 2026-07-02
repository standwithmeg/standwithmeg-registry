import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Stand With Meg",
  description: "How Stand With Meg documents family-court and child-welfare patterns, protects submitter privacy, and builds public reports.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/about",
    siteName: "Stand With Meg",
    title: "About Stand With Meg",
    description: "How Stand With Meg documents family-court and child-welfare patterns, protects submitter privacy, and builds public reports.",
    images: [{ url: "/swm/swm-banner.png", width: 1366, height: 768, alt: "Stand With Meg national movement banner" }],
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f7f5f0] px-5 py-12 text-[#0f1e30]">
      <article className="mx-auto max-w-3xl">
        <Link href="/report" className="text-sm font-bold text-[#8a6d16] hover:underline">
          Back to the report
        </Link>
        <h1 className="mt-6 text-4xl font-black tracking-tight">About Stand With Meg</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Published by Stand With Meg</p>
        <p className="mt-5 text-lg leading-relaxed text-slate-700">
          Stand With Meg documents family-court and child-welfare experiences so families can turn isolated stories into a public record of patterns, costs, delays, and named system actors.
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">What the registry is</h2>
          <p className="leading-relaxed text-slate-700">
            The Family Rights Survey collects family-submitted experiences, then summarizes them into public dashboards, state reports, and court-actor pattern tools. The public pages are built to help families, advocates, and lawmakers see repeated issues by state and system.
          </p>
          <p className="leading-relaxed text-slate-700">
            Family submissions are allegations and lived experiences unless a public record independently supports stronger wording. Stand With Meg does not publish submitter identities and does not present individual submissions as court findings.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">How public naming works</h2>
          <p className="leading-relaxed text-slate-700">
            Court actors are only displayed publicly after repeated trusted family reports meet the public threshold. Extracted or unreviewed rows stay admin-only until they are promoted or independently confirmed through the project workflow.
          </p>
          <p className="leading-relaxed text-slate-700">
            Sponsors and partners support public-interest reporting. They do not control editorial decisions, family submissions, court-actor thresholds, or report language.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">What families can use it for</h2>
          <p className="leading-relaxed text-slate-700">
            Families use the dashboard and reports to understand whether their experience is isolated or part of a broader pattern. Advocates can point lawmakers, reporters, and community leaders to aggregate data without exposing a family&apos;s private story.
          </p>
          <p className="leading-relaxed text-slate-700">
            The project is not a law firm, emergency service, or case strategy provider. It is a documentation and public-reporting project built around family-submitted data, careful thresholds, and privacy-aware publishing.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">How the work is funded</h2>
          <p className="leading-relaxed text-slate-700">
            Stand With Meg is supported by donations, sponsors, and mission-aligned partner work. Funding helps cover hosting, data storage, email delivery, report generation, and the review workflows needed to keep public pages careful and usable.
          </p>
          <p className="leading-relaxed text-slate-700">
            Sponsors do not buy access to family submissions and do not decide which court actors appear. Public naming follows the registry workflow, not sponsor preference.
          </p>
          <p className="leading-relaxed text-slate-700">
            That separation matters because families need to know the record is built from their reports, not from whoever funds the platform.
          </p>
        </section>

        <nav className="mt-12 flex flex-wrap gap-3 text-sm font-bold">
          <Link href="/survey" className="rounded-lg bg-[#0f1e30] px-4 py-2 text-white">Take the Survey</Link>
          <Link href="/privacy" className="rounded-lg border border-slate-300 px-4 py-2">Privacy Policy</Link>
          <Link href="/contact" className="rounded-lg border border-slate-300 px-4 py-2">Contact</Link>
        </nav>
      </article>
    </main>
  );
}

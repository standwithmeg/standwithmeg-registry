import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Stand With Meg",
  description: "Contact Stand With Meg about the registry, state reports, sponsorships, privacy questions, corrections, or submission updates.",
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/contact",
    siteName: "Stand With Meg",
    title: "Contact Stand With Meg",
    description: "Contact Stand With Meg about the registry, state reports, sponsorships, privacy questions, corrections, or submission updates.",
    images: [{ url: "/swm/swm-banner.png", width: 1366, height: 768, alt: "Stand With Meg national movement banner" }],
  },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#f7f5f0] px-5 py-12 text-[#0f1e30]">
      <article className="mx-auto max-w-3xl">
        <Link href="/report" className="text-sm font-bold text-[#8a6d16] hover:underline">
          Back to the report
        </Link>
        <h1 className="mt-6 text-4xl font-black tracking-tight">Contact Stand With Meg</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Published by Stand With Meg</p>
        <p className="mt-5 text-lg leading-relaxed text-slate-700">
          Use these contacts for registry questions, sponsor requests, privacy concerns, and submission updates. Stand With Meg cannot provide emergency help or legal advice.
        </p>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-black">Registry and reports</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Questions about the survey, state reports, court-actor updates, or corrections.
            </p>
            <a className="mt-4 inline-block font-bold text-[#8a6d16] hover:underline" href="mailto:founder@standwithmeg.com">
              founder@standwithmeg.com
            </a>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-black">Sponsors and partners</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Sponsor placements, partner applications, or business questions.
            </p>
            <a className="mt-4 inline-block font-bold text-[#8a6d16] hover:underline" href="mailto:sponsors@standwithmeg.com">
              sponsors@standwithmeg.com
            </a>
          </div>
        </section>

        <section className="mt-10 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-black">Submission updates or removal</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            If you need to update or remove a survey submission, include the email you used and your submission ID if you have it. Do not send private documents, case numbers, or child-identifying details by email unless specifically requested.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/survey" className="rounded-lg bg-[#0f1e30] px-4 py-2 text-sm font-bold text-white">
              Request update link
            </Link>
            <Link href="/privacy" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">
              Read privacy policy
            </Link>
          </div>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-black">Before you send</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Keep emails brief and avoid attaching private court records, medical records, addresses, case numbers, or child-identifying details unless Stand With Meg specifically asks for them. If you are facing an emergency, contact local emergency services or a qualified advocate in your area.
          </p>
          <p className="text-sm leading-relaxed text-slate-600">
            For technical issues, include the page URL, what you were trying to do, and the error message you saw. For privacy requests, include enough information to find your submission without sending unnecessary private details.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-black">What to expect</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Registry and privacy messages are reviewed manually. Some requests require matching the email address on the original survey before anything can be changed. If a request involves a public court-actor page, Stand With Meg may need to compare the public page, the underlying submission record, and any admin review notes before responding.
          </p>
          <p className="text-sm leading-relaxed text-slate-600">
            Sponsor and partner messages are reviewed for mission fit first. The project does not accept every business, and sponsor interest does not guarantee placement on a report.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-black">Helpful links</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Start with the <Link href="/survey" className="font-bold text-[#8a6d16] hover:underline">Family Rights Survey</Link> if you have not submitted yet. Use the <Link href="/court-actor-update" className="font-bold text-[#8a6d16] hover:underline">Court Actor Update</Link> page only when you have a private submission link or need to add actor details to an existing survey.
          </p>
          <p className="text-sm leading-relaxed text-slate-600">
            To support the project publicly, review <Link href="/sponsor" className="font-bold text-[#8a6d16] hover:underline">sponsorship options</Link>. To earn by connecting mission-aligned businesses, start with the <Link href="/partners" className="font-bold text-[#8a6d16] hover:underline">State Partner application</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}

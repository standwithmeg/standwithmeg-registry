import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Stand With Meg uses survey, contact, sponsor, and connection data while protecting submitter identities and private details.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    url: "https://my.standwithmeg.com/privacy",
    siteName: "Stand With Meg",
    title: "Privacy Policy",
    description: "How Stand With Meg uses survey, contact, sponsor, and connection data while protecting submitter identities and private details.",
    images: [{ url: "/swm/swm-banner.png", width: 1366, height: 768, alt: "Stand With Meg national movement banner" }],
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f5f0] px-5 py-12 text-[#0f1e30]">
      <article className="mx-auto max-w-3xl">
        <Link href="/report" className="text-sm font-bold text-[#8a6d16] hover:underline">
          Back to the report
        </Link>
        <h1 className="mt-6 text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Published by Stand With Meg · Last updated June 4, 2026</p>
        <p className="mt-5 text-lg leading-relaxed text-slate-700">
          Stand With Meg collects only the information needed to operate the Family Rights Survey, public reports, court-actor registry, sponsorship pages, and Connection Circles.
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">Information we collect</h2>
          <p className="leading-relaxed text-slate-700">
            Survey submissions may include contact information, state or country, county, case status, family impact details, cost estimates, story excerpts, and court actors named by the submitting family. Sponsor, partner, and contact forms collect the fields shown on those forms.
          </p>
          <p className="leading-relaxed text-slate-700">
            Connection Circles may use email, access status, pseudonyms, connection requests, and consent records to help families privately request contact with others who reported the same court actor.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">How we use it</h2>
          <p className="leading-relaxed text-slate-700">
            We use submitted information to maintain the registry, generate aggregate reports, review court-actor patterns, send requested update or access emails, respond to inquiries, process sponsorship workflows, and protect the integrity of the project.
          </p>
          <p className="leading-relaxed text-slate-700">
            Public reports use aggregate data and thresholded court-actor naming. Submitter names, emails, phone numbers, private update links, and child-identifying information are not displayed in public reports.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">Service providers</h2>
          <p className="leading-relaxed text-slate-700">
            The site uses service providers for hosting, database storage, authentication, email delivery, payments, analytics or debugging, and document/report generation. These providers process information only as needed to operate the site.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">Updates and removal</h2>
          <p className="leading-relaxed text-slate-700">
            You can request an update link from the survey page or contact Stand With Meg to request correction or removal of a submission. Include the email used for the survey and your submission ID if available.
          </p>
          <p className="leading-relaxed text-slate-700">
            For privacy questions, email <a className="font-bold text-[#8a6d16] hover:underline" href="mailto:founder@standwithmeg.com">founder@standwithmeg.com</a>.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-black">Public reports and private details</h2>
          <p className="leading-relaxed text-slate-700">
            Stand With Meg may publish aggregate counts, state-level patterns, public report summaries, and thresholded court-actor names. We do not intentionally publish a submitter&apos;s email, phone number, private update link, precise address, child name, or full individual survey record.
          </p>
          <p className="leading-relaxed text-slate-700">
            If a public page appears to include private information that should not be public, contact us promptly with the URL and a short description of the concern so it can be reviewed.
          </p>
        </section>
      </article>
    </main>
  );
}

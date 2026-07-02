import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Report Kit Purchase Complete",
  robots: { index: false },
};

type Props = {
  searchParams?: Promise<{ email?: string }>;
};

export default async function FraudKitSuccessPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <main className="min-h-screen bg-[#0F1E30] px-5 py-16 text-[#f4f1ea]">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-3xl font-black text-white">Thank you — you&apos;re locked in.</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/80">
          Your $79 prepayment is processing. The Report Kit is coming soon — when Shawn&apos;s course goes live, your
          access unlocks automatically at this email. We&apos;ll also email you on launch day.
          {email ? (
            <>
              {" "}
              Save <strong className="text-[#C9A227]">{email}</strong> for the unlock button on the kit page.
            </>
          ) : null}
        </p>
        <Link
          href="/tools/fraud-kit"
          className="mt-8 inline-block rounded-xl bg-[#C9A227] px-8 py-3 text-sm font-bold text-[#050A14]"
        >
          Open The Report Kit
        </Link>
      </div>
    </main>
  );
}
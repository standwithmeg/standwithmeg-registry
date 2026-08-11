import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report Kit Purchase Complete",
  robots: { index: false },
};

export default async function FraudKitSuccessPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || "your signed-in email";

  return (
    <main className="min-h-screen bg-[#0F1E30] px-5 py-16 text-[#f4f1ea]">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-3xl font-black text-white">Thank you — you&apos;re locked in.</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/80">
          Your $79 payment is processing. Access is tied to your verified account at{" "}
          <strong className="text-[#C9A227]">{email}</strong>. If the workspace is not visible yet, wait a moment for the
          Stripe webhook, then reopen the kit.
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

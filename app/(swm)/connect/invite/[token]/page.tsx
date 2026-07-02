import { redirect } from "next/navigation";
import { Metadata } from "next";
import { createServerSupabaseClient } from "../../../../../lib/supabase";
import { getInviteLinkByToken, trackPendingReferral } from "../../../../../lib/connection-circle-invites";
import { findLatestSurveySubmitter } from "../../../../../lib/connection-circles";
import Link from "next/link";
import { GOLD, INK, PAPER, RED } from "../../../connect/theme";

export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://my.standwithmeg.com").replace(/\/+$/, "");
const OG_IMAGE_PATH = "/swm/swm-circles-promo-v2.png";
const OG_TITLE = "Join Stand With Meg Connection Circles";
const OG_DESCRIPTION = "A private, anonymous circle for families who survived the same courtroom. Come find your people.";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const imageUrl = `${APP_URL}${OG_IMAGE_PATH}`;
  return {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    openGraph: {
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: OG_TITLE,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      images: [imageUrl],
    },
  };
}

export default async function InviteLandingPage({ params }: Props) {
  const { token } = await params;

  const [supabase, link] = await Promise.all([
    createServerSupabaseClient(),
    getInviteLinkByToken(token),
  ]);

  const { data: { user } } = await supabase.auth.getUser();

  if (!link) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: INK, color: PAPER }}>
        <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${RED}57` }}>
          <h1 className="text-2xl font-black text-white mb-3">Invite link expired</h1>
          <p className="text-sm text-white/70 mb-6">This invite link is no longer active. Ask the person who shared it to send a new one.</p>
          <Link href="/connect" className="rounded-xl px-5 py-3 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
            Learn about Connection Circles
          </Link>
        </div>
      </main>
    );
  }

  if (user?.email) {
    const submitter = await findLatestSurveySubmitter(user.email);
    if (submitter) {
      await trackPendingReferral(token, user.email);
      redirect(`/connect?ref_token=${encodeURIComponent(token)}`);
    }
    // Logged in but not a submitter — fall through to landing page with a message.
  }

  const connectUrl = `/connect?ref_token=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-4xl px-6 py-12 md:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>Private invitation</p>
            <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">
              Join Stand With Meg <em style={{ color: GOLD, fontStyle: "normal" }}>Connection Circles</em>
            </h1>
            <p className="mt-5 text-base leading-relaxed text-white/70">
              A private, anonymous community for verified families who survived family court.
              Talk by handle, find others who reported the same court actor, and connect only when both sides agree.
            </p>
            <div className="mt-8 space-y-3">
              <div className="flex items-start gap-3 text-sm text-white/75">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-900/40 text-[10px] font-black" style={{ color: "#fecaca" }}>1</span>
                <span>Log in with the email you used on the Stand With Meg survey.</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-white/75">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-900/40 text-[10px] font-black" style={{ color: "#fecaca" }}>2</span>
                <span>Choose $6/month or $50/year access.</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-white/75">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-900/40 text-[10px] font-black" style={{ color: "#fecaca" }}>3</span>
                <span>The person who invited you gets one month free after you join.</span>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={connectUrl} className="rounded-xl px-6 py-3 text-center text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
                Accept invite & join →
              </Link>
              <Link href="/survey" target="_blank" className="rounded-xl px-6 py-3 text-center text-sm font-bold text-white/85" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>
                Take the survey first
              </Link>
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            <img
              src={OG_IMAGE_PATH}
              alt="Join Stand With Meg Connection Circles"
              className="w-full object-cover"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

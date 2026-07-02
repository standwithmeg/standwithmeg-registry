"use client";

import Link from "next/link";
import { GOLD, INK, NAVY, RED, PAPER, HAIRLINE, SURFACE, SURFACE_RAISED } from "../theme";

const guides = [
  { id: "getting-started", title: "Getting Started", step: 1 },
  { id: "finding-rooms", title: "Finding Your Rooms", step: 2 },
  { id: "chat-safety", title: "Using the Chat Safely", step: 3 },
  { id: "requests", title: "Requesting a Connection", step: 4 },
  { id: "account", title: "Managing Your Account", step: 5 },
  { id: "help-paying", title: "Getting Help Paying", step: 6 },
  { id: "sponsoring", title: "Sponsoring Another Parent", step: 7 },
  { id: "invite", title: "Inviting Another Parent", step: 8 },
];

export default function ConnectHelpPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-6xl px-6 py-10 md:px-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:items-start">
          {/* Sidebar nav */}
          <nav className="sticky top-8 hidden lg:block">
            <div className="rounded-2xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
              <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>Help Center</p>
              <h2 className="mt-2 text-lg font-black">Connection Circles</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {guides.map((g) => (
                  <li key={g.id}>
                    <a href={`#${g.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-white/5" style={{ color: "rgba(244,241,234,0.65)" }}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black" style={{ backgroundColor: GOLD, color: NAVY }}>{g.step}</span>
                      <span>{g.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t pt-4" style={{ borderColor: HAIRLINE }}>
                <Link href="/connect" className="block rounded-lg px-3 py-2 text-sm font-black" style={{ backgroundColor: RED, color: "white" }}>
                  Back to Connection Circles
                </Link>
              </div>
            </div>
          </nav>

          {/* Mobile nav */}
          <div className="lg:hidden">
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>Help Center</p>
            <h1 className="mt-2 text-3xl font-black">Connection Circles Guides</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {guides.map((g) => (
                <a key={g.id} href={`#${g.id}`} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                  {g.step}. {g.title}
                </a>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-12">
            <div className="hidden lg:block">
              <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>Help Center</p>
              <h1 className="mt-2 text-4xl font-black">Connection Circles Guides</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#f4f1ea]/60">
                Step-by-step help for using Stand With Meg Connection Circles. Each guide walks through one part of the experience, from signing up to sponsoring another parent.
              </p>
            </div>

            {/* Guide 1: Getting Started */}
            <GuideSection id="getting-started" step={1} title="Getting Started">
              <p>Go to <Link href="/connect" className="font-bold underline" style={{ color: GOLD }}>my.standwithmeg.com/connect</Link> and enter the <strong>exact same email</strong> you used on the Stand With Meg survey.</p>
              <p className="mt-3">We will send you a private, one-time login link. No password needed. Click the link in your email to sign in automatically.</p>
              <p className="mt-3">Once you are in, choose how you want access:</p>
              <ul className="mt-2 space-y-1">
                <li><strong style={{ color: GOLD }}>$6/month</strong> — try it out month by month</li>
                <li><strong style={{ color: GOLD }}>$50/year</strong> — save money with an annual plan</li>
                <li><strong>Request free access</strong> — if you cannot pay right now, your request goes into a private queue</li>
              </ul>
              <p className="mt-3 rounded-xl p-4 text-sm" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                <strong>Tip:</strong> If you have not taken the survey yet, the login link will not be sent. Take the survey first, then come back with the same email.
              </p>
            </GuideSection>

            {/* Guide 2: Finding Your Rooms */}
            <GuideSection id="finding-rooms" step={2} title="Finding Your Rooms">
              <p>After you have active access, click <strong>Go to my circle</strong>. You will see <strong>rooms</strong> built around the court actors you reported in the survey.</p>
              <p className="mt-3">Each room shows up only when at least one other verified family also reported that same court actor. If you do not see any rooms yet, it means we have not found another match. This is normal — come back in a week or ask another parent to take the survey.</p>
              <p className="mt-3">If this is your first time, you will be asked to pick a <strong>private handle</strong>. This is the only name other parents ever see.</p>
              <p className="mt-2 rounded-xl p-4 text-sm" style={{ backgroundColor: "rgba(198,61,47,0.10)", border: "1px solid rgba(198,61,47,0.30)" }}>
                <strong>Good handles:</strong> PrairieMom, HopefulDad_2024, TexasTiger<br />
                <strong>Bad handles:</strong> Your real name, your child&apos;s name, your employer, your case number, your city
              </p>
            </GuideSection>

            {/* Guide 3: Chat Safety */}
            <GuideSection id="chat-safety" step={3} title="Using the Chat Safely">
              <p>Inside each room, you can post messages using your handle. No one sees your real name or email.</p>
              <p className="mt-3 font-bold" style={{ color: GOLD }}>What you CAN share:</p>
              <ul className="mt-1 space-y-1">
                <li>General process questions</li>
                <li>Public patterns you noticed</li>
                <li>How the court actor behaved in your case (without case numbers)</li>
                <li>Support and encouragement for other parents</li>
              </ul>
              <p className="mt-3 font-bold" style={{ color: RED }}>What you should NEVER share:</p>
              <ul className="mt-1 space-y-1">
                <li>Your child&apos;s name</li>
                <li>Case numbers or docket numbers</li>
                <li>Sealed filings or court orders</li>
                <li>Your home address, phone number, or email</li>
                <li>Your legal strategy or attorney&apos;s private advice</li>
                <li>Names of the opposing party or their family</li>
              </ul>
              <p className="mt-3">If you regret a message, hover over it and click <strong>remove</strong>. It disappears from the room, but stays in our audit log for safety reviews.</p>
            </GuideSection>

            {/* Guide 4: Requesting a Connection */}
            <GuideSection id="requests" step={4} title="Requesting a Real Connection">
              <p>When you want to exchange real email addresses with another parent, click <strong>Request to connect</strong> next to their handle in the room list.</p>
              <p className="mt-3">You can add a short, general note (max 600 characters). Keep it general — do not include your name, email, phone, or case details.</p>
              <p className="mt-3">The other parent gets a private link. They do <strong>not</strong> see your name, email, survey answers, or story. They only see your handle and your optional note.</p>
              <p className="mt-3">They can choose to:</p>
              <ul className="mt-1 space-y-1">
                <li><strong>Accept</strong> — both of you get one introduction email with your real email addresses</li>
                <li><strong>Decline</strong> — they never learn who you are</li>
                <li><strong>Ignore</strong> — the request expires after a set time; they never learn who you are</li>
              </ul>
              <p className="mt-3 rounded-xl p-4 text-sm" style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}>
                <strong>Safety check:</strong> Only accept requests from parents in the same court actor room. If something feels off, decline. You can always block or report if needed.
              </p>
            </GuideSection>

            {/* Guide 5: Managing Your Account */}
            <GuideSection id="account" step={5} title="Managing Your Account">
              <p>Go to <strong>Manage access</strong> or visit <Link href="/connect/account" className="font-bold underline" style={{ color: GOLD }}>my.standwithmeg.com/connect/account</Link>.</p>
              <p className="mt-3">Here you can:</p>
              <ul className="mt-1 space-y-1">
                <li><strong>Change your handle</strong> — type a new one and click Save. Old messages keep the handle you had when you wrote them.</li>
                <li><strong>Manage your subscription</strong> — open Stripe&apos;s billing portal to update your card, see invoices, or cancel. If you cancel, you keep access until the end of your current billing period.</li>
                <li><strong>Leave a room</strong> — the room disappears from your list, but your old messages stay for others to see.</li>
                <li><strong>Sign out</strong> — click the Sign out button on the main Connection Circles page.</li>
              </ul>
            </GuideSection>

            {/* Guide 6: Getting Help Paying */}
            <GuideSection id="help-paying" step={6} title="Getting Help Paying">
              <p>If you cannot afford $6/month, you have two options:</p>
              <p className="mt-3 font-bold" style={{ color: GOLD }}>Option 1: Request free access from the community pool</p>
              <p className="mt-1">In the <strong>I need free access now</strong> section, click <strong>Request free access</strong>. Your request goes into a private queue. We review it as soon as sponsor funds are available. You will get an email when a seat opens up.</p>
              <p className="mt-3 font-bold" style={{ color: GOLD }}>Option 2: Ask one person to sponsor you directly</p>
              <p className="mt-1">Click <strong>Create a private sponsor link to share</strong>. This creates a link tied to your survey email. You can:</p>
              <ul className="mt-1 space-y-1">
                <li><strong>Copy the link</strong> and send it by text or DM</li>
                <li>Click <strong>Email</strong> to open your email app with a pre-written message</li>
                <li>Click <strong>Share</strong> to send through your phone&apos;s share sheet</li>
              </ul>
              <p className="mt-2">The person who pays never sees your name, email, court actor list, case details, or story. When they pay, your access is added automatically.</p>
            </GuideSection>

            {/* Guide 7: Sponsoring Another Parent */}
            <GuideSection id="sponsoring" step={7} title="Sponsoring Another Parent">
              <p>If a parent sent you a private sponsor link, open it and choose <strong>1 month ($6)</strong> or <strong>1 year ($50)</strong>. You can also choose how you want to be thanked:</p>
              <ul className="mt-1 space-y-1">
                <li><strong>Tag my social account</strong> — e.g., &quot;Thank you @HopefulDad&quot;</li>
                <li><strong>Use my first name</strong> — e.g., &quot;Thank you Michael&quot;</li>
                <li><strong>Keep me anonymous</strong> — &quot;Thank you, a friend of Stand With Meg&quot;</li>
              </ul>
              <p className="mt-3">If you do not know a specific parent but want to help, go to <Link href="/connect/sponsor" className="font-bold underline" style={{ color: GOLD }}>my.standwithmeg.com/connect/sponsor</Link> and donate to the general pool. Your donation goes toward the hardship waitlist. You never see who receives it.</p>
            </GuideSection>

            {/* Guide 8: Inviting Another Parent */}
            <GuideSection id="invite" step={8} title="Inviting Another Parent">
              <p>The most important thing is that they <strong>take the Stand With Meg survey first</strong> using the email they want to use for Connection Circles.</p>
              <p className="mt-3">Send them this link: <Link href="/survey" className="font-bold underline" style={{ color: GOLD }}>my.standwithmeg.com/survey</Link></p>
              <p className="mt-3">After they submit, tell them to go to <Link href="/connect" className="font-bold underline" style={{ color: GOLD }}>my.standwithmeg.com/connect</Link> and enter the <strong>exact same email</strong> they used on the survey.</p>
              <p className="mt-3">You can also share the live stats page to show them the community is real and growing: <Link href="/connect/stats" className="font-bold underline" style={{ color: GOLD }}>my.standwithmeg.com/connect/stats</Link></p>
            </GuideSection>

            {/* Quick reminders */}
            <div className="rounded-2xl p-6 md:p-8" style={{ background: "linear-gradient(135deg, rgba(198,61,47,0.13), rgba(201,162,39,0.08))", border: `1px solid rgba(198,61,47,0.30)` }}>
              <h2 className="text-xl font-black">Quick Safety Reminders</h2>
              <div className="mt-4 grid gap-3 text-sm text-[#f4f1ea]/70 md:grid-cols-2">
                <p><strong style={{ color: GOLD }}>Handles first.</strong> Your real name and email are never shown in rooms or chats unless both sides accept a connection request.</p>
                <p><strong style={{ color: GOLD }}>Double opt-in.</strong> Real email addresses are only exchanged when BOTH parents agree. If one declines or ignores, identity stays hidden.</p>
                <p><strong style={{ color: GOLD }}>No public directory.</strong> There is no list of all members. You only see parents who reported the same court actor as you.</p>
                <p><strong style={{ color: GOLD }}>Not legal advice.</strong> Connection Circles are for peer support and pattern documentation. Do not ask for or give legal advice here.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function GuideSection({ id, step, title, children }: { id: string; step: number; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-8">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ backgroundColor: GOLD, color: NAVY }}>{step}</span>
        <h2 className="text-2xl font-black">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#f4f1ea]/72">
        {children}
      </div>
    </div>
  );
}

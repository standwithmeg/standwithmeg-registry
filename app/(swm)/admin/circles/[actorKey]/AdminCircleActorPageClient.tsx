"use client";

import Link from "next/link";
import { AdminCircleChatPanel } from "../../_components/AdminCircleChat";
import type { AdminChatMessage } from "../../_components/AdminCircleChat";
import { colors } from "../../../../../lib/design-tokens";
import type { AdminCircleParent } from "../../../../../lib/admin-circles";

const GOLD = colors.gold.DEFAULT;
const RED = colors.evidence.DEFAULT;
const INK = colors.ink.DEFAULT;
const HAIRLINE_STRONG = colors.hairline.strong;
const HAIRLINE = colors.hairline.DEFAULT;
const SURFACE = colors.surface.DEFAULT;
const SURFACE_RAISED = colors.surface.raised;

export default function AdminCircleActorPageClient({
  actorKey,
  actor,
  parents,
  joinedHandles,
  acceptedIntros,
  preview = false,
  demo = false,
  demoKey = "jane",
  demoMessages,
}: {
  actorKey: string;
  actor: { name: string; state: string | null; role: string };
  parents: AdminCircleParent[];
  joinedHandles: number;
  acceptedIntros: number;
  preview?: boolean;
  demo?: boolean;
  demoKey?: string;
  demoMessages?: AdminChatMessage[];
}) {
  const toggleHref = demo
    ? `/admin/circles/${encodeURIComponent(actorKey)}`
    : preview
      ? `/admin/circles/${encodeURIComponent(actorKey)}`
      : `/admin/circles/${encodeURIComponent(actorKey)}?preview=member`;

  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/circles" className="text-xs uppercase tracking-wider text-[#f4f1ea]/60 hover:text-[#f4f1ea]">
            &larr; Back to Circles admin
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {!demo && (
              <Link
                href={toggleHref}
                className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/10"
                style={{ border: `1px solid ${HAIRLINE}` }}
              >
                {preview ? "Switch to founder view" : "Preview as new member"}
              </Link>
            )}
            <Link
              href={`/admin/circles/${encodeURIComponent(actorKey)}?preview=demo&demo=jane`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${demo && demoKey === "jane" ? "bg-white/10" : "hover:bg-white/10"}`}
              style={{ border: `1px solid ${HAIRLINE}` }}
            >
              Demo: Jane Doe
            </Link>
            <Link
              href={`/admin/circles/${encodeURIComponent(actorKey)}?preview=demo&demo=kevin`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${demo && demoKey === "kevin" ? "bg-white/10" : "hover:bg-white/10"}`}
              style={{ border: `1px solid ${HAIRLINE}` }}
            >
              Demo: Kevin Paul
            </Link>
          </div>
        </div>

        {demo && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-sm font-bold"
            style={{ backgroundColor: colors.gold.wash, color: GOLD, border: `1px solid ${colors.gold.border}` }}
          >
            Demo video mode — names, handles, and messages are fake. Use this for recordings and screenshots.
            {" "}
            <Link href={`/admin/circles/${encodeURIComponent(actorKey)}`} className="underline">Exit demo</Link>
          </div>
        )}

        {!demo && preview && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-sm font-bold"
            style={{ backgroundColor: colors.gold.wash, color: GOLD, border: `1px solid ${colors.gold.border}` }}
          >
            Member preview mode — emails are hidden and posting is disabled.
          </div>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div
            className="rounded-[2rem] p-6 md:p-8"
            style={{
              background: "linear-gradient(135deg, rgba(244,241,234,0.075), rgba(244,241,234,0.025))",
              border: `1px solid ${HAIRLINE_STRONG}`,
            }}
          >
            <p className="text-xs uppercase tracking-wider" style={{ color: RED }}>{actor.role}</p>
            <h1 className="mt-1 text-4xl font-black md:text-6xl">{actor.name}</h1>
            <p className="mt-2 text-sm text-[#f4f1ea]/60">{actor.state ?? "Unknown state"}</p>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#f4f1ea]/70 md:text-base">
              {demo
                ? "Demo view: a busy circle with many connected families. This is what a thriving room looks like for a video walkthrough."
                : preview
                  ? "This is what a verified member sees when they enter this circle. They can read the room, see other handles, and post once they pick a pseudonym."
                  : "Founder view of this circle. You can see every family who reported this actor, read the room, and post as Meg to welcome them."}
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <RoomStat label="Visible parents" value={String(parents.length)} />
              <RoomStat label="Joined handles" value={String(joinedHandles)} />
              <RoomStat label="Accepted intros" value={String(acceptedIntros)} />
            </div>
          </div>

          <aside
            className="rounded-[2rem] p-5"
            style={{ backgroundColor: SURFACE, border: `1px solid ${colors.gold.border}` }}
          >
            <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: RED }}>
              {demo ? "Demo scenario" : preview ? "How a new member uses this room" : "Founder workflow"}
            </p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#f4f1ea]/68">
              <WorkflowLine n="1" text="Read the room context before posting." />
              <WorkflowLine n="2" text="Use the chat for general pattern support by handle." />
              <WorkflowLine n="3" text={demo ? "Members request a mutual email intro only when both sides consent." : preview ? "Request a mutual email intro only when both sides consent." : "Parents on the right are the same list members see."} />
            </div>
          </aside>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <GuidanceCard title="Good room use" text="Ask general process questions, share public patterns, and keep your identity separate from your story." />
          <GuidanceCard title="Do not post" text="Case numbers, sealed details, child names, addresses, phone numbers, legal strategy, or private documents." />
          <GuidanceCard title="Member view" text="This layout mirrors what verified members see when they enter the same circle." />
          {demo || preview ? (
            <GuidanceCard title="Pick a handle" text="New members choose a pseudonym before posting. Their real name and email stay hidden." />
          ) : (
            <GuidanceCard title="Post as Meg" text="Your chat messages appear under the Meg handle so families know it is founder support." />
          )}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <div className="min-h-[600px]">
            <AdminCircleChatPanel actorKey={actorKey} readOnly={preview || demo} demoMessages={demoMessages} />
          </div>

          <section
            className="rounded-2xl p-5 md:p-6"
            style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}
          >
            <div
              className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end sm:justify-between"
              style={{ borderColor: HAIRLINE }}
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: RED }}>Parents in this circle</p>
                <h2 className="mt-1 text-2xl font-black">Handles and info</h2>
              </div>
              <span
                className="rounded-xl px-3 py-2 text-sm font-black"
                style={{ backgroundColor: colors.gold.wash, color: GOLD, border: `1px solid ${colors.gold.border}` }}
              >
                {joinedHandles} joined
              </span>
            </div>

            {parents.length === 0 ? (
              <div
                className="mt-4 rounded-2xl p-6 text-sm text-[#f4f1ea]/70"
                style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}
              >
                <p>No other parents are currently visible here. They may not have joined, or the bucket may have no matched families yet.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {parents.map(p => (
                  <li
                    key={p.email}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: SURFACE_RAISED, border: `1px solid ${HAIRLINE}` }}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-lg font-black" style={{ color: GOLD }}>{p.pseudonym}</p>
                        {!p.has_handle && (
                          <span
                            className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#f4f1ea]/55"
                            style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}
                          >
                            not joined
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#f4f1ea]/60">
                        {p.state ?? "state n/a"}{p.case_year ? ` · case ${p.case_year}` : ""}
                        {p.submission_count > 1 ? ` · ${p.submission_count} submissions` : ""}
                      </p>
                      {!preview && !demo && (
                        <p className="text-[10px] text-[#f4f1ea]/40">{p.email}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function RoomStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: INK, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f4f1ea]/45">{label}</p>
      <p className="mt-2 text-3xl font-black" style={{ color: GOLD }}>{value}</p>
    </div>
  );
}

function WorkflowLine({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black" style={{ backgroundColor: GOLD, color: INK }}>{n}</span>
      <span>{text}</span>
    </div>
  );
}

function GuidanceCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
      <p className="text-sm font-black" style={{ color: GOLD }}>{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#f4f1ea]/58">{text}</p>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { colors } from "../../../../../lib/design-tokens";
import { parseActorKeyClient } from "../../../../../lib/parse-actor-key-client";
import type { CirclesAccessDetailRow } from "../../../../../lib/admin-metrics";
import type { CircleUserProfile } from "../../../../../lib/circle-user-profile";
import { RED, GOLD, fmtDate, fmtAgo, accessTypeLabel, StatusBadge } from "./shared";

export function AccessDetailPanel({ row, onClose }: { row: CirclesAccessDetailRow; onClose: () => void }) {
  const [profile, setProfile] = useState<CircleUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "activity" | "messages" | "survey" | "financial" | "invites" | "referrals" | "audit" | "moderation">("overview");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/circle-user/${encodeURIComponent(row.email)}`, { cache: "no-store" })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Could not load profile.");
        return data as CircleUserProfile;
      })
      .then(data => {
        if (cancelled) return;
        setProfile(data);
        setNote(data.moderation.admin_note || "");
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [row.email]);

  async function saveNote() {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/circle-user/${encodeURIComponent(row.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Save failed");
      setProfile(prev => prev ? { ...prev, moderation: { ...prev.moderation, admin_note: note } } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingNote(false);
    }
  }

  function exportData() {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swm-user-${profile.email.replace(/[^a-z0-9]/gi, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-5xl overflow-y-auto border-l"
        style={{
          backgroundColor: colors.surface.DEFAULT,
          borderColor: colors.hairline.strong,
        }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-6 py-5" style={{ backgroundColor: colors.surface.DEFAULT, borderColor: colors.hairline.strong }}>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: RED }}>Member CRM profile</p>
            <h2 className="mt-1 break-all text-2xl font-black text-white">{row.email}</h2>
            {!loading && !error && profile && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/55">
                  {profile.state ?? "No state"} · Joined {fmtDate(profile.join_date)} · {accessTypeLabel(profile.access.current_type || "—")}
                </span>
                {profile.surveys.length === 0 && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: "rgba(185,28,28,0.18)", color: "#fca5a5", border: "1px solid rgba(185,28,28,0.35)" }}>
                    No survey on file
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={exportData}
              disabled={!profile}
              className="rounded-lg px-3 py-2 text-xs font-black disabled:opacity-40"
              style={{ backgroundColor: "rgba(201,162,39,0.15)", color: GOLD, border: `1px solid rgba(201,162,39,0.35)` }}
            >
              Export user data
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs font-bold transition-colors hover:bg-white/10"
              style={{ border: `1px solid ${colors.hairline.strong}` }}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b px-6 py-3" style={{ borderColor: colors.hairline.subtle, backgroundColor: "rgba(0,0,0,0.15)" }}>
          {(["overview", "activity", "messages", "survey", "financial", "invites", "referrals", "audit", "moderation"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-lg px-3 py-1.5 text-xs font-black capitalize transition-colors"
              style={{
                backgroundColor: tab === t ? RED : "transparent",
                color: tab === t ? "white" : "rgba(244,241,234,0.65)",
                border: `1px solid ${tab === t ? RED : colors.hairline.subtle}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-6 py-6">
          {loading && (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              <div className="h-48 animate-pulse rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            </div>
          )}

          {error && (
            <div className="rounded-xl p-5" style={{ backgroundColor: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.35)" }}>
              <p className="text-sm text-red-100">{error}</p>
            </div>
          )}

          {!loading && !error && profile && (
            <>
              {tab === "overview" && <OverviewTab profile={profile} />}
              {tab === "activity" && <ActivityTab profile={profile} />}
              {tab === "messages" && <UserMessagesTab profile={profile} />}
              {tab === "survey" && <SurveyTab profile={profile} />}
              {tab === "financial" && <FinancialTab profile={profile} />}
              {tab === "invites" && <InvitesTab profile={profile} />}
              {tab === "referrals" && <ReferralsTab profile={profile} />}
              {tab === "audit" && <AuditTab profile={profile} />}
              {tab === "moderation" && (
                <ModerationTab
                  profile={profile}
                  note={note}
                  setNote={setNote}
                  savingNote={savingNote}
                  onSave={saveNote}
                />
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl p-5" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${colors.hairline.subtle}` }}>
      <h3 className="text-sm font-black uppercase tracking-wide text-white/90">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function KVGrid({ items }: { items: { label: string; value: React.ReactNode; accent?: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(item => (
        <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
          <div className="text-[10px] font-black uppercase tracking-wider text-white/45">{item.label}</div>
          <div className="mt-1 text-sm font-bold" style={{ color: (item.accent as string) || "#f4f1ea" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatBox({ value, label, accent }: { value: string | number; label: string; accent: "red" | "gold" | "green" | "blue" }) {
  const map = {
    red: { text: "#f87171", bg: "rgba(198,61,47,0.10)", border: "rgba(198,61,47,0.30)" },
    gold: { text: GOLD, bg: "rgba(201,162,39,0.10)", border: "rgba(201,162,39,0.25)" },
    green: { text: "#4ade80", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.25)" },
    blue: { text: "#60a5fa", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)" },
  };
  const c = map[accent];
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
      <div className="text-2xl font-black" style={{ color: c.text }}>{value}</div>
      <div className="text-[10px] font-black uppercase tracking-wider text-white/55">{label}</div>
    </div>
  );
}

function OverviewTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Basic info">
        <KVGrid items={[
          { label: "Email", value: profile.email },
          { label: "State", value: profile.state ?? "—" },
          { label: "Handle", value: profile.handle ?? "—" },
          { label: "Join date", value: fmtDate(profile.join_date) },
          { label: "Access type", value: accessTypeLabel(profile.access.current_type || "—") },
          { label: "Payment status", value: profile.subscription
            ? <a href={profile.subscription.dashboard_url} target="_blank" rel="noreferrer" className="underline" style={{ color: GOLD }}>{profile.subscription.status}</a>
            : <StatusBadge status={profile.access.status || "—"} />
          },
          { label: "Next billing", value: profile.subscription?.next_billing_date ? fmtDate(profile.subscription.next_billing_date) : "—" },
          { label: "Free months earned", value: profile.referrals.months_earned },
          { label: "Expires", value: profile.access.expires_at ? fmtDate(profile.access.expires_at) : "Never" },
        ]} />
      </Section>
      <Section title="Engagement snapshot">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatBox value={profile.activity.total_messages.toLocaleString()} label="Messages sent" accent="gold" />
          <StatBox value={profile.activity.active_days.toLocaleString()} label="Active days" accent="red" />
          <StatBox value={profile.activity.rooms.length.toLocaleString()} label="Rooms active" accent="blue" />
          <StatBox value={fmtAgo(profile.activity.last_active)} label="Last active" accent="green" />
        </div>
      </Section>
      <Section title="Recent access history">
        <div className="space-y-2">
          {profile.access.history.slice(0, 5).map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">{accessTypeLabel(a.access_type)}</div>
                <div className="text-xs text-white/50">{fmtDate(a.granted_at)} · {a.expires_at ? `expires ${fmtDate(a.expires_at)}` : "no expiry"}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
          {profile.access.history.length === 0 && <p className="text-sm text-white/50">No access records.</p>}
        </div>
      </Section>
    </>
  );
}

function ActivityTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Activity & engagement">
        <KVGrid items={[
          { label: "Total messages", value: profile.activity.total_messages.toLocaleString() },
          { label: "Last active", value: profile.activity.last_active ? fmtDate(profile.activity.last_active) : "—" },
          { label: "Active days", value: profile.activity.active_days.toLocaleString() },
          { label: "Rooms active", value: profile.activity.rooms.length.toLocaleString() },
        ]} />
      </Section>
      <Section title="Rooms they're active in">
        <div className="space-y-2">
          {profile.activity.rooms.map(room => (
            <div key={room.actor_key} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">{room.name}</div>
                <div className="text-xs text-white/50">{room.role} · {room.state ?? "Unknown state"}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black" style={{ color: GOLD }}>{room.messages}</div>
                <div className="text-[10px] text-white/45">msgs · {fmtAgo(room.last_active)}</div>
              </div>
            </div>
          ))}
          {profile.activity.rooms.length === 0 && <p className="text-sm text-white/50">No room activity yet.</p>}
        </div>
      </Section>
    </>
  );
}

function SurveyTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      {profile.surveys.map(survey => (
        <Section key={survey.id} title={`Survey submission · ${fmtDate(survey.created_at)}`}>
          <KVGrid items={[
            { label: "Name", value: `${survey.first_name || ""} ${survey.last_name || ""}`.trim() || "—" },
            { label: "State / jurisdiction", value: survey.state_of_occurrence ?? "—" },
            { label: "County", value: survey.county ?? "—" },
            { label: "Case year", value: survey.case_year ?? "—" },
          ]} />
          <div className="mt-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-white/55">Court actors reported</h4>
            <div className="mt-2 space-y-2">
              {survey.court_actors.map((actor, i) => (
                <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
                  <div className="text-sm font-bold text-white">{actor.name}</div>
                  <div className="text-xs text-white/50">{actor.role} · {actor.state ?? "Unknown state"}{actor.county ? ` · ${actor.county}` : ""}</div>
                </div>
              ))}
              {survey.court_actors.length === 0 && <p className="text-sm text-white/50">No court actors recorded.</p>}
            </div>
          </div>
        </Section>
      ))}
      {profile.surveys.length === 0 && (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${colors.hairline.subtle}` }}>
          <p className="text-sm text-white/50">No survey submissions found for this email.</p>
        </div>
      )}
    </>
  );
}

function FinancialTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <Section title="Financial history">
      <div className="space-y-2">
        {profile.financial.map(f => (
          <div key={`${f.kind}-${f.id}`} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
            <div>
              <div className="text-sm font-bold text-white">{f.description}</div>
              <div className="text-xs text-white/50">{fmtDate(f.date)} · {f.kind}</div>
            </div>
            <div className="text-right">
              {f.amount_cents != null ? (
                <div className="text-sm font-black" style={{ color: GOLD }}>${(f.amount_cents / 100).toFixed(0)}</div>
              ) : (
                <div className="text-xs text-white/45">No amount</div>
              )}
            </div>
          </div>
        ))}
        {profile.financial.length === 0 && <p className="text-sm text-white/50">No financial records.</p>}
      </div>
    </Section>
  );
}

function InvitesTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Referral summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox value={profile.invites.generated.length.toLocaleString()} label="Links generated" accent="red" />
          <StatBox value={profile.invites.total_uses.toLocaleString()} label="Link uses" accent="gold" />
          <StatBox value={profile.invites.accepted_count.toLocaleString()} label="Paid & rewarded" accent="green" />
        </div>
      </Section>
      <Section title="Rewards earned">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox value={profile.invites.pending.toLocaleString()} label="Pending referrals" accent="gold" />
          <StatBox value={profile.invites.rewarded.toLocaleString()} label="Rewarded referrals" accent="green" />
          <StatBox value={profile.invites.months_earned.toLocaleString()} label="Free months earned" accent="blue" />
        </div>
      </Section>
      <Section title="Invite links">
        <div className="space-y-2">
          {profile.invites.generated.map(link => (
            <div key={link.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white font-mono text-xs">{link.token.slice(0, 16)}…</div>
                <div className="text-xs text-white/50">Created {fmtDate(link.created_at)} · Expires {fmtDate(link.expires_at)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black" style={{ color: GOLD }}>
                  {link.remaining_uses == null ? `${link.used_count} used` : `${link.used_count}/${link.used_count + link.remaining_uses}`}
                </div>
                <div className="text-[10px] text-white/45">{link.remaining_uses == null ? "unlimited" : "used"}</div>
              </div>
            </div>
          ))}
          {profile.invites.generated.length === 0 && <p className="text-sm text-white/50">No invite links generated yet.</p>}
        </div>
      </Section>
    </>
  );
}

function ModerationTab({ profile, note, setNote, savingNote, onSave }: {
  profile: CircleUserProfile;
  note: string;
  setNote: (v: string) => void;
  savingNote: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <Section title="Admin notes">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={5}
          className="w-full rounded-xl bg-white/5 p-3 text-sm text-white outline-none"
          style={{ border: `1px solid ${colors.hairline.subtle}` }}
          placeholder="Private founder-only notes about this member..."
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={savingNote}
            className="rounded-lg px-4 py-2 text-xs font-black disabled:opacity-50"
            style={{ backgroundColor: RED, color: "white" }}
          >
            {savingNote ? "Saving..." : "Save note"}
          </button>
          {profile.moderation.admin_note && <span className="text-xs text-white/50">Last saved note loaded</span>}
        </div>
      </Section>
      <Section title="Removed / deleted messages">
        <div className="space-y-2">
          {profile.moderation.deleted_messages.map(m => (
            <div key={m.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(185,28,28,0.08)", border: "1px solid rgba(185,28,28,0.25)" }}>
              <p className="text-sm text-white/80">{m.body}</p>
              <p className="mt-1 text-xs text-white/45">Deleted {fmtDate(m.deleted_at)} by {m.deleted_by || "system"}</p>
            </div>
          ))}
          {profile.moderation.deleted_messages.length === 0 && <p className="text-sm text-white/50">No deleted messages.</p>}
        </div>
      </Section>
      <Section title="Reports">
        <p className="text-sm text-white/50">No reports recorded for this member.</p>
      </Section>
    </>
  );
}

function ReferralsTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <>
      <Section title="Referral summary">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox value={profile.referrals.made.length.toLocaleString()} label="Referrals made" accent="red" />
          <StatBox value={profile.referrals.received.length.toLocaleString()} label="Referrals received" accent="gold" />
          <StatBox value={profile.referrals.months_earned.toLocaleString()} label="Free months earned" accent="green" />
        </div>
      </Section>
      <Section title="Referrals made">
        <div className="space-y-2">
          {profile.referrals.made.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">{r.other_email}</div>
                <div className="text-xs text-white/50">Created {fmtDate(r.created_at)}</div>
              </div>
              <div className="text-right">
                <StatusBadge status={r.status} />
                {r.rewarded_at && <div className="mt-1 text-[10px] text-white/45">Rewarded {fmtDate(r.rewarded_at)}</div>}
              </div>
            </div>
          ))}
          {profile.referrals.made.length === 0 && <p className="text-sm text-white/50">No referrals made yet.</p>}
        </div>
      </Section>
      <Section title="Referrals received">
        <div className="space-y-2">
          {profile.referrals.received.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
              <div>
                <div className="text-sm font-bold text-white">From {r.other_email}</div>
                <div className="text-xs text-white/50">Created {fmtDate(r.created_at)}</div>
              </div>
              <div className="text-right">
                <StatusBadge status={r.status} />
                {r.completed_at && <div className="mt-1 text-[10px] text-white/45">Completed {fmtDate(r.completed_at)}</div>}
              </div>
            </div>
          ))}
          {profile.referrals.received.length === 0 && <p className="text-sm text-white/50">No referrals received yet.</p>}
        </div>
      </Section>
    </>
  );
}

function UserMessagesTab({ profile }: { profile: CircleUserProfile }) {
  const [roomFilter, setRoomFilter] = useState("");
  const messages = profile.activity.messages;
  const filtered = messages.filter(m => {
    if (!roomFilter.trim()) return true;
    const room = parseActorKeyClient(m.actor_key);
    const text = room ? `${room.name} ${room.state ?? ""} ${room.role}`.toLowerCase() : m.actor_key.toLowerCase();
    return text.includes(roomFilter.toLowerCase());
  });

  return (
    <>
      <Section title="Recent messages">
        <input
          type="text"
          value={roomFilter}
          onChange={e => setRoomFilter(e.target.value)}
          placeholder="Filter by room/actor"
          className="mb-4 w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", border: `1px solid ${colors.hairline.subtle}`, color: "#f4f1ea" }}
        />
        <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="text-sm text-white/50">No messages.</p>}
          {filtered.map(m => {
            const room = parseActorKeyClient(m.actor_key);
            return (
              <div key={m.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-white/50">
                  <span>{room ? `${room.name} · ${room.role}${room.state ? ` · ${room.state}` : ""}` : m.actor_key}</span>
                  <span>{fmtAgo(m.created_at)}</span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap text-white/90">{m.body}</p>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function AuditTab({ profile }: { profile: CircleUserProfile }) {
  return (
    <Section title="Audit log">
      <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
        {profile.audit.length === 0 && <p className="text-sm text-white/50">No audit events.</p>}
        {profile.audit.map(a => (
          <div key={a.id} className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${colors.hairline.subtle}` }}>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-white/50">
              <span className="font-bold text-white/80">{a.event}</span>
              <span>{fmtAgo(a.created_at)}</span>
            </div>
            {a.detail && Object.keys(a.detail).length > 0 && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/30 p-2 text-xs text-white/70">{JSON.stringify(a.detail, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

const GOLD = "#c9a227";

const STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "Canada",
];

const CONNECTIONS = [
  "Advocate",
  "Survivor / impacted parent",
  "Family member",
  "Supporter",
  "Local business owner",
  "Other",
];

const ROLES = ["Referral Partner", "Sales Partner", "Regional Lead", "Not sure yet"];

type Status = "idle" | "submitting" | "success" | "error";

const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-white/30 outline-none focus:border-[#c9a227]/60 focus:bg-white/[0.07] transition-colors";
const labelClass = "block text-[11px] font-bold uppercase tracking-wider text-white/45 mb-1.5";

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  region: string;
  connection: string;
  why: string;
  agreed: boolean;
  businesses_in_mind: string;
  experience: string;
  socials: string;
  role_interest: string;
  heard_from: string;
}

const EMPTY: FormState = {
  full_name: "",
  email: "",
  phone: "",
  region: "",
  connection: "",
  why: "",
  agreed: false,
  businesses_in_mind: "",
  experience: "",
  socials: "",
  role_interest: "Sales Partner",
  heard_from: "",
};

export function PartnerApplyForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  // Honeypot: a hidden field real users never fill.
  const [trap, setTrap] = useState("");
  // Time-trap: instant submits are bots. Recorded on mount.
  const mountedAt = useRef<number>(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.agreed) {
      setErrorMsg("Please accept the integrity agreement to apply.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/partner-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          company: trap, // honeypot
          elapsed_ms: Date.now() - mountedAt.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Network error — please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[#c9a227]/40 bg-[#c9a227]/[0.06] p-8 text-center">
        <div className="text-2xl font-black" style={{ color: GOLD }}>You&apos;re in the queue. 🎉</div>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Watch your email — we review every partner personally and you&apos;ll hear from us within 2–3 days.
          Thank you for stepping up for families.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      {/* Honeypot — visually hidden and skipped by keyboard navigation. */}
      <div className="pointer-events-none absolute -left-[100vw] top-auto h-px w-px overflow-hidden opacity-0">
        <label htmlFor="company">Company (leave blank)</label>
        <input id="company" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      <div className="sm:col-span-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>Required</div>
      </div>

      <div>
        <label className={labelClass} htmlFor="full_name">Full name *</label>
        <input id="full_name" className={inputClass} required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Jane Smith" />
      </div>
      <div>
        <label className={labelClass} htmlFor="email">Email *</label>
        <input id="email" type="email" className={inputClass} required value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@email.com" />
      </div>
      <div>
        <label className={labelClass} htmlFor="phone">Phone *</label>
        <input id="phone" type="tel" className={inputClass} required value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(509) 555-0123" />
      </div>
      <div>
        <label className={labelClass} htmlFor="region">State / region you&apos;ll cover *</label>
        <select id="region" className={inputClass} required value={form.region} onChange={(e) => update("region", e.target.value)}>
          <option value="">Choose…</option>
          {STATES.map((s) => (
            <option key={s} value={s} className="bg-[#0a1526]">{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="connection">Your connection to the cause *</label>
        <select id="connection" className={inputClass} required value={form.connection} onChange={(e) => update("connection", e.target.value)}>
          <option value="">Choose…</option>
          {CONNECTIONS.map((c) => (
            <option key={c} value={c} className="bg-[#0a1526]">{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="role_interest">Which role interests you?</label>
        <select id="role_interest" className={inputClass} value={form.role_interest} onChange={(e) => update("role_interest", e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r} className="bg-[#0a1526]">{r}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="why">Why do you want to do this? *</label>
        <textarea id="why" required className={`${inputClass} min-h-[90px] resize-y`} value={form.why} onChange={(e) => update("why", e.target.value)} placeholder="A sentence or two about why this matters to you." />
      </div>

      <div className="sm:col-span-2 mt-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/40">Optional — helps us warm-start you</div>
      </div>

      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="businesses_in_mind">Businesses you already have in mind</label>
        <textarea id="businesses_in_mind" className={`${inputClass} min-h-[60px] resize-y`} value={form.businesses_in_mind} onChange={(e) => update("businesses_in_mind", e.target.value)} placeholder="Warm leads = a faster first sale." />
      </div>
      <div>
        <label className={labelClass} htmlFor="experience">Any outreach / sales / community experience?</label>
        <input id="experience" className={inputClass} value={form.experience} onChange={(e) => update("experience", e.target.value)} placeholder="None is totally fine." />
      </div>
      <div>
        <label className={labelClass} htmlFor="socials">Social handles / following</label>
        <input id="socials" className={inputClass} value={form.socials} onChange={(e) => update("socials", e.target.value)} placeholder="@yourhandle" />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="heard_from">How did you hear about us?</label>
        <input id="heard_from" className={inputClass} value={form.heard_from} onChange={(e) => update("heard_from", e.target.value)} placeholder="Instagram, a friend, the report…" />
      </div>

      <div className="sm:col-span-2 mt-1">
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-white/70">
          <input
            type="checkbox"
            checked={form.agreed}
            onChange={(e) => update("agreed", e.target.checked)}
            className="mt-1 h-4 w-4 flex-shrink-0 accent-[#c9a227]"
          />
          <span>
            I&apos;ll represent Stand With Meg with integrity — no spam, no pressure, no misrepresentation — and I understand
            every sponsor must be approved for mission fit. <b className="text-white/90">No law firms.</b>
          </span>
        </label>
      </div>

      {status === "error" && (
        <p className="sm:col-span-2 text-sm text-red-400" role="alert" aria-live="assertive">{errorMsg}</p>
      )}

      <div className="sm:col-span-2">
        <button type="submit" disabled={status === "submitting"} className="w-full rounded-xl bg-[#d8332f] px-6 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          {status === "submitting" ? "Sending…" : "Apply to become a partner →"}
        </button>
        <p className="mt-3 text-center text-[11px] text-white/35">
          Free to apply. Stand With Meg reviews every partner personally — we&apos;re building a team families can trust.
        </p>
      </div>
    </form>
  );
}

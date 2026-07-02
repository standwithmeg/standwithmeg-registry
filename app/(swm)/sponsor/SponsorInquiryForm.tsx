"use client";

import { useEffect, useState } from "react";
import { subscribeSponsorPrefill, type SponsorPrefill } from "./sponsor-prefill";

const GOLD = "#c9a227";

const TIERS = [
  "State Exclusive",
  "Community Supporter",
  "National Presenting",
  "National Co-Sponsor",
  "Movement Partner",
  "Founding Reserve",
  "Not sure yet — tell me more",
];

type Status = "idle" | "submitting" | "success" | "error";

const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-white/30 outline-none focus:border-[#c9a227]/60 focus:bg-white/[0.07] transition-colors";
const labelClass = "block text-[11px] font-bold uppercase tracking-wider text-white/45 mb-1.5";

interface FormState {
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  state: string;
  tier: string;
  message: string;
}

const EMPTY: FormState = {
  business_name: "",
  contact_name: "",
  email: "",
  phone: "",
  website: "",
  state: "",
  tier: "",
  message: "",
};

/** Live "here's how you'll look" sponsor card. */
function LivePreview({ form, stateName }: { form: FormState; stateName: string }) {
  const tagState = (form.state || "").toUpperCase() || "YOUR STATE";
  const label = stateName || form.state || "your state";
  return (
    <div>
      <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>
        Here&apos;s how your business will appear on the {label} report →
      </div>
      <div
        className="mt-3 rounded-xl p-5 text-[#15202b]"
        style={{ background: "linear-gradient(180deg,#ffffff,#f4f6f9)", boxShadow: "0 16px 36px -16px rgba(0,0,0,0.55)" }}
      >
        <span
          className="float-right rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider"
          style={{ color: "#8a6d10", background: "rgba(201,162,39,0.16)", border: "1px solid rgba(201,162,39,0.4)" }}
        >
          Sponsor · {tagState}
        </span>
        <div className="mb-3 flex h-12 w-28 items-center justify-center rounded-md border border-dashed border-gray-300 text-center text-[9px] leading-tight text-gray-400">
          Your logo here
        </div>
        <div className="text-base font-black">{form.business_name || "Your Business Name"}</div>
        <div className="mt-0.5 text-[12px] italic text-[#5b6675]">
          {form.message || "Your tagline or one-liner here"}
        </div>
        <div className="my-3 h-px bg-[#e6e9ee]" />
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-extrabold">{form.phone || "(000) 000-0000"}</div>
          <span className="rounded-lg bg-[#1f93c7] px-3.5 py-2 text-xs font-extrabold text-white">
            {form.website ? form.website.replace(/^https?:\/\//, "") : "yourbusiness.com"}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-white/35">We&apos;ll add your real logo after you apply.</p>
    </div>
  );
}

export function SponsorInquiryForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [banner, setBanner] = useState<{ tier: string; stateName: string; price: string } | null>(null);

  useEffect(() => {
    return subscribeSponsorPrefill((p: SponsorPrefill) => {
      setForm((prev) => ({ ...prev, tier: p.tier, state: p.stateAbbr || prev.state }));
      setBanner({ tier: p.tier, stateName: p.stateName, price: p.price });
    });
  }, []);

  function update<K extends keyof FormState>(field: K, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    const message = [form.message, form.website ? `Website: ${form.website}` : ""].filter(Boolean).join("\n");
    try {
      const res = await fetch("/api/sponsor-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, message }),
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
        <div className="text-2xl font-black" style={{ color: GOLD }}>Thank you! 🎉</div>
        <p className="mt-3 text-sm text-white/70 leading-relaxed">
          Your sponsorship request is in. We&apos;ll reach out within a couple of business days. Want it faster?
          Email <span style={{ color: GOLD }}>sponsors@standwithmeg.com</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[1fr_300px]">
      <div>
        {banner && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "rgba(201,162,39,0.4)", background: "rgba(201,162,39,0.08)" }}>
            <div className="text-[13px]">
              <span className="text-white/55">You&apos;re sponsoring: </span>
              <b style={{ color: GOLD }}>
                {banner.tier}
                {banner.stateName ? ` · ${banner.stateName}` : ""} · {banner.price}
              </b>
            </div>
            <button type="button" onClick={() => setBanner(null)} className="whitespace-nowrap text-[12px] font-bold underline" style={{ color: GOLD }}>
              change →
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="business_name">Business name *</label>
            <input id="business_name" className={inputClass} required value={form.business_name} onChange={(e) => update("business_name", e.target.value)} placeholder="Uprise Remodeling" />
          </div>
          <div>
            <label className={labelClass} htmlFor="contact_name">Your name</label>
            <input id="contact_name" className={inputClass} value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">Email *</label>
            <input id="email" type="email" className={inputClass} required value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@business.com" />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">Phone</label>
            <input id="phone" className={inputClass} value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(509) 555-0123" />
          </div>
          <div>
            <label className={labelClass} htmlFor="website">Website</label>
            <input id="website" className={inputClass} value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="yourbusiness.com" />
          </div>
          <div>
            <label className={labelClass} htmlFor="state">State you serve</label>
            <input id="state" className={inputClass} value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="WA" maxLength={6} />
          </div>
          <div>
            <label className={labelClass} htmlFor="tier">Tier you&apos;re interested in</label>
            <select id="tier" className={inputClass} value={form.tier} onChange={(e) => update("tier", e.target.value)}>
              <option value="">Choose a tier…</option>
              {TIERS.map((t) => (
                <option key={t} value={t} className="bg-[#0a1526]">{t}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="message">Anything else? (becomes your tagline)</label>
            <textarea id="message" className={`${inputClass} min-h-[80px] resize-y`} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Protecting your home, one gutter at a time." />
          </div>

          {status === "error" && <p className="sm:col-span-2 text-sm text-red-400">{errorMsg}</p>}

          <div className="sm:col-span-2">
            <button type="submit" disabled={status === "submitting"} className="w-full rounded-xl bg-[#d8332f] px-6 py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {status === "submitting" ? "Sending…" : "Become a sponsor →"}
            </button>
            <p className="mt-3 text-center text-[11px] text-white/35">
              Sponsors are local businesses supporting public-interest reporting. Not affiliated with any case or family. Stand With Meg remains editorially independent.
            </p>
          </div>
        </form>
      </div>

      {/* Live preview */}
      <div className="lg:pt-1">
        <LivePreview form={form} stateName={banner?.stateName ?? ""} />
      </div>
    </div>
  );
}

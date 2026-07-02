"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { colors, shadows } from "../../../lib/design-tokens";

const GOLD = colors.gold.DEFAULT;
const RED = colors.evidence.DEFAULT;
const INK = colors.ink.DEFAULT;
const PAPER = colors.paper.DEFAULT;

const SOCIAL_PROOF = [
  { stat: "3,000+", label: "family stories documented" },
  { stat: "50", label: "states with submissions" },
  { stat: "24/7", label: "private circle access" },
];

const TESTIMONIALS = [
  {
    quote: "For the first time, I didn't feel alone. The report gave my experience a number and a name.",
    name: "A parent in Texas",
  },
  {
    quote: "I connected with two other families who had the same judge. We finally had proof it wasn't just us.",
    name: "A parent in Ohio",
  },
];

const URGENCY_OPTIONS = [
  { value: "", label: "Select one (optional)" },
  { value: "active_case", label: "I have an active case" },
  { value: "recently_closed", label: "My case recently closed" },
  { value: "years_ago", label: "My case ended years ago" },
  { value: "advocate", label: "I'm an advocate or professional" },
];

export default function SignupPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    state: "",
    county: "",
    city: "",
    urgency: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function updateField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!form.firstName.trim() || !form.email.trim() || !form.password) {
      setError("First name, email, and password are required.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the terms to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          plan: "basic",
          caseTypes: [],
        }),
      });
      const data = await res.json().catch(() => ({ error: "Signup failed." }));
      if (!res.ok) {
        setError(data.error || "Could not create your account.");
      } else {
        setSuccess(true);
        window.location.href = "/report?welcome=1";
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: INK, color: PAPER }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          {/* Left: value prop */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-xs font-black uppercase tracking-[0.28em]" style={{ color: RED }}>
              Join the movement
            </p>
            <h1 className="mt-4 text-4xl md:text-5xl font-black leading-tight">
              Turn your story into public evidence.
            </h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "rgba(244,241,234,0.65)" }}>
              Create a free Stand With Meg account to track your report, access Connection Circles,
              and stay anonymous until you choose not to be.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {SOCIAL_PROOF.map(item => (
                <div
                  key={item.label}
                  className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: colors.surface.raised, border: `1px solid ${colors.hairline.DEFAULT}` }}
                >
                  <div className="text-2xl font-black" style={{ color: RED }}>{item.stat}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "rgba(244,241,234,0.5)" }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 space-y-4">
              {TESTIMONIALS.map((t, i) => (
                <div
                  key={i}
                  className="rounded-xl p-5"
                  style={{ backgroundColor: "rgba(198,61,47,0.08)", border: `1px solid rgba(198,61,47,0.25)` }}
                >
                  <p className="text-sm italic leading-relaxed" style={{ color: "rgba(244,241,234,0.8)" }}>
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <p className="mt-2 text-xs font-bold" style={{ color: RED }}>— {t.name}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl p-6 md:p-8 space-y-5"
              style={{
                backgroundColor: colors.surface.DEFAULT,
                border: `1px solid ${colors.hairline.DEFAULT}`,
                boxShadow: shadows.xl,
              }}
            >
              <h2 className="text-2xl font-black text-white">Create your account</h2>
              <p className="text-sm" style={{ color: "rgba(244,241,234,0.55)" }}>
                Already have one?{" "}
                <Link href="/login" className="font-bold hover:underline" style={{ color: RED }}>
                  Sign in
                </Link>
              </p>

              {error && (
                <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ backgroundColor: "rgba(185,28,28,0.2)", border: "1px solid rgba(185,28,28,0.5)", color: "#fca5a5" }}>
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ backgroundColor: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", color: "#86efac" }}>
                  Account created. Redirecting you...
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                    First name <span style={{ color: RED }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={e => updateField("firstName", e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                    Last name
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={e => updateField("lastName", e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                  Email <span style={{ color: RED }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => updateField("email", e.target.value)}
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                  Password <span style={{ color: RED }}>*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={e => updateField("password", e.target.value)}
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                  placeholder="At least 8 characters"
                />
                <p className="mt-1 text-xs" style={{ color: "rgba(244,241,234,0.4)" }}>
                  Must be at least 8 characters.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={e => updateField("state", e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    placeholder="TX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>County</label>
                  <input
                    type="text"
                    value={form.county}
                    onChange={e => updateField("county", e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    placeholder="Harris County"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => updateField("city", e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                    placeholder="Houston"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(244,241,234,0.8)" }}>
                  Where are you in your case?
                </label>
                <select
                  value={form.urgency}
                  onChange={e => updateField("urgency", e.target.value)}
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none transition-all appearance-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  {URGENCY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value} className="bg-[#0F1E30]">{o.label}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-xs leading-relaxed" style={{ color: "rgba(244,241,234,0.55)" }}>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="underline" style={{ color: GOLD }}>Terms</Link>
                  {" "}and{" "}
                  <Link href="/privacy" target="_blank" className="underline" style={{ color: GOLD }}>Privacy Policy</Link>.
                  I understand Connection Circles require a verified survey submission.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3.5 font-black text-sm tracking-wide transition-opacity disabled:opacity-50"
                style={{ backgroundColor: RED, color: "white" }}
              >
                {loading ? "Creating account..." : "Create free account →"}
              </button>

              <p className="text-center text-xs" style={{ color: "rgba(244,241,234,0.4)" }}>
                No spam. No selling your data. Unsubscribe anytime.
              </p>
            </form>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

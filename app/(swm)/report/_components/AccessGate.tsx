"use client";

import { useState } from "react";
import { US_JURISDICTIONS } from "../../../../lib/us-jurisdictions";

const GOLD = "#C9A227";

const US_STATES = [
  ["", "Select your state…"],
  ["all", "National / All States"],
  ...US_JURISDICTIONS,
];

const ROLES = [
  ["", "Select your role…"],
  ["impacted_parent", "Impacted Parent"],
  ["family_member", "Family Member"],
  ["advocate", "Advocate"],
  ["journalist", "Journalist"],
  ["legislator", "Legislator"],
  ["researcher", "Researcher"],
  ["public", "General Public"],
];

type Props = { onComplete: (data: { email: string; state_of_interest: string; first_name: string; last_name: string; organization?: string }) => void };

export function AccessGate({ onComplete }: Props) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organization, setOrganization] = useState("");
  const [state, setState] = useState("");
  const [role, setRole] = useState("");
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !firstName.trim() || !lastName.trim() || !role || !agreed) {
      setError("Please complete your name, email, role, and accept the terms.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          first_name: firstName,
          last_name: lastName,
          organization: organization || null,
          state_of_interest: state || null,
          role,
          reason: reason || null,
          agreed_terms: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        return;
      }
      onComplete({ email, state_of_interest: state, first_name: firstName, last_name: lastName, organization: organization || undefined });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
  };

  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: "#0F1E30" }}>
      {/* Background texture */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "url('/swm/swm-banner.png')",
        backgroundSize: "cover", backgroundPosition: "center", opacity: 0.06, zIndex: 0,
      }} />

      {/* Gold top bar */}
      <div className="relative z-10 h-1" style={{ backgroundColor: GOLD }} />

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-700 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-white font-black text-xl tracking-wide">STAND WITH MEG</div>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white leading-tight mb-3">
              Movement Dashboard
            </h1>
            <p className="text-sm max-w-md mx-auto" style={{ color: "rgba(245,245,245,0.55)" }}>
              Real data from real families documenting what is happening inside family court
              and child welfare systems across the country.
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(201,162,39,0.3)" }} />
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: GOLD }} />
            <div className="flex-1 h-px" style={{ backgroundColor: "rgba(201,162,39,0.3)" }} />
          </div>

          {/* Gate form */}
          <form onSubmit={handleSubmit} className="rounded-2xl p-8 space-y-5"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(201,162,39,0.3)", backdropFilter: "blur(4px)" }}>

            <p className="text-xs text-center" style={{ color: "rgba(245,245,245,0.45)" }}>
              To protect the families who shared their stories, we ask visitors to identify themselves
              before accessing the dashboard.
            </p>

            <div className="rounded-xl p-4"
              style={{ backgroundColor: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.35)" }}>
              <p className="text-sm font-black text-white mb-1">Have your own family court or child welfare story?</p>
              <p className="text-xs mb-3" style={{ color: "rgba(245,245,245,0.55)" }}>
                Add your experience first so your state count and future reports reflect what happened to your family.
              </p>
              <a href="/survey"
                className="block w-full text-center py-3 rounded-lg font-bold text-sm text-white transition-colors bg-red-700 hover:bg-red-600">
                Share Your Story →
              </a>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
              <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: "rgba(245,245,245,0.35)" }}>
                or continue to data
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                  First Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required
                  placeholder="First name"
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none"
                  style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required
                  placeholder="Last name"
                  className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none"
                  style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                Organization / Outlet <span className="text-xs font-normal" style={{ color: "rgba(245,245,245,0.4)" }}>(optional)</span>
              </label>
              <input type="text" value={organization} onChange={e => setOrganization(e.target.value)}
                placeholder="News outlet, organization, or group"
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none"
                style={inputStyle} />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                Email Address <span className="text-red-400">*</span>
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="your@email.com"
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none"
                style={inputStyle} />
            </div>

            {/* State */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                State of Interest
              </label>
              <select value={state} onChange={e => setState(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none appearance-none"
                style={inputStyle}>
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code} style={{ backgroundColor: "#1E3A5F" }}>{name}</option>
                ))}
              </select>
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                Your Role <span className="text-red-400">*</span>
              </label>
              <select value={role} onChange={e => setRole(e.target.value)} required
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none appearance-none"
                style={inputStyle}>
                {ROLES.map(([val, label]) => (
                  <option key={val} value={val} style={{ backgroundColor: "#1E3A5F" }}>{label}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "rgba(245,245,245,0.8)" }}>
                Reason for Access <span className="text-xs font-normal" style={{ color: "rgba(245,245,245,0.4)" }}>(optional)</span>
              </label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="What brings you here today?"
                className="w-full rounded-lg px-4 py-3 text-white text-sm focus:outline-none resize-none"
                style={inputStyle} />
            </div>

            {/* Terms checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded" />
              <span className="text-xs leading-relaxed" style={{ color: "rgba(245,245,245,0.6)" }}>
                I agree not to copy, resell, misrepresent, scrape, or repackage Stand With Meg data
                or reports as my own. I understand this data belongs to the families who shared it
                and to Stand With Meg. <span className="text-red-400">*</span>
              </span>
            </label>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm font-medium text-red-300"
                style={{ backgroundColor: "rgba(185,28,28,0.25)", border: "1px solid rgba(185,28,28,0.5)" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-lg font-bold text-sm tracking-wide transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#B91C1C", color: "white" }}>
              {loading ? "Verifying…" : "Access the Dashboard →"}
            </button>
          </form>

          {/* Attribution */}
          <p className="text-center text-xs mt-6 px-4 leading-relaxed" style={{ color: "rgba(245,245,245,0.25)" }}>
            Stand With Meg data and reports are compiled from submitted family experiences
            and are provided for advocacy, education, and reform purposes.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center px-6 py-5 text-xs border-t"
        style={{ color: "rgba(245,245,245,0.2)", borderColor: "rgba(255,255,255,0.06)" }}>
        Stand With Meg &nbsp;·&nbsp; Courage to Stand, Power to Change &nbsp;·&nbsp; standwithmeg.com
      </footer>
    </div>
  );
}

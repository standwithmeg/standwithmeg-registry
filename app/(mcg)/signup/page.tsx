"use client";

import { useState } from "react";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming"
];

const CASE_TYPES = [
  { id: "family_court", label: "Family Court / Custody", icon: "👨‍👩‍👧", desc: "Custody, visitation, parenting time" },
  { id: "dcf_cps", label: "DCF / CPS / Child Welfare", icon: "🏛️", desc: "Agency involvement, removal, reunification" },
  { id: "divorce", label: "Divorce / Separation", icon: "📋", desc: "Property division, alimony, settlement" },
  { id: "child_support", label: "Child Support", icon: "💰", desc: "Establishing, modifying, enforcing support" },
  { id: "protective_order", label: "Protective Order / DV", icon: "🛡️", desc: "Restraining orders, safety planning" },
  { id: "termination", label: "Termination of Parental Rights", icon: "⚠️", desc: "Fighting TPR or voluntarily relinquishing" },
  { id: "adoption", label: "Adoption / Guardianship", icon: "❤️", desc: "Stepparent adoption, kinship, guardianship" },
  { id: "civil", label: "Civil Case", icon: "⚖️", desc: "Lawsuits, contracts, personal injury" },
  { id: "bankruptcy", label: "Bankruptcy", icon: "📁", desc: "Chapter 7, Chapter 13, debt relief" },
  { id: "housing", label: "Housing / Eviction", icon: "🏠", desc: "Eviction defense, tenant rights, habitability" },
  { id: "criminal", label: "Criminal Defense", icon: "🔒", desc: "Misdemeanor or felony charges" },
  { id: "school", label: "School / Education Rights", icon: "🎓", desc: "IEP, special ed, school discipline" },
];

const OPPOSING_PARTIES = [
  { id: "ex_spouse", label: "Ex-Spouse / Co-Parent" },
  { id: "dcf_agency", label: "DCF / CPS Agency" },
  { id: "gal", label: "GAL / Guardian ad Litem" },
  { id: "attorney", label: "Attorney (they have one, I don't)" },
  { id: "landlord", label: "Landlord" },
  { id: "employer", label: "Employer" },
  { id: "creditor", label: "Creditor / Debt Collector" },
  { id: "government", label: "Government Agency" },
  { id: "other", label: "Other / Not Sure" },
];

const URGENCY_LEVELS = [
  { id: "immediate", label: "🚨 I have a hearing within 30 days" },
  { id: "soon", label: "⏰ I have a case in progress" },
  { id: "preparing", label: "📚 I'm preparing / just getting started" },
  { id: "research", label: "🔍 I'm researching my rights" },
];

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [formData, setFormData] = useState({
    // Account
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    // Location
    state: "",
    county: "",
    city: "",
    // Case Info
    caseTypes: [] as string[],
    opposingParties: [] as string[],
    caseNumber: "",
    courtName: "",
    judgeName: "",
    urgency: "",
    // Children (if family court)
    hasChildren: false,
    numberOfChildren: "",
    childrenAges: "",
    // Additional
    hasAttorney: "",
    howHeard: "",
    plan: "fighter",
  });

  const update = (field: string, value: string | string[] | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field: string, value: string) => {
    setFormData(prev => {
      const arr = prev[field as keyof typeof prev] as string[];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter(i => i !== value) : [...arr, value]
      };
    });
  };

  const isFamilyCase = formData.caseTypes.some(t =>
    ["family_court", "dcf_cps", "divorce", "child_support", "termination"].includes(t)
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-blue-900 text-white px-6 py-6">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <span className="text-xl font-bold">My Court Guide</span>
          <span className="text-blue-300 text-sm">Already have an account? <a href="/login" className="text-white underline">Log in</a></span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            {[1,2,3,4].map(s => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  step > s ? "bg-green-500 text-white" :
                  step === s ? "bg-blue-700 text-white" :
                  "bg-gray-200 text-gray-700"
                }`}>
                  {step > s ? "✓" : s}
                </div>
                <span className={`text-xs hidden sm:block ${step === s ? "text-blue-700 font-medium" : "text-gray-600"}`}>
                  {s === 1 ? "Account" : s === 2 ? "Location" : s === 3 ? "Your Case" : "Plan"}
                </span>
                {s < 4 && <div className={`flex-1 h-1 rounded ${step > s ? "bg-green-400" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* STEP 1: Account */}
        {step === 1 && (
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">Create Your Account</h1>
            <p className="text-gray-600 mb-8">Your information is encrypted and never shared.</p>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={e => update("firstName", e.target.value)}
                    placeholder="First name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={e => update("lastName", e.target.value)}
                    placeholder="Last name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => update("email", e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => update("password", e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-600 mt-1">Minimum 8 characters</p>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!formData.firstName || !formData.email || !formData.password}
                className="w-full bg-blue-700 text-white py-3 rounded-lg font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Location */}
        {step === 2 && (
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">Where Is Your Case?</h1>
            <p className="text-gray-600 mb-8">
              This lets us pull the right laws, statutes, court rules, and agency names for your exact location.
              A family court case in Texas has completely different rules than one in California.
            </p>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 space-y-6">

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">State <span className="text-red-500">*</span></label>
                <select
                  value={formData.state}
                  onChange={e => update("state", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select your state...</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <p className="text-xs text-gray-600 mt-1">This determines which state laws and agencies apply to your case.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">County <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.county}
                  onChange={e => update("county", e.target.value)}
                  placeholder="e.g. Johnson County, Los Angeles County"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-600 mt-1">County courts have local rules that can differ significantly from state rules.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">City / Town</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={e => update("city", e.target.value)}
                  placeholder="City where your court is located"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Court Name <span className="text-gray-600">(optional but helpful)</span></label>
                <input
                  type="text"
                  value={formData.courtName}
                  onChange={e => update("courtName", e.target.value)}
                  placeholder="e.g. Johnson County District Court, 18th Judicial Circuit"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Judge&apos;s Name <span className="text-gray-600">(optional)</span></label>
                <input
                  type="text"
                  value={formData.judgeName}
                  onChange={e => update("judgeName", e.target.value)}
                  placeholder="The judge assigned to your case"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-600 mt-1">Knowing your judge helps us pull relevant rulings from CourtListener.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Case Number <span className="text-gray-600">(optional)</span></label>
                <input
                  type="text"
                  value={formData.caseNumber}
                  onChange={e => update("caseNumber", e.target.value)}
                  placeholder="e.g. 2024-CV-001234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 border-2 border-gray-400 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-100">
                  ← Back
                </button>
                <button
                  onClick={() => { if (formData.state && formData.county) setStep(3); }}
                  disabled={!formData.state || !formData.county}
                  className="flex-1 bg-blue-700 text-white py-3 rounded-lg font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Case Info */}
        {step === 3 && (
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">Tell Me About Your Case</h1>
            <p className="text-gray-600 mb-8">
              The more you tell us, the more targeted your AI assistant, templates, and case law will be.
              Everything stays private in your vault.
            </p>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 space-y-8">

              {/* Case Types */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">
                  What type of case are you dealing with? <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-400 mb-4">Select all that apply — many cases overlap.</p>
                <div className="grid grid-cols-2 gap-3">
                  {CASE_TYPES.map(ct => (
                    <button
                      key={ct.id}
                      onClick={() => toggleArrayItem("caseTypes", ct.id)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        formData.caseTypes.includes(ct.id)
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-blue-200"
                      }`}
                    >
                      <div className="text-lg">{ct.icon}</div>
                      <div className="font-medium text-gray-900 text-xs mt-1">{ct.label}</div>
                      <div className="text-gray-600 text-xs">{ct.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Children */}
              {isFamilyCase && (
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                  <label className="block text-sm font-bold text-gray-800 mb-4">Children involved in your case</label>
                  <div className="flex gap-4 mb-4">
                    <button
                      onClick={() => update("hasChildren", true)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium ${formData.hasChildren ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-600"}`}
                    >
                      Yes, children are involved
                    </button>
                    <button
                      onClick={() => update("hasChildren", false)}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium ${!formData.hasChildren ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-600"}`}
                    >
                      No children involved
                    </button>
                  </div>
                  {formData.hasChildren && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-800 font-medium mb-1">Number of children</label>
                        <input
                          type="number"
                          value={formData.numberOfChildren}
                          onChange={e => update("numberOfChildren", e.target.value)}
                          placeholder="e.g. 2"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-800 font-medium mb-1">Ages of children</label>
                        <input
                          type="text"
                          value={formData.childrenAges}
                          onChange={e => update("childrenAges", e.target.value)}
                          placeholder="e.g. 4, 7, 12"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Opposing Parties */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Who are you up against?</label>
                <p className="text-xs text-gray-400 mb-4">Select all that apply.</p>
                <div className="grid grid-cols-2 gap-2">
                  {OPPOSING_PARTIES.map(op => (
                    <button
                      key={op.id}
                      onClick={() => toggleArrayItem("opposingParties", op.id)}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        formData.opposingParties.includes(op.id)
                          ? "border-red-400 bg-red-50 text-red-800"
                          : "border-gray-300 text-gray-800 bg-white hover:border-gray-400"
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Do they have an attorney */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-3">Do you have an attorney?</label>
                <div className="flex gap-3">
                  {[
                    { id: "no", label: "No — I'm fully pro se" },
                    { id: "limited", label: "Limited scope / consulting only" },
                    { id: "yes", label: "Yes, but I want to understand everything" },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => update("hasAttorney", opt.id)}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all ${
                        formData.hasAttorney === opt.id
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-gray-300 text-gray-800 bg-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-3">How urgent is your situation?</label>
                <div className="space-y-2">
                  {URGENCY_LEVELS.map(u => (
                    <button
                      key={u.id}
                      onClick={() => update("urgency", u.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-all ${
                        formData.urgency === u.id
                          ? "border-blue-600 bg-blue-50 text-blue-800 font-medium"
                          : "border-gray-300 text-gray-800 bg-white"
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 border-2 border-gray-400 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-100">
                  ← Back
                </button>
                <button
                  onClick={() => { if (formData.caseTypes.length > 0) setStep(4); }}
                  disabled={formData.caseTypes.length === 0}
                  className="flex-1 bg-blue-700 text-white py-3 rounded-lg font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Plan Selection */}
        {step === 4 && (
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">Choose Your Plan</h1>
            <p className="text-gray-600 mb-8">
              You can change or cancel anytime. Most people start with Fighter.
            </p>

            <div className="space-y-4 mb-8">
              {[
                {
                  id: "basic",
                  name: "Basic",
                  price: "$19/mo",
                  desc: "Just getting started",
                  features: ["1 Case Vault", "50 AI questions/month", "5 state-adapted templates", "1GB document storage", "How-to guides"]
                },
                {
                  id: "fighter",
                  name: "Fighter",
                  price: "$49/mo",
                  desc: "Active case — most popular",
                  popular: true,
                  features: ["3 Case Vaults", "Unlimited AI Q&A", "All templates (all 50 states)", "Exhibit Builder", "CourtListener case search", "10GB storage", "Law change alerts"]
                },
                {
                  id: "advocate",
                  name: "Advocate",
                  price: "$99/mo",
                  desc: "Complex or multiple cases",
                  features: ["Unlimited vaults", "Unlimited AI + document analysis", "All templates + custom drafting", "Full Exhibit Builder", "50GB storage", "Weekly law alerts", "Priority AI response"]
                }
              ].map(plan => (
                <button
                  key={plan.id}
                  onClick={() => update("plan", plan.id)}
                  className={`w-full text-left p-6 rounded-2xl border-2 transition-all ${
                    formData.plan === plan.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-lg">{plan.name}</span>
                        {plan.popular && <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">MOST POPULAR</span>}
                      </div>
                      <span className="text-gray-500 text-sm">{plan.desc}</span>
                    </div>
                    <span className="font-bold text-blue-900 text-xl">{plan.price}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {plan.features.map((f, i) => (
                      <span key={i} className="text-xs text-gray-800">✅ {f}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-blue-50 rounded-xl p-6 border border-blue-200 mb-6">
              <h3 className="font-bold text-blue-900 mb-3">Your Setup Summary</h3>
              <div className="text-sm text-gray-900 space-y-1">
                <p>📍 <strong>Location:</strong> {formData.county}, {formData.state}</p>
                {formData.courtName && <p>🏛️ <strong>Court:</strong> {formData.courtName}</p>}
                <p>⚖️ <strong>Case types:</strong> {formData.caseTypes.map(t => CASE_TYPES.find(c => c.id === t)?.label).join(", ")}</p>
                {formData.urgency && <p>⏰ <strong>Urgency:</strong> {URGENCY_LEVELS.find(u => u.id === formData.urgency)?.label}</p>}
              </div>
              <p className="text-xs text-blue-700 mt-3">We&apos;ll use this to load your state&apos;s specific laws, agencies, templates, and relevant case law from day one.</p>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {submitError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 border-2 border-gray-400 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-100">
                ← Back
              </button>
              <button
                onClick={async () => {
                  setSubmitting(true);
                  setSubmitError("");
                  try {
                    const res = await fetch("/api/signup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email: formData.email,
                        password: formData.password,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        state: formData.state,
                        county: formData.county,
                        city: formData.city,
                        caseTypes: formData.caseTypes,
                        urgency: formData.urgency,
                        plan: formData.plan,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setSubmitError(data.error || "Signup failed. Please try again.");
                    } else {
                      if (data.session?.access_token) {
                        localStorage.setItem("sb_access_token", data.session.access_token);
                      }
                      window.location.href = "/dashboard";
                    }
                  } catch {
                    setSubmitError("Something went wrong. Please try again.");
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="flex-1 bg-blue-700 text-white py-3 rounded-lg font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating account..." : "Create My Account →"}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4">
              By creating an account you agree to our Terms of Service and Privacy Policy.<br />
              This platform provides legal information, not legal advice.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

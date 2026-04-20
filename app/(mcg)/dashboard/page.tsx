"use client";

import { useState, useEffect } from "react";

type UserProfile = {
  firstName: string;
  lastName: string;
  state: string;
  county: string;
  caseTypes: string[];
  urgency: string;
  plan: string;
  email: string;
};

const QUICK_ACTIONS = [
  { icon: "🤖", label: "Ask the AI", desc: "Get a legal answer right now", href: "/ai-assistant", color: "bg-blue-600" },
  { icon: "🎤", label: "Court Coach", desc: "What do I say in court?", href: "/court-coach", color: "bg-purple-600" },
  { icon: "📄", label: "Get a Template", desc: "State-adapted legal documents", href: "/templates", color: "bg-green-600" },
  { icon: "📁", label: "Build Exhibit Packet", desc: "Compile your hearing docs", href: "/exhibits", color: "bg-orange-600" },
];

const MOCK_ALERTS = [
  { type: "law", icon: "⚖️", title: "New Kansas ruling on GAL reports", desc: "A Johnson County court recently ruled on GAL report admissibility in custody cases.", date: "2 days ago", urgent: false },
  { type: "deadline", icon: "🚨", title: "Response deadline approaching", desc: "You have a pending motion response due. Check your vault for details.", date: "Today", urgent: true },
  { type: "update", icon: "📋", title: "Federal Register: CAPTA updated", desc: "New regulations affecting child welfare records access were published.", date: "1 week ago", urgent: false },
];

const VAULT_TYPE_META: Record<string, { icon: string; color: string }> = {
  family_court: { icon: "👨‍👩‍👧", color: "bg-blue-100 border-blue-300" },
  dcf_cps: { icon: "🏛️", color: "bg-red-100 border-red-300" },
  divorce: { icon: "📋", color: "bg-purple-100 border-purple-300" },
  child_support: { icon: "💰", color: "bg-green-100 border-green-300" },
  civil: { icon: "⚖️", color: "bg-yellow-100 border-yellow-300" },
  bankruptcy: { icon: "📁", color: "bg-gray-100 border-gray-300" },
  housing: { icon: "🏠", color: "bg-orange-100 border-orange-300" },
  criminal: { icon: "🔒", color: "bg-pink-100 border-pink-300" },
  school: { icon: "🎓", color: "bg-teal-100 border-teal-300" },
  custom: { icon: "📂", color: "bg-indigo-100 border-indigo-300" },
};

const LANDMARK_CASES = [
  { name: "Troxel v. Granville", citation: "530 U.S. 57 (2000)", relevance: "Your parental rights are constitutionally protected." },
  { name: "Santosky v. Kramer", citation: "455 U.S. 745 (1982)", relevance: "The State needs clear & convincing evidence before removing your child." },
  { name: "Stanley v. Illinois", citation: "405 U.S. 645 (1972)", relevance: "Due process required before any parental rights can be terminated." },
];

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic Plan",
  fighter: "Fighter Plan",
  advocate: "Advocate Plan",
};

function daysAgoLabel(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

const PLAN_DESCS: Record<string, string> = {
  basic: "50 AI questions/month",
  fighter: "Unlimited AI · All Templates",
  advocate: "Unlimited everything · Priority AI",
};

export default function Dashboard() {
  const [quickQuestion, setQuickQuestion] = useState("");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [vaults, setVaults] = useState<{ id: string; name: string; type: string; updated_at: string }[]>([]);

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(data => { if (!data.error) setUser(data); })
      .catch(() => {})
      .finally(() => setUserLoading(false));

    fetch("/api/vaults")
      .then(r => r.json())
      .then(data => { if (!data.error) setVaults(data.vaults); })
      .catch(() => {});
  }, []);

  const handleQuickAsk = (question: string) => {
    const q = question || quickQuestion;
    if (!q.trim()) return;
    window.location.href = `/ai-assistant?q=${encodeURIComponent(q.trim())}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-blue-800">
          <div className="text-xl font-bold">My Court Guide</div>
          <div className="text-blue-300 text-xs mt-1">Pro Se Legal Platform</div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { icon: "🏠", label: "Dashboard", href: "/dashboard" },
            { icon: "🗂️", label: "My Vaults", href: "/vaults" },
            { icon: "🤖", label: "AI Workspace", href: "/workspace" },
            { icon: "🎤", label: "Court Coach", href: "/court-coach" },
            { icon: "📄", label: "Templates", href: "/templates" },
            { icon: "📁", label: "Exhibit Builder", href: "/exhibits" },
            { icon: "⚖️", label: "Case Law Search", href: "/case-law" },
            { icon: "📚", label: "How-To Guides", href: "/guides" },
            { icon: "🔔", label: "Law Alerts", href: "/alerts" },
          ].map(item => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                item.href === "/dashboard"
                  ? "bg-blue-700 text-white"
                  : "text-blue-200 hover:bg-blue-800 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="p-4 border-t border-blue-800">
          <div className="bg-blue-800 rounded-lg p-3 mb-3">
            <div className="text-xs text-blue-300 mb-1">Your Plan</div>
            <div className="font-bold text-sm">{PLAN_LABELS[user?.plan || "basic"] || "Basic Plan"}</div>
            <div className="text-blue-300 text-xs">{PLAN_DESCS[user?.plan || "basic"] || ""}</div>
          </div>
          <a href="/settings" className="flex items-center gap-2 text-blue-300 hover:text-white text-sm">
            <span>⚙️</span> Settings
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 flex-1 p-8">

        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">
              {userLoading ? "Loading..." : `Good morning, ${user?.firstName || "there"}. 👋`}
            </h1>
            <p className="text-gray-600 mt-1">
              {user?.county && user?.state ? `${user.county}, ${user.state}` : "Set up your case profile →"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
              🚨 Hearing within 30 days
            </div>
            <button className="relative bg-white border border-gray-200 rounded-lg p-2 hover:bg-gray-50">
              <span className="text-xl">🔔</span>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">3</span>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {QUICK_ACTIONS.map(action => (
            <a
              key={action.href}
              href={action.href}
              className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-md transition-all group"
            >
              <div className={`${action.color} text-white w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform`}>
                {action.icon}
              </div>
              <div className="font-bold text-gray-800 text-sm">{action.label}</div>
              <div className="text-gray-500 text-xs mt-1">{action.desc}</div>
            </a>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* Left Column — Vaults + Alerts */}
          <div className="col-span-2 space-y-6">

            {/* Alerts */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-blue-900 text-lg">🔔 Your Alerts</h2>
                <a href="/alerts" className="text-blue-600 text-xs hover:underline">View all</a>
              </div>
              <div className="space-y-3">
                {MOCK_ALERTS.map((alert, i) => (
                  <div key={i} className={`flex gap-4 p-4 rounded-xl border ${alert.urgent ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100"}`}>
                    <div className="text-2xl">{alert.icon}</div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-800 text-sm">{alert.title}</span>
                        <span className="text-gray-400 text-xs">{alert.date}</span>
                      </div>
                      <p className="text-gray-600 text-xs mt-1">{alert.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* My Vaults */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-blue-900 text-lg">🗂️ My Case Vaults</h2>
                <a href="/vaults" className="bg-blue-700 text-white text-xs px-3 py-1 rounded-lg hover:bg-blue-800">+ New Vault</a>
              </div>
              <div className="space-y-3">
                {vaults.slice(0, 3).map(vault => {
                  const meta = VAULT_TYPE_META[vault.type] ?? VAULT_TYPE_META.custom;
                  const ago = daysAgoLabel(vault.updated_at);
                  return (
                    <a key={vault.id} href="/vaults" className={`flex items-center gap-4 p-4 rounded-xl border-2 ${meta.color} hover:shadow-sm transition-all`}>
                      <div className="text-3xl">{meta.icon}</div>
                      <div className="flex-1">
                        <div className="font-bold text-gray-800">{vault.name}</div>
                        <div className="text-gray-500 text-xs">Updated {ago}</div>
                      </div>
                      <div className="text-gray-400 text-sm">→</div>
                    </a>
                  );
                })}
                {vaults.length === 0 && (
                  <div className="text-gray-400 text-sm py-2">No vaults yet.</div>
                )}
                <a href="/vaults" className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all">
                  <div className="text-3xl">➕</div>
                  <div>
                    <div className="font-medium text-sm">Add a new vault</div>
                    <div className="text-xs">Bankruptcy, housing, civil, and more</div>
                  </div>
                </a>
              </div>
            </div>

            {/* AI Assistant Quick Ask */}
            <div className="bg-gradient-to-br from-blue-900 to-blue-700 rounded-2xl p-6 text-white">
              <h2 className="font-bold text-lg mb-2">🤖 Ask the AI a Legal Question</h2>
              <p className="text-blue-200 text-sm mb-4">Answers backed by real federal statutes and court opinions — not guesses.</p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={quickQuestion}
                  onChange={e => setQuickQuestion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleQuickAsk("")}
                  placeholder="e.g. Can DCF deny me my child's case records?"
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <button onClick={() => handleQuickAsk("")} className="bg-white text-blue-900 px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-50">
                  Ask →
                </button>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {["Can I record my court hearing?", "What is a GAL required to do?", "How do I file a motion to compel?"].map(q => (
                  <span key={q} onClick={() => handleQuickAsk(q)} className="bg-white/10 text-blue-100 text-xs px-2 py-1 rounded-full cursor-pointer hover:bg-white/20">{q}</span>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="space-y-6">

            {/* Your Case Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-blue-900 mb-4">📋 Your Case Profile</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">State</span>
                  <span className="font-medium">{user?.state || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">County</span>
                  <span className="font-medium">{user?.county || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Case Types</span>
                  <span className="font-medium text-right text-xs">
                    {user?.caseTypes?.length ? user.caseTypes.join(", ").replace(/_/g, " ") : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  {user?.urgency === "immediate"
                    ? <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold">Active — Urgent</span>
                    : user?.urgency === "soon"
                    ? <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-bold">Case in Progress</span>
                    : <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">Preparing</span>
                  }
                </div>
              </div>
              <a href="/settings/case" className="text-blue-600 text-xs hover:underline mt-4 block">Edit case profile →</a>
            </div>

            {/* Landmark Cases */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-blue-900 mb-4">⚖️ Your Key Cases</h2>
              <p className="text-gray-500 text-xs mb-4">Landmark Supreme Court cases that protect your rights. Know these cold.</p>
              <div className="space-y-4">
                {LANDMARK_CASES.map((c, i) => (
                  <div key={i} className="border-l-4 border-blue-500 pl-3">
                    <div className="font-bold text-gray-800 text-xs">{c.name}</div>
                    <div className="text-blue-600 text-xs">{c.citation}</div>
                    <div className="text-gray-500 text-xs mt-1">{c.relevance}</div>
                  </div>
                ))}
              </div>
              <a href="/case-law" className="text-blue-600 text-xs hover:underline mt-4 block">Search more cases →</a>
            </div>

            {/* Upcoming */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-blue-900 mb-4">📅 Prepare for Court</h2>
              <div className="space-y-3">
                {[
                  { label: "Review your exhibits", href: "/exhibits", done: false },
                  { label: "Practice opening statement", href: "/court-coach", done: false },
                  { label: "Check for new case law", href: "/case-law", done: true },
                  { label: "Download latest templates", href: "/templates", done: true },
                ].map((item, i) => (
                  <a key={i} href={item.href} className="flex items-center gap-3 text-sm group">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 group-hover:border-blue-400"}`}>
                      {item.done && "✓"}
                    </div>
                    <span className={item.done ? "text-gray-400 line-through" : "text-gray-700 group-hover:text-blue-600"}>{item.label}</span>
                  </a>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

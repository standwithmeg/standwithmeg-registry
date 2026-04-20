"use client";

import { useState, useEffect } from "react";

type Vault = {
  id: string;
  name: string;
  type: string;
  state: string | null;
  county: string | null;
  updated_at: string;
  doc_count?: number;
};

const VAULT_TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  family_court: { icon: "👨‍👩‍👧", label: "Family Court", color: "bg-blue-50 border-blue-200" },
  dcf_cps: { icon: "🏛️", label: "DCF / CPS", color: "bg-red-50 border-red-200" },
  divorce: { icon: "📋", label: "Divorce", color: "bg-purple-50 border-purple-200" },
  child_support: { icon: "💰", label: "Child Support", color: "bg-green-50 border-green-200" },
  civil: { icon: "⚖️", label: "Civil", color: "bg-yellow-50 border-yellow-200" },
  bankruptcy: { icon: "📁", label: "Bankruptcy", color: "bg-gray-50 border-gray-200" },
  housing: { icon: "🏠", label: "Housing", color: "bg-orange-50 border-orange-200" },
  criminal: { icon: "🔒", label: "Criminal", color: "bg-pink-50 border-pink-200" },
  school: { icon: "🎓", label: "School / Education", color: "bg-teal-50 border-teal-200" },
  custom: { icon: "📂", label: "Custom", color: "bg-indigo-50 border-indigo-200" },
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

export default function WorkspacePage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/vaults")
      .then(r => r.json())
      .then(async data => {
        if (!data.error && data.vaults) {
          setVaults(data.vaults);
          // Load doc counts in parallel
          const counts: Record<string, number> = {};
          await Promise.all(
            data.vaults.map(async (v: Vault) => {
              try {
                const res = await fetch(`/api/vaults/${v.id}/documents`);
                const d = await res.json();
                if (!d.error) counts[v.id] = d.documents.length;
              } catch {
                counts[v.id] = 0;
              }
            })
          );
          setDocCounts(counts);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const navItems = [
    { icon: "🏠", label: "Dashboard", href: "/dashboard" },
    { icon: "🗂️", label: "My Vaults", href: "/vaults" },
    { icon: "🤖", label: "AI Workspace", href: "/workspace", active: true },
    { icon: "🎤", label: "Court Coach", href: "/court-coach" },
    { icon: "📄", label: "Templates", href: "/templates" },
    { icon: "📁", label: "Exhibit Builder", href: "/exhibits" },
    { icon: "⚖️", label: "Case Law Search", href: "/case-law" },
    { icon: "📚", label: "How-To Guides", href: "/guides" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-blue-800">
          <a href="/dashboard" className="text-blue-300 text-xs hover:text-white block mb-3">← Dashboard</a>
          <div className="text-xl font-bold">My Court Guide</div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <a key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                item.active ? "bg-blue-700 text-white" : "text-blue-200 hover:bg-blue-800 hover:text-white"
              }`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div className="ml-64 flex-1 p-8">
        <div className="max-w-3xl mx-auto">

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-blue-900">🤖 AI Workspace</h1>
            <p className="text-gray-600 mt-1">Choose a vault to open your vault-aware AI assistant.</p>
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm">Loading your vaults…</div>
          ) : vaults.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="text-4xl mb-3">🗂️</div>
              <p className="text-gray-700 font-medium mb-1">No vaults yet</p>
              <p className="text-gray-500 text-sm mb-4">Create a vault to get started with the AI Workspace.</p>
              <a href="/vaults" className="inline-block bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800">
                Go to My Vaults
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {vaults.map(vault => {
                const meta = VAULT_TYPE_META[vault.type] ?? VAULT_TYPE_META.custom;
                const count = docCounts[vault.id] ?? 0;
                return (
                  <div
                    key={vault.id}
                    className={`bg-white rounded-xl border-2 ${meta.color} p-5 flex items-center justify-between gap-4 hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-3xl">{meta.icon}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-blue-900 truncate">{vault.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{meta.label}</span>
                          {(vault.state || vault.county) && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span>{[vault.county, vault.state].filter(Boolean).join(", ")}</span>
                            </>
                          )}
                          <span className="text-gray-300">·</span>
                          <span>{count} doc{count !== 1 ? "s" : ""}</span>
                          <span className="text-gray-300">·</span>
                          <span>Updated {timeAgo(vault.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                    <a
                      href={`/vaults/${vault.id}/ai`}
                      className="flex-shrink-0 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors"
                    >
                      Start Working →
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
            <strong>Tip:</strong> The AI Workspace uses your vault&apos;s case details and uploaded documents as context — so the more you fill in your vault, the better the answers.
          </div>
        </div>
      </div>
    </div>
  );
}

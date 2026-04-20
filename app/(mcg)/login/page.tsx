"use client";

import { useState } from "react";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
      } else {
        // Store session token for client-side Supabase calls, then redirect
        if (data.session?.access_token) {
          localStorage.setItem("sb_access_token", data.session.access_token);
        }
        const params = new URLSearchParams(window.location.search);
        window.location.href = params.get("next") || "/dashboard";
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">

      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-900">My Court Guide</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Pro Se Legal Platform</span>
        </Link>
        <div className="flex gap-6 items-center">
          <a href="/guides" className="text-gray-600 hover:text-blue-900 text-sm">Free Guides</a>
          <a href="/signup" className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800">Get Started</a>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-md">

          <h1 className="text-2xl font-bold text-blue-900 mb-2">Sign In</h1>
          <p className="text-gray-500 text-sm mb-8">
            Don&apos;t have an account? <a href="/signup" className="text-blue-700 hover:underline font-medium">Create one free</a>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 text-white py-3 rounded-lg font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </form>

          <div className="border-t border-gray-100 pt-6 mt-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Available now, free:</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">→</span>
                <a href="/ai-assistant" className="text-blue-700 hover:underline">AI Document Assistant</a>
                <span className="text-gray-400">— no account needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">→</span>
                <a href="/guides" className="text-blue-700 hover:underline">Free Guides</a>
                <span className="text-gray-400">— plain-language legal information</span>
              </li>
            </ul>
          </div>

        </div>
      </div>

      <footer className="bg-gray-900 text-gray-400 px-6 py-8">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-between gap-4 text-sm">
          <p>© 2026 My Court Guide. Legal information, not legal advice.</p>
          <div className="flex gap-4">
            <a href="/disclaimer" className="hover:text-white">Disclaimer</a>
            <a href="/privacy" className="hover:text-white">Privacy</a>
            <a href="/terms" className="hover:text-white">Terms</a>
          </div>
        </div>
      </footer>

    </main>
  );
}

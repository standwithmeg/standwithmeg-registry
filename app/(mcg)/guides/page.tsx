import Link from "next/link";

export default function GuidesIndex() {
  return (
    <main className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-900">My Court Guide</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Pro Se Legal Platform</span>
        </Link>
        <div className="flex gap-6 items-center">
          <a href="/guides" className="text-blue-700 font-medium text-sm">Guides</a>
          <a href="/login" className="text-blue-700 hover:text-blue-900 text-sm font-medium">Log In</a>
          <a href="/signup" className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800">Get Started</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-blue-700 text-white px-6 py-16 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Free Legal Guides</h1>
          <p className="text-blue-100 text-lg max-w-xl mx-auto">
            Straight talk about how courts actually work — written for real people fighting real cases.
            No law degree required.
          </p>
        </div>
      </section>

      {/* Guides Grid */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Family Court — Live */}
          <a href="/guides/family-court" className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all p-8">
            <div className="text-4xl mb-4">⚖️</div>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Available Now</div>
            <h2 className="text-xl font-bold text-blue-900 group-hover:text-blue-700 mb-3">Family Court Guide</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              Divorce, custody, child support, property division, discovery, motions to compel, and enforcement.
              Everything you need to fight in family court without a lawyer.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Divorce</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Custody</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Child Support</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Discovery</span>
            </div>
          </a>

          {/* Motions — Live */}
          <a href="/guides/motions-and-hearings" className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all p-8">
            <div className="text-4xl mb-4">📝</div>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Available Now</div>
            <h2 className="text-xl font-bold text-blue-900 group-hover:text-blue-700 mb-3">Motions &amp; Hearings Guide</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              How to file motions, prepare for hearings, use contempt power, and force the court
              to act. Includes a motion quick-reference and a real motion template.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Motions</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Hearings</span>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Contempt</span>
            </div>
          </a>

          {/* Evidence — Coming Soon */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8 opacity-75">
            <div className="text-4xl mb-4">🔍</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Coming Soon</div>
            <h2 className="text-xl font-bold text-gray-600 mb-3">Evidence Guide</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              What evidence courts accept, how hearsay rules work, how to object, and how to get
              your evidence in front of the judge in a way it cannot be ignored.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Admissibility</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Hearsay</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Objections</span>
            </div>
          </div>

          {/* Defenses — Coming Soon */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8 opacity-75">
            <div className="text-4xl mb-4">🛡️</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Coming Soon</div>
            <h2 className="text-xl font-bold text-gray-600 mb-3">Affirmative Defenses Guide</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-4">
              How to fight back — not just deny. The essential elements of every major affirmative defense,
              how to plead them, and how to use offense as your best strategy.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Defenses</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pleadings</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Strategy</span>
            </div>
          </div>

        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-900 text-white px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Guides are just the start.</h2>
          <p className="text-blue-200 mb-6">
            My Court Guide gives you the guides, the AI legal research, the court templates, and the
            document tools — all in one place.
          </p>
          <a href="/signup" className="bg-white text-blue-900 px-8 py-3 rounded-lg font-bold hover:bg-blue-50">
            Get Started Free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 px-6 py-12">
        <div className="max-w-6xl mx-auto mt-8 pt-8 text-center text-sm">
          <p>© 2026 My Court Guide. This platform provides legal information, not legal advice. Always consult a licensed attorney in your state.</p>
        </div>
      </footer>

    </main>
  );
}

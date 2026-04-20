import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-blue-900 tracking-tight">
            My Court Guide
          </Link>
          <div className="hidden md:flex gap-8 items-center">
            <a href="#how-it-works" className="text-gray-600 hover:text-blue-900 text-sm transition-colors">How It Works</a>
            <a href="/about" className="text-gray-600 hover:text-blue-900 text-sm transition-colors">About</a>
            <a href="/login" className="text-gray-600 hover:text-blue-900 text-sm transition-colors">Sign In</a>
            <a
              href="/ai-assistant"
              className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              Try It Free
            </a>
          </div>
          {/* Mobile CTA only */}
          <a
            href="/ai-assistant"
            className="md:hidden bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
          >
            Try It Free
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-950 to-blue-900 text-white px-6 py-24 md:py-32">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-7">
            The court system wasn&apos;t designed<br className="hidden md:block" /> to explain itself to you.
          </h1>
          <p className="text-blue-100 text-lg md:text-xl leading-relaxed mb-5 max-w-2xl mx-auto">
            The statutes, case law, and practical strategy that could actually help you are buried where most people never find them. And when people turn to generic AI for answers, they often get confident-sounding responses that don&apos;t hold up in court.
          </p>
          <p className="text-blue-100 text-lg leading-relaxed mb-12 max-w-2xl mx-auto">
            My Court Guide is different — grounded in real law, built around actual courtroom strategy, and created by someone who spent 12 years navigating family court without an attorney. Not a tech company. Someone who needed this and built it anyway.
          </p>
          <a
            href="/ai-assistant"
            className="inline-block bg-white text-blue-900 px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-colors shadow-lg"
          >
            Analyze your first document free
          </a>
          <p className="text-blue-300 text-sm mt-4">No account needed &nbsp;·&nbsp; Real law &nbsp;·&nbsp; Plain English</p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="px-6 py-20 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-blue-900 text-center mb-3">How It Works</h2>
          <p className="text-gray-500 text-center text-lg mb-16 max-w-xl mx-auto">
            Start without an account. See what your document actually means.
          </p>
          <div className="grid md:grid-cols-3 gap-12">

            <div className="text-center">
              <div className="w-14 h-14 bg-blue-900 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5">
                1
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-3">Upload your document</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Upload a PDF or paste text from any court document — an order, a motion, a DCF report, or anything else you&apos;ve received.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 bg-blue-900 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5">
                2
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-3">Get a plain-English breakdown</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                The AI explains what the document is, what it means for you, any deadlines or obligations, and relevant law — in language you can actually use.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 bg-blue-900 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5">
                3
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-3">Know what to do next</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Create a free account to save your analysis, add the rest of your documents, and get your personalized action plan.
              </p>
            </div>

          </div>

          <div className="mt-14 text-center">
            <a
              href="/ai-assistant"
              className="inline-block bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-800 transition-colors"
            >
              Analyze your first document free
            </a>
          </div>
        </div>
      </section>

      {/* What Makes This Different */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-blue-900 text-center mb-3">
            This is not a general-purpose AI
          </h2>
          <p className="text-gray-500 text-center text-lg mb-16 max-w-2xl mx-auto">
            Generic AI can sound helpful while giving answers that don&apos;t hold up. My Court Guide is built differently.
          </p>
          <div className="grid md:grid-cols-3 gap-8">

            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-3">Grounded in real law</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Every answer is backed by real statutes and case law — not pattern-matched guesses. When a law is cited, it exists and it applies.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-3">Built on courtroom strategy</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                The platform is built on practical courtroom knowledge — the kind of strategy that usually only comes from years inside the system.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-blue-900 mb-3">Honest about what it knows</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                One document isn&apos;t the whole story. The AI tells you what it can see, what&apos;s still missing, and what you should find out next.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Court Coach Preview */}
      <section className="px-6 py-16 bg-blue-900 text-white">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-10 md:items-center">
          <div className="flex-1">
            <div className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-3">
              For signed-in users
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Court Coach — word for word, for your hearing
            </h2>
            <p className="text-blue-100 leading-relaxed mb-3">
              Once you&apos;re signed in, you get access to Court Coach — exact language to use in 12 different courtroom situations, from opening statements to objections to DCF hearings.
            </p>
            <p className="text-blue-300 text-sm">
              On the Active Case plan, the AI plays the judge so you can practice before you walk in.
            </p>
          </div>
          <div className="flex-shrink-0">
            <a
              href="/signup"
              className="inline-block bg-white text-blue-900 px-8 py-4 rounded-xl font-bold hover:bg-blue-50 transition-colors"
            >
              Create a free account
            </a>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-blue-900 text-center mb-3">Simple, honest pricing</h2>
          <p className="text-gray-500 text-center text-lg mb-16">Start free. Upgrade when you&apos;re ready.</p>
          <div className="grid md:grid-cols-3 gap-8 items-start">

            {/* Free */}
            <div className="bg-white rounded-2xl p-8 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Free</h3>
              <div className="text-4xl font-bold text-blue-900 mb-1">$0</div>
              <p className="text-gray-400 text-sm mb-7">No credit card required</p>
              <ul className="space-y-3 text-sm text-gray-600 mb-8">
                <li className="flex gap-2 items-start">
                  <span className="text-blue-700 font-bold mt-0.5">✓</span>
                  5 document analyses per month
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-700 font-bold mt-0.5">✓</span>
                  1 case vault
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-700 font-bold mt-0.5">✓</span>
                  15 AI follow-up questions per month
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-700 font-bold mt-0.5">✓</span>
                  Court Coach scripts (read-only)
                </li>
                <li className="flex gap-2 items-start text-gray-300">
                  <span className="mt-0.5">–</span>
                  Templates
                </li>
                <li className="flex gap-2 items-start text-gray-300">
                  <span className="mt-0.5">–</span>
                  County-specific guidance
                </li>
              </ul>
              <a
                href="/signup"
                className="block text-center border-2 border-blue-700 text-blue-700 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-colors"
              >
                Get started free
              </a>
            </div>

            {/* Active Case */}
            <div className="bg-blue-900 rounded-2xl p-8 border border-blue-800 relative shadow-xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                MOST POPULAR
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Active Case</h3>
              <div className="text-4xl font-bold text-white mb-1">
                $19<span className="text-lg font-normal text-blue-300">/mo</span>
              </div>
              <p className="text-blue-300 text-sm mb-7">For people managing a real case</p>
              <ul className="space-y-3 text-sm text-blue-100 mb-8">
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  20 document analyses per month
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  3 case vaults
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  75 AI questions per month
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  Full Court Coach + AI practice mode
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  County-specific guidance
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  Template access
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-300 font-bold mt-0.5">✓</span>
                  1GB document storage
                </li>
              </ul>
              <a
                href="/signup?plan=active"
                className="block text-center bg-white text-blue-900 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors"
              >
                Start Active Case
              </a>
            </div>

            {/* Advocate — Coming Soon */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 relative">
              <div className="absolute top-5 right-5 bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full">
                COMING SOON
              </div>
              <h3 className="text-lg font-bold text-gray-400 mb-1">Advocate</h3>
              <div className="text-4xl font-bold text-gray-400 mb-1">
                $99<span className="text-lg font-normal">/mo</span>
              </div>
              <p className="text-gray-400 text-sm mb-7">For case managers and advocates</p>
              <ul className="space-y-3 text-sm text-gray-400 mb-8">
                <li className="flex gap-2 items-start">
                  <span className="mt-0.5">✓</span>
                  Higher limits on analyses and questions
                </li>
                <li className="flex gap-2 items-start">
                  <span className="mt-0.5">✓</span>
                  Up to 25 case vaults
                </li>
                <li className="flex gap-2 items-start">
                  <span className="mt-0.5">✓</span>
                  Multi-client dashboard
                </li>
                <li className="flex gap-2 items-start">
                  <span className="mt-0.5">✓</span>
                  Everything in Active Case
                </li>
                <li className="flex gap-2 items-start">
                  <span className="mt-0.5">✓</span>
                  Larger document storage
                </li>
              </ul>
              <div className="block text-center bg-gray-200 text-gray-400 px-6 py-3 rounded-xl font-semibold cursor-not-allowed select-none">
                Coming soon
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Meg's Story */}
      <section id="about" className="px-6 py-20 bg-blue-950 text-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-4">
            Why this exists
          </div>
          <h2 className="text-3xl font-bold mb-8">
            Built from inside the system
          </h2>

          {/* Credibility stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-blue-900 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">12+</div>
              <div className="text-blue-400 text-xs mt-1 leading-snug">years as a pro se litigant</div>
            </div>
            <div className="bg-blue-900 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">5</div>
              <div className="text-blue-400 text-xs mt-1 leading-snug">children across 2 states</div>
            </div>
            <div className="bg-blue-900 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">4×</div>
              <div className="text-blue-400 text-xs mt-1 leading-snug">testified before Kansas legislators</div>
            </div>
            <div className="bg-blue-900 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">200K+</div>
              <div className="text-blue-400 text-xs mt-1 leading-snug">people reached nationally</div>
            </div>
          </div>

          <div className="space-y-5 text-blue-100 text-lg leading-relaxed">
            <p>
              I spent 12 years in family court as a pro se litigant — navigating custody battles, DCF investigations, and multi-state proceedings while raising five children and learning the law on the fly.
            </p>
            <p>
              I testified before Kansas legislators. I filed my own civil rights cases. I built a national platform. What I kept finding is that the information you need to fight back exists — it&apos;s just buried where most people never look, and written for people who already have a law degree.
            </p>
            <p>
              I built My Court Guide to close that gap.
            </p>
          </div>

          <div className="mt-10 pt-8 border-t border-blue-800 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
            <div>
              <p className="text-blue-200 font-semibold">— Meg, Founder of My Court Guide</p>
              <a href="/about" className="text-blue-400 hover:text-blue-200 text-sm mt-1 inline-block transition-colors">
                Read the full story →
              </a>
            </div>
            <a
              href="/ai-assistant"
              className="inline-block bg-white text-blue-900 px-7 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors text-sm whitespace-nowrap"
            >
              Try it free — no account needed
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-950 border-t border-blue-900 text-blue-400 px-6 py-12">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between gap-10">
          <div>
            <div className="text-white font-bold text-lg mb-3">My Court Guide</div>
            <p className="text-sm text-blue-500 max-w-xs leading-relaxed">
              Legal information for people navigating the court system without an attorney.
            </p>
          </div>
          <div className="flex gap-16">
            <div>
              <div className="text-white font-semibold text-sm mb-4">Platform</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="/login" className="hover:text-white transition-colors">Sign In</a></li>
              </ul>
            </div>
            <div>
              <div className="text-white font-semibold text-sm mb-4">Legal</div>
              <ul className="space-y-2 text-sm">
                <li><a href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-10 pt-8 border-t border-blue-900 text-center text-xs text-blue-600">
          <p>© 2026 My Court Guide. This platform provides legal information, not legal advice. Always consult a licensed attorney in your state.</p>
        </div>
      </footer>

    </main>
  );
}

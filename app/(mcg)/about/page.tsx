import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-blue-900 tracking-tight">
            My Court Guide
          </Link>
          <div className="hidden md:flex gap-8 items-center">
            <Link href="/#how-it-works" className="text-gray-600 hover:text-blue-900 text-sm transition-colors">How It Works</Link>
            <a href="/about" className="text-blue-900 font-semibold text-sm">About</a>
            <a href="/login" className="text-gray-600 hover:text-blue-900 text-sm transition-colors">Sign In</a>
            <a
              href="/ai-assistant"
              className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              Try It Free
            </a>
          </div>
          <a href="/ai-assistant" className="md:hidden bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            Try It Free
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-950 to-blue-900 text-white px-6 py-20 md:py-28">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-4">
            The founder&apos;s story
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
            From stay-at-home mom<br className="hidden md:block" /> to national advocate
          </h1>
          <p className="text-blue-100 text-xl leading-relaxed max-w-2xl">
            Twelve years. Five children. Two states. One federal lawsuit. This is why My Court Guide exists.
          </p>
        </div>
      </section>

      {/* By the numbers */}
      <section className="bg-blue-800 text-white px-6 py-10">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-3xl font-bold">12+</div>
            <div className="text-blue-300 text-sm mt-1">years as a pro se litigant</div>
          </div>
          <div>
            <div className="text-3xl font-bold">5</div>
            <div className="text-blue-300 text-sm mt-1">children at the center of it</div>
          </div>
          <div>
            <div className="text-3xl font-bold">4×</div>
            <div className="text-blue-300 text-sm mt-1">testified before Kansas legislators</div>
          </div>
          <div>
            <div className="text-3xl font-bold">200K+</div>
            <div className="text-blue-300 text-sm mt-1">people reached nationally</div>
          </div>
        </div>
      </section>

      {/* Section 1: The Beginning */}
      <section className="px-6 py-16 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-700 text-xs font-bold uppercase tracking-widest mb-3">
            2013 — Missouri
          </div>
          <h2 className="text-2xl font-bold text-blue-900 mb-6">How it started</h2>
          <div className="space-y-5 text-gray-700 text-lg leading-relaxed">
            <p>
              In 2013, I was a stay-at-home mother in Missouri, raising five young children. On paper, my life looked stable. Behind closed doors, it was something very different.
            </p>
            <p>
              When I discovered I was being surveilled — including a GPS tracker placed on my vehicle — I did what the system tells you to do. I sought protection through the courts. I filed for an Order of Protection. Criminal charges followed. A lengthy divorce proceeding documented what I had been living through, and the court&apos;s findings supported my account.
            </p>
            <p>
              On paper, that ruling should have meant safety. In reality, it marked the beginning of something else entirely.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: What the system actually is */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-700 text-xs font-bold uppercase tracking-widest mb-3">
            2013–2024 — Missouri &amp; Kansas
          </div>
          <h2 className="text-2xl font-bold text-blue-900 mb-6">What the system actually is</h2>
          <div className="space-y-5 text-gray-700 text-lg leading-relaxed">
            <p>
              What followed was more than a decade of family court proceedings across two states. Custody battles. DCF investigations. Guardian ad Litem control. Court-appointed therapists. Temporary orders that stretched into years. And a financial system that conditions access to your children on your ability to pay.
            </p>
            <p>
              The proceedings looked like due process from the outside. Inside, they often weren&apos;t. Decisions were made in hearings without sworn testimony. Reports were relied on without being tested. I was excluded from processes that directly determined my relationship with my children.
            </p>
            <p>
              On January 29, 2024, all five of my children were removed from my custody. I would go 290 days without seeing any of them.
            </p>
            <p>
              Later, the state agency investigating the allegations found them unsubstantiated and documented concerns about what had happened. That information did not restore my rights. The separation continued anyway.
            </p>
          </div>

          {/* Pull quote */}
          <div className="mt-10 border-l-4 border-blue-700 pl-6 py-2">
            <p className="text-blue-900 text-xl font-semibold leading-snug">
              &ldquo;My four-day custody trial was canceled because I could not prepay over $13,000 in fees. My right to a trial became pay-to-play.&rdquo;
            </p>
            <p className="text-gray-500 text-sm mt-2">— Testimony before Kansas legislators, 2025</p>
          </div>
        </div>
      </section>

      {/* Section 3: The discovery */}
      <section className="px-6 py-16 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-700 text-xs font-bold uppercase tracking-widest mb-3">
            The turning point
          </div>
          <h2 className="text-2xl font-bold text-blue-900 mb-6">What I discovered</h2>
          <div className="space-y-5 text-gray-700 text-lg leading-relaxed">
            <p>
              Fighting for your own family teaches you things no one tells you in advance. I learned to read statutes. I learned to write motions. I learned the difference between what the law says and how it gets applied in practice. I learned what arguments hold up, what evidence matters, and what procedural moves change outcomes.
            </p>
            <p>
              None of that knowledge was handed to me. I found it buried in legal databases, scattered across court websites that weren&apos;t designed for regular people to navigate, and written in language that assumed I already had a law degree.
            </p>
            <p>
              The information existed. It was just locked behind access that most people don&apos;t have — time, money, connections, or the right vocabulary to even know what to search for.
            </p>
            <p className="font-semibold text-blue-900 text-xl">
              The gap isn&apos;t in the law. The law is public. The gap is in who gets it explained to them clearly, who gets practical strategy, and who walks into a courtroom understanding what they&apos;re walking into.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Going public */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-700 text-xs font-bold uppercase tracking-widest mb-3">
            2024–present
          </div>
          <h2 className="text-2xl font-bold text-blue-900 mb-6">Going public</h2>
          <div className="space-y-5 text-gray-700 text-lg leading-relaxed">
            <p>
              In April 2024, I stopped waiting for the system to correct itself. I started speaking.
            </p>
            <p>
              On November 14, 2024 — after 290 days without seeing my children — I testified before a Kansas state legislative committee. I have since appeared four times at the Kansas Capitol, each time with more data, more families&apos; stories, and more specific demands: end the pay-to-parent system, bring accountability to court-appointed professionals, and restore due process for families who currently have none.
            </p>
            <p>
              The numbers are real. Nearly 1 in 3 Kansas parents in custody cases reported having no contact with their children. I filed pro se civil rights actions in state and federal court. I built a national platform — Stand With Meg — that has reached more than 200,000 people. I am still fighting. Not because I wanted this role, but because too many parents are trapped in systems that reward silence over truth.
            </p>
          </div>
        </div>
      </section>

      {/* Section 5: Why this tool */}
      <section className="px-6 py-16 bg-blue-950 text-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Why I built this</h2>
          <div className="space-y-5 text-blue-100 text-lg leading-relaxed">
            <p>
              I built My Court Guide because I spent 12 years learning things that should have been available to me from the beginning.
            </p>
            <p>
              Not legal advice. Not a replacement for an attorney. The real law, explained in plain English — with the practical strategy that helps you understand what&apos;s happening in your case and what you can actually do about it.
            </p>
            <p>
              Every parent who walks into a courtroom without understanding their rights is starting at a disadvantage that doesn&apos;t have to exist. The system is hard enough. It should not also be a mystery.
            </p>
          </div>
          <div className="mt-10 pt-8 border-t border-blue-800">
            <p className="text-blue-200 font-semibold text-lg">— Meg, Founder of My Court Guide</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 bg-white text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-blue-900 mb-4">See what your document actually means</h2>
          <p className="text-gray-500 text-lg mb-8">
            Upload your first document free. No account needed. Real law. Plain English.
          </p>
          <a
            href="/ai-assistant"
            className="inline-block bg-blue-700 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-800 transition-colors"
          >
            Analyze your first document free
          </a>
          <p className="text-gray-400 text-sm mt-4">No signup required</p>
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
                <li><Link href="/#how-it-works" className="hover:text-white transition-colors">How It Works</Link></li>
                <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
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

import Link from "next/link";

export default function Disclaimer() {
  return (
    <main className="min-h-screen bg-white">

      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-900">My Court Guide</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Pro Se Legal Platform</span>
        </Link>
        <div className="flex gap-6 items-center">
          <a href="/guides" className="text-gray-600 hover:text-blue-900 text-sm">Free Guides</a>
          <a href="/login" className="text-blue-700 hover:text-blue-900 text-sm font-medium">Log In</a>
          <a href="/signup" className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800">Get Started</a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">

        <div className="mb-10">
          <p className="text-sm text-gray-400 uppercase tracking-wide font-medium mb-2">Legal</p>
          <h1 className="text-4xl font-bold text-blue-900 mb-4">Legal Disclaimer</h1>
          <p className="text-gray-500 text-sm">Last updated: March 2026</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8">

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <h2 className="text-lg font-bold text-yellow-800 mb-2">This is legal information, not legal advice.</h2>
            <p className="text-yellow-700 text-sm leading-relaxed">
              My Court Guide provides legal information — not legal advice. There is an important legal difference.
              Legal information is general knowledge about how the law works. Legal advice is professional guidance
              applied to your specific facts by a licensed attorney. We provide the former, not the latter.
            </p>
          </div>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">No Attorney-Client Relationship</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Using My Court Guide — including creating an account, using the AI assistant, reading our guides,
              generating documents from templates, or communicating with us in any form — does not create an
              attorney-client relationship between you and My Court Guide or anyone affiliated with it.
            </p>
            <p className="text-gray-700 leading-relaxed">
              No attorney-client privilege attaches to anything you share on this platform. Do not treat
              information you receive here as confidential legal counsel.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">No Professional Legal Advice</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The guides, templates, AI responses, case law summaries, and other content on this platform are
              intended to help you understand how legal systems work — not to substitute for professional legal
              representation. Laws change. Courts interpret statutes differently. What applies in one state may
              not apply in another. What worked in one case may not work in yours.
            </p>
            <p className="text-gray-700 leading-relaxed">
              You are solely responsible for any legal decisions you make, filings you submit, and actions you
              take based on information from this platform. We strongly encourage you to consult a licensed
              attorney in your jurisdiction before filing anything with a court.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">AI-Generated Content</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              My Court Guide uses artificial intelligence to help answer questions, research case law, and assist
              with document drafting. AI can make mistakes. AI responses may be incomplete, outdated, or
              inapplicable to your specific situation. AI-generated content on this platform should be treated
              as a starting point for your own research — not a final answer.
            </p>
            <p className="text-gray-700 leading-relaxed">
              We connect to external legal databases including CourtListener and GovInfo to retrieve publicly
              available case law and federal statutes. We do not guarantee the accuracy, completeness, or
              currency of information retrieved from those sources.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">State and Local Law Variation</h2>
            <p className="text-gray-700 leading-relaxed">
              Legal procedures, court rules, filing deadlines, and substantive rights vary significantly from
              state to state and sometimes county to county. Templates and guides on this platform are intended
              as general starting points. Always verify that any document you file meets the specific
              requirements of your court, jurisdiction, and case type.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">No Guarantee of Outcome</h2>
            <p className="text-gray-700 leading-relaxed">
              Nothing on this platform guarantees any legal outcome. Providing you with tools, information, or
              document templates does not mean you will win your case. Legal outcomes depend on facts, evidence,
              judicial discretion, applicable law, and many other factors outside our control or knowledge.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">About My Court Guide</h2>
            <p className="text-gray-700 leading-relaxed">
              My Court Guide was built by a parent who spent over a decade navigating family court as a
              pro se litigant. The platform exists to help other parents and individuals understand their
              legal rights and navigate the court system with more confidence. It is not a law firm and
              does not employ attorneys for the purpose of advising users on their cases.
            </p>
          </section>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <p className="text-blue-800 text-sm leading-relaxed">
              <strong>When in doubt, consult an attorney.</strong> If you are facing a serious legal matter —
              particularly anything involving your children, housing, criminal charges, or significant financial
              consequences — please seek guidance from a licensed attorney in your state. Many states have
              legal aid organizations that offer free or reduced-cost help for qualifying individuals.
            </p>
          </div>

        </div>
      </div>

      <footer className="bg-gray-900 text-gray-400 px-6 py-8 mt-16">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-between gap-4 text-sm">
          <p>© 2026 My Court Guide. Legal information, not legal advice.</p>
          <div className="flex gap-4">
            <a href="/disclaimer" className="text-white">Disclaimer</a>
            <a href="/privacy" className="hover:text-white">Privacy</a>
            <a href="/terms" className="hover:text-white">Terms</a>
          </div>
        </div>
      </footer>

    </main>
  );
}

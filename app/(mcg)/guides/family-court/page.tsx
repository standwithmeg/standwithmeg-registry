import Link from "next/link";

export default function FamilyCourtGuide() {
  return (
    <main className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold text-blue-900">My Court Guide</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Pro Se Legal Platform</span>
        </Link>
        <div className="flex gap-6 items-center">
          <a href="/guides" className="text-gray-600 hover:text-blue-900 text-sm">Guides</a>
          <a href="/login" className="text-blue-700 hover:text-blue-900 text-sm font-medium">Log In</a>
          <a href="/signup" className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800">Get Started</a>
        </div>
      </nav>

      {/* Disclaimer Banner */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-center">
        <p className="text-yellow-800 text-sm">
          <strong>Legal Information, Not Legal Advice.</strong> This guide provides general legal information only. Laws vary by state. Consult a licensed attorney in your jurisdiction for advice about your specific situation.
        </p>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-blue-700 text-white px-6 py-16 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-300 text-sm font-medium mb-3 uppercase tracking-wide">Free Guide</div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">Family Court: What You Need to Know</h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            Divorce, custody, child support, discovery — explained plainly, without the lawyer markup.
            Know the law. Know your rights. Know what to do next.
          </p>
        </div>
      </section>

      {/* Jump Links */}
      <section className="bg-blue-50 border-b border-blue-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-4 text-sm text-blue-700 font-medium justify-center">
          <a href="#divorce" className="hover:text-blue-900">Divorce Basics</a>
          <span className="text-blue-300">·</span>
          <a href="#property" className="hover:text-blue-900">Property Division</a>
          <span className="text-blue-300">·</span>
          <a href="#child-support" className="hover:text-blue-900">Child Support</a>
          <span className="text-blue-300">·</span>
          <a href="#custody" className="hover:text-blue-900">Custody</a>
          <span className="text-blue-300">·</span>
          <a href="#discovery" className="hover:text-blue-900">Discovery</a>
          <span className="text-blue-300">·</span>
          <a href="#motions" className="hover:text-blue-900">Motions to Compel</a>
          <span className="text-blue-300">·</span>
          <a href="#enforcement" className="hover:text-blue-900">Enforcement</a>
        </div>
      </section>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-16 space-y-16">

        {/* Divorce Basics */}
        <section id="divorce">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Divorce Basics</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Divorce legally dissolves the marital unit. Before it, the law treats husband and wife as one legal entity.
            After it, both people go forward as separate individuals. That split is not just emotional — it is legal.
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            And once it happens, the court has to sort out responsibilities that do not disappear just because the
            relationship did. If children are involved, the stakes get more serious — now it is also about stability,
            protection, support, time, and emotional structure for children who did not ask for any of this.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-3">What divorce orders typically cover:</h3>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> Division of assets and debts</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> Child custody and visitation</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> Child support</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> Alimony / spousal support</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> Jurisdiction reserved for future enforcement</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <h3 className="font-bold text-green-800 mb-2">Agreed Divorce</h3>
              <p className="text-green-700 text-sm leading-relaxed">
                Both parties agree on all terms. Less destructive, faster, cheaper. The court approves and
                enters a binding order. Still needs careful drafting — agreements break down later more often
                than people expect.
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <h3 className="font-bold text-red-800 mb-2">Contested Divorce</h3>
              <p className="text-red-700 text-sm leading-relaxed">
                Parties disagree on one or more terms. Every issue becomes a potential fight. These cases
                are won or lost through discovery — not dramatic speeches, not emotional outrage. Through
                discovery.
              </p>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
            <p className="text-blue-800 text-sm font-medium">
              Critical: Make sure your final order reserves jurisdiction. Without that clause, enforcing it later
              becomes needlessly complicated.
            </p>
          </div>
        </section>

        {/* Property */}
        <section id="property">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Property Division</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            What you owned before marriage is generally yours — that is non-marital property.
            What was acquired during the marriage is generally marital property, meaning the law treats it as
            belonging to both parties regardless of whose name appears on the title.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6 space-y-4">
            <div>
              <div className="font-bold text-gray-800 mb-1">Usually marital property:</div>
              <p className="text-gray-600 text-sm">Homes bought during the marriage, businesses built during the marriage, income earned during the marriage, investment growth during the marriage.</p>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <div className="font-bold text-gray-800 mb-1">The commingling trap:</div>
              <p className="text-gray-600 text-sm">Once separate money goes into a joint account, it can become marital in ways people do not understand until it is too late. Know your state&apos;s rules on this before you file.</p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
            <p className="text-yellow-800 text-sm">
              <strong>State law matters here.</strong> Community property states (like California, Texas, Arizona) divide
              assets 50/50 by default. Equitable distribution states divide assets &quot;fairly&quot; — which does not always
              mean equally. Know which one you are in.
            </p>
          </div>
        </section>

        {/* Child Support */}
        <section id="child-support">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Child Support</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Child support is not money for the ex-spouse. It is money for the child. That should be obvious —
            but in practice it gets abused constantly.
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            Most states calculate support using a formula tied to income, custody split, and sometimes assets.
            The non-custodial parent contributes financially to the child&apos;s needs. If you are paying support,
            you have every right to care where it is going.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 space-y-4 mb-6">
            <h3 className="font-bold text-blue-900">Pay in a way you can prove.</h3>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> By check (keep copies)</li>
              <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> By traceable bank transfer</li>
              <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> Through the state&apos;s payment registry if required</li>
              <li className="flex items-start gap-2"><span className="text-red-500">✗</span> Not cash — unless you get a signed, dated receipt with detail</li>
              <li className="flex items-start gap-2"><span className="text-red-500">✗</span> Not &quot;I bought groceries&quot; — courts treat that as a gift, not support</li>
            </ul>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
            <p className="text-blue-800 text-sm">
              If you have reason to believe support money is not being used for the child, that is not something
              you quietly absorb. You investigate through discovery and raise it with the court.
            </p>
          </div>
        </section>

        {/* Custody */}
        <section id="custody">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Child Custody</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Every parent of a minor child has a fundamental legal interest in time, relationship, and connection
            with that child. Courts have recognized this as a constitutional right in landmark cases like{' '}
            <em>Troxel v. Granville</em> (2000).
          </p>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Legal Custody</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                The right to make major decisions about the child&apos;s life — education, healthcare, religion.
                Can be sole (one parent decides) or joint (both parents decide together).
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Physical Custody</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Where the child lives day to day. Primary physical custody means the child lives mainly
                with one parent. Shared means roughly equal time with both.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-3">UCCJEA — Know This Law</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              Most states have adopted the Uniform Child Custody Jurisdiction and Enforcement Act. It determines
              which state has jurisdiction over your custody case when parents live in different states — and which
              state&apos;s order controls. If you or the other parent has moved states, this law governs your case.
              Look up how your specific state applies it.
            </p>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
            <p className="text-blue-800 text-sm">
              <strong>The best interests of the child</strong> is the legal standard in every state — but courts
              define it differently. Document everything: your involvement, your stability, your communication
              with the other parent. The record you build today is what the court sees.
            </p>
          </div>
        </section>

        {/* Discovery */}
        <section id="discovery">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Discovery: How Cases Are Actually Won</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Contested divorces are won or lost through discovery. Not through dramatic speeches in court.
            Not through emotional outrage. Through discovery — the process of legally obtaining information
            from the other side and third parties.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Interrogatories</h3>
              <p className="text-gray-600 text-sm">Written questions the other side must answer under oath. Use them to expose income, assets, living arrangements, and child-related changes.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Requests for Production</h3>
              <p className="text-gray-600 text-sm">Demand bank records, tax returns, phone records, emails, texts, and financial documents. If it exists and it is relevant, you can usually get it.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Subpoenas</h3>
              <p className="text-gray-600 text-sm">Get records directly from banks, employers, and third parties when the other side won&apos;t produce them voluntarily.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Requests for Admissions</h3>
              <p className="text-gray-600 text-sm">Force the other side to admit or deny specific facts. Unanswered admissions are automatically deemed admitted in most jurisdictions.</p>
            </div>
          </div>
        </section>

        {/* Motions to Compel */}
        <section id="motions">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Motions to Compel Discovery</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            When the other side refuses to answer discovery in good faith, do not wait around hoping cooperation
            suddenly appears. File the motion. Immediately.
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            The standard is simple: if the information you are seeking is reasonably calculated to lead to
            admissible evidence, you are entitled to it. When the other side stalls, dodges, or hides behind
            meaningless objections — move to compel.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-4">Escalation ladder:</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="bg-blue-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <div className="font-medium text-gray-800">Serve discovery requests</div>
                  <div className="text-gray-600 text-sm">The other side has a deadline to respond (usually 30 days)</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <div className="font-medium text-gray-800">Good faith letter</div>
                  <div className="text-gray-600 text-sm">Write to opposing party identifying deficient responses — this is usually required before you can file</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
                <div>
                  <div className="font-medium text-gray-800">Motion to compel</div>
                  <div className="text-gray-600 text-sm">File it. Set it for hearing. Support with a memorandum showing what was asked and what was refused.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-red-700 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">4</div>
                <div>
                  <div className="font-medium text-gray-800">Motion for contempt / show cause</div>
                  <div className="text-gray-600 text-sm">If the court orders compliance and the other side still refuses — escalate. This is where real consequences begin.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
            <p className="text-yellow-800 text-sm">
              <strong>Watch out:</strong> Sometimes the biggest obstacle is not the spouse — it is the lawyer
              deliberately slowing things down. The answer is not passive frustration. The answer is motion practice.
            </p>
          </div>
        </section>

        {/* Enforcement */}
        <section id="enforcement">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Enforcing Court Orders</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            A court order is only as powerful as your willingness to enforce it. If the other side is violating
            a custody order, a support order, or any provision of your final judgment — you have remedies.
          </p>

          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Motion for Contempt</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                When the other party knowingly violates a court order. If proven, the court can impose sanctions,
                fines, make-up time, and in serious cases — incarceration. File it, document the violations,
                and bring your proof.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Motion to Show Cause</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Requires the other party to appear in court and explain why they should not be held in contempt.
                Shifts the burden onto them. Often the act of filing is enough to force compliance.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Motion to Modify</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                When circumstances have genuinely changed — income, living situation, child&apos;s needs — you can
                ask the court to update the order. Requires showing a substantial change in circumstances.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
            <p className="text-blue-800 text-sm">
              Document every violation. Date, time, what happened, who witnessed it. A pattern of documented
              violations is far more powerful in court than a single incident reported from memory.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-blue-900 rounded-2xl p-10 text-center text-white">
          <h2 className="text-2xl font-bold mb-4">Ready to Build Your Case?</h2>
          <p className="text-blue-200 mb-6 max-w-xl mx-auto">
            My Court Guide gives you AI legal research, document vaults, court templates, and the
            tools to fight — all in one place. No lawyer required.
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/signup" className="bg-white text-blue-900 px-6 py-3 rounded-lg font-bold hover:bg-blue-50">
              Start Free Today
            </a>
            <a href="/guides" className="border-2 border-blue-400 text-blue-200 px-6 py-3 rounded-lg font-medium hover:border-white hover:text-white">
              Read More Guides
            </a>
          </div>
        </section>

      </article>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 px-6 py-12">
        <div className="max-w-6xl mx-auto grid grid-cols-4 gap-8">
          <div>
            <h4 className="text-white font-bold mb-4">My Court Guide</h4>
            <p className="text-sm">Built by a parent who fought for 12 years. Built for every parent fighting today.</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/dashboard" className="hover:text-white">Dashboard</a></li>
              <li><a href="/vaults" className="hover:text-white">Case Vaults</a></li>
              <li><a href="/ai-assistant" className="hover:text-white">AI Assistant</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/guides" className="hover:text-white">How-To Guides</a></li>
              <li><a href="/guides/family-court" className="hover:text-white">Family Court Guide</a></li>
              <li><a href="/state-guides" className="hover:text-white">State Guides</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/disclaimer" className="hover:text-white">Legal Disclaimer</a></li>
              <li><a href="/privacy" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-white">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-gray-800 text-center text-sm">
          <p>© 2026 My Court Guide. This platform provides legal information, not legal advice. Always consult a licensed attorney in your state.</p>
        </div>
      </footer>

    </main>
  );
}

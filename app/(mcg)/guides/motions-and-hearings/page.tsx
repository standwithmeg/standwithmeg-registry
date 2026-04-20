import Link from "next/link";

export default function MotionsAndHearingsGuide() {
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
          <strong>Legal Information, Not Legal Advice.</strong> This guide provides general legal information only. Court rules vary by jurisdiction. Consult a licensed attorney for advice about your specific case.
        </p>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-blue-700 text-white px-6 py-16 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="text-blue-300 text-sm font-medium mb-3 uppercase tracking-wide">Free Guide</div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">Motions &amp; Hearings</h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            How to move the court, what to file, how to prepare for a hearing, and what happens
            when the other side ignores an order. Practical and direct.
          </p>
        </div>
      </section>

      {/* Jump Links */}
      <section className="bg-blue-50 border-b border-blue-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-4 text-sm text-blue-700 font-medium justify-center">
          <a href="#what-is-a-motion" className="hover:text-blue-900">What Is a Motion</a>
          <span className="text-blue-300">·</span>
          <a href="#spoken-motions" className="hover:text-blue-900">Spoken Motions</a>
          <span className="text-blue-300">·</span>
          <a href="#written-motions" className="hover:text-blue-900">Written Motions</a>
          <span className="text-blue-300">·</span>
          <a href="#motion-structure" className="hover:text-blue-900">Motion Structure</a>
          <span className="text-blue-300">·</span>
          <a href="#hearings" className="hover:text-blue-900">Hearings</a>
          <span className="text-blue-300">·</span>
          <a href="#contempt" className="hover:text-blue-900">Contempt Power</a>
          <span className="text-blue-300">·</span>
          <a href="#common-motions" className="hover:text-blue-900">Common Motions</a>
        </div>
      </section>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-16 space-y-16">

        {/* What Is a Motion */}
        <section id="what-is-a-motion">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">What Is a Motion</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Every case is headed toward one thing: a court order. That is the point.
            Judges do not act until someone moves them to act. That procedural tool is a motion.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="font-bold text-red-800 mb-1 text-sm">Not a motion:</div>
              <p className="text-red-700 text-sm">A pleading</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="font-bold text-red-800 mb-1 text-sm">Not a motion:</div>
              <p className="text-red-700 text-sm">A suggestion</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="font-bold text-red-800 mb-1 text-sm">Not a motion:</div>
              <p className="text-red-700 text-sm">A wish</p>
            </div>
          </div>

          <div className="bg-blue-900 text-white rounded-xl p-6 mb-6">
            <p className="text-lg font-medium leading-relaxed">
              A motion is the procedural tool used to move the court toward an order.
              If you do not move the court, your opponent will — and then you are reacting from behind.
            </p>
          </div>

          <p className="text-gray-700 leading-relaxed">
            You are not required to act like a timid person asking permission to exist in the room.
            You are there to move the case forward. Clarity is stronger than submission theater.
          </p>
        </section>

        {/* Spoken Motions */}
        <section id="spoken-motions">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Spoken Motions</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            In the courtroom, some motions are made out loud, on your feet, in real time. They do not
            need to feel mystical. You are asking the court to do something specific. That is it.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-4">Common in-court oral motions:</h3>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">→</span> Motion to exclude improper evidence or testimony</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">→</span> Motion to take judicial notice of a fact</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">→</span> Motion to strike testimony that shouldn&apos;t be in the record</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">→</span> Motion for a continuance (to reschedule)</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">→</span> Motion to disqualify counsel with a conflict</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-0.5">→</span> Motion for a directed verdict (after the other side&apos;s evidence)</li>
            </ul>
          </div>

          <p className="text-gray-700 leading-relaxed">
            Creativity is allowed — so long as what you are asking for is reasonable, connected to the case,
            and within the rules. The ask can be ordinary. Sometimes it is creative. Both are fine.
          </p>
        </section>

        {/* Written Motions */}
        <section id="written-motions">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Written Motions</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Written motions are the more formal version of the same thing — a direct request to the court
            for a specific order. The court should be able to read the title and opening lines and know
            exactly what you want and why you say you are entitled to it.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-3">Standard written motion contains:</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-start gap-3">
                <span className="bg-blue-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <div><strong>Caption</strong> — the court name, case number, and parties (same as your other filings)</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-blue-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <div><strong>Title</strong> — names the specific motion (e.g., &quot;MOTION TO COMPEL DISCOVERY&quot;)</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-blue-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <div><strong>Preamble</strong> — one sentence stating who is moving and what order is sought</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-blue-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">4</span>
                <div><strong>Numbered grounds</strong> — the facts that support your request, one per paragraph</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-blue-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">5</span>
                <div><strong>WHEREFORE clause</strong> — the exact order you want the court to enter</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-blue-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">6</span>
                <div><strong>Signature + certificate of service</strong> — your signature and proof you served the other side</div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
            <p className="text-blue-800 text-sm">
              <strong>State vs. federal:</strong> In federal court, motions are usually supported by separate written memoranda. In state court, motions are often argued at hearings. The rule changes by court — but the functional truth doesn&apos;t: a motion by itself means nothing until the judge rules on it. Push for rulings.
            </p>
          </div>
        </section>

        {/* Motion Structure Example */}
        <section id="motion-structure">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">What a Motion Actually Looks Like</h2>

          <p className="text-gray-700 leading-relaxed mb-6">
            Here is a stripped-down example of a motion to recuse a judge — one of the most powerful
            motions a pro se litigant can file when a judge has a conflict of interest.
          </p>

          <div className="bg-gray-900 text-gray-100 rounded-xl p-6 font-mono text-sm leading-relaxed mb-6 overflow-x-auto">
            <p className="mb-2">IN THE [CIRCUIT COURT NAME]</p>
            <p className="mb-2">Case No. [Your Case Number]</p>
            <p className="mb-4">Judge [Name]</p>
            <p className="mb-2">[YOUR NAME], Plaintiff,</p>
            <p className="mb-4">v.</p>
            <p className="mb-6">[OTHER PARTY], Defendant.</p>
            <p className="mb-4 font-bold text-white">MOTION TO RECUSE</p>
            <p className="mb-4">Plaintiff [Your Name] moves this Honorable Court for an Order recusing the assigned judge and assigning a new judge, stating in support:</p>
            <p className="mb-1">1. Judge [Name] has both an economic and personal relationship to Defendant.</p>
            <p className="mb-1">2. [Specific fact establishing the conflict.]</p>
            <p className="mb-1">3. [Specific fact showing financial or personal interest in outcome.]</p>
            <p className="mb-4">4. Judge [Name] has an impermissible interest in the outcome of this case.</p>
            <p className="mb-4">WHEREFORE, Plaintiff moves this Honorable Court to enter an Order disqualifying and recusing Judge [Name] and assigning a disinterested judge with authority to rule in this proceeding.</p>
            <p className="mb-1">RESPECTFULLY SUBMITTED this ___ day of ____________ 20___.</p>
            <p className="mb-4">______________________________</p>
            <p>[Your Name], Pro Se</p>
            <p>[Certificate of Service]</p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
            <p className="text-yellow-800 text-sm">
              <strong>When the issue is complex:</strong> add citations to legal authority in your numbered grounds.
              A motion to reconsider, for example, should cite the rule or case law that allows reconsideration
              and explain exactly what material fact or legal error the court missed.
            </p>
          </div>
        </section>

        {/* Hearings */}
        <section id="hearings">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Hearings: The Right to Be Heard</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            No just court should rule without hearing both sides. That is not a suggestion — it is a
            foundational principle of due process. Each side gets a structured opportunity to put its
            facts and law before the court within the rules.
          </p>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">Before the hearing</h3>
              <ul className="space-y-1 text-gray-600 text-sm">
                <li>→ File your motion and set it for hearing</li>
                <li>→ Serve the other side and court properly</li>
                <li>→ Prepare a short outline of your argument</li>
                <li>→ Know the exact order you want entered</li>
                <li>→ Bring copies of supporting documents</li>
              </ul>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-2">At the hearing</h3>
              <ul className="space-y-1 text-gray-600 text-sm">
                <li>→ State your name and that you are pro se</li>
                <li>→ Address the judge as &quot;Your Honor&quot;</li>
                <li>→ State what order you are seeking first</li>
                <li>→ Give your factual grounds in order</li>
                <li>→ Ask the court to rule before you leave</li>
              </ul>
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg mb-6">
            <p className="text-blue-800 text-sm">
              <strong>Critical:</strong> A motion with no ruling is just paper. If the judge does not rule
              at the hearing, follow up in writing. Ask when the order will be entered. Do not let motions
              sit unresolved — an unruled motion gives you nothing.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="font-bold text-blue-900 mb-3">Drafting the proposed order yourself</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              In many courts you can — and should — bring a proposed order to the hearing. Draft it in advance
              with the exact relief you want. If the judge rules in your favor, you hand up the draft. Courts
              often sign a well-drafted proposed order on the spot. This puts the language in your hands, not
              opposing counsel&apos;s.
            </p>
          </div>
        </section>

        {/* Contempt */}
        <section id="contempt">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Contempt Power: Why Orders Have Teeth</h2>

          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            Orders matter because of contempt power. Once a court enters an order commanding someone
            to act, disobedience is no longer just frustrating — it becomes punishable. That is why
            you fight for orders. That is why motions matter.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">💰</div>
              <div className="font-bold text-red-800 text-sm mb-1">Fines</div>
              <p className="text-red-700 text-xs">Daily or per-violation fines for non-compliance</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">⚖️</div>
              <div className="font-bold text-red-800 text-sm mb-1">Default</div>
              <p className="text-red-700 text-xs">Court may rule against the non-complying party outright</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <div className="text-2xl mb-2">🔒</div>
              <div className="font-bold text-red-800 text-sm mb-1">Incarceration</div>
              <p className="text-red-700 text-xs">Jail is a real outcome for serious contempt</p>
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-6">
            That is why the party who knows how to move the court has real leverage the other side
            may not be ready for. Contempt power is what turns paper orders into real consequences.
          </p>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="font-bold text-blue-900 mb-3">How to file a motion for contempt</h3>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start gap-3">
                <span className="bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <div>Identify the specific order that was violated — cite the order date and case number</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <div>Document each violation with dates, times, and evidence</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <div>File a Motion for Contempt or Motion to Show Cause — some courts use different names</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">4</span>
                <div>In the WHEREFORE clause, ask for: compliance, sanctions, attorney&apos;s fees if applicable, and any make-up relief (such as make-up parenting time)</div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">5</span>
                <div>Set it for hearing — and bring your documented evidence with you</div>
              </div>
            </div>
          </div>
        </section>

        {/* Common Motions Reference */}
        <section id="common-motions">
          <h2 className="text-3xl font-bold text-blue-900 mb-6">Common Motions — Quick Reference</h2>

          <p className="text-gray-700 leading-relaxed mb-6">
            These are the motions most commonly used by pro se litigants in family court and civil cases.
            Each one forces the court to act on a specific issue.
          </p>

          <div className="space-y-3">
            {[
              { name: "Motion to Compel", use: "Force the other side to answer discovery they have ignored or stonewalled." },
              { name: "Motion for Contempt", use: "Enforce a court order that is being violated. Brings consequences." },
              { name: "Motion to Show Cause", use: "Require the other party to appear and explain why they are not in contempt. Shifts burden to them." },
              { name: "Motion to Recuse", use: "Remove a judge who has a conflict of interest or bias in your case." },
              { name: "Motion to Strike", use: "Remove improper material from a pleading or the record." },
              { name: "Motion to Reconsider", use: "Ask the court to reverse a ruling based on a factual or legal error." },
              { name: "Motion for Summary Judgment", use: "Ask the court to rule in your favor before trial when there are no disputed facts." },
              { name: "Motion in Limine", use: "Block improper evidence from being presented at trial before trial begins." },
              { name: "Motion to Modify", use: "Change an existing custody, support, or other order when circumstances have changed." },
              { name: "Motion for Continuance", use: "Postpone a hearing or deadline — requires good cause shown." },
            ].map((m) => (
              <div key={m.name} className="bg-gray-50 rounded-xl p-4 flex gap-4">
                <div className="font-bold text-blue-900 text-sm w-48 flex-shrink-0">{m.name}</div>
                <div className="text-gray-600 text-sm">{m.use}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-blue-900 rounded-2xl p-10 text-center text-white">
          <h2 className="text-2xl font-bold mb-4">Ready to File?</h2>
          <p className="text-blue-200 mb-6 max-w-xl mx-auto">
            My Court Guide gives you AI legal research, court templates, document vaults, and
            the tools to move your case forward — all in one place.
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/signup" className="bg-white text-blue-900 px-6 py-3 rounded-lg font-bold hover:bg-blue-50">
              Get Early Access
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
              <li><a href="/guides" className="hover:text-white">All Guides</a></li>
              <li><a href="/guides/family-court" className="hover:text-white">Family Court</a></li>
              <li><a href="/guides/motions-and-hearings" className="hover:text-white">Motions &amp; Hearings</a></li>
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

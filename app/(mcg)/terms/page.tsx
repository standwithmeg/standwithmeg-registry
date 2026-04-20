import Link from "next/link";

export default function Terms() {
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
          <h1 className="text-4xl font-bold text-blue-900 mb-4">Terms of Service</h1>
          <p className="text-gray-500 text-sm">Last updated: March 2026</p>
        </div>

        <div className="space-y-8 text-gray-700">

          <p className="text-lg leading-relaxed">
            These terms govern your use of My Court Guide. By creating an account or using the platform,
            you agree to them. Please read them. They are written to be understood, not to hide anything.
          </p>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">What My Court Guide Is</h2>
            <p className="leading-relaxed mb-4">
              My Court Guide is a legal information platform. It provides guides, document templates,
              AI-assisted research, and organizational tools to help individuals navigate the legal
              system as pro se litigants.
            </p>
            <p className="leading-relaxed">
              It is not a law firm. It does not provide legal advice. It does not create an
              attorney-client relationship. See our <a href="/disclaimer" className="text-blue-700 underline">Legal Disclaimer</a> for the full explanation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Your Account</h2>
            <ul className="space-y-3 text-sm leading-relaxed">
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> You must be 18 or older to create an account.</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> You are responsible for keeping your login credentials secure.</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> You are responsible for all activity that occurs under your account.</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> One account per person. Shared accounts are not permitted.</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> You may delete your account at any time from your account settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Acceptable Use</h2>
            <p className="leading-relaxed mb-4">
              My Court Guide is built to help people who are fighting for themselves in court. Use it
              for that purpose. You agree not to:
            </p>
            <ul className="space-y-2 text-sm leading-relaxed">
              <li className="flex items-start gap-2"><span className="text-red-500 mt-1">✗</span> Use the platform to harass, threaten, or harm any individual</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-1">✗</span> Use the AI assistant to generate fraudulent legal documents intended to deceive a court</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-1">✗</span> Attempt to reverse-engineer, scrape, or copy the platform&apos;s content or systems</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-1">✗</span> Upload content that infringes on third-party intellectual property rights</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-1">✗</span> Share your account access with others or resell access to the platform</li>
              <li className="flex items-start gap-2"><span className="text-red-500 mt-1">✗</span> Use the platform for any unlawful purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Your Content</h2>
            <p className="leading-relaxed mb-4">
              Documents and content you upload to the platform remain yours. You own them. By uploading
              them, you grant My Court Guide a limited license to store and process them solely for
              the purpose of providing the platform&apos;s features to you.
            </p>
            <p className="leading-relaxed">
              We do not claim ownership of your case documents, notes, or uploaded files.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">AI-Generated Content</h2>
            <p className="leading-relaxed mb-4">
              The AI assistant generates responses based on your questions and publicly available
              legal information. AI-generated content — including suggested document language,
              case law summaries, and legal explanations — is provided for informational purposes only.
            </p>
            <p className="leading-relaxed">
              You are solely responsible for reviewing AI-generated content before relying on it or
              filing anything with a court. We are not liable for errors, omissions, or inaccuracies
              in AI-generated responses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Document Templates</h2>
            <p className="leading-relaxed">
              Templates provided on this platform are general starting points based on common legal
              forms. They are not tailored legal advice. Court filing requirements, formatting rules,
              and procedural requirements vary by jurisdiction. You are responsible for verifying
              that any document you file complies with the specific rules of your court.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Subscription and Billing</h2>
            <p className="leading-relaxed mb-4">
              Some features of My Court Guide require a paid subscription. Subscription fees are charged
              on a monthly basis. You may cancel your subscription at any time, and cancellation takes
              effect at the end of the current billing period — you will not be charged again after that.
            </p>
            <p className="leading-relaxed">
              We do not offer refunds for partial subscription periods. If you believe you were charged
              in error, contact us within 30 days and we will review it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Platform Availability</h2>
            <p className="leading-relaxed">
              We aim to keep My Court Guide available and reliable, but we do not guarantee uninterrupted
              uptime. We may need to perform maintenance, update systems, or respond to technical issues
              that temporarily limit access. We will not be liable for losses caused by temporary
              unavailability of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Limitation of Liability</h2>
            <p className="leading-relaxed mb-4">
              My Court Guide is provided &quot;as is.&quot; We make no warranties, express or implied, about
              the accuracy, completeness, or fitness for purpose of any content on the platform.
            </p>
            <p className="leading-relaxed">
              To the fullest extent permitted by law, My Court Guide and its founders, employees, and
              affiliates are not liable for any legal outcomes, court decisions, damages, or losses
              resulting from your use of the platform or reliance on any content it provides.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Termination</h2>
            <p className="leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these terms, engage
              in abuse, or use the platform in ways that harm other users or the platform itself. If
              we terminate your account for cause, we will make reasonable efforts to notify you and
              give you access to export your documents before access is removed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Changes to These Terms</h2>
            <p className="leading-relaxed">
              We may update these terms as the platform grows. Material changes will be communicated
              by email or platform notice before they take effect. Continuing to use the platform
              after updated terms are posted means you accept the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Governing Law</h2>
            <p className="leading-relaxed">
              These terms are governed by the laws of the United States and the state in which
              My Court Guide is incorporated. Any disputes will be resolved in the courts of
              that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Contact</h2>
            <p className="leading-relaxed">
              Questions about these terms? Email us at{' '}
              <span className="text-blue-700 font-medium">legal@standwithmeg.com</span>.
            </p>
          </section>

        </div>
      </div>

      <footer className="bg-gray-900 text-gray-400 px-6 py-8 mt-16">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-between gap-4 text-sm">
          <p>© 2026 My Court Guide. Legal information, not legal advice.</p>
          <div className="flex gap-4">
            <a href="/disclaimer" className="hover:text-white">Disclaimer</a>
            <a href="/privacy" className="hover:text-white">Privacy</a>
            <a href="/terms" className="text-white">Terms</a>
          </div>
        </div>
      </footer>

    </main>
  );
}

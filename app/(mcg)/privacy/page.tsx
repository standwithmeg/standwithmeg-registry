import Link from "next/link";

export default function Privacy() {
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
          <h1 className="text-4xl font-bold text-blue-900 mb-4">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: March 2026</p>
        </div>

        <div className="space-y-8 text-gray-700">

          <p className="text-lg leading-relaxed">
            We know that what you share on this platform is sensitive. You are dealing with your family,
            your children, and your legal situation. We take that seriously. This policy explains plainly
            what we collect, why we collect it, and how we protect it.
          </p>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">What We Collect</h2>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-bold text-gray-800 mb-2">Account Information</h3>
                <p className="text-sm leading-relaxed">
                  When you create an account, we collect your email address and a password (stored as a
                  secure hash — we never see your actual password). We may ask for your name and state
                  to help personalize your experience.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-bold text-gray-800 mb-2">Documents You Upload</h3>
                <p className="text-sm leading-relaxed">
                  If you upload documents to a case vault, those files are stored in your account and
                  associated with your user ID. We do not read, analyze, or share your uploaded documents
                  except to provide the storage and retrieval features of the platform, or unless you
                  explicitly use the AI assistant to analyze a document you have uploaded.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-bold text-gray-800 mb-2">AI Conversations</h3>
                <p className="text-sm leading-relaxed">
                  When you use the AI assistant or Court Coach, your questions and the AI responses are
                  processed to generate answers. Conversations may be stored to support features like
                  conversation history. We do not sell or share your AI conversation content with
                  third parties for advertising purposes.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-5">
                <h3 className="font-bold text-gray-800 mb-2">Usage Data</h3>
                <p className="text-sm leading-relaxed">
                  We collect basic usage information — which pages you visit, features you use, and
                  general interaction patterns. This helps us understand how the platform is being used
                  so we can improve it. We do not track your behavior across other websites.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">How We Use Your Information</h2>
            <ul className="space-y-2 text-sm leading-relaxed">
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> To provide and maintain the platform features you use</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> To authenticate your identity when you log in</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> To store and retrieve your documents and case vault content</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> To generate AI responses to your questions using the content you provide</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> To send you product updates or account notices (you can opt out of marketing emails)</li>
              <li className="flex items-start gap-2"><span className="text-blue-600 mt-1">→</span> To improve the platform based on aggregate usage patterns</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Third-Party Services</h2>
            <p className="leading-relaxed mb-4">
              My Court Guide integrates with the following external services to deliver its core functionality:
            </p>
            <div className="space-y-3">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-medium text-gray-800 mb-1">CourtListener (Free Law Project)</div>
                <p className="text-sm text-gray-600">Used to retrieve publicly available court opinions and case law. When you search for case law, your query is sent to CourtListener. No personal information is shared in these requests.</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-medium text-gray-800 mb-1">GovInfo (U.S. Government Publishing Office)</div>
                <p className="text-sm text-gray-600">Used to retrieve publicly available federal statutes and regulations. Your queries are sent to GovInfo. No personal information is shared in these requests.</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-medium text-gray-800 mb-1">Anthropic (AI Provider)</div>
                <p className="text-sm text-gray-600">AI responses are generated using Anthropic&apos;s Claude models. Content you send to the AI assistant is processed by Anthropic&apos;s API under their usage policies. We recommend not including sensitive identifying information (full names, Social Security numbers, case numbers) in AI queries unless necessary.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Data Security</h2>
            <p className="leading-relaxed mb-4">
              We use industry-standard security practices including encrypted storage and secure
              transmission (HTTPS) for all data on the platform. Passwords are never stored in
              plain text.
            </p>
            <p className="leading-relaxed">
              No system is perfectly secure. If you become aware of a security concern related to your
              account or our platform, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">We Do Not Sell Your Data</h2>
            <p className="leading-relaxed">
              We do not sell, rent, or trade your personal information or your document content to
              third parties. Full stop.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Your Rights</h2>
            <p className="leading-relaxed mb-4">
              You can request a copy of the personal information we hold about you, ask us to correct
              inaccurate information, or request deletion of your account and associated data.
              To make any of these requests, contact us at the email listed below.
            </p>
            <p className="leading-relaxed">
              If you delete your account, we will remove your personal information and document content
              from active storage. Some information may remain in backups for a limited period before
              full deletion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Children</h2>
            <p className="leading-relaxed">
              My Court Guide is intended for adults. We do not knowingly collect personal information
              from anyone under the age of 18. If you believe a minor has created an account, contact
              us and we will remove it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update this policy as the platform evolves. If we make material changes, we will
              notify users by email or by a notice on the platform before the changes take effect.
              Continued use of the platform after changes are posted constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-blue-900 mb-3">Contact</h2>
            <p className="leading-relaxed">
              Questions about this policy or your data? Email us at{' '}
              <span className="text-blue-700 font-medium">privacy@standwithmeg.com</span>.
            </p>
          </section>

        </div>
      </div>

      <footer className="bg-gray-900 text-gray-400 px-6 py-8 mt-16">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-between gap-4 text-sm">
          <p>© 2026 My Court Guide. Legal information, not legal advice.</p>
          <div className="flex gap-4">
            <a href="/disclaimer" className="hover:text-white">Disclaimer</a>
            <a href="/privacy" className="text-white">Privacy</a>
            <a href="/terms" className="hover:text-white">Terms</a>
          </div>
        </div>
      </footer>

    </main>
  );
}

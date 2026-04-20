"use client";

import { useState } from "react";
import Link from "next/link";

const SITUATIONS = [
  { id: "addressing_judge", label: "Addressing the Judge", icon: "⚖️", desc: "How to speak to the judge correctly" },
  { id: "opening_statement", label: "Opening Statement", icon: "🎤", desc: "What to say at the start of your hearing" },
  { id: "objection", label: "Making an Objection", icon: "✋", desc: "How to object to evidence or testimony" },
  { id: "cross_examination", label: "Cross-Examining a Witness", icon: "❓", desc: "How to question the other side's witnesses" },
  { id: "affirmative_defense", label: "Affirmative Defenses", icon: "🛡️", desc: "How to fight back — not just react" },
  { id: "custody_hearing", label: "Custody Hearing", icon: "👨‍👩‍👧", desc: "What to say at a custody or visitation hearing" },
  { id: "dcf_hearing", label: "DCF / Child Welfare Hearing", icon: "🏛️", desc: "What to say when DCF or CPS is involved" },
  { id: "contempt_hearing", label: "Contempt Hearing", icon: "⚠️", desc: "What to say if someone violated a court order" },
  { id: "closing_argument", label: "Closing Argument", icon: "🔚", desc: "How to finish your case powerfully" },
  { id: "responding_to_motion", label: "Responding to a Motion", icon: "📋", desc: "What to say when the other side files a motion" },
  { id: "emergency_motion", label: "Emergency / TRO Hearing", icon: "🚨", desc: "What to say in an emergency hearing" },
  { id: "summary_judgment", label: "Summary Judgment Hearing", icon: "📜", desc: "What to say at a summary judgment hearing" },
];

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming"
];

export default function CourtCoach() {
  const [step, setStep] = useState(1);
  const [selectedSituation, setSelectedSituation] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [caseType, setCaseType] = useState("");
  const [userSituation, setUserSituation] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceHistory, setPracticeHistory] = useState<{role: string, text: string}[]>([]);

  const handleGetScript = async () => {
    setLoading(true);
    setStep(4);
    try {
      const res = await fetch("/api/court-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: selectedSituation, state: selectedState, caseType, userSituation }),
      });
      const data = await res.json();
      setResponse(data.response || data.error || "No response received.");
    } catch {
      setResponse("Failed to load scripts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const currentSituation = SITUATIONS.find(s => s.id === selectedSituation);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-blue-900 text-white px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-300 text-sm hover:text-white mb-4 inline-block">← Back to Platform</Link>
          <h1 className="text-4xl font-bold mb-2">🎤 Courtroom Coach</h1>
          <p className="text-blue-200 text-lg">
            Tell me your situation. I&apos;ll tell you exactly what to say — word for word.
          </p>
          <p className="text-blue-300 text-sm mt-2">
            Built from 12 years of real courtroom experience. Not theory. Real scripts that work.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Step 1: Pick Your Situation */}
        {step >= 1 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-blue-900 mb-2">Step 1: What&apos;s your situation?</h2>
            <p className="text-gray-600 mb-6">Pick the closest match to what you&apos;re facing in court.</p>
            <div className="grid grid-cols-2 gap-4">
              {SITUATIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSituation(s.id); if (step === 1) setStep(2); }}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selectedSituation === s.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-blue-300"
                  }`}
                >
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="font-bold text-gray-800 text-sm">{s.label}</div>
                  <div className="text-gray-500 text-xs mt-1">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Your State + Case Info */}
        {step >= 2 && selectedSituation && (
          <div className="mb-10 bg-white rounded-2xl p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-blue-900 mb-6">Step 2: Tell me about your case</h2>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your State</label>
                <select
                  value={selectedState}
                  onChange={e => setSelectedState(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select your state...</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Case Type</label>
                <select
                  value={caseType}
                  onChange={e => setCaseType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select case type...</option>
                  <option value="family_court">Family Court / Custody</option>
                  <option value="dcf_cps">DCF / CPS / Child Welfare</option>
                  <option value="divorce">Divorce</option>
                  <option value="civil">Civil Case</option>
                  <option value="criminal">Criminal Defense</option>
                  <option value="bankruptcy">Bankruptcy</option>
                  <option value="housing">Housing / Eviction</option>
                </select>
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe your specific situation <span className="text-gray-400">(the more detail, the better the script)</span>
              </label>
              <textarea
                value={userSituation}
                onChange={e => setUserSituation(e.target.value)}
                placeholder="Example: I am the mother in a custody case. The other parent is alleging I denied visitation but I have text messages showing he cancelled himself. The hearing is next week and I need to know what to say when the judge asks me to respond..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-32 resize-none"
              />
            </div>
            <button
              onClick={() => { if (selectedState && caseType) { setStep(3); handleGetScript(); } }}
              disabled={!selectedState || !caseType}
              className="bg-blue-700 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Get My Court Scripts →
            </button>
          </div>
        )}

        {/* Step 3: Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4 animate-pulse">⚖️</div>
            <h3 className="text-xl font-bold text-blue-900 mb-2">Preparing your scripts...</h3>
            <p className="text-gray-600">Pulling from 12 years of courtroom knowledge + real case law</p>
          </div>
        )}

        {/* Step 4: Scripts */}
        {step >= 4 && !loading && response && currentSituation && (
          <div>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-8">
              <div className="bg-blue-900 text-white px-8 py-6">
                <div className="text-3xl mb-2">{currentSituation.icon}</div>
                <h2 className="text-2xl font-bold">{currentSituation.label}</h2>
                <p className="text-blue-200 text-sm mt-1">{selectedState} · {caseType.replace(/_/g, ' ')}</p>
              </div>

              {/* AI Scripts */}
              <div className="px-8 py-6">
                <h3 className="font-bold text-blue-900 text-lg mb-4">📜 Your Word-for-Word Scripts</h3>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">{response}</pre>
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(response)}
                  className="mt-4 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-3 py-1"
                >
                  📋 Copy all scripts
                </button>
              </div>

              {/* Key Cases */}
              <div className="bg-gray-50 border-t border-gray-200 px-8 py-6">
                <h3 className="font-bold text-gray-800 mb-3">⚖️ Cite These Cases If Relevant</h3>
                <div className="space-y-3">
                  {getRelevantCases(selectedSituation, caseType).map((c, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-bold text-blue-900">{c.name}</span>
                      <span className="text-gray-500">, {c.citation}</span>
                      <p className="text-gray-600 mt-1">{c.holding}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Practice Mode */}
            <div className="bg-white rounded-2xl border-2 border-blue-200 p-8 mb-8">
              <h3 className="text-xl font-bold text-blue-900 mb-2">🎭 Practice Mode</h3>
              <p className="text-gray-600 mb-6">
                Ready to rehearse? I&apos;ll play the judge and you practice what you&apos;d say.
                I&apos;ll give you feedback on your performance.
              </p>
              {!practiceMode ? (
                <button
                  onClick={() => {
                    setPracticeMode(true);
                    setPracticeHistory([{
                      role: "judge",
                      text: getPracticeOpener(selectedSituation, selectedState)
                    }]);
                  }}
                  className="bg-blue-700 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-800"
                >
                  Start Practice Session →
                </button>
              ) : (
                <div>
                  <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-4 max-h-80 overflow-y-auto">
                    {practiceHistory.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        <div className={`max-w-lg rounded-xl px-4 py-3 text-sm ${
                          msg.role === "judge"
                            ? "bg-blue-900 text-white"
                            : "bg-green-100 text-gray-800 border border-green-200"
                        }`}>
                          <div className="font-bold text-xs mb-1 opacity-75">
                            {msg.role === "judge" ? "👨‍⚖️ THE JUDGE" : "🗣️ YOU"}
                          </div>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <textarea
                      value={practiceInput}
                      onChange={e => setPracticeInput(e.target.value)}
                      placeholder="Type what you would say to the judge..."
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-20"
                    />
                    <button
                      onClick={async () => {
                        if (!practiceInput.trim()) return;
                        const userText = practiceInput;
                        setPracticeInput("");
                        const history = [...practiceHistory, { role: "user", text: userText }];
                        setPracticeHistory(history);
                        try {
                          const res = await fetch("/api/court-coach-practice", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              userInput: userText,
                              situation: selectedSituation,
                              state: selectedState,
                              conversationHistory: history.map(m => ({ role: m.role === "judge" ? "assistant" : "user", content: m.text })),
                            }),
                          });
                          const data = await res.json();
                          setPracticeHistory(prev => [...prev, { role: "judge", text: data.response || "I didn't catch that. Please continue." }]);
                        } catch {
                          setPracticeHistory(prev => [...prev, { role: "judge", text: "There was a connection issue. Please try again." }]);
                        }
                      }}
                      className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold self-end"
                    >
                      Say It
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              <strong>Important:</strong> These scripts are legal information, not legal advice. They are based on general principles and may need to be adapted for your specific jurisdiction and judge. Always verify the current rules of your court. Consult a licensed attorney in {selectedState} if possible before your hearing.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper functions for scripts data ────────────────────────────────────────

function getRelevantCases(situation: string, _caseType: string) {
  const cases = [
    { name: "Troxel v. Granville", citation: "530 U.S. 57 (2000)", holding: "Parents have a fundamental constitutional right to make decisions concerning the care, custody, and control of their children.", relevant: ["custody_hearing", "dcf_hearing", "affirmative_defense", "opening_statement"] },
    { name: "Santosky v. Kramer", citation: "455 U.S. 745 (1982)", holding: "Before a State may sever the parent-child relationship, it must support its allegations by at least clear and convincing evidence.", relevant: ["dcf_hearing", "affirmative_defense", "opening_statement", "closing_argument"] },
    { name: "Stanley v. Illinois", citation: "405 U.S. 645 (1972)", holding: "Parents have a protectable interest in their relationship with their children. Due process is required before that interest can be terminated.", relevant: ["dcf_hearing", "affirmative_defense"] },
    { name: "Meyer v. Nebraska", citation: "262 U.S. 390 (1923)", holding: "The right to raise children is a fundamental liberty interest protected by the 14th Amendment.", relevant: ["custody_hearing", "dcf_hearing", "opening_statement"] },
  ];
  return cases.filter(c => c.relevant.includes(situation)).slice(0, 3);
}

function getPracticeOpener(situation: string, state: string): string {
  const openers: Record<string, string> = {
    opening_statement: `This is the ${state} Family Court. We are here today on a motion to modify custody. The other party has completed their opening statement. You may proceed. State your name for the record and give your opening statement.`,
    custody_hearing: `Court is in session. We are here on a motion to modify visitation. I have reviewed the file. [Your name], you filed this motion. Tell me why I should grant it.`,
    dcf_hearing: `This is a shelter care hearing. The agency has presented their basis for removal. Parent, do you wish to be heard?`,
    objection: `Opposing counsel is examining their witness. They just asked: "And in your opinion, based on what the neighbor told you, do you believe the parent was neglectful?" — What do you do?`,
    contempt_hearing: `You've filed a motion for contempt. The other party is here. Tell me what happened and why you believe they are in contempt of my order.`,
    closing_argument: `We've completed all testimony and evidence. This is your opportunity for closing argument. You may proceed.`,
    addressing_judge: `The hearing is about to begin. I'm looking at you as you walk in. What do you say first?`,
  };
  return openers[situation] || `Court is in session in ${state}. You are appearing pro se. I'm ready to hear from you. Proceed.`;
}


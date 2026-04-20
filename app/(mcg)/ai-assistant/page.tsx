"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const CASE_TYPES = [
  { id: "family_court", label: "Family Court / Custody" },
  { id: "dcf_cps", label: "DCF / CPS / Child Welfare" },
  { id: "divorce", label: "Divorce" },
  { id: "child_support", label: "Child Support" },
  { id: "civil", label: "Civil Case" },
  { id: "bankruptcy", label: "Bankruptcy" },
  { id: "housing", label: "Housing / Eviction" },
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

const SUGGESTED = [
  "What does this order require me to do?",
  "Are there any deadlines I need to worry about?",
  "How do I respond to this?",
  "Can I file a motion based on what's in this document?",
  "What are my rights here?",
];

type Message = {
  role: "user" | "assistant";
  content: string;
};

type CaseContext = {
  situation: string;
  tried: string;
  obstacle: string;
  goal: string;
};

function AIAssistantInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState("");
  const [caseType, setCaseType] = useState("family_court");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<{name: string; text: string}[]>([]);
  const [setupDone, setSetupDone] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [caseContext, setCaseContext] = useState<CaseContext>({ situation: "", tried: "", obstacle: "", goal: "" });
  const autoSubmitDone = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasCaseContext = caseContext.situation.trim() || caseContext.obstacle.trim() || caseContext.goal.trim();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-submit question from ?q= URL parameter (e.g. from dashboard quick-ask)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSubmitDone.current) {
      autoSubmitDone.current = true;
      setSetupDone(true);
      setTimeout(() => sendMessage(q), 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError("");
    setUploadingFile(true);

    for (const file of Array.from(files)) {
      if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        const text = await file.text();
        setDocuments(prev => [...prev, { name: file.name, text }]);
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/extract-pdf", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || `Could not extract text from ${file.name}.`);
          } else {
            setDocuments(prev => [...prev, { name: `${file.name} (${data.pages} pages)`, text: data.text }]);
          }
        } catch {
          setError(`Could not read ${file.name}. Try pasting text instead.`);
        }
      } else {
        setError("Please upload .txt, .md, or .pdf files — or paste your document text below.");
      }
    }

    setUploadingFile(false);
    // Reset file input so the same file(s) can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (overrideInput?: string) => {
    const userMessage = (overrideInput || input).trim();
    if (!userMessage || loading) return;

    setInput("");
    setError("");
    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage,
          documentText: documents.length > 0 ? documents : undefined,
          caseContext: hasCaseContext ? caseContext : undefined,
          state,
          caseType,
          conversationHistory: messages.slice(-6),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages(newMessages); // keep user message, remove loading
    } finally {
      setLoading(false);
    }
  };

  // Setup screen — state + case type + document (skip if ?q= param present)
  if (!setupDone) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-900">My Court Guide</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Pro Se Legal Platform</span>
          </Link>
          <div className="flex gap-6 items-center">
            <a href="/guides" className="text-gray-600 hover:text-blue-900 text-sm">Guides</a>
            <a href="/court-coach" className="text-gray-600 hover:text-blue-900 text-sm">Court Coach</a>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-blue-900 mb-3">AI Document Assistant</h1>
            <p className="text-gray-600 max-w-lg mx-auto">
              Upload a court document and get a plain-English explanation, deadline flags,
              and help figuring out what to do next.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">

            {/* State + Case Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your State *</label>
                <select
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                >
                  <option value="">Select your state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Case Type *</label>
                <select
                  value={caseType}
                  onChange={e => setCaseType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                >
                  {CASE_TYPES.map(ct => <option key={ct.id} value={ct.id}>{ct.label}</option>)}
                </select>
              </div>
            </div>

            {/* Document Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Court Documents</label>

              {/* Uploaded files list */}
              {documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {documents.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">📄</span>
                        <span className="text-sm font-medium text-gray-800 truncate">{doc.name}</span>
                        <span className="text-xs text-green-600 flex-shrink-0">{doc.text.length.toLocaleString()} chars</span>
                      </div>
                      <button onClick={() => removeDocument(i)} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0 ml-2">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
              >
                {uploadingFile ? (
                  <div className="text-gray-500 text-sm">Extracting text...</div>
                ) : (
                  <div>
                    <div className="text-2xl mb-1">{documents.length > 0 ? "➕" : "📁"}</div>
                    <div className="text-gray-600 text-sm font-medium">
                      {documents.length > 0 ? "Add another document" : "Click to upload a PDF or text file"}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">PDF, TXT, or MD — court orders, motions, DCF reports, pleadings</div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={handleFileUpload}
                multiple
                className="hidden"
              />
            </div>

            {/* Paste option */}
            <details className="text-sm">
              <summary className="text-blue-600 cursor-pointer hover:text-blue-800 font-medium">
                Or paste document text directly
              </summary>
              <textarea
                id="paste-area"
                placeholder="Paste the text of your court document here, then click 'Add pasted text'..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 h-40 mt-3 resize-none"
              />
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("paste-area") as HTMLTextAreaElement;
                  if (el?.value.trim()) {
                    setDocuments(prev => [...prev, { name: `Pasted text (${prev.length + 1})`, text: el.value.trim() }]);
                    el.value = "";
                  }
                }}
                className="mt-2 text-sm bg-gray-100 border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-200"
              >
                Add pasted text
              </button>
            </details>

            {/* Case Context */}
            <details className="text-sm">
              <summary className="text-blue-600 cursor-pointer hover:text-blue-800 font-medium select-none">
                Tell me about your situation <span className="text-gray-400 font-normal">(optional — improves every answer)</span>
              </summary>
              <div className="mt-4 space-y-4 border border-blue-100 rounded-xl p-5 bg-blue-50">
                <p className="text-xs text-blue-700">Fill in what applies. The more context you give, the more targeted the analysis will be. Nothing is saved after you close this page.</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">What is happening in your case?</label>
                  <textarea
                    value={caseContext.situation}
                    onChange={e => setCaseContext(prev => ({ ...prev, situation: e.target.value }))}
                    placeholder="Describe the situation in plain English. Don't worry about legal language."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">What have you already tried?</label>
                  <textarea
                    value={caseContext.tried}
                    onChange={e => setCaseContext(prev => ({ ...prev, tried: e.target.value }))}
                    placeholder="What steps have you taken so far? What happened when you tried them?"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">What is your specific obstacle right now?</label>
                  <textarea
                    value={caseContext.obstacle}
                    onChange={e => setCaseContext(prev => ({ ...prev, obstacle: e.target.value }))}
                    placeholder="e.g. I can't find a supervisor to escalate to, my motions keep getting denied without explanation, I don't know if I need to file a response or wait."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">What outcome are you trying to reach?</label>
                  <textarea
                    value={caseContext.goal}
                    onChange={e => setCaseContext(prev => ({ ...prev, goal: e.target.value }))}
                    placeholder="What are you trying to accomplish? What would a win look like for you?"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
            </details>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-xs">
              <strong>Legal information, not legal advice.</strong> Your document is sent to the AI for analysis
              but is not stored permanently. We do not save your files or conversation after you close this page.
            </div>

            {/* Submit */}
            <button
              onClick={() => {
                if (!state) { setError("Please select your state."); return; }
                setSetupDone(true);
                if (documents.length > 0) {
                  setTimeout(() => {
                    sendMessage(`Please analyze ${documents.length > 1 ? "these documents together" : "this document"}. Explain what ${documents.length > 1 ? "each one" : "it"} means in plain English, flag any deadlines or obligations, and tell me what I should do next.`);
                  }, 100);
                }
              }}
              disabled={!state}
              className="w-full bg-blue-700 text-white py-3 rounded-xl font-bold text-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {documents.length > 0 ? `Analyze ${documents.length} Document${documents.length > 1 ? "s" : ""}` : "Start Without a Document"}
            </button>

            <p className="text-center text-xs text-gray-400">
              No account required. No data saved. You can also ask questions without uploading anything.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold text-blue-900">My Court Guide</Link>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">AI Assistant</span>
          {documents.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
              📄 {documents.length} doc{documents.length > 1 ? "s" : ""} loaded
            </span>
          )}
          {hasCaseContext && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full flex items-center gap-1">
              🗂 case context active
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{state} · {CASE_TYPES.find(c => c.id === caseType)?.label}</span>
          <button
            onClick={() => { setMessages([]); setSetupDone(false); setDocuments([]); setError(""); setCaseContext({ situation: "", tried: "", obstacle: "", goal: "" }); }}
            className="text-gray-400 hover:text-red-500"
          >
            New session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {messages.length === 0 && !loading && (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">⚖️</div>
              <h2 className="text-xl font-bold text-blue-900 mb-2">
                {documents.length > 0 ? "Analyzing your document..." : "Ask me anything about your case"}
              </h2>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                {documents.length > 0
                  ? "I'm reading your document and will give you a plain-English breakdown."
                  : "Ask a legal question, describe your situation, or upload a document to analyze."}
              </p>
              {documents.length === 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="bg-white border border-gray-200 text-gray-600 text-xs px-3 py-2 rounded-lg hover:border-blue-300 hover:text-blue-700 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-1">⚖️</div>
              )}
              <div className={`max-w-2xl ${msg.role === "user" ? "" : ""}`}>
                <div className={`rounded-2xl px-5 py-4 ${
                  msg.role === "user"
                    ? "bg-blue-700 text-white"
                    : "bg-white border border-gray-200 text-gray-800"
                }`}>
                  <div className="text-sm whitespace-pre-line leading-relaxed">{msg.content}</div>
                </div>
                {msg.role === "assistant" && (
                  <button
                    onClick={() => navigator.clipboard?.writeText(msg.content)}
                    className="text-xs text-gray-400 hover:text-blue-600 mt-1 ml-2"
                  >
                    Copy response
                  </button>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-gray-600 text-sm flex-shrink-0 mt-1">👤</div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-1">⚖️</div>
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                <div className="flex gap-2 items-center">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "0ms"}}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "150ms"}}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "300ms"}}></div>
                  <span className="text-xs text-gray-400 ml-2">
                    {messages.length === 0 ? "Reading your document and analyzing..." : "Thinking..."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              placeholder={messages.length === 0 && documents.length > 0
                ? "Ask a question about your document, or press Enter to start analysis..."
                : "Ask a follow-up question... (Enter to send, Shift+Enter for new line)"
              }
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed self-end"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Legal information, not legal advice. Nothing is saved after you close this page. Consult a licensed attorney in {state} if possible.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AIAssistant() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>}>
      <AIAssistantInner />
    </Suspense>
  );
}

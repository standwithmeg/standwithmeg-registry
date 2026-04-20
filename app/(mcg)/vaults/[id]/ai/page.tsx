"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultDetail = {
  id: string;
  name: string;
  type: string;
  state: string | null;
  county: string | null;
  court_name: string | null;
  case_number: string | null;
  judge_name: string | null;
  what_is_happening: string | null;
  what_tried: string | null;
  obstacle: string | null;
  desired_outcome: string | null;
  ai_instructions: string | null;
};

type VaultDoc = {
  id: string;
  name: string;
  type: string;
  size_bytes: number;
  extracted_text: string | null;
  uploaded_at: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  includedDocNames?: string[]; // attached to assistant messages — which docs were read for this answer
};

// A document added temporarily during this chat session — not persisted to vault unless user explicitly saves
type SessionDoc = {
  id: string; // temp client-generated UUID
  name: string;
  type: string;
  size_bytes: number;
  extracted_text: string;
  isSession: true;
  saveDecision: "pending" | "declined"; // "saved" added in Layer E
};

// ─── Constants ────────────────────────────────────────────────────────────────

const VAULT_TYPE_LABELS: Record<string, string> = {
  family_court: "Family Court / Custody",
  dcf_cps: "DCF / CPS / Child Welfare",
  divorce: "Divorce / Separation",
  child_support: "Child Support",
  civil: "Civil Case",
  bankruptcy: "Bankruptcy",
  housing: "Housing / Eviction",
  criminal: "Criminal Defense",
  school: "School / Education",
  custom: "Custom",
};

const VAULT_TYPE_ICONS: Record<string, string> = {
  family_court: "👨‍👩‍👧",
  dcf_cps: "🏛️",
  divorce: "📋",
  child_support: "💰",
  civil: "⚖️",
  bankruptcy: "📁",
  housing: "🏠",
  criminal: "🔒",
  school: "🎓",
  custom: "📂",
};

// Vault type → analyze route caseType mapping (they match already, but be explicit)
const VAULT_TYPE_TO_CASE_TYPE: Record<string, string> = {
  family_court: "family_court",
  dcf_cps: "dcf_cps",
  divorce: "divorce",
  child_support: "child_support",
  civil: "civil",
  bankruptcy: "bankruptcy",
  housing: "housing",
  criminal: "criminal",
  school: "school",
  custom: "civil", // federal lawsuits and other custom cases — civil gives better CourtListener behavior
};

const MAX_DOCS_TO_AI = 5; // send at most 5 docs per query to stay within context limits

// Only first N chars of each doc are used for relevance scoring — legal docs front-load key facts
const SCORE_TEXT_LIMIT = 5000;

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","was","are","were","be","been","this","that","it","its","i","my","me","we",
  "our","you","your","he","she","they","their","have","has","had","do","does","did",
  "will","would","can","could","should","may","might","what","how","when","where",
  "who","which","not","no","any","all","also","if","so","about","as","up","out",
  "than","then","there","use","used","using","more","just","than","then","very",
]);

// Score a document's relevance to a question using term-frequency overlap.
// Returns 0 if question has no scoreable tokens (caller should treat all docs as equal).
function scoreDocumentRelevance(question: string, name: string, text: string): number {
  const tokens = question.toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  if (tokens.length === 0) return 0;

  const haystack = (name + " " + text.slice(0, SCORE_TEXT_LIMIT)).toLowerCase();
  const nameOnly = name.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    let pos = 0, count = 0;
    while ((pos = haystack.indexOf(token, pos)) !== -1) { count++; pos += token.length; }
    if (count > 0) score += Math.log1p(count);
    if (nameOnly.includes(token)) score += 3; // name match is a strong signal
  }
  return score;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VaultAIPage() {
  const params = useParams();
  const vaultId = params.id as string;

  const [vault, setVault] = useState<VaultDetail | null>(null);
  const [allDocs, setAllDocs] = useState<VaultDoc[]>([]);
  const [sessionDocs, setSessionDocs] = useState<SessionDoc[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [pinnedDocIds, setPinnedDocIds] = useState<Set<string>>(new Set()); // pinned = always included regardless of score
  const [loadError, setLoadError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Save-to-vault state: tracks which session doc is currently being saved
  const [savingDocId, setSavingDocId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load vault + docs on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!vaultId) return;

    Promise.all([
      fetch(`/api/vaults/${vaultId}`).then(r => r.json()),
      fetch(`/api/vaults/${vaultId}/documents`).then(r => r.json()),
    ]).then(([vaultData, docsData]) => {
      if (vaultData.error || !vaultData.vault) {
        setLoadError("Vault not found. It may belong to a different account.");
        return;
      }
      setVault(vaultData.vault);

      const docs: VaultDoc[] = (docsData.documents ?? []).filter(
        (d: VaultDoc) => d.extracted_text && d.extracted_text.trim().length > 0
      );
      setAllDocs(docs);
      // Select all docs by default (up to MAX_DOCS_TO_AI)
      setSelectedDocIds(new Set(docs.slice(0, MAX_DOCS_TO_AI).map((d: VaultDoc) => d.id)));
    }).catch(() => {
      setLoadError("Failed to load vault. Please try again.");
    });
  }, [vaultId]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── Focus input once vault loads ─────────────────────────────────────────────
  useEffect(() => {
    if (vault) inputRef.current?.focus();
  }, [vault]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function toggleDoc(id: string) {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function buildCaseContext() {
    if (!vault) return undefined;
    // Only include fields that have actual content — never inject blank strings into the prompt
    const ctx: Record<string, string> = {};
    if (vault.what_is_happening?.trim()) ctx.situation = vault.what_is_happening.trim();
    if (vault.what_tried?.trim())        ctx.tried     = vault.what_tried.trim();
    if (vault.obstacle?.trim())          ctx.obstacle  = vault.obstacle.trim();
    if (vault.desired_outcome?.trim())   ctx.goal      = vault.desired_outcome.trim();
    return Object.keys(ctx).length > 0 ? ctx : undefined;
  }

  // Select the best MAX_DOCS_TO_AI documents for a given question.
  // Priority order: pinned (always in) → relevance-scored remaining slots.
  // Session docs are auto-pinned on upload, so they naturally come first.
  // Returns both the payload for the API and the names for the "Based on:" display.
  function selectDocuments(question: string): {
    documentText: { name: string; text: string }[] | undefined;
    includedNames: string[];
    includedIds: Set<string>;
  } {
    const allSelected: { id: string; name: string; extracted_text: string | null }[] = [
      ...sessionDocs.filter(d => selectedDocIds.has(d.id)),
      ...allDocs.filter(d => selectedDocIds.has(d.id)),
    ];

    if (allSelected.length === 0) return { documentText: undefined, includedNames: [], includedIds: new Set() };

    const pinned   = allSelected.filter(d => pinnedDocIds.has(d.id));
    const unpinned = allSelected.filter(d => !pinnedDocIds.has(d.id));

    // Pinned docs fill the front of the slot budget
    const pinnedCapped = pinned.slice(0, MAX_DOCS_TO_AI);
    const remaining = MAX_DOCS_TO_AI - pinnedCapped.length;

    let fillers: typeof allSelected;
    if (remaining <= 0 || unpinned.length === 0) {
      fillers = [];
    } else if (question.trim().length === 0 || unpinned.length <= remaining) {
      // No question or all fit — keep existing order (session-first already)
      fillers = unpinned.slice(0, remaining);
    } else {
      // Score and rank by relevance to the actual question
      fillers = [...unpinned]
        .map(d => ({ d, score: scoreDocumentRelevance(question, d.name, d.extracted_text ?? "") }))
        .sort((a, b) => b.score - a.score)
        .slice(0, remaining)
        .map(s => s.d);
    }

    const final = [...pinnedCapped, ...fillers];
    return {
      documentText: final.length > 0
        ? final.map(d => ({ name: d.name, text: d.extracted_text ?? "" }))
        : undefined,
      includedNames: final.map(d => d.name),
      includedIds: new Set(final.map(d => d.id)),
    };
  }

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-selected
    setUploadError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/extract", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");
      const newDoc: SessionDoc = {
        id: crypto.randomUUID(),
        name: data.name,
        type: data.type,
        size_bytes: data.sizeBytes,
        extracted_text: data.extractedText,
        isSession: true,
        saveDecision: "pending",
      };
      setSessionDocs(prev => [...prev, newDoc]);
      // Auto-select and auto-pin — a just-uploaded doc must always be included
      setSelectedDocIds(prev => { const next = new Set(prev); next.add(newDoc.id); return next; });
      setPinnedDocIds(prev => { const next = new Set(prev); next.add(newDoc.id); return next; });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, []);

  async function handleSaveToVault(sessionDocId: string) {
    const doc = sessionDocs.find(d => d.id === sessionDocId);
    if (!doc || !vaultId) return;
    setSavingDocId(sessionDocId);
    try {
      const res = await fetch(`/api/vaults/${vaultId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: doc.name,
          type: doc.type,
          sizeBytes: doc.size_bytes,
          extractedText: doc.extracted_text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");

      // Move from session to vault: add the persisted doc to allDocs, remove from sessionDocs
      const saved: VaultDoc = data.document;
      setAllDocs(prev => [saved, ...prev]);
      setSessionDocs(prev => prev.filter(d => d.id !== sessionDocId));
      // Keep the doc selected + pinned under its new vault ID
      setSelectedDocIds(prev => {
        const next = new Set(prev); next.delete(sessionDocId); next.add(saved.id); return next;
      });
      setPinnedDocIds(prev => {
        const next = new Set(prev); next.delete(sessionDocId); next.add(saved.id); return next;
      });
    } catch (err) {
      // Surface the error inline in the session doc row — handled by a separate error state isn't worth it
      // Just log for now; the button will re-enable
      console.error("Save to vault failed:", err);
    } finally {
      setSavingDocId(null);
    }
  }

  async function sendMessage(overrideInput?: string) {
    const text = (overrideInput ?? input).trim();
    if (!text || sending || !vault) return;

    // Select documents now, based on the actual question being asked
    const { documentText, includedNames } = selectDocuments(text);

    setInput("");
    setAiError("");

    // Append AI instructions from vault to the question (invisible to user display)
    let questionForApi = text;
    if (vault.ai_instructions?.trim()) {
      questionForApi += `\n\n[Case AI Instructions: ${vault.ai_instructions.trim()}]`;
    }

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setSending(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionForApi,
          state: vault.state ?? "",
          caseType: VAULT_TYPE_TO_CASE_TYPE[vault.type] ?? "family_court",
          caseContext: buildCaseContext(),
          documentText,
          conversationHistory: newMessages.slice(-6),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      setMessages([...newMessages, {
        role: "assistant",
        content: data.response,
        includedDocNames: includedNames.length > 0 ? includedNames : undefined,
      }]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages(newMessages);
    } finally {
      setSending(false);
    }
  }

  // ── Derived display values ───────────────────────────────────────────────────

  // Live preview of which docs will be included if the user sends right now.
  // Recomputes as the user types so the sidebar shows accurate state.
  const previewSelection = selectDocuments(input);
  const includedDocIds = previewSelection.includedIds;
  const isOverLimit = selectedDocIds.size > MAX_DOCS_TO_AI;

  const selectedDocs = [
    ...sessionDocs.filter(d => selectedDocIds.has(d.id)),
    ...allDocs.filter(d => selectedDocIds.has(d.id)),
  ];
  const icon = VAULT_TYPE_ICONS[vault?.type ?? "custom"] ?? "📂";
  const typeLabel = VAULT_TYPE_LABELS[vault?.type ?? "custom"] ?? "Case";
  const contextFields = vault ? [
    vault.state && `📍 ${vault.state}${vault.county ? ` · ${vault.county}` : ""}`,
    vault.judge_name && `⚖️ Judge ${vault.judge_name}`,
    vault.case_number && `#${vault.case_number}`,
    vault.court_name && `🏛️ ${vault.court_name}`,
  ].filter(Boolean) : [];
  const hasCaseDetails = !!(vault?.what_is_happening || vault?.obstacle || vault?.desired_outcome);

  // ── Welcome message (static, no API call) ───────────────────────────────────
  const welcomeText = vault
    ? `I've loaded your **${vault.name}** vault.\n\n` +
      (selectedDocs.length > 0
        ? `I have **${selectedDocs.length} document${selectedDocs.length > 1 ? "s" : ""}** ready to reference, plus your saved case details.`
        : `I have your saved case details loaded. No documents are selected — you can still ask general questions about your case.`) +
      `\n\nWhat do you want to work on?`
    : null;

  // ── Error state ──────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-gray-700 font-medium mb-4">{loadError}</p>
          <a href="/vaults" className="text-blue-600 hover:underline text-sm">← Back to My Vaults</a>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (!vault) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading vault…</div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">

      {/* Top nav */}
      <div className="bg-blue-900 text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <a href={`/vaults`} className="text-blue-300 hover:text-white text-sm">← Vaults</a>
          <span className="text-blue-600">|</span>
          <span className="text-lg">{icon}</span>
          <span className="font-bold text-white text-sm truncate max-w-xs">{vault.name}</span>
          <span className="bg-blue-700 text-blue-200 text-xs px-2 py-0.5 rounded-full hidden sm:block">{typeLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {includedDocIds.size > 0 && (
            <span className="bg-green-700 text-green-100 text-xs px-2 py-1 rounded-full">
              {isOverLimit
                ? `📄 ${includedDocIds.size} of ${selectedDocIds.size} docs included`
                : `📄 ${includedDocIds.size} doc${includedDocIds.size > 1 ? "s" : ""} included`}
            </span>
          )}
          {hasCaseDetails && (
            <span className="bg-blue-700 text-blue-200 text-xs px-2 py-1 rounded-full">
              🗂 case context loaded
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen(o => !o)}
            className="text-blue-300 hover:text-white text-xs"
          >
            {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">

            {/* Vault meta */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Case Context Loaded</span>
              </div>
              {contextFields.length > 0 && (
                <div className="space-y-1">
                  {contextFields.map((f, i) => (
                    <div key={i} className="text-xs text-gray-600">{f}</div>
                  ))}
                </div>
              )}
              {hasCaseDetails && (
                <div className="mt-3 space-y-2">
                  {vault.what_is_happening && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-0.5">Situation</div>
                      <div className="text-xs text-gray-700 line-clamp-3">{vault.what_is_happening}</div>
                    </div>
                  )}
                  {vault.desired_outcome && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase mb-0.5">Goal</div>
                      <div className="text-xs text-gray-700 line-clamp-2">{vault.desired_outcome}</div>
                    </div>
                  )}
                </div>
              )}
              {!hasCaseDetails && (
                <p className="text-xs text-gray-400 mt-2">
                  No case details saved.{" "}
                  <a href={`/vaults`} className="text-blue-600 hover:underline">Add them in your vault →</a>
                </p>
              )}
            </div>

            {/* Documents */}
            <div className="px-5 py-4 flex-1">
              {/* Section header with All/None */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Documents</span>
                {(allDocs.length > 0 || sessionDocs.length > 0) && (
                  <div className="flex gap-2 text-xs text-blue-600">
                    <button type="button" onClick={() => {
                      // Select all available docs — the send cap is enforced in buildDocumentText
                      setSelectedDocIds(new Set([
                        ...allDocs.map(d => d.id),
                        ...sessionDocs.map(d => d.id),
                      ]));
                    }}>All</button>
                    <span className="text-gray-300">|</span>
                    <button type="button" onClick={() => setSelectedDocIds(new Set())}>None</button>
                  </div>
                )}
              </div>

              {/* Vault documents */}
              {allDocs.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 font-medium mb-1.5">From vault</div>
                  <div className="space-y-2">
                    {allDocs.map(doc => {
                      const checked  = selectedDocIds.has(doc.id);
                      const pinned   = pinnedDocIds.has(doc.id);
                      const included = includedDocIds.has(doc.id);
                      const excluded = checked && isOverLimit && !included;
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs transition-all ${
                            excluded
                              ? "bg-white border-orange-200 opacity-50"
                              : checked
                                ? "bg-blue-50 border-blue-300"
                                : "bg-white border-gray-200 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDoc(doc.id)}
                            className="mt-0.5 accent-blue-600 flex-shrink-0 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-800 truncate">{doc.name}</div>
                            <div className="text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>{doc.type} · {((doc.extracted_text?.length ?? 0) / 1000).toFixed(0)}k chars</span>
                              {excluded && <span className="text-orange-500 font-medium">· skipped</span>}
                              {pinned && !excluded && <span className="text-blue-500">· pinned</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPinnedDocIds(prev => {
                              const next = new Set(prev);
                              if (next.has(doc.id)) { next.delete(doc.id); } else { next.add(doc.id); }
                              return next;
                            })}
                            title={pinned ? "Unpin — allow relevance-based selection" : "Pin — always include this doc"}
                            className={`flex-shrink-0 text-sm leading-none mt-0.5 ${pinned ? "opacity-100" : "opacity-20 hover:opacity-60"}`}
                          >
                            📌
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Session documents (added this chat) */}
              {sessionDocs.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 font-medium mb-1.5">Added this session</div>
                  <div className="space-y-2">
                    {sessionDocs.map(doc => {
                      const checked  = selectedDocIds.has(doc.id);
                      const pinned   = pinnedDocIds.has(doc.id);
                      const included = includedDocIds.has(doc.id);
                      const excluded = checked && isOverLimit && !included;
                      return (
                        <div key={doc.id} className="space-y-1.5">
                          <div
                            className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs transition-all ${
                              excluded
                                ? "bg-white border-orange-200 opacity-50"
                                : checked
                                  ? "bg-amber-50 border-amber-300"
                                  : "bg-white border-gray-200 opacity-60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDoc(doc.id)}
                              className="mt-0.5 accent-amber-500 flex-shrink-0 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-800 truncate">{doc.name}</div>
                              <div className="text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>{doc.type} · {(doc.extracted_text.length / 1000).toFixed(0)}k chars</span>
                                {!doc.extracted_text && <span className="text-amber-600">· no text extracted</span>}
                                {excluded && <span className="text-orange-500 font-medium">· skipped</span>}
                                {pinned && !excluded && <span className="text-amber-600">· pinned</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPinnedDocIds(prev => {
                                const next = new Set(prev);
                                if (next.has(doc.id)) { next.delete(doc.id); } else { next.add(doc.id); }
                                return next;
                              })}
                              title={pinned ? "Unpin" : "Pin — always include this doc"}
                              className={`flex-shrink-0 text-sm leading-none mt-0.5 ${pinned ? "opacity-100" : "opacity-20 hover:opacity-60"}`}
                            >
                              📌
                            </button>
                          </div>
                          {/* Save-to-vault prompt */}
                          {doc.saveDecision === "pending" && (
                            <div className="ml-1 pl-2 border-l-2 border-amber-200 text-xs text-gray-600">
                              <span className="block mb-1">Added for this chat.</span>
                              <span className="font-medium">Save to vault permanently?</span>
                              <div className="flex gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveToVault(doc.id)}
                                  disabled={savingDocId === doc.id}
                                  className="text-blue-600 hover:underline disabled:opacity-50"
                                >
                                  {savingDocId === doc.id ? "Saving…" : "Yes, save it"}
                                </button>
                                <span className="text-gray-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => setSessionDocs(prev =>
                                    prev.map(d => d.id === doc.id ? { ...d, saveDecision: "declined" } : d)
                                  )}
                                  disabled={savingDocId === doc.id}
                                  className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                >
                                  No, just this chat
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {allDocs.length === 0 && sessionDocs.length === 0 && (
                <div className="text-xs text-gray-400 mb-4">
                  No documents yet.{" "}
                  <a href="/vaults" className="text-blue-600 hover:underline">Import from Drive →</a>
                </div>
              )}

              {/* Limit warning — fires when selected count exceeds the send cap */}
              {isOverLimit && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-orange-700 font-medium mb-0.5">
                    {selectedDocIds.size - MAX_DOCS_TO_AI} doc{selectedDocIds.size - MAX_DOCS_TO_AI > 1 ? "s" : ""} marked <strong>skipped</strong> — only {MAX_DOCS_TO_AI} can be read per message.
                  </p>
                  <p className="text-xs text-orange-600">
                    Session docs are included first. Deselect vault docs to make room.
                  </p>
                </div>
              )}

              {/* Add documents */}
              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs text-gray-400 font-medium mb-2">Add documents</div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.text"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <><span className="animate-spin">⏳</span> Reading file…</>
                  ) : (
                    <><span>⬆️</span> Upload from computer</>
                  )}
                </button>

                {uploadError && (
                  <p className="text-xs text-red-600 mt-1.5">{uploadError}</p>
                )}
                <p className="text-xs text-gray-400 mt-1.5">PDF or .txt · max 10 MB · session only</p>
              </div>
            </div>

            {/* New session / back */}
            <div className="px-5 py-3 border-t border-gray-100 space-y-2">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setMessages([]); setAiError(""); inputRef.current?.focus(); }}
                  className="w-full text-xs text-gray-400 hover:text-red-500 text-left"
                >
                  Clear conversation
                </button>
              )}
              <a href="/vaults" className="block text-xs text-blue-600 hover:underline">← Back to Vaults</a>
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Messages — flex spacer pushes content to bottom when chat is short;
              collapses naturally as messages accumulate and the area scrolls */}
          <div className="flex-1 overflow-y-auto px-6">
            <div className="max-w-3xl mx-auto min-h-full flex flex-col">
              <div className="flex-1" />
              <div className="flex flex-col gap-5 py-5">

              {/* Welcome message (static) */}
              {welcomeText && messages.length === 0 && !sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-1">⚖️</div>
                  <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 max-w-2xl">
                    <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                      {welcomeText.split("**").map((part, i) =>
                        i % 2 === 1
                          ? <strong key={i}>{part}</strong>
                          : <span key={i}>{part}</span>
                      )}
                    </div>
                    {/* Suggested openers */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {[
                        "What should I do next in my case?",
                        selectedDocs.length > 0 ? "Analyze my documents and flag anything urgent" : null,
                        "What are my strongest arguments?",
                        "What motions should I consider filing?",
                      ].filter(Boolean).map(q => (
                        <button
                          key={q!}
                          type="button"
                          onClick={() => sendMessage(q!)}
                          className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Message thread */}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-1">⚖️</div>
                  )}
                  <div className="max-w-2xl">
                    <div className={`rounded-2xl px-5 py-4 text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === "user"
                        ? "bg-blue-700 text-white"
                        : "bg-white border border-gray-200 text-gray-800"
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-3 mt-1 ml-2">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(msg.content)}
                          className="text-xs text-gray-400 hover:text-blue-600"
                        >
                          Copy
                        </button>
                        {msg.includedDocNames && msg.includedDocNames.length > 0 && (
                          <span className="text-xs text-gray-400">
                            Based on: {msg.includedDocNames.join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-gray-600 text-sm flex-shrink-0 mt-1">👤</div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-1">⚖️</div>
                  <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                    <div className="flex gap-2 items-center">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                      <span className="text-xs text-gray-400 ml-2">
                        {selectedDocs.length > 0 && messages.length === 0 ? "Reading your documents…" : "Thinking…"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                  <strong>Error:</strong> {aiError}
                </div>
              )}

              <div ref={messagesEndRef} />
              </div>{/* end message content */}
            </div>{/* end min-h-full flex col */}
          </div>{/* end scroll area */}

          {/* Input bar */}
          <div className="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="Ask about your case… (Enter to send, Shift+Enter for new line)"
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || sending}
                  className="bg-blue-700 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed self-end"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Legal information, not legal advice.
                {vault.state ? ` Consult a licensed attorney in ${vault.state} if possible.` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

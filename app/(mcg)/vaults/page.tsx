"use client";

import { useState, useEffect } from "react";

const VAULT_TYPES = [
  { id: "family_court", label: "Family Court / Custody", icon: "👨‍👩‍👧", headerColor: "bg-blue-700", color: "border-blue-400 bg-blue-50" },
  { id: "dcf_cps", label: "DCF / CPS / Child Welfare", icon: "🏛️", headerColor: "bg-red-700", color: "border-red-400 bg-red-50" },
  { id: "divorce", label: "Divorce / Separation", icon: "📋", headerColor: "bg-purple-700", color: "border-purple-400 bg-purple-50" },
  { id: "child_support", label: "Child Support", icon: "💰", headerColor: "bg-green-700", color: "border-green-400 bg-green-50" },
  { id: "civil", label: "Civil Case", icon: "⚖️", headerColor: "bg-yellow-700", color: "border-yellow-400 bg-yellow-50" },
  { id: "bankruptcy", label: "Bankruptcy", icon: "📁", headerColor: "bg-gray-700", color: "border-gray-400 bg-gray-50" },
  { id: "housing", label: "Housing / Eviction", icon: "🏠", headerColor: "bg-orange-700", color: "border-orange-400 bg-orange-50" },
  { id: "criminal", label: "Criminal Defense", icon: "🔒", headerColor: "bg-pink-700", color: "border-pink-400 bg-pink-50" },
  { id: "school", label: "School / Education", icon: "🎓", headerColor: "bg-teal-700", color: "border-teal-400 bg-teal-50" },
  { id: "custom", label: "Custom Vault", icon: "📂", headerColor: "bg-indigo-700", color: "border-indigo-400 bg-indigo-50" },
];

type Vault = {
  id: string;
  name: string;
  type: string;
  state: string | null;
  county: string | null;
  city: string | null;
  court_name: string | null;
  case_number: string | null;
  judge_name: string | null;
  what_is_happening: string | null;
  what_tried: string | null;
  obstacle: string | null;
  desired_outcome: string | null;
  ai_instructions: string | null;
  created_at: string;
  updated_at: string;
};

type VaultContext = {
  state: string;
  county: string;
  court_name: string;
  case_number: string;
  judge_name: string;
  what_is_happening: string;
  what_tried: string;
  obstacle: string;
  desired_outcome: string;
  ai_instructions: string;
};

const EMPTY_CONTEXT: VaultContext = {
  state: "",
  county: "",
  court_name: "",
  case_number: "",
  judge_name: "",
  what_is_happening: "",
  what_tried: "",
  obstacle: "",
  desired_outcome: "",
  ai_instructions: "",
};

type VaultDocument = {
  id: string;
  name: string;
  type: string;
  tag: string;
  size_bytes: number;
  source: string | null;
  drive_file_id: string | null;
  uploaded_at: string;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  modifiedTime: string;
};

const DOC_TAGS = ["all", "orders", "motions", "evidence", "records", "reports", "requests", "correspondence"];

function vaultMeta(type: string) {
  return VAULT_TYPES.find(vt => vt.id === type) ?? VAULT_TYPES[VAULT_TYPES.length - 1];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [showNewVault, setShowNewVault] = useState(false);
  const [activeTag, setActiveTag] = useState("all");

  // New vault form state
  const [newVaultType, setNewVaultType] = useState("");
  const [newVaultName, setNewVaultName] = useState("");
  const [newCaseNumber, setNewCaseNumber] = useState("");
  const [newCourtName, setNewCourtName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Case context state
  const [contextOpen, setContextOpen] = useState(true);
  const [contextDraft, setContextDraft] = useState<VaultContext>(EMPTY_CONTEXT);
  const [contextLoading, setContextLoading] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [contextError, setContextError] = useState("");

  // Google Drive connection state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleStatusLoading, setGoogleStatusLoading] = useState(true);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);
  const [googleBannerMsg, setGoogleBannerMsg] = useState("");

  // Drive file picker state
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  // Vault documents state
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/vaults")
      .then(r => r.json())
      .then(data => { if (!data.error) setVaults(data.vaults); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Check Google connection status + handle post-OAuth redirect messages
  useEffect(() => {
    fetch("/api/auth/google/status")
      .then(r => r.json())
      .then(data => {
        if (data.connected) {
          setGoogleConnected(true);
          setGoogleEmail(data.googleEmail ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setGoogleStatusLoading(false));

    // Show banner messages from OAuth redirect params
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "1") {
      setGoogleBannerMsg("Google Drive connected successfully.");
      window.history.replaceState({}, "", "/vaults");
    } else if (params.get("google_error")) {
      const code = params.get("google_error");
      const msgs: Record<string, string> = {
        token_exchange_failed: "Google connection failed — could not exchange code for tokens.",
        no_refresh_token: "Google connection failed — no refresh token returned. Please try again.",
        db_error: "Google connection failed — could not save credentials.",
      };
      setGoogleBannerMsg(msgs[code!] ?? `Google connection failed (${code}).`);
      window.history.replaceState({}, "", "/vaults");
    }
  }, []);

  // Load full vault (with context) when one is selected
  useEffect(() => {
    if (!selectedVaultId) return;
    setContextLoading(true);
    setContextSaved(false);
    setContextError("");
    fetch(`/api/vaults/${selectedVaultId}`)
      .then(r => r.json())
      .then(data => {
        if (data.vault) {
          const v = data.vault;
          setContextDraft({
            state: v.state ?? "",
            county: v.county ?? "",
            court_name: v.court_name ?? "",
            case_number: v.case_number ?? "",
            judge_name: v.judge_name ?? "",
            what_is_happening: v.what_is_happening ?? "",
            what_tried: v.what_tried ?? "",
            obstacle: v.obstacle ?? "",
            desired_outcome: v.desired_outcome ?? "",
            ai_instructions: v.ai_instructions ?? "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setContextLoading(false));
  }, [selectedVaultId]);

  // Load documents when a vault is opened (or after an import)
  function loadDocs(vaultId: string) {
    setDocsLoading(true);
    fetch(`/api/vaults/${vaultId}/documents`)
      .then(r => r.json())
      .then(data => { if (!data.error) setVaultDocs(data.documents); })
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }

  useEffect(() => {
    if (!selectedVaultId) { setVaultDocs([]); return; }
    loadDocs(selectedVaultId);
  }, [selectedVaultId]);

  const selectedVault = vaults.find(v => v.id === selectedVaultId) ?? null;

  // Drive picker handlers
  function openDrivePicker() {
    setDrivePickerOpen(true);
    setSelectedDriveFiles(new Set());
    setImportError("");
    setDriveSearch("");
    setDriveFilesLoading(true);
    fetch("/api/drive/files")
      .then(r => r.json())
      .then(data => { if (!data.error) setDriveFiles(data.files); })
      .catch(() => {})
      .finally(() => setDriveFilesLoading(false));
  }

  async function searchDriveFiles(q: string) {
    setDriveFilesLoading(true);
    try {
      const res = await fetch(`/api/drive/files?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.error) setDriveFiles(data.files);
    } catch { /* ignore */ }
    finally { setDriveFilesLoading(false); }
  }

  function toggleDriveFile(id: string) {
    setSelectedDriveFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleImport() {
    if (!selectedVaultId || selectedDriveFiles.size === 0) return;
    setImporting(true);
    setImportError("");
    const filesToImport = driveFiles.filter(f => selectedDriveFiles.has(f.id));
    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: selectedVaultId, files: filesToImport }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed.");
        return;
      }
      if (data.failed?.length > 0) {
        setImportError(`${data.imported} imported. ${data.failed.length} failed: ${data.failed.map((f: {name: string}) => f.name).join(", ")}`);
      }
      setDrivePickerOpen(false);
      setSelectedDriveFiles(new Set());
      loadDocs(selectedVaultId); // refresh doc list
    } catch {
      setImportError("Something went wrong. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  function formatBytes(bytes: number) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  async function handleGoogleDisconnect() {
    setGoogleDisconnecting(true);
    try {
      const res = await fetch("/api/auth/google/disconnect", { method: "DELETE" });
      if (res.ok) {
        setGoogleConnected(false);
        setGoogleEmail("");
        setGoogleBannerMsg("Google Drive disconnected.");
      }
    } catch {
      // non-fatal
    } finally {
      setGoogleDisconnecting(false);
    }
  }

  function updateCtx(field: keyof VaultContext, value: string) {
    setContextDraft(prev => ({ ...prev, [field]: value }));
    setContextSaved(false);
  }

  async function handleSaveContext() {
    if (!selectedVaultId) return;
    setSavingContext(true);
    setContextError("");
    setContextSaved(false);
    try {
      const res = await fetch(`/api/vaults/${selectedVaultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contextDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        setContextError(data.error || "Failed to save.");
        return;
      }
      // Update the vault in local list so the card reflects new case_number/court_name
      setVaults(prev => prev.map(v =>
        v.id === selectedVaultId
          ? { ...v, ...data.vault }
          : v
      ));
      setContextSaved(true);
    } catch {
      setContextError("Something went wrong. Please try again.");
    } finally {
      setSavingContext(false);
    }
  }

  async function handleCreateVault() {
    if (!newVaultType || !newVaultName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newVaultName.trim(),
          type: newVaultType,
          case_number: newCaseNumber.trim() || null,
          court_name: newCourtName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create vault.");
        return;
      }
      setVaults(prev => [data.vault, ...prev]);
      setShowNewVault(false);
      setNewVaultType("");
      setNewVaultName("");
      setNewCaseNumber("");
      setNewCourtName("");
    } catch {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white flex flex-col fixed h-full">
        <div className="p-6 border-b border-blue-800">
          <a href="/dashboard" className="text-blue-300 text-xs hover:text-white block mb-3">← Dashboard</a>
          <div className="text-xl font-bold">My Court Guide</div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {[
            { icon: "🏠", label: "Dashboard", href: "/dashboard" },
            { icon: "🗂️", label: "My Vaults", href: "/vaults", active: true },
            { icon: "🤖", label: "AI Workspace", href: "/workspace" },
            { icon: "🎤", label: "Court Coach", href: "/court-coach" },
            { icon: "📄", label: "Templates", href: "/templates" },
            { icon: "📁", label: "Exhibit Builder", href: "/exhibits" },
            { icon: "⚖️", label: "Case Law Search", href: "/case-law" },
            { icon: "📚", label: "How-To Guides", href: "/guides" },
          ].map(item => (
            <a key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                item.active ? "bg-blue-700 text-white" : "text-blue-200 hover:bg-blue-800 hover:text-white"
              }`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="ml-64 flex-1 p-8">

        {/* Flash banner — shown after OAuth redirect or disconnect */}
        {googleBannerMsg && (
          <div className={`mb-5 flex items-center justify-between gap-4 px-4 py-3 rounded-lg text-sm font-medium border ${
            googleBannerMsg.includes("failed") || googleBannerMsg.includes("Failed")
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-green-50 border-green-200 text-green-700"
          }`}>
            <span>{googleBannerMsg}</span>
            <button type="button" onClick={() => setGoogleBannerMsg("")} className="text-lg leading-none opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">🗂️ My Case Vaults</h1>
            <p className="text-gray-600 mt-1">Store, organize, and access all your case documents in one secure place.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Google Drive connection widget */}
            {!googleStatusLoading && (
              googleConnected ? (
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <span className="text-green-500 font-bold">●</span>
                  <span className="text-gray-700">Google Drive</span>
                  {googleEmail && <span className="text-gray-400 text-xs hidden sm:block">({googleEmail})</span>}
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    disabled={googleDisconnecting}
                    className="ml-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {googleDisconnecting ? "…" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <a
                  href="/api/auth/google"
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connect Google Drive
                </a>
              )
            )}
            <button
              type="button"
              onClick={() => setShowNewVault(true)}
              className="bg-blue-700 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-800"
            >
              + New Vault
            </button>
          </div>
        </div>

        {!selectedVaultId ? (
          <>
            {loading ? (
              <div className="text-gray-500 text-sm py-12 text-center">Loading vaults…</div>
            ) : (
              <div className="grid grid-cols-3 gap-6 mb-8">
                {vaults.map(v => {
                  const meta = vaultMeta(v.type);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVaultId(v.id)}
                      className={`text-left rounded-2xl border-2 ${meta.color} overflow-hidden hover:shadow-lg transition-all`}
                    >
                      <div className={`${meta.headerColor} text-white px-5 py-4`}>
                        <div className="text-3xl mb-1">{meta.icon}</div>
                        <div className="font-bold text-lg">{v.name}</div>
                        <div className="text-white/70 text-xs mt-1">{v.case_number || "No case number"}</div>
                      </div>
                      <div className="px-5 py-4">
                        <div className="flex justify-between text-sm mb-3">
                          <span className="text-gray-700 font-medium">0 documents</span>
                          <span className="text-gray-500">Updated {timeAgo(v.updated_at)}</span>
                        </div>
                        <div className="mt-2 text-blue-700 text-sm font-bold">Open Vault →</div>
                      </div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShowNewVault(true)}
                  className="text-left rounded-2xl border-2 border-dashed border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all p-8 flex flex-col items-center justify-center text-center"
                >
                  <div className="text-5xl mb-3 text-gray-300">+</div>
                  <div className="font-bold text-gray-500">Create New Vault</div>
                  <div className="text-gray-400 text-sm mt-1">Bankruptcy, housing, civil, and more</div>
                </button>
              </div>
            )}

            {!loading && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-900">0</div>
                  <div className="text-blue-700 text-xs">Total Documents</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-900">{vaults.length}</div>
                  <div className="text-blue-700 text-xs">Active Vaults</div>
                </div>
                <div className="flex-1 flex items-center justify-end">
                  <a href="/pricing" className="text-blue-600 text-sm hover:underline">Upgrade for unlimited vaults →</a>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Inside a Vault */
          <div>
            {(() => {
              const meta = vaultMeta(selectedVault?.type ?? "custom");
              return (
                <>
                  {/* Vault Header */}
                  <div className={`${meta.headerColor} text-white rounded-2xl p-6 mb-6`}>
                    <button type="button" onClick={() => setSelectedVaultId(null)} className="text-white/70 text-sm hover:text-white mb-3 block">← All Vaults</button>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-4xl mb-2">{meta.icon}</div>
                        <h2 className="text-2xl font-bold">{selectedVault?.name}</h2>
                        <p className="text-white/70 text-sm mt-1">
                          {selectedVault?.court_name || "—"} · Case #{selectedVault?.case_number || "—"}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <a href="/exhibits" className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium">
                          📁 Build Exhibit Packet
                        </a>
                        <a href={`/vaults/${selectedVaultId}/ai`} className="bg-white text-blue-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-50">
                          🤖 Ask AI About This Case
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Case Context Panel */}
                  <div className="bg-white rounded-2xl border border-gray-200 mb-6">
                    <button
                      type="button"
                      onClick={() => setContextOpen(o => !o)}
                      className="w-full flex justify-between items-center px-6 py-4 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-900 text-base">📋 Case Details</span>
                        {!contextLoading && (
                          <span className="text-xs text-gray-400">
                            {contextDraft.what_is_happening ? "· Details saved" : "· Fill in your case details"}
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-sm">{contextOpen ? "▲ Collapse" : "▼ Expand"}</span>
                    </button>

                    {contextOpen && (
                      <div className="px-6 pb-6 border-t border-gray-100">
                        {contextLoading ? (
                          <p className="text-gray-400 text-sm py-4">Loading…</p>
                        ) : (
                          <>
                            <p className="text-gray-500 text-xs pt-4 pb-5">
                              This context is saved to this vault and will be used by the AI Assistant, Court Coach, and templates to give you precise, case-specific answers.
                            </p>

                            {/* Row 1: location + case identifiers */}
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">State</label>
                                <input
                                  type="text"
                                  value={contextDraft.state}
                                  onChange={e => updateCtx("state", e.target.value)}
                                  placeholder="e.g. Kansas"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">County</label>
                                <input
                                  type="text"
                                  value={contextDraft.county}
                                  onChange={e => updateCtx("county", e.target.value)}
                                  placeholder="e.g. Johnson County"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Court Name</label>
                                <input
                                  type="text"
                                  value={contextDraft.court_name}
                                  onChange={e => updateCtx("court_name", e.target.value)}
                                  placeholder="e.g. Johnson County District Court"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Case Number</label>
                                <input
                                  type="text"
                                  value={contextDraft.case_number}
                                  onChange={e => updateCtx("case_number", e.target.value)}
                                  placeholder="e.g. 2024-CV-001234"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Judge&apos;s Name</label>
                                <input
                                  type="text"
                                  value={contextDraft.judge_name}
                                  onChange={e => updateCtx("judge_name", e.target.value)}
                                  placeholder="The judge assigned to your case"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            {/* Narrative fields */}
                            <div className="space-y-4 mb-5">
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">What is happening in your case?</label>
                                <textarea
                                  value={contextDraft.what_is_happening}
                                  onChange={e => updateCtx("what_is_happening", e.target.value)}
                                  rows={3}
                                  placeholder="Describe the current situation — hearings, motions, what the other side is doing…"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">What have you already tried?</label>
                                <textarea
                                  value={contextDraft.what_tried}
                                  onChange={e => updateCtx("what_tried", e.target.value)}
                                  rows={2}
                                  placeholder="Motions filed, requests made, mediation attempted…"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">What is the main obstacle?</label>
                                <textarea
                                  value={contextDraft.obstacle}
                                  onChange={e => updateCtx("obstacle", e.target.value)}
                                  rows={2}
                                  placeholder="What is blocking you — the other party, a ruling, lack of evidence…"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">What outcome do you want?</label>
                                <textarea
                                  value={contextDraft.desired_outcome}
                                  onChange={e => updateCtx("desired_outcome", e.target.value)}
                                  rows={2}
                                  placeholder="What does winning look like for you and your family?"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Instructions for the AI</label>
                                <textarea
                                  value={contextDraft.ai_instructions}
                                  onChange={e => updateCtx("ai_instructions", e.target.value)}
                                  rows={2}
                                  placeholder="Anything the AI should always know or do — tone, focus areas, things to avoid…"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                />
                              </div>
                            </div>

                            {contextError && (
                              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                                {contextError}
                              </div>
                            )}

                            <div className="flex items-center gap-4">
                              <button
                                type="button"
                                onClick={handleSaveContext}
                                disabled={savingContext}
                                className="bg-blue-700 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {savingContext ? "Saving…" : "Save Case Details"}
                              </button>
                              {contextSaved && (
                                <span className="text-green-600 text-sm font-medium">✓ Saved</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Documents Section */}
                  <div className="bg-white rounded-2xl border border-gray-200">
                    {/* Doc section header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                      <h3 className="font-bold text-gray-800">
                        📄 Documents
                        {!docsLoading && vaultDocs.length > 0 && (
                          <span className="ml-2 text-sm font-normal text-gray-400">({vaultDocs.length})</span>
                        )}
                      </h3>
                      <div className="flex gap-2">
                        {googleConnected && (
                          <button
                            type="button"
                            onClick={openDrivePicker}
                            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:border-blue-400 hover:text-blue-700 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Import from Drive
                          </button>
                        )}
                        {!googleConnected && !googleStatusLoading && (
                          <a
                            href="/api/auth/google"
                            className="text-xs text-blue-600 hover:underline px-2 py-1.5"
                          >
                            Connect Drive to import
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Filter Tags */}
                    <div className="flex gap-2 px-6 py-3 border-b border-gray-100 flex-wrap">
                      {DOC_TAGS.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setActiveTag(tag)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            activeTag === tag
                              ? "bg-blue-700 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>

                    {/* Document rows */}
                    {docsLoading ? (
                      <div className="px-6 py-8 text-center text-gray-400 text-sm">Loading documents…</div>
                    ) : vaultDocs.length === 0 ? (
                      <div className="px-6 py-12 text-center text-gray-400">
                        <div className="text-4xl mb-2">📂</div>
                        <p className="font-medium">No documents yet.</p>
                        {googleConnected
                          ? <p className="text-xs mt-1">Click <strong>Import from Drive</strong> to bring in your court documents.</p>
                          : <p className="text-xs mt-1">Connect Google Drive above to import documents.</p>
                        }
                      </div>
                    ) : (
                      <>
                        {/* Table header */}
                        <div className="grid grid-cols-12 gap-2 px-6 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                          <div className="col-span-5">Name</div>
                          <div className="col-span-2">Type</div>
                          <div className="col-span-2">Tag</div>
                          <div className="col-span-1">Size</div>
                          <div className="col-span-2">Added</div>
                        </div>
                        {vaultDocs
                          .filter(d => activeTag === "all" || d.tag === activeTag)
                          .map(doc => (
                            <div key={doc.id} className="grid grid-cols-12 gap-2 px-6 py-3 border-t border-gray-100 hover:bg-gray-50 items-center text-sm">
                              <div className="col-span-5 flex items-center gap-2 min-w-0">
                                <span className="text-lg flex-shrink-0">
                                  {doc.source === "google_drive" ? (
                                    <svg className="w-4 h-4 inline" viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                  ) : "📄"}
                                </span>
                                <span className="font-medium text-gray-900 truncate">{doc.name}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{doc.type}</span>
                              </div>
                              <div className="col-span-2 text-gray-500 text-xs">{doc.tag}</div>
                              <div className="col-span-1 text-gray-400 text-xs">{formatBytes(doc.size_bytes)}</div>
                              <div className="col-span-2 text-gray-400 text-xs">{timeAgo(doc.uploaded_at)}</div>
                            </div>
                          ))
                        }
                        {vaultDocs.filter(d => activeTag === "all" || d.tag === activeTag).length === 0 && (
                          <div className="px-6 py-8 text-center text-gray-400 text-sm">No documents tagged &quot;{activeTag}&quot;.</div>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Drive File Picker Modal */}
        {drivePickerOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
              {/* Modal header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Import from Google Drive</h2>
                  <p className="text-gray-500 text-xs mt-0.5">PDFs and Google Docs — most recently modified first</p>
                </div>
                <button type="button" onClick={() => setDrivePickerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>

              {/* Search */}
              <div className="px-6 py-3 border-b border-gray-100">
                <input
                  type="text"
                  value={driveSearch}
                  onChange={e => {
                    setDriveSearch(e.target.value);
                    searchDriveFiles(e.target.value);
                  }}
                  placeholder="Search your Drive files…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* File list */}
              <div className="flex-1 overflow-y-auto px-6 py-2">
                {driveFilesLoading ? (
                  <div className="py-12 text-center text-gray-400 text-sm">Loading your Drive files…</div>
                ) : driveFiles.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    {driveSearch ? "No files match your search." : "No PDFs or Google Docs found in your Drive."}
                  </div>
                ) : (
                  driveFiles.map(file => {
                    const checked = selectedDriveFiles.has(file.id);
                    const icon = file.mimeType === "application/vnd.google-apps.document" ? "📝"
                      : file.mimeType === "application/pdf" ? "📄" : "📋";
                    const sizeLabel = file.size ? formatBytes(parseInt(file.size, 10)) : "Google Doc";
                    return (
                      <label
                        key={file.id}
                        className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all border mb-1 ${
                          checked ? "bg-blue-50 border-blue-300" : "bg-white border-transparent hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDriveFile(file.id)}
                          className="w-4 h-4 accent-blue-600 flex-shrink-0"
                        />
                        <span className="text-xl flex-shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm truncate">{file.name}</div>
                          <div className="text-gray-400 text-xs">{sizeLabel} · Modified {timeAgo(file.modifiedTime)}</div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-gray-200">
                {importError && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-700 text-xs">
                    {importError}
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    {selectedDriveFiles.size > 0
                      ? `${selectedDriveFiles.size} file${selectedDriveFiles.size > 1 ? "s" : ""} selected`
                      : "Select files to import"}
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDrivePickerOpen(false)}
                      className="px-4 py-2 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={selectedDriveFiles.size === 0 || importing}
                      className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importing ? "Importing…" : `Import ${selectedDriveFiles.size > 0 ? selectedDriveFiles.size : ""} File${selectedDriveFiles.size !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Vault Modal */}
        {showNewVault && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-screen overflow-y-auto">
              <h2 className="text-2xl font-bold text-blue-900 mb-2">Create a New Vault</h2>
              <p className="text-gray-600 mb-6">Each vault keeps one case organized — documents, orders, evidence, all in one place.</p>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-900 mb-3">What type of case is this vault for?</label>
                <div className="grid grid-cols-2 gap-3">
                  {VAULT_TYPES.map(vt => (
                    <button
                      key={vt.id}
                      type="button"
                      onClick={() => {
                        setNewVaultType(vt.id);
                        if (!newVaultName) setNewVaultName(vt.label);
                      }}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        newVaultType === vt.id ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-blue-200"
                      }`}
                    >
                      <span className="text-xl">{vt.icon}</span>
                      <span className="font-medium text-gray-900 text-sm ml-2">{vt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-900 mb-2">Vault Name</label>
                <input
                  type="text"
                  value={newVaultName}
                  onChange={e => setNewVaultName(e.target.value)}
                  placeholder="e.g. Custody Case 2024, DCF Appeal"
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-900 mb-2">Case Number <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={newCaseNumber}
                  onChange={e => setNewCaseNumber(e.target.value)}
                  placeholder="e.g. 2024-CV-001234"
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-900 mb-2">Court Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={newCourtName}
                  onChange={e => setNewCourtName(e.target.value)}
                  placeholder="e.g. Johnson County District Court"
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {createError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {createError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewVault(false);
                    setNewVaultType("");
                    setNewVaultName("");
                    setNewCaseNumber("");
                    setNewCourtName("");
                    setCreateError("");
                  }}
                  className="flex-1 border-2 border-gray-400 text-gray-900 font-bold py-3 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateVault}
                  disabled={!newVaultType || !newVaultName.trim() || creating}
                  className="flex-1 bg-blue-700 text-white font-bold py-3 rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creating…" : "Create Vault →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

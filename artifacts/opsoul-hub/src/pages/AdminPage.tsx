import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import NebulaBlobs from "@/components/ui/NebulaBlobs";

interface PlatformStats {
  totalOwners: number;
  totalOperators: number;
  messagesLast24h: number;
  driftAlerts: number;
}

interface AdminOwner {
  id: string;
  email: string;
  name: string | null;
  isSovereignAdmin: boolean;
  createdAt: string;
  operatorCount: number;
}

interface AdminOperator {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  archetype: string[];
  safeMode: boolean;
  growLockLevel: string;
  driftScore: number | null;
  messageCount: number;
  createdAt: string;
}

interface DriftAlert {
  id: string;
  operatorId: string;
  operatorName: string;
  ownerEmail: string;
  driftScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface PlatformKbEntry {
  id: string;
  base_id: string;
  content: string;
  source_name: string;
  confidence_score: number;
  created_at: string;
}

interface AdminConversation {
  id: string;
  createdAt: string;
  messageCount: number | null;
  contextName: string;
}

interface AdminMessage {
  role: string;
  content: string;
  createdAt: string;
}

type Tab = "overview" | "owners" | "operators" | "drift" | "rag";

function StatCard({ label, value, color, glow }: {
  label: string;
  value: number | string;
  color: string;
  glow: string;
}) {
  return (
    <div className="glass-panel p-8 relative overflow-hidden">
      <div className={`absolute inset-0 ${glow} pointer-events-none`} />
      <div className={`font-headline text-5xl font-bold mb-2 ${color}`} style={{ letterSpacing: "-0.04em" }}>
        {value}
      </div>
      <div className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
    </div>
  );
}

function DriftBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs font-mono">—</span>;
  const pct = Math.min(score * 100, 100);
  const color = score > 0.30 ? "#fbbf24" : "#40cef3";
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 h-1 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <span className="font-mono text-xs" style={{ color }}>{(score * 100).toFixed(1)}%</span>
    </div>
  );
}

export default function AdminPage() {
  const { owner, token } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [owners, setOwners] = useState<AdminOwner[]>([]);
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [driftAlerts, setDriftAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [growLocking, setGrowLocking] = useState<string | null>(null);
  const [confirmDeleteOp, setConfirmDeleteOp] = useState<string | null>(null);
  const [confirmDeleteOwner, setConfirmDeleteOwner] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [inspectOp, setInspectOp] = useState<AdminOperator | null>(null);
  const [inspectConversations, setInspectConversations] = useState<AdminConversation[]>([]);
  const [inspectConvId, setInspectConvId] = useState<string | null>(null);
  const [inspectMessages, setInspectMessages] = useState<AdminMessage[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  const [platformKbEntries, setPlatformKbEntries] = useState<PlatformKbEntry[]>([]);
  const [kbPage, setKbPage] = useState(1);
  const [kbTotal, setKbTotal] = useState(0);
  const KB_LIMIT = 20;
  const [seedingKb, setSeedingKb] = useState(false);
  const [seedResult, setSeedResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [deletingKbEntry, setDeletingKbEntry] = useState<string | null>(null);
  const [selectedKbEntries, setSelectedKbEntries] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [platformUpload, setPlatformUpload] = useState<{
    uploading: boolean;
    uploadMsg: string | null;
    result: { source: string; chunks: number; operators: number } | null;
    multiResult: { files: number; totalChunks: number; failed: number } | null;
    error: string | null;
  }>({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: null });
  const [platformUrlInput, setPlatformUrlInput] = useState("");
  const [bulkUrlOpen, setBulkUrlOpen] = useState(false);
  const [bulkUrlText, setBulkUrlText] = useState("");
  const [bulkUrlProgress, setBulkUrlProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkUrlResult, setBulkUrlResult] = useState<{
    ingested: number;
    failed: number;
    details: { url: string; ok: boolean; chunks?: number; error?: string }[];
  } | null>(null);
  const platformFileRef = useRef<HTMLInputElement>(null);

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
    const yr = Math.floor(mo / 12);
    return `${yr} year${yr === 1 ? "" : "s"} ago`;
  }

  const loadPlatformKb = useCallback(async (page = 1) => {
    try {
      const data = await apiFetch<{ entries: PlatformKbEntry[]; total: number }>(`/admin/rag/platform-kb/entries?page=${page}&limit=${KB_LIMIT}`);
      setPlatformKbEntries(data.entries);
      setKbTotal(data.total);
    } catch {
      setPlatformKbEntries([]);
      setKbTotal(0);
    }
  }, []);

  const kbPageLoaded = useRef(false);
  useEffect(() => {
    if (!token) return;
    if (!kbPageLoaded.current) { kbPageLoaded.current = true; return; }
    loadPlatformKb(kbPage);
  }, [kbPage, token, loadPlatformKb]);

  useEffect(() => {
    if (!token) return;
    if (!owner?.isSovereignAdmin) {
      setLocation("/");
      return;
    }

    async function load() {
      try {
        const [s, o, ops, drift] = await Promise.all([
          apiFetch<PlatformStats>("/admin/stats"),
          apiFetch<AdminOwner[]>("/admin/owners"),
          apiFetch<AdminOperator[]>("/admin/operators"),
          apiFetch<DriftAlert[]>("/admin/drift-alerts"),
        ]);
        setStats(s);
        setOwners(o);
        setOperators(ops);
        setDriftAlerts(drift);
        await loadPlatformKb();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, owner, setLocation, loadPlatformKb]);

  async function toggleAdmin(id: string) {
    setTogglingId(id);
    try {
      const updated = await apiFetch<{ id: string; isSovereignAdmin: boolean }>(
        `/admin/owners/${id}/toggle-admin`,
        { method: "PATCH" }
      );
      setOwners((prev) =>
        prev.map((o) => o.id === updated.id ? { ...o, isSovereignAdmin: updated.isSovereignAdmin } : o)
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function toggleSafeMode(op: AdminOperator) {
    setTogglingId(op.id);
    try {
      await apiFetch(`/admin/operators/${op.id}/safe-mode`, {
        method: "PATCH",
        body: JSON.stringify({ safeMode: !op.safeMode }),
      });
      setOperators((prev) => prev.map((o) => o.id === op.id ? { ...o, safeMode: !op.safeMode } : o));
    } finally {
      setTogglingId(null);
    }
  }

  async function changeGrowLock(opId: string, level: string) {
    setGrowLocking(opId);
    try {
      await apiFetch(`/admin/operators/${opId}/grow-lock`, {
        method: "PATCH",
        body: JSON.stringify({ level }),
      });
      setOperators((prev) => prev.map((o) => o.id === opId ? { ...o, growLockLevel: level } : o));
    } finally {
      setGrowLocking(null);
    }
  }

  async function deleteOperator(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/admin/operators/${id}`, { method: "DELETE" });
      setOperators((prev) => prev.filter((o) => o.id !== id));
      setConfirmDeleteOp(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteOwner(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/admin/owners/${id}`, { method: "DELETE" });
      setOwners((prev) => prev.filter((o) => o.id !== id));
      setOperators((prev) => prev.filter((o) => o.ownerId !== id));
      setConfirmDeleteOwner(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function openInspect(op: AdminOperator) {
    setInspectOp(op);
    setInspectConvId(null);
    setInspectMessages([]);
    setInspectLoading(true);
    try {
      const convs = await apiFetch<AdminConversation[]>(`/admin/operators/${op.id}/conversations`);
      setInspectConversations(convs);
    } finally {
      setInspectLoading(false);
    }
  }

  async function openConversation(convId: string) {
    setInspectConvId(convId);
    setInspectLoading(true);
    try {
      const msgs = await apiFetch<AdminMessage[]>(`/admin/conversations/${convId}/messages`);
      setInspectMessages(msgs);
    } finally {
      setInspectLoading(false);
    }
  }

  async function seedPlatformKb() {
    setSeedingKb(true);
    setSeedResult(null);
    try {
      const result = await apiFetch<{ ok: boolean; inserted: number; skipped: number }>(
        "/admin/rag/platform-kb/seed",
        { method: "POST" }
      );
      setSeedResult({ inserted: result.inserted, skipped: result.skipped });
      setKbPage(1);
      await loadPlatformKb(1);
    } finally {
      setSeedingKb(false);
    }
  }

  async function deletePlatformKbEntry(entryId: string) {
    setDeletingKbEntry(entryId);
    try {
      await apiFetch(`/admin/rag/platform-kb/entries/${entryId}`, { method: "DELETE" });
      await loadPlatformKb(kbPage);
    } finally {
      setDeletingKbEntry(null);
    }
  }

  async function handleFilesSelected(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;

    if (arr.length === 1) {
      setPlatformUpload({ uploading: true, uploadMsg: null, result: null, multiResult: null, error: null });
      try {
        const formData = new FormData();
        formData.append("file", arr[0]);
        const result = await apiFetch<{ ok: boolean; source: string; chunks: number; operators: number; total_inserted: number }>(
          "/admin/rag/platform-kb/upload",
          { method: "POST", body: formData }
        );
        setPlatformUpload({ uploading: false, uploadMsg: null, result: { source: result.source, chunks: result.chunks, operators: result.operators }, multiResult: null, error: null });
        setKbPage(1);
        await loadPlatformKb(1);
      } catch (err) {
        setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: err instanceof Error ? err.message : "Upload failed" });
      }
      return;
    }

    let totalChunks = 0;
    let failed = 0;
    setPlatformUpload({ uploading: true, uploadMsg: `Processing file 1 of ${arr.length}…`, result: null, multiResult: null, error: null });
    for (let i = 0; i < arr.length; i++) {
      setPlatformUpload(prev => ({ ...prev, uploadMsg: `Processing file ${i + 1} of ${arr.length}…` }));
      try {
        const formData = new FormData();
        formData.append("file", arr[i]);
        const result = await apiFetch<{ ok: boolean; source: string; chunks: number; operators: number; total_inserted: number }>(
          "/admin/rag/platform-kb/upload",
          { method: "POST", body: formData }
        );
        totalChunks += result.chunks;
      } catch {
        failed++;
      }
    }
    setKbPage(1);
    await loadPlatformKb(1);
    setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: { files: arr.length, totalChunks, failed }, error: null });
  }

  async function handlePlatformKbIngestUrl() {
    const url = platformUrlInput.trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    setPlatformUpload({ uploading: true, uploadMsg: null, result: null, multiResult: null, error: null });
    try {
      const result = await apiFetch<{ ok: boolean; source: string; chunks: number; operators: number; total_inserted: number; error?: string }>(
        "/admin/rag/platform-kb/ingest-url",
        { method: "POST", body: JSON.stringify({ url }) }
      );
      if (!result.ok) {
        setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: result.error ?? "Ingest failed" });
        return;
      }
      setPlatformUpload({ uploading: false, uploadMsg: null, result: { source: result.source, chunks: result.chunks, operators: result.operators }, multiResult: null, error: null });
      setPlatformUrlInput("");
      setKbPage(1);
      await loadPlatformKb(1);
    } catch (err) {
      setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: err instanceof Error ? err.message : "Ingest failed" });
    }
  }

  async function handleBulkUrlIngest() {
    const urls = bulkUrlText.split("\n").map(u => u.trim()).filter(u => /^https?:\/\//i.test(u));
    if (urls.length === 0) return;
    setBulkUrlResult(null);
    setBulkUrlProgress({ current: 0, total: urls.length });
    let ingested = 0;
    let failedCount = 0;
    const details: { url: string; ok: boolean; chunks?: number; error?: string }[] = [];
    for (let i = 0; i < urls.length; i++) {
      setBulkUrlProgress({ current: i + 1, total: urls.length });
      try {
        const result = await apiFetch<{ ok: boolean; chunks?: number; error?: string }>(
          "/admin/rag/platform-kb/ingest-url",
          { method: "POST", body: JSON.stringify({ url: urls[i] }) }
        );
        if (result.ok) {
          ingested++;
          details.push({ url: urls[i], ok: true, chunks: result.chunks });
        } else {
          failedCount++;
          details.push({ url: urls[i], ok: false, error: result.error ?? "Unknown error" });
        }
      } catch (err) {
        failedCount++;
        details.push({ url: urls[i], ok: false, error: err instanceof Error ? err.message : "Network error" });
      }
    }
    setBulkUrlProgress(null);
    setBulkUrlResult({ ingested, failed: failedCount, details });
    setBulkUrlText("");
    setKbPage(1);
    await loadPlatformKb(1);
  }

  async function handleBulkDeleteSelected() {
    if (selectedKbEntries.size === 0) return;
    setDeletingSelected(true);
    try {
      for (const baseId of selectedKbEntries) {
        await apiFetch(`/admin/rag/platform-kb/entries/${baseId}`, { method: "DELETE" });
      }
      setSelectedKbEntries(new Set());
      await loadPlatformKb(kbPage);
    } finally {
      setDeletingSelected(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary font-mono tracking-widest text-xs uppercase animate-pulse">
          Initializing Sovereign Console...
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "owners", label: "Owners", count: owners.length },
    { id: "operators", label: "Operators", count: operators.length },
    { id: "drift", label: "Drift Alerts", count: driftAlerts.length },
    { id: "rag", label: "Platform KB", count: kbTotal },
  ];

  const GROW_LEVELS = ["OPEN", "CONTROLLED", "LOCKED", "FROZEN"] as const;
  const GROW_COLORS: Record<string, string> = {
    OPEN: "text-secondary",
    CONTROLLED: "text-primary",
    LOCKED: "text-amber-400",
    FROZEN: "text-destructive",
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <NebulaBlobs />
      <div className="fixed inset-0 dot-grid opacity-10 pointer-events-none z-0" />

      {/* Inspect modal */}
      {inspectOp && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setInspectOp(null); setInspectConvId(null); }} />
          <div className="relative z-10 w-full max-w-lg h-screen bg-surface-container/95 border-l border-border/40 flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-border/30 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="font-sans text-sm font-medium text-on-surface">{inspectOp.name}</div>
                <div className="font-label text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                  {inspectConvId ? "Messages" : "Conversations"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {inspectConvId && (
                  <button
                    onClick={() => { setInspectConvId(null); setInspectMessages([]); }}
                    className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                  >
                    ← Back
                  </button>
                )}
                <button
                  onClick={() => { setInspectOp(null); setInspectConvId(null); }}
                  className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {inspectLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="font-label text-[10px] uppercase tracking-widest text-primary animate-pulse">Loading…</div>
                </div>
              ) : !inspectConvId ? (
                inspectConversations.length === 0 ? (
                  <div className="px-6 py-16 text-center text-muted-foreground text-sm">No conversations yet.</div>
                ) : (
                  <div className="divide-y divide-border/10">
                    {inspectConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv.id)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                      >
                        <div>
                          <div className="font-sans text-xs text-on-surface mb-0.5 truncate max-w-[280px]">
                            {conv.contextName || conv.id.slice(0, 20)}
                          </div>
                          <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">
                            {new Date(conv.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="font-mono text-xs text-secondary flex-shrink-0 ml-4">
                          {conv.messageCount ?? 0} msg
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="px-6 py-4 space-y-4">
                  {inspectMessages.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-8">No messages.</div>
                  ) : (
                    inspectMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                          msg.role === "user"
                            ? "bg-primary/15 border border-primary/20"
                            : "bg-surface-container border border-border/30"
                        }`}>
                          <div className="font-label text-[8px] uppercase tracking-widest text-muted-foreground mb-1">
                            {msg.role}
                          </div>
                          <p className="font-sans text-xs text-on-surface whitespace-pre-wrap">{msg.content}</p>
                          <div className="font-label text-[8px] text-muted-foreground/50 mt-1.5">
                            {new Date(msg.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete operator confirm */}
      {confirmDeleteOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteOp(null)} />
          <div className="relative z-10 glass-panel p-8 max-w-sm w-full mx-4">
            <h3 className="font-headline text-lg text-on-surface mb-2">Delete Operator?</h3>
            <p className="font-sans text-sm text-muted-foreground mb-6">
              This will soft-delete the operator. Their data is preserved but the operator will be inactive.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteOp(null)}
                className="font-label text-[10px] uppercase tracking-widest px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteOperator(confirmDeleteOp)}
                disabled={deletingId === confirmDeleteOp}
                className="font-label text-[10px] uppercase tracking-widest px-5 py-2 bg-destructive/10 border border-destructive/40 text-destructive rounded hover:bg-destructive/20 disabled:opacity-40 transition-all"
              >
                {deletingId === confirmDeleteOp ? "Deleting…" : "Delete Operator"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete owner confirm */}
      {confirmDeleteOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteOwner(null)} />
          <div className="relative z-10 glass-panel p-8 max-w-sm w-full mx-4">
            <h3 className="font-headline text-lg text-on-surface mb-2">Delete Owner?</h3>
            <p className="font-sans text-sm text-muted-foreground mb-6">
              This will delete the owner and soft-delete all their operators. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteOwner(null)}
                className="font-label text-[10px] uppercase tracking-widest px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteOwner(confirmDeleteOwner)}
                disabled={deletingId === confirmDeleteOwner}
                className="font-label text-[10px] uppercase tracking-widest px-5 py-2 bg-destructive/10 border border-destructive/40 text-destructive rounded hover:bg-destructive/20 disabled:opacity-40 transition-all"
              >
                {deletingId === confirmDeleteOwner ? "Deleting…" : "Delete Owner + Operators"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="frosted-nav sticky top-0 z-40 px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="font-headline text-xl text-primary tracking-tight">OpSoul</a>
          <span className="text-muted-foreground/40 font-mono text-xs">/</span>
          <div className="flex items-center gap-2">
            <span className="status-beacon" />
            <span className="font-label text-[10px] uppercase tracking-[0.2em] text-secondary">
              Sovereign Console
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
            {owner?.email}
          </span>
          <a href="/" className="font-label text-[10px] uppercase tracking-widest text-primary hover:opacity-70 transition-opacity">
            Exit Console
          </a>
        </div>
      </header>

      <main className="relative z-10 px-8 max-w-7xl mx-auto py-12">

        {/* Page title */}
        <div className="mb-12">
          <h1 className="headline-lg text-4xl md:text-5xl font-bold text-on-surface mb-3">
            Sovereign <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Command Center</span>
          </h1>
          <p className="font-sans text-on-surface-variant text-sm">
            Full platform visibility. All operators, all owners, all intelligence streams.
          </p>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <StatCard label="Total Owners" value={stats.totalOwners} color="text-primary"
              glow="bg-[radial-gradient(circle_at_top-left,rgba(205,150,255,0.06),transparent_60%)]" />
            <StatCard label="Total Operators" value={stats.totalOperators} color="text-secondary"
              glow="bg-[radial-gradient(circle_at_top-left,rgba(64,206,243,0.06),transparent_60%)]" />
            <StatCard label="Messages (24h)" value={stats.messagesLast24h.toLocaleString()} color="text-primary"
              glow="bg-[radial-gradient(circle_at_top-left,rgba(205,150,255,0.06),transparent_60%)]" />
            <StatCard
              label="Drift Alerts"
              value={stats.driftAlerts}
              color={stats.driftAlerts > 0 ? "text-amber-400" : "text-secondary"}
              glow={stats.driftAlerts > 0
                ? "bg-[radial-gradient(circle_at_top-left,rgba(251,191,36,0.08),transparent_60%)]"
                : "bg-[radial-gradient(circle_at_top-left,rgba(64,206,243,0.06),transparent_60%)]"}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-8 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 font-label text-[10px] uppercase tracking-widest transition-all ${
                tab === t.id
                  ? "bg-primary-container text-on-primary-container shadow-[inset_0_1px_0_rgba(205,150,255,0.20)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-panel p-8">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
                Most Active Operators
              </h3>
              <div className="space-y-4">
                {[...operators]
                  .sort((a, b) => b.messageCount - a.messageCount)
                  .slice(0, 5)
                  .map((op) => (
                    <div key={op.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-sans text-sm text-on-surface">{op.name}</div>
                        <div className="font-label text-[10px] text-muted-foreground mt-0.5">{op.ownerEmail}</div>
                      </div>
                      <span className="font-mono text-xs text-secondary">
                        {op.messageCount.toLocaleString()} msg
                      </span>
                    </div>
                  ))}
                {operators.length === 0 && (
                  <p className="text-muted-foreground text-sm">No operators yet.</p>
                )}
              </div>
            </div>

            <div className="glass-panel p-8">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
                Recent Registrations
              </h3>
              <div className="space-y-4">
                {[...owners]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 5)
                  .map((o) => (
                    <div key={o.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-sans text-sm text-on-surface">{o.email}</div>
                        <div className="font-label text-[10px] text-muted-foreground mt-0.5">
                          {o.operatorCount} operator{o.operatorCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {o.isSovereignAdmin && (
                        <span className="font-label text-[10px] uppercase tracking-widest text-primary">Admin</span>
                      )}
                    </div>
                  ))}
                {owners.length === 0 && (
                  <p className="text-muted-foreground text-sm">No owners yet.</p>
                )}
              </div>
            </div>

            {driftAlerts.length > 0 && (
              <div className="glass-panel p-8 md:col-span-2 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/60" />
                <div className="flex items-center gap-3 mb-6">
                  <span className="status-beacon-warn" />
                  <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-amber-400">
                    Active Drift Warnings
                  </h3>
                </div>
                <div className="space-y-3">
                  {driftAlerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-sans text-sm text-on-surface">{alert.operatorName}</div>
                        <div className="font-label text-[10px] text-muted-foreground mt-0.5">{alert.ownerEmail}</div>
                      </div>
                      <DriftBar score={alert.driftScore} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Owners tab */}
        {tab === "owners" && (
          <div className="glass-panel overflow-hidden">
            <div className="px-8 py-5 flex items-center justify-between">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                All Owners — {owners.length} total
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-high/50">
                    {["Email", "Name", "Operators", "Registered", "Role", "Actions"].map((h) => (
                      <th key={h} className="pl-6 pr-4 py-3 text-left font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o, i) => (
                    <tr key={o.id} className={i % 2 === 0 ? "bg-transparent" : "bg-surface-container/30"}>
                      <td className="pl-6 pr-4 py-4 font-mono text-sm text-on-surface">{o.email}</td>
                      <td className="pl-6 pr-4 py-4 font-sans text-sm text-on-surface-variant">{o.name ?? "—"}</td>
                      <td className="pl-6 pr-4 py-4 font-mono text-sm text-secondary">{o.operatorCount}</td>
                      <td className="pl-6 pr-4 py-4 font-label text-[10px] text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </td>
                      <td className="pl-6 pr-4 py-4">
                        <button
                          onClick={() => toggleAdmin(o.id)}
                          disabled={togglingId === o.id || o.id === owner?.id}
                          className={`font-label text-[10px] uppercase tracking-widest transition-opacity ${
                            o.isSovereignAdmin ? "text-primary" : "text-muted-foreground hover:text-primary"
                          } disabled:opacity-40`}
                        >
                          {togglingId === o.id ? "…" : o.isSovereignAdmin ? "Admin" : "User"}
                        </button>
                      </td>
                      <td className="pl-6 pr-4 py-4">
                        {o.id !== owner?.id && (
                          <button
                            onClick={() => setConfirmDeleteOwner(o.id)}
                            className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {owners.length === 0 && (
                    <tr>
                      <td colSpan={6} className="pl-6 py-12 text-muted-foreground text-sm">No owners found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Operators tab */}
        {tab === "operators" && (
          <div className="glass-panel overflow-hidden">
            <div className="px-8 py-5">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                All Operators — {operators.length} total
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-high/50">
                    {["Operator", "Owner", "Messages", "Drift", "GROW Lock", "Safe Mode", "Actions"].map((h) => (
                      <th key={h} className="pl-6 pr-4 py-3 text-left font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operators.map((op, i) => (
                    <tr key={op.id} className={i % 2 === 0 ? "bg-transparent" : "bg-surface-container/30"}>
                      <td className="pl-6 pr-4 py-4 font-sans text-sm text-on-surface">{op.name}</td>
                      <td className="pl-6 pr-4 py-4 font-mono text-xs text-muted-foreground">{op.ownerEmail}</td>
                      <td className="pl-6 pr-4 py-4 font-mono text-xs text-on-surface-variant">
                        {op.messageCount.toLocaleString()}
                      </td>
                      <td className="pl-6 pr-4 py-4">
                        <DriftBar score={op.driftScore} />
                      </td>
                      <td className="pl-6 pr-4 py-4">
                        <select
                          value={op.growLockLevel}
                          onChange={(e) => changeGrowLock(op.id, e.target.value)}
                          disabled={growLocking === op.id}
                          className={`bg-transparent border border-border/30 rounded px-2 py-1 text-[10px] font-label uppercase tracking-widest focus:outline-none focus:border-primary/50 disabled:opacity-40 cursor-pointer ${GROW_COLORS[op.growLockLevel] ?? "text-muted-foreground"}`}
                        >
                          {GROW_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl} className="text-foreground bg-surface-container">
                              {lvl}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="pl-6 pr-4 py-4">
                        <button
                          onClick={() => toggleSafeMode(op)}
                          disabled={togglingId === op.id}
                          className={`font-label text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40 ${
                            op.safeMode ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-secondary"
                          }`}
                        >
                          {togglingId === op.id ? "…" : op.safeMode ? "On" : "Off"}
                        </button>
                      </td>
                      <td className="pl-6 pr-4 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openInspect(op)}
                            className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                          >
                            Inspect
                          </button>
                          <button
                            onClick={() => setConfirmDeleteOp(op.id)}
                            className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {operators.length === 0 && (
                    <tr>
                      <td colSpan={7} className="pl-6 py-12 text-muted-foreground text-sm">No operators found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Drift alerts tab */}
        {tab === "drift" && (
          <div className="space-y-4">
            {driftAlerts.length === 0 ? (
              <div className="glass-panel p-12 text-center">
                <div className="text-secondary mb-4">
                  <span className="status-beacon mx-auto block" />
                </div>
                <p className="font-headline text-xl text-on-surface mb-2">All Systems Nominal</p>
                <p className="text-muted-foreground font-sans text-sm">No soul drift events detected across the operator network.</p>
              </div>
            ) : (
              driftAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="glass-panel p-8 relative overflow-hidden flex items-center justify-between gap-8"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/60" />
                  <div className="pl-4">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="status-beacon-warn" />
                      <span className="font-sans text-base text-on-surface">{alert.operatorName}</span>
                    </div>
                    <div className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                      {alert.ownerEmail} · Flagged {new Date(alert.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-8 flex-shrink-0">
                    <DriftBar score={alert.driftScore} />
                    <span className={`font-label text-[10px] uppercase tracking-widest ${alert.resolvedAt ? "text-secondary" : "text-amber-400"}`}>
                      {alert.resolvedAt ? "Resolved" : "Unresolved"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Platform KB tab */}
        {tab === "rag" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <div>
                  <h3 className="font-headline text-xl text-on-surface mb-1">Platform KB</h3>
                  <p className="font-sans text-xs text-muted-foreground/80">
                    Shared knowledge seeded into every operator. Retrieved during conversations.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="font-mono text-2xl font-bold text-primary">{kbTotal}</span>
                    <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">entries total</span>
                  </div>
                  {seedResult && (
                    <div className="mt-2 font-mono text-xs text-secondary">
                      Seed complete — {seedResult.inserted} inserted · {seedResult.skipped} skipped
                    </div>
                  )}
                </div>
                <button
                  onClick={seedPlatformKb}
                  disabled={seedingKb}
                  className="px-5 py-2.5 bg-primary/10 border border-primary/30 text-primary font-label text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all whitespace-nowrap"
                >
                  {seedingKb ? "Seeding…" : "Seed V1 (100 entries)"}
                </button>
              </div>
            </div>

            {/* Loading Bay */}
            <div className="glass-panel p-6 space-y-5">
              <div>
                <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Platform KB — Loading Bay</h3>
                <p className="font-sans text-xs text-muted-foreground/70">Drop any file or paste a URL — content is chunked, embedded, and seeded into all active operators' knowledge bases.</p>
              </div>

              {!platformUpload.uploading && !platformUpload.result && !platformUpload.multiResult && !platformUpload.error && (
                <div className="space-y-4">
                  <div
                    className="border-2 border-dashed border-border/40 rounded-lg p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all"
                    onClick={() => platformFileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files.length > 0) handleFilesSelected(e.dataTransfer.files);
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary text-lg">↑</span>
                    </div>
                    <div className="text-center">
                      <div className="font-sans text-sm text-on-surface mb-1">Drop any file or click to browse</div>
                      <div className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">PDF · DOCX · TXT · MD · XLSX · CSV · JSON · JSONL · XML · YAML · and more</div>
                      <div className="font-label text-[9px] text-muted-foreground/50 mt-1">Up to 500 MB · Multiple files supported</div>
                    </div>
                    <input
                      ref={platformFileRef}
                      type="file"
                      accept="*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) handleFilesSelected(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground/50">or ingest a URL</span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://docs.example.com/page"
                      value={platformUrlInput}
                      onChange={(e) => setPlatformUrlInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handlePlatformKbIngestUrl(); }}
                      className="flex-1 bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                    />
                    <button
                      onClick={handlePlatformKbIngestUrl}
                      disabled={!platformUrlInput.trim() || !/^https?:\/\//i.test(platformUrlInput)}
                      className="px-5 py-2.5 bg-primary/10 border border-primary/30 text-primary font-label text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all whitespace-nowrap"
                    >
                      Fetch & Ingest
                    </button>
                  </div>

                  {/* Bulk URL expander */}
                  <div className="border border-border/20 rounded-lg overflow-hidden">
                    <button
                      onClick={() => { setBulkUrlOpen(o => !o); setBulkUrlResult(null); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/3 transition-colors"
                    >
                      <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground/70">Bulk ingest — multiple URLs</span>
                      <span className="font-mono text-muted-foreground/40 text-xs">{bulkUrlOpen ? "▲" : "▼"}</span>
                    </button>
                    {bulkUrlOpen && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3">
                        <textarea
                          rows={5}
                          placeholder={"https://example.com/page-1\nhttps://example.com/page-2\nhttps://docs.org/guide"}
                          value={bulkUrlText}
                          onChange={(e) => setBulkUrlText(e.target.value)}
                          className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 resize-y"
                        />
                        {bulkUrlProgress && (
                          <div className="font-label text-[9px] uppercase tracking-widest text-primary animate-pulse">
                            Processing {bulkUrlProgress.current} of {bulkUrlProgress.total}…
                          </div>
                        )}
                        {bulkUrlResult && (
                          <div className="space-y-2">
                            <div className="font-mono text-xs text-secondary">
                              {bulkUrlResult.ingested} ingested · {bulkUrlResult.failed} failed
                            </div>
                            {bulkUrlResult.details.length > 0 && (
                              <div className="max-h-48 overflow-y-auto rounded-lg border border-border/20 divide-y divide-border/10">
                                {bulkUrlResult.details.map((d, i) => {
                                  const seg = (() => { try { const p = new URL(d.url).pathname; return p.split("/").filter(Boolean).pop() || new URL(d.url).hostname; } catch { return d.url; } })();
                                  return (
                                    <div key={i} className="flex items-start gap-2 px-3 py-1.5">
                                      <span className="text-sm mt-px flex-shrink-0">{d.ok ? "✅" : "❌"}</span>
                                      <span className="font-mono text-[10px] text-muted-foreground truncate flex-1" title={d.url}>{seg}</span>
                                      <span className={`font-label text-[9px] whitespace-nowrap ${d.ok ? "text-secondary" : "text-destructive/70"}`}>
                                        {d.ok ? `${d.chunks} chunks` : d.error}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={handleBulkUrlIngest}
                          disabled={!!bulkUrlProgress || bulkUrlText.split("\n").filter(u => /^https?:\/\//i.test(u.trim())).length === 0}
                          className="px-5 py-2 bg-primary/10 border border-primary/30 text-primary font-label text-[9px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all"
                        >
                          {bulkUrlProgress ? `Processing ${bulkUrlProgress.current} of ${bulkUrlProgress.total}…` : "Ingest All URLs"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {platformUpload.uploading && (
                <div className="border border-border/30 rounded-lg p-8 flex flex-col items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <div className="font-label text-[10px] uppercase tracking-widest text-primary animate-pulse">
                    {platformUpload.uploadMsg ?? "Processing — embedding chunks…"}
                  </div>
                  <p className="font-sans text-xs text-muted-foreground text-center">This may take a moment depending on file size.</p>
                </div>
              )}

              {platformUpload.result && (
                <div className="border border-secondary/30 rounded-lg p-6 space-y-4 bg-secondary/5">
                  <div className="flex items-center gap-3">
                    <span className="status-beacon" />
                    <span className="font-label text-[10px] uppercase tracking-widest text-secondary">Upload Complete</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Source</div>
                      <div className="font-mono text-xs text-on-surface truncate" title={platformUpload.result.source}>{platformUpload.result.source}</div>
                    </div>
                    <div>
                      <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Chunks</div>
                      <div className="font-headline text-xl font-bold text-secondary">{platformUpload.result.chunks}</div>
                    </div>
                    <div>
                      <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Operators Seeded</div>
                      <div className="font-headline text-xl font-bold text-primary">{platformUpload.result.operators}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: null })}
                    className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                  >
                    Upload another file
                  </button>
                </div>
              )}

              {platformUpload.multiResult && (
                <div className="border border-secondary/30 rounded-lg p-6 space-y-4 bg-secondary/5">
                  <div className="flex items-center gap-3">
                    <span className="status-beacon" />
                    <span className="font-label text-[10px] uppercase tracking-widest text-secondary">Batch Upload Complete</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Files</div>
                      <div className="font-headline text-xl font-bold text-primary">{platformUpload.multiResult.files}</div>
                    </div>
                    <div>
                      <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Total Chunks</div>
                      <div className="font-headline text-xl font-bold text-secondary">{platformUpload.multiResult.totalChunks}</div>
                    </div>
                    <div>
                      <div className="font-label text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Failed</div>
                      <div className={`font-headline text-xl font-bold ${platformUpload.multiResult.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}>{platformUpload.multiResult.failed}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: null })}
                    className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                  >
                    Upload more files
                  </button>
                </div>
              )}

              {platformUpload.error && (
                <div className="border border-destructive/30 rounded-lg p-6 space-y-3 bg-destructive/5">
                  <div className="flex items-center gap-3">
                    <span className="status-beacon-warn" />
                    <span className="font-label text-[10px] uppercase tracking-widest text-destructive">Upload Failed</span>
                  </div>
                  <p className="font-sans text-xs text-muted-foreground">{platformUpload.error}</p>
                  <button
                    onClick={() => setPlatformUpload({ uploading: false, uploadMsg: null, result: null, multiResult: null, error: null })}
                    className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-border/25 mx-1" />

            {/* Entry list */}
            <div className="glass-panel overflow-hidden">
              <div className="px-6 py-4 border-b border-border/30 bg-surface-container-high/30">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="grid grid-cols-[24px_1fr_120px_80px_100px_60px] gap-4 flex-1">
                    <input
                      type="checkbox"
                      checked={platformKbEntries.length > 0 && selectedKbEntries.size === platformKbEntries.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedKbEntries(new Set(platformKbEntries.map(en => en.base_id)));
                        else setSelectedKbEntries(new Set());
                      }}
                      className="accent-primary mt-0.5"
                      title="Select all"
                    />
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Content</span>
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Source</span>
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Score</span>
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Date</span>
                    <span />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground/50">
                      {kbTotal} {kbTotal === 1 ? "entry" : "entries"} total
                    </span>
                    {selectedKbEntries.size > 0 && (
                      <button
                        onClick={handleBulkDeleteSelected}
                        disabled={deletingSelected}
                        className="px-4 py-1.5 bg-destructive/10 border border-destructive/30 text-destructive font-label text-[9px] uppercase tracking-widest rounded-lg hover:bg-destructive/20 disabled:opacity-40 transition-all whitespace-nowrap"
                      >
                        {deletingSelected ? "Deleting…" : `Delete Selected (${selectedKbEntries.size})`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {platformKbEntries.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="font-sans text-sm text-muted-foreground mb-4">
                    No platform knowledge seeded yet.
                  </p>
                  <p className="font-label text-[10px] uppercase tracking-widest text-muted-foreground/60">
                    Click &ldquo;Seed V1&rdquo; to load the 100 core entries.
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-border/10">
                    {platformKbEntries.map((entry, idx) => {
                      const isSelected = selectedKbEntries.has(entry.base_id);
                      const displaySource = entry.source_name?.replace("_platform-kb", "v1").replace(/^_upload:/, "upload:").replace(/^_url:/, "url:") ?? "—";
                      const rawSource = entry.source_name ?? "";
                      const isUrl = rawSource.startsWith("_url:") || rawSource.startsWith("http");
                      const sourceUrl = isUrl ? (rawSource.startsWith("_url:") ? rawSource.slice(5) : rawSource) : null;
                      const rowBg = isSelected ? "bg-primary/5" : idx % 2 === 0 ? "hover:bg-white/2" : "bg-white/[0.015] hover:bg-white/3";
                      return (
                        <div key={entry.id} className={`px-6 py-4 grid grid-cols-[24px_1fr_120px_80px_100px_60px] gap-4 items-start transition-colors ${rowBg}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedKbEntries(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(entry.base_id);
                                else next.delete(entry.base_id);
                                return next;
                              });
                            }}
                            className="accent-primary mt-0.5"
                          />
                          <p className="font-sans text-xs text-on-surface leading-relaxed">
                            {entry.content.length > 100 ? entry.content.slice(0, 100) + "…" : entry.content}
                          </p>
                          <span className="font-label text-[9px] uppercase tracking-widest truncate" title={displaySource}>
                            {sourceUrl ? (
                              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:text-primary transition-colors">
                                {displaySource}
                              </a>
                            ) : (
                              <span className="text-muted-foreground/70">{displaySource}</span>
                            )}
                          </span>
                          <span className="font-mono text-xs text-secondary">{entry.confidence_score}</span>
                          <span className="font-label text-[9px] text-muted-foreground" title={new Date(entry.created_at).toLocaleString()}>
                            {timeAgo(entry.created_at)}
                          </span>
                          <button
                            onClick={() => deletePlatformKbEntry(entry.base_id)}
                            disabled={deletingKbEntry === entry.base_id}
                            className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors text-right"
                          >
                            {deletingKbEntry === entry.base_id ? "…" : "Delete"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {Math.ceil(kbTotal / KB_LIMIT) > 1 && (
                    <div className="px-6 py-3 border-t border-border/20 flex items-center justify-center gap-4">
                      <button
                        onClick={() => setKbPage(p => Math.max(1, p - 1))}
                        disabled={kbPage === 1}
                        className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                      >
                        ← Previous
                      </button>
                      <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground/60">
                        Page {kbPage} of {Math.ceil(kbTotal / KB_LIMIT)}
                      </span>
                      <button
                        onClick={() => setKbPage(p => Math.min(Math.ceil(kbTotal / KB_LIMIT), p + 1))}
                        disabled={kbPage >= Math.ceil(kbTotal / KB_LIMIT)}
                        className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

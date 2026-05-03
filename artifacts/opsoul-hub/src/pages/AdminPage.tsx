import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";


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

type Tab = "overview" | "owners" | "operators" | "drift" | "rag" | "vael";

interface VaelRunState {
  isRunning: boolean;
  lastRunType: "full" | "validate" | null;
  lastRunAt: string | null;
  lastRunDurationSec: number | null;
  lastRunSummary: string | null;
  sweepSchedule: string;
  validateSchedule: string;
}

interface DnaEntry {
  id: string;
  layer: string;
  archetype: string | null;
  title: string;
  content: string;
  tags: string[];
  sourceName: string | null;
  confidence: number | null;
  knowledgeStatus: "current" | "upgraded" | "deprecated" | "draft";
  isActive: boolean;
  hasEmbedding: boolean;
  dnaScope: string;
  archetypeScope: string[];
  domainTags: string[];
  createdAt: string;
  updatedAt: string;
}

interface RagSource {
  id: string;
  name: string;
  sourceType: string;
  url: string;
  notes: string | null;
  isActive: boolean;
  lastFetchAt: string | null;
  lastFetchCount: number | null;
  createdAt: string;
}

interface VaelVerificationRun {
  id: string;
  operatorId: string;
  entryId: string;
  runNumber: number;
  sourceFound: boolean;
  sourceUrl: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  actionTaken: string | null;
  createdAt: string;
}

function StatCard({ label, value, color }: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white border border-border p-8 relative overflow-hidden">
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
  const color = score > 0.30 ? "#fbbf24" : "#1B4FD8";
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

  // ── VAEL Desk state ────────────────────────────────────────────────────────
  type VaelPanel = "drop" | "inbox" | "library" | "sources" | "runs";
  const [vaelPanel, setVaelPanel] = useState<VaelPanel>("drop");
  const [vaelStatus, setVaelStatus] = useState<VaelRunState | null>(null);
  const [vaelTriggerLoading, setVaelTriggerLoading] = useState(false);
  const [vaelTriggerMsg, setVaelTriggerMsg] = useState<string | null>(null);

  // Drop Zone
  const [vaelUrlInput, setVaelUrlInput] = useState("");
  const [vaelTextInput, setVaelTextInput] = useState("");
  const [vaelLabel, setVaelLabel] = useState("");
  const [vaelDropLoading, setVaelDropLoading] = useState(false);
  const [vaelDropResult, setVaelDropResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Pending Inbox
  const [vaelInbox, setVaelInbox] = useState<{ pending: string[]; processed: string[] }>({ pending: [], processed: [] });
  const [vaelInboxLoading, setVaelInboxLoading] = useState(false);

  // DNA Library
  const [dnaEntries, setDnaEntries] = useState<DnaEntry[]>([]);
  const [dnaLoading, setDnaLoading] = useState(false);
  const [dnaStatusFilter, setDnaStatusFilter] = useState<string>("all");
  const [dnaSearch, setDnaSearch] = useState("");
  const [dnaExpanded, setDnaExpanded] = useState<string | null>(null);
  const [dnaDeprecating, setDnaDeprecating] = useState<string | null>(null);
  const [dnaDeleting, setDnaDeleting] = useState<string | null>(null);

  // Sources
  const [ragSources, setRagSources] = useState<RagSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState("raw_url");
  const [addingSource, setAddingSource] = useState(false);
  const [togglingSource, setTogglingSource] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);

  // Verification Runs
  const [vaelRuns, setVaelRuns] = useState<VaelVerificationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

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

  // ── VAEL Desk functions ────────────────────────────────────────────────────

  async function loadVaelStatus() {
    try {
      const s = await apiFetch<VaelRunState>("/admin/rag/vael/status");
      setVaelStatus(s);
    } catch { /* silent */ }
  }

  async function loadVaelInbox() {
    setVaelInboxLoading(true);
    try {
      const data = await apiFetch<{ pending: string[]; processed: string[] }>("/admin/rag/inbox");
      setVaelInbox(data);
    } catch {
      setVaelInbox({ pending: [], processed: [] });
    } finally {
      setVaelInboxLoading(false);
    }
  }

  async function loadDnaEntries() {
    setDnaLoading(true);
    try {
      const params = new URLSearchParams();
      if (dnaStatusFilter !== "all") params.set("status", dnaStatusFilter);
      const entries = await apiFetch<DnaEntry[]>(`/admin/rag/entries?${params.toString()}`);
      setDnaEntries(entries);
    } catch {
      setDnaEntries([]);
    } finally {
      setDnaLoading(false);
    }
  }

  async function loadRagSources() {
    setSourcesLoading(true);
    try {
      const sources = await apiFetch<RagSource[]>("/admin/rag/sources");
      setRagSources(sources);
    } catch {
      setRagSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }

  async function loadVaelRuns() {
    setRunsLoading(true);
    try {
      const runs = await apiFetch<VaelVerificationRun[]>("/admin/rag/vael/runs");
      setVaelRuns(runs);
    } catch {
      setVaelRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }

  async function triggerVael(mode: "full" | "validate" = "full") {
    setVaelTriggerLoading(true);
    setVaelTriggerMsg(null);
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>("/admin/rag/vael/trigger", {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      setVaelTriggerMsg(r.message);
      setTimeout(() => loadVaelStatus(), 2000);
    } catch (err) {
      setVaelTriggerMsg(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setVaelTriggerLoading(false);
    }
  }

  async function submitVaelUrl() {
    if (!vaelUrlInput.trim() || !vaelLabel.trim()) return;
    setVaelDropLoading(true);
    setVaelDropResult(null);
    try {
      const r = await apiFetch<{ ok: boolean; filename?: string; error?: string }>("/admin/rag/vael/inbox-url", {
        method: "POST",
        body: JSON.stringify({ url: vaelUrlInput.trim(), label: vaelLabel.trim() }),
      });
      if (r.ok) {
        setVaelDropResult({ ok: true, msg: `Queued as ${r.filename} — VAEL will verify on next sweep` });
        setVaelUrlInput("");
        setVaelLabel("");
        await loadVaelInbox();
      } else {
        setVaelDropResult({ ok: false, msg: r.error ?? "Failed" });
      }
    } catch (err) {
      setVaelDropResult({ ok: false, msg: err instanceof Error ? err.message : "Failed" });
    } finally {
      setVaelDropLoading(false);
    }
  }

  async function submitVaelText() {
    if (!vaelTextInput.trim() || !vaelLabel.trim()) return;
    setVaelDropLoading(true);
    setVaelDropResult(null);
    try {
      const r = await apiFetch<{ ok: boolean; filename?: string; error?: string }>("/admin/rag/vael/inbox-text", {
        method: "POST",
        body: JSON.stringify({ content: vaelTextInput.trim(), label: vaelLabel.trim() }),
      });
      if (r.ok) {
        setVaelDropResult({ ok: true, msg: `Queued as ${r.filename} — VAEL will verify on next sweep` });
        setVaelTextInput("");
        setVaelLabel("");
        await loadVaelInbox();
      } else {
        setVaelDropResult({ ok: false, msg: r.error ?? "Failed" });
      }
    } catch (err) {
      setVaelDropResult({ ok: false, msg: err instanceof Error ? err.message : "Failed" });
    } finally {
      setVaelDropLoading(false);
    }
  }

  async function deprecateDna(id: string) {
    setDnaDeprecating(id);
    try {
      await apiFetch(`/admin/rag/entries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ knowledgeStatus: "deprecated", isActive: false }),
      });
      await loadDnaEntries();
    } finally {
      setDnaDeprecating(null);
    }
  }

  async function deleteDna(id: string) {
    setDnaDeleting(id);
    try {
      await apiFetch(`/admin/rag/entries/${id}`, { method: "DELETE" });
      setDnaEntries(prev => prev.filter(e => e.id !== id));
    } finally {
      setDnaDeleting(null);
    }
  }

  async function toggleSource(source: RagSource) {
    setTogglingSource(source.id);
    try {
      const updated = await apiFetch<RagSource>(`/admin/rag/sources/${source.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !source.isActive }),
      });
      setRagSources(prev => prev.map(s => s.id === updated.id ? updated : s));
    } finally {
      setTogglingSource(null);
    }
  }

  async function deleteSource(id: string) {
    setDeletingSource(id);
    try {
      await apiFetch(`/admin/rag/sources/${id}`, { method: "DELETE" });
      setRagSources(prev => prev.filter(s => s.id !== id));
    } finally {
      setDeletingSource(null);
    }
  }

  async function addSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    setAddingSource(true);
    try {
      const created = await apiFetch<RagSource>("/admin/rag/sources", {
        method: "POST",
        body: JSON.stringify({ name: newSourceName.trim(), url: newSourceUrl.trim(), sourceType: newSourceType }),
      });
      setRagSources(prev => [...prev, created]);
      setNewSourceName("");
      setNewSourceUrl("");
    } catch { /* show error */ } finally {
      setAddingSource(false);
    }
  }

  // Load VAEL data when tab is opened
  const vaelLoaded = useRef(false);
  useEffect(() => {
    if (tab !== "vael") return;
    if (vaelLoaded.current) return;
    vaelLoaded.current = true;
    loadVaelStatus();
    loadVaelInbox();
    loadDnaEntries();
    loadRagSources();
    loadVaelRuns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Reload DNA when filter changes
  useEffect(() => {
    if (tab !== "vael") return;
    loadDnaEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dnaStatusFilter]);

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
    { id: "vael", label: "VAEL Desk" },
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
      {/* Inspect modal */}
      {inspectOp && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => { setInspectOp(null); setInspectConvId(null); }} />
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
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted transition-colors text-left"
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
          <div className="absolute inset-0 bg-black/20" onClick={() => setConfirmDeleteOp(null)} />
          <div className="relative z-10 bg-white border border-border p-8 max-w-sm w-full mx-4">
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
          <div className="absolute inset-0 bg-black/20" onClick={() => setConfirmDeleteOwner(null)} />
          <div className="relative z-10 bg-white border border-border p-8 max-w-sm w-full mx-4">
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
            <StatCard label="Total Owners" value={stats.totalOwners} color="text-primary" />
            <StatCard label="Total Operators" value={stats.totalOperators} color="text-secondary" />
            <StatCard label="Messages (24h)" value={stats.messagesLast24h.toLocaleString()} color="text-primary" />
            <StatCard
              label="Drift Alerts"
              value={stats.driftAlerts}
              color={stats.driftAlerts > 0 ? "text-amber-500" : "text-secondary"}
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
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-border p-8">
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

            <div className="bg-white border border-border p-8">
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
              <div className="bg-white border border-border p-8 md:col-span-2 relative overflow-hidden">
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
          <div className="bg-white border border-border overflow-hidden">
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
          <div className="bg-white border border-border overflow-hidden">
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
              <div className="bg-white border border-border p-12 text-center">
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
                  className="bg-white border border-border p-8 relative overflow-hidden flex items-center justify-between gap-8"
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
            <div className="bg-white border border-border p-6">
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
            <div className="bg-white border border-border p-6 space-y-5">
              <div>
                <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Platform KB — Loading Bay</h3>
                <p className="font-sans text-xs text-muted-foreground/70">Drop any file or paste a URL — content is chunked, embedded, and seeded into all active operators' knowledge bases.</p>
              </div>

              {!platformUpload.uploading && !platformUpload.result && !platformUpload.multiResult && !platformUpload.error && (
                <div className="space-y-4">
                  <div
                    className="border-2 border-dashed border-border/40 rounded-lg p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-primary/40 hover:bg-accent transition-all"
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
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted transition-colors"
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
            <div className="bg-white border border-border overflow-hidden">
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
                      const rowBg = isSelected ? "bg-accent" : idx % 2 === 0 ? "hover:bg-muted" : "bg-muted/30 hover:bg-muted";
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


        {/* VAEL Desk tab */}
        {tab === "vael" && (() => {
          const dnaFiltered = dnaEntries.filter(e =>
            dnaSearch.trim()
              ? e.title.toLowerCase().includes(dnaSearch.toLowerCase()) ||
                e.content.toLowerCase().includes(dnaSearch.toLowerCase())
              : true
          );

          const confidenceBar = (conf: number | null) => {
            const pct = conf != null ? Math.round(conf * 100) : 0;
            const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
            return (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <span className="font-mono text-xs" style={{ color }}>{pct}%</span>
              </div>
            );
          };

          const statusBadge = (status: string) => {
            const map: Record<string, string> = {
              current: "bg-secondary/10 text-secondary border-secondary/30",
              upgraded: "bg-primary/10 text-primary border-primary/30",
              deprecated: "bg-muted text-muted-foreground border-border/40",
              draft: "bg-amber-500/10 text-amber-400 border-amber-400/30",
            };
            return (
              <span className={`inline-block px-2 py-0.5 rounded border font-label text-[9px] uppercase tracking-widest ${map[status] ?? map.draft}`}>
                {status}
              </span>
            );
          };

          const VAEL_PANELS: { id: VaelPanel; label: string; count?: number }[] = [
            { id: "drop", label: "Submit to VAEL" },
            { id: "inbox", label: "Pending Inbox", count: vaelInbox.pending.length },
            { id: "library", label: "DNA Library", count: dnaEntries.length },
            { id: "sources", label: "Discovery Sources", count: ragSources.length },
            { id: "runs", label: "Pipeline Runs", count: vaelRuns.length },
          ];

          return (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white border border-border p-6">
                <div className="flex items-center justify-between gap-6 flex-wrap">
                  <div>
                    <h3 className="font-headline text-xl text-on-surface mb-1">VAEL Intelligence Desk</h3>
                    <p className="font-sans text-xs text-muted-foreground/80">
                      All knowledge enters through VAEL. She verifies, classifies, and assigns confidence before it reaches operators.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {vaelStatus && (
                      <div className="text-right">
                        <div className={`font-label text-[10px] uppercase tracking-widest ${vaelStatus.isRunning ? "text-amber-400 animate-pulse" : "text-secondary"}`}>
                          {vaelStatus.isRunning ? "Running now" : vaelStatus.lastRunAt ? `Last run ${timeAgo(vaelStatus.lastRunAt)}` : "Never run"}
                        </div>
                        {vaelStatus.lastRunSummary && (
                          <div className="font-mono text-[9px] text-muted-foreground mt-0.5 max-w-xs truncate" title={vaelStatus.lastRunSummary}>
                            {vaelStatus.lastRunSummary}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => triggerVael("validate")}
                        disabled={vaelTriggerLoading || vaelStatus?.isRunning}
                        className="px-4 py-2 bg-muted border border-border text-muted-foreground font-label text-[9px] uppercase tracking-widest rounded-lg hover:text-primary hover:border-primary/30 disabled:opacity-40 transition-all whitespace-nowrap"
                      >
                        {vaelTriggerLoading ? "Triggering…" : "Validate Only"}
                      </button>
                      <button
                        onClick={() => triggerVael("full")}
                        disabled={vaelTriggerLoading || vaelStatus?.isRunning}
                        className="px-4 py-2 bg-primary/10 border border-primary/30 text-primary font-label text-[9px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all whitespace-nowrap"
                      >
                        {vaelTriggerLoading ? "Triggering…" : "Trigger Full Sweep"}
                      </button>
                    </div>
                  </div>
                </div>
                {vaelTriggerMsg && (
                  <div className="mt-3 font-mono text-xs text-secondary border border-secondary/20 bg-secondary/5 px-4 py-2 rounded">
                    {vaelTriggerMsg}
                  </div>
                )}
              </div>

              {/* Panel tabs */}
              <div className="flex gap-1 flex-wrap">
                {VAEL_PANELS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setVaelPanel(p.id)}
                    className={`px-4 py-1.5 font-label text-[9px] uppercase tracking-widest transition-all ${
                      vaelPanel === p.id
                        ? "bg-primary-container text-on-primary-container border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                    }`}
                  >
                    {p.label}{p.count !== undefined ? ` (${p.count})` : ""}
                  </button>
                ))}
              </div>

              {/* Panel 1: Drop Zone */}
              {vaelPanel === "drop" && (
                <div className="bg-white border border-border p-6 space-y-6">
                  <div>
                    <h4 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Submit Content to VAEL</h4>
                    <p className="font-sans text-xs text-muted-foreground/70">VAEL will verify, classify, and assign confidence. Approved entries enter the DNA library as &ldquo;current&rdquo;.</p>
                  </div>

                  {/* Source label — shared */}
                  <div className="space-y-1.5">
                    <label className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Source Label (required)</label>
                    <input
                      type="text"
                      placeholder="e.g. OpSoul operator lifecycle guide"
                      value={vaelLabel}
                      onChange={(e) => setVaelLabel(e.target.value)}
                      className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {/* URL input */}
                  <div className="space-y-2">
                    <label className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Ingest from URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://docs.example.com/page"
                        value={vaelUrlInput}
                        onChange={(e) => setVaelUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitVaelUrl(); }}
                        className="flex-1 bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                      />
                      <button
                        onClick={submitVaelUrl}
                        disabled={vaelDropLoading || !vaelUrlInput.trim() || !vaelLabel.trim()}
                        className="px-5 py-2.5 bg-primary/10 border border-primary/30 text-primary font-label text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all whitespace-nowrap"
                      >
                        {vaelDropLoading ? "Fetching…" : "Queue URL"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border/30" />
                    <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground/50">or submit text directly</span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>

                  {/* Text input */}
                  <div className="space-y-2">
                    <label className="font-label text-[9px] uppercase tracking-widest text-muted-foreground">Submit Raw Text</label>
                    <textarea
                      rows={6}
                      placeholder="Paste content for VAEL to verify and classify…"
                      value={vaelTextInput}
                      onChange={(e) => setVaelTextInput(e.target.value)}
                      className="w-full bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 resize-y"
                    />
                    <button
                      onClick={submitVaelText}
                      disabled={vaelDropLoading || !vaelTextInput.trim() || !vaelLabel.trim()}
                      className="px-5 py-2.5 bg-primary/10 border border-primary/30 text-primary font-label text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all whitespace-nowrap"
                    >
                      {vaelDropLoading ? "Submitting…" : "Submit Text to VAEL"}
                    </button>
                  </div>

                  {/* Result */}
                  {vaelDropResult && (
                    <div className={`border rounded-lg px-5 py-3 flex items-center gap-3 ${vaelDropResult.ok ? "border-secondary/30 bg-secondary/5" : "border-destructive/30 bg-destructive/5"}`}>
                      <span className={`font-label text-[10px] uppercase tracking-widest ${vaelDropResult.ok ? "text-secondary" : "text-destructive"}`}>
                        {vaelDropResult.ok ? "Queued" : "Error"}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{vaelDropResult.msg}</span>
                      <button
                        onClick={() => setVaelDropResult(null)}
                        className="ml-auto font-label text-[9px] text-muted-foreground hover:text-foreground"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Panel 2: Pending Inbox */}
              {vaelPanel === "inbox" && (
                <div className="bg-white border border-border overflow-hidden">
                  <div className="px-6 py-4 border-b border-border/30 bg-surface-container-high/30 flex items-center justify-between">
                    <div>
                      <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        VAEL Inbox — {vaelInbox.pending.length} file{vaelInbox.pending.length !== 1 ? "s" : ""} waiting
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={loadVaelInbox}
                        disabled={vaelInboxLoading}
                        className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                      >
                        {vaelInboxLoading ? "Loading…" : "Refresh"}
                      </button>
                      <button
                        onClick={() => triggerVael("full")}
                        disabled={vaelTriggerLoading || vaelStatus?.isRunning}
                        className="px-4 py-1.5 bg-primary/10 border border-primary/30 text-primary font-label text-[9px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all"
                      >
                        {vaelStatus?.isRunning ? "VAEL Running…" : "Trigger VAEL Now"}
                      </button>
                    </div>
                  </div>

                  {vaelInbox.pending.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <p className="font-sans text-sm text-secondary mb-2">Inbox is clear</p>
                      <p className="font-label text-[10px] uppercase tracking-widest text-muted-foreground/60">No files waiting for VAEL</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/10">
                      {vaelInbox.pending.map((file, i) => (
                        <div key={i} className={`px-6 py-4 flex items-center justify-between gap-4 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <div className="flex items-center gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                            <span className="font-mono text-sm text-on-surface">{file}</span>
                          </div>
                          <span className="font-label text-[9px] uppercase tracking-widest text-amber-400">Pending</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {vaelInbox.processed.length > 0 && (
                    <>
                      <div className="px-6 py-3 border-t border-border/20 bg-surface-container/30">
                        <span className="font-label text-[9px] uppercase tracking-widest text-muted-foreground/60">
                          Recently Processed ({vaelInbox.processed.length})
                        </span>
                      </div>
                      <div className="divide-y divide-border/10">
                        {vaelInbox.processed.slice(0, 10).map((file, i) => (
                          <div key={i} className="px-6 py-3 flex items-center justify-between gap-4">
                            <span className="font-mono text-xs text-muted-foreground">{file}</span>
                            <span className="font-label text-[9px] uppercase tracking-widest text-secondary">Done</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Panel 3: DNA Library */}
              {vaelPanel === "library" && (
                <div className="bg-white border border-border overflow-hidden">
                  <div className="px-6 py-4 border-b border-border/30 bg-surface-container-high/30">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                          DNA Library — {dnaFiltered.length} {dnaStatusFilter !== "all" ? dnaStatusFilter : "total"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="search"
                          placeholder="Search content…"
                          value={dnaSearch}
                          onChange={(e) => setDnaSearch(e.target.value)}
                          className="bg-surface-container/50 border border-border/40 rounded px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 w-48"
                        />
                        <select
                          value={dnaStatusFilter}
                          onChange={(e) => setDnaStatusFilter(e.target.value)}
                          className="bg-surface-container/50 border border-border/40 rounded px-3 py-1.5 text-[10px] font-label uppercase tracking-widest text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
                        >
                          <option value="all">All</option>
                          <option value="current">Current</option>
                          <option value="draft">Draft</option>
                          <option value="upgraded">Upgraded</option>
                          <option value="deprecated">Deprecated</option>
                        </select>
                        <button
                          onClick={loadDnaEntries}
                          disabled={dnaLoading}
                          className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                        >
                          {dnaLoading ? "Loading…" : "Refresh"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {dnaFiltered.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <p className="font-sans text-sm text-muted-foreground">
                        {dnaLoading ? "Loading…" : "No DNA entries found"}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/10">
                      {dnaFiltered.map((entry, i) => {
                        const isExpanded = dnaExpanded === entry.id;
                        return (
                          <div key={entry.id} className={i % 2 === 0 ? "hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/30"}>
                            <div className="px-6 py-4 grid grid-cols-[1fr_80px_100px_120px_100px] gap-4 items-center">
                              <div>
                                <button
                                  onClick={() => setDnaExpanded(isExpanded ? null : entry.id)}
                                  className="text-left"
                                >
                                  <div className="font-sans text-sm text-on-surface">{entry.title}</div>
                                  <div className="font-label text-[9px] text-muted-foreground mt-0.5 uppercase tracking-widest">
                                    {entry.layer}{entry.archetype ? ` · ${entry.archetype}` : ""}
                                    {entry.sourceName ? ` · ${entry.sourceName.slice(0, 40)}` : ""}
                                  </div>
                                </button>
                              </div>
                              <div>{confidenceBar(entry.confidence)}</div>
                              <div>{statusBadge(entry.knowledgeStatus)}</div>
                              <div className="font-label text-[9px] text-muted-foreground" title={new Date(entry.createdAt).toLocaleString()}>
                                {timeAgo(entry.createdAt)}
                              </div>
                              <div className="flex items-center gap-3 justify-end">
                                {entry.knowledgeStatus !== "deprecated" && (
                                  <button
                                    onClick={() => deprecateDna(entry.id)}
                                    disabled={dnaDeprecating === entry.id}
                                    className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-amber-400 disabled:opacity-40 transition-colors"
                                  >
                                    {dnaDeprecating === entry.id ? "…" : "Deprecate"}
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteDna(entry.id)}
                                  disabled={dnaDeleting === entry.id}
                                  className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
                                >
                                  {dnaDeleting === entry.id ? "…" : "Delete"}
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="px-6 pb-5 space-y-3 bg-surface-container/30 border-t border-border/10">
                                <p className="font-sans text-xs text-on-surface leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                                {entry.tags?.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                    {entry.tags.map(tag => (
                                      <span key={tag} className="px-2 py-0.5 bg-primary/5 border border-primary/20 rounded text-[9px] font-label text-primary/70 uppercase tracking-widest">{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Panel 4: Discovery Sources */}
              {vaelPanel === "sources" && (
                <div className="space-y-4">
                  {/* Add source form */}
                  <div className="bg-white border border-border p-6 space-y-4">
                    <h4 className="font-label text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Add Discovery Source</h4>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_140px_120px] gap-3">
                      <input
                        type="text"
                        placeholder="Source name"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        className="bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                      />
                      <input
                        type="url"
                        placeholder="https://…"
                        value={newSourceUrl}
                        onChange={(e) => setNewSourceUrl(e.target.value)}
                        className="bg-surface-container/50 border border-border/40 rounded-lg px-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                      />
                      <select
                        value={newSourceType}
                        onChange={(e) => setNewSourceType(e.target.value)}
                        className="bg-surface-container/50 border border-border/40 rounded-lg px-3 py-2.5 text-[10px] font-label uppercase tracking-widest text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
                      >
                        <option value="raw_url">Raw URL</option>
                        <option value="github_file">GitHub File</option>
                        <option value="github_repo">GitHub Repo</option>
                        <option value="huggingface">HuggingFace</option>
                      </select>
                      <button
                        onClick={addSource}
                        disabled={addingSource || !newSourceName.trim() || !newSourceUrl.trim()}
                        className="px-5 py-2.5 bg-primary/10 border border-primary/30 text-primary font-label text-[10px] uppercase tracking-widest rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-all"
                      >
                        {addingSource ? "Adding…" : "Add Source"}
                      </button>
                    </div>
                  </div>

                  {/* Sources table */}
                  <div className="bg-white border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border/30 bg-surface-container-high/30">
                      <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                        {ragSources.length} source{ragSources.length !== 1 ? "s" : ""} registered
                      </span>
                    </div>

                    {ragSources.length === 0 ? (
                      <div className="px-6 py-12 text-center">
                        <p className="font-sans text-sm text-muted-foreground">{sourcesLoading ? "Loading…" : "No discovery sources yet"}</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-surface-container-high/50">
                              {["Name", "URL", "Type", "Active", "Last Crawled", "Actions"].map(h => (
                                <th key={h} className="pl-6 pr-4 py-3 text-left font-label text-[9px] uppercase tracking-widest text-muted-foreground">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ragSources.map((src, i) => (
                              <tr key={src.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                                <td className="pl-6 pr-4 py-3 font-sans text-sm text-on-surface">{src.name}</td>
                                <td className="pl-6 pr-4 py-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={src.url}>
                                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">{src.url}</a>
                                </td>
                                <td className="pl-6 pr-4 py-3 font-label text-[9px] uppercase tracking-widest text-muted-foreground">{src.sourceType}</td>
                                <td className="pl-6 pr-4 py-3">
                                  <button
                                    onClick={() => toggleSource(src)}
                                    disabled={togglingSource === src.id}
                                    className={`font-label text-[9px] uppercase tracking-widest transition-colors disabled:opacity-40 ${src.isActive ? "text-secondary" : "text-muted-foreground hover:text-secondary"}`}
                                  >
                                    {togglingSource === src.id ? "…" : src.isActive ? "Active" : "Inactive"}
                                  </button>
                                </td>
                                <td className="pl-6 pr-4 py-3 font-label text-[9px] text-muted-foreground">
                                  {src.lastFetchAt ? timeAgo(src.lastFetchAt) : "—"}
                                  {src.lastFetchCount != null ? ` (${src.lastFetchCount} seeded)` : ""}
                                </td>
                                <td className="pl-6 pr-4 py-3">
                                  <button
                                    onClick={() => deleteSource(src.id)}
                                    disabled={deletingSource === src.id}
                                    className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
                                  >
                                    {deletingSource === src.id ? "…" : "Delete"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Panel 5: Pipeline Runs */}
              {vaelPanel === "runs" && (
                <div className="bg-white border border-border overflow-hidden">
                  <div className="px-6 py-4 border-b border-border/30 bg-surface-container-high/30 flex items-center justify-between">
                    <span className="font-label text-[10px] uppercase tracking-widest text-muted-foreground">
                      Verification Runs — {vaelRuns.length} recent
                    </span>
                    <button
                      onClick={loadVaelRuns}
                      disabled={runsLoading}
                      className="font-label text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                    >
                      {runsLoading ? "Loading…" : "Refresh"}
                    </button>
                  </div>

                  {vaelRuns.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <p className="font-sans text-sm text-muted-foreground">{runsLoading ? "Loading…" : "No verification runs recorded yet"}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-surface-container-high/50">
                            {["Run #", "Entry ID", "Action", "Score Before", "Score After", "Source Found", "Date"].map(h => (
                              <th key={h} className="pl-6 pr-4 py-3 text-left font-label text-[9px] uppercase tracking-widest text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vaelRuns.map((run, i) => (
                            <tr key={run.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                              <td className="pl-6 pr-4 py-3 font-mono text-xs text-muted-foreground">{run.runNumber}</td>
                              <td className="pl-6 pr-4 py-3 font-mono text-xs text-muted-foreground max-w-[120px] truncate" title={run.entryId}>{run.entryId.slice(0, 12)}…</td>
                              <td className="pl-6 pr-4 py-3 font-label text-[9px] uppercase tracking-widest text-on-surface">{run.actionTaken ?? "—"}</td>
                              <td className="pl-6 pr-4 py-3 font-mono text-xs text-muted-foreground">{run.scoreBefore ?? "—"}</td>
                              <td className="pl-6 pr-4 py-3">
                                {run.scoreAfter != null ? (
                                  <span className={`font-mono text-xs ${(run.scoreAfter ?? 0) >= (run.scoreBefore ?? 0) ? "text-secondary" : "text-destructive"}`}>
                                    {run.scoreAfter}
                                  </span>
                                ) : <span className="text-muted-foreground font-mono text-xs">—</span>}
                              </td>
                              <td className="pl-6 pr-4 py-3">
                                <span className={`font-label text-[9px] uppercase tracking-widest ${run.sourceFound ? "text-secondary" : "text-muted-foreground"}`}>
                                  {run.sourceFound ? "Yes" : "No"}
                                </span>
                              </td>
                              <td className="pl-6 pr-4 py-3 font-label text-[9px] text-muted-foreground" title={new Date(run.createdAt).toLocaleString()}>
                                {timeAgo(run.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          );
        })()}

      </main>
    </div>
  );
}

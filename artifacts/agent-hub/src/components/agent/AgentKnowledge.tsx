import {
  Agent,
  useListKnowledge,
  useAddKnowledge,
  useDeleteKnowledge,
  useUploadKnowledgeFile,
  getListKnowledgeQueryKey,
} from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Plus, Trash2, Link as LinkIcon, FileText, File, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AgentKnowledge({ agent }: { agent: Agent }) {
  const { t } = useI18n();
  const { data: knowledge } = useListKnowledge(agent.id);
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<"text" | "url" | "document">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListKnowledgeQueryKey(agent.id) });

  const addMutation = useAddKnowledge({
    mutation: {
      onSuccess: () => {
        invalidate();
        setIsOpen(false);
        setTitle(""); setContent(""); setSourceUrl("");
      },
    },
  });

  const uploadMutation = useUploadKnowledgeFile({
    mutation: {
      onSuccess: () => invalidate(),
      onError: (err: Error) => {
        toast.error(err.message || "Failed to upload file");
      },
    },
  });

  const deleteMutation = useDeleteKnowledge({
    mutation: { onSuccess: invalidate },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content) return;
    addMutation.mutate({
      agentId: agent.id,
      data: { type, title: title || null, content, sourceUrl: sourceUrl || null },
    });
  };

  const handleFileUpload = useCallback(
    (file: File) => {
      const allowed = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
        "text/x-markdown",
      ];
      const allowedExts = ["pdf", "docx", "txt", "md"];
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      if (!allowed.includes(file.type) && !allowedExts.includes(ext)) {
        toast.error("Unsupported file type. Please upload a PDF, .docx, .txt, or .md file.");
        return;
      }

      uploadMutation.mutate({ agentId: agent.id, data: { file } });
    },
    [agent.id, uploadMutation],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "url": return <LinkIcon className="w-5 h-5 text-blue-400" />;
      case "document": return <File className="w-5 h-5 text-emerald-400" />;
      default: return <FileText className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display text-white flex items-center">
          <Database className="w-5 h-5 me-2 text-primary" /> {t("knowledge")}
        </h3>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={onFileInputChange}
          />
          <Button
            size="sm"
            variant="outline"
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 me-2" />
            )}
            {uploadMutation.isPending ? t("uploading") : t("uploadFile")}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-white/10 hover:bg-primary text-white border border-white/10">
                <Plus className="w-4 h-4 me-2" /> {t("addEntry")}
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-white/10 sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="font-display">{t("addEntry")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">{t("type")}</label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger className="bg-black/50 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-white/10">
                      <SelectItem value="text">{t("text")}</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="document">{t("document")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">{t("title")}</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-black/50 border-white/10" />
                </div>
                {type === "url" && (
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted-foreground uppercase">{t("url")}</label>
                    <Input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      className="bg-black/50 border-white/10"
                      placeholder="https://"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">{t("content")}</label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="bg-black/50 border-white/10 min-h-[150px]"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary font-bold"
                  disabled={!content || addMutation.isPending}
                >
                  {t("save")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed transition-colors p-4 text-center text-sm text-muted-foreground cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/10 text-primary"
            : "border-white/10 hover:border-white/20 hover:bg-white/5"
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadMutation.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("dropZoneExtracting")}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" />
            {isDragging ? t("dropZoneDrop") : t("dropZonePrompt")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {knowledge?.map((entry) => (
          <div
            key={entry.id}
            className="glass-panel p-4 rounded-xl border border-white/5 flex items-start gap-4 group"
          >
            <div className="mt-1 p-2 bg-white/5 rounded-lg border border-white/10 shadow-inner">
              {getIcon(entry.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <h4 className="text-white font-medium truncate">
                    {entry.title || `Entry #${entry.id}`}
                  </h4>
                  {entry.sourceFilename && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                      <File className="w-3 h-3 inline me-1 mb-0.5" />
                      {entry.sourceFilename}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity -mt-2 -me-2 shrink-0"
                  onClick={() => deleteMutation.mutate({ agentId: agent.id, id: entry.id })}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{entry.content}</p>
              {entry.sourceUrl && (
                <a
                  href={entry.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline mt-2 inline-flex items-center"
                >
                  <LinkIcon className="w-3 h-3 me-1" /> {entry.sourceUrl}
                </a>
              )}
            </div>
          </div>
        ))}
        {knowledge?.length === 0 && (
          <div className="text-center py-12 border border-white/5 border-dashed rounded-2xl">
            <p className="text-muted-foreground font-mono text-sm">{t("noData")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

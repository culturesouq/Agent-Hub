import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { FilePlus, Trash2, Save, FileText } from 'lucide-react';
import type { Operator } from '@/types';

interface OperatorFile {
  id: string;
  filename: string;
  content: string;
  updatedAt: string;
}

export default function FilesSection({ operator }: { operator: Operator }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<OperatorFile | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: files = [], isLoading } = useQuery<OperatorFile[]>({
    queryKey: ['operator-files', operator.id],
    queryFn: () => apiFetch(`/operators/${operator.id}/files`),
  });

  const createFile = useMutation({
    mutationFn: () => apiFetch(`/operators/${operator.id}/files`, {
      method: 'POST',
      body: JSON.stringify({ filename: newName.trim(), content: '' }),
    }),
    onSuccess: (file: OperatorFile) => {
      qc.invalidateQueries({ queryKey: ['operator-files', operator.id] });
      setSelected(file);
      setNewName('');
      setCreating(false);
      toast({ title: 'File created' });
    },
  });

  const saveFile = useMutation({
    mutationFn: (f: OperatorFile) => apiFetch(`/operators/${operator.id}/files/${f.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: f.content }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator-files', operator.id] });
      toast({ title: 'Saved' });
    },
  });

  const deleteFile = useMutation({
    mutationFn: (fileId: string) => apiFetch(`/operators/${operator.id}/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator-files', operator.id] });
      setSelected(null);
      toast({ title: 'File deleted' });
    },
  });

  return (
    <div className="flex h-full gap-4 font-mono">
      <div className="w-48 shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Files</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCreating(true)}>
            <FilePlus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {creating && (
          <div className="flex gap-1">
            <Input
              autoFocus
              className="h-7 text-xs"
              placeholder="filename.md"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newName.trim()) createFile.mutate();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
            />
          </div>
        )}

        {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}

        {files.map(f => (
          <button
            key={f.id}
            onClick={() => setSelected(f)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded text-left w-full truncate transition-colors
              ${selected?.id === f.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{f.filename}</span>
          </button>
        ))}

        {files.length === 0 && !isLoading && !creating && (
          <p className="text-xs text-muted-foreground">No files yet.</p>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-2">
        {selected ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{selected.filename}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => saveFile.mutate(selected)}
                  disabled={saveFile.isPending}
                >
                  <Save className="w-3 h-3" /> Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                  onClick={() => deleteFile.mutate(selected.id)}
                  disabled={deleteFile.isPending}
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </Button>
              </div>
            </div>
            <Textarea
              className="flex-1 resize-none text-xs font-mono min-h-[400px]"
              value={selected.content}
              onChange={e => setSelected({ ...selected, content: e.target.value })}
              placeholder="Start writing..."
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            Select a file or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

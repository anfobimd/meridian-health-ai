// src/pages/me/QuickTexts.tsx
//
// Manage the current user's dotphrase quick texts.
// Note: project palette has no --teal / --t2 tokens, so we substitute
// --accent (teal) and text-muted-foreground respectively.

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  useQuickTexts,
  type QuickText,
} from "@/hooks/useQuickTexts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const TRIGGER_RE = /^\.[a-z][a-z0-9_]{0,30}$/;
const PREVIEW_LEN = 100;

type DialogMode = { kind: "create" } | { kind: "edit"; row: QuickText };

export default function QuickTextsPage() {
  const { toast } = useToast();
  const {
    quickTexts,
    isLoading,
    error,
    createQuickText,
    updateQuickText,
    deleteQuickText,
  } = useQuickTexts();

  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [trigger, setTrigger] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<QuickText | null>(null);
  const [deleting, setDeleting] = useState(false);

  const triggerValid = TRIGGER_RE.test(trigger);
  const canSave = triggerValid && body.trim().length > 0 && !saving;

  const openCreate = () => {
    setTrigger("");
    setDescription("");
    setBody("");
    setDialogMode({ kind: "create" });
  };

  const openEdit = (row: QuickText) => {
    setTrigger(row.trigger);
    setDescription(row.description ?? "");
    setBody(row.body);
    setDialogMode({ kind: "edit", row });
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogMode(null);
  };

  const handleSave = async () => {
    if (!dialogMode || !canSave) return;
    setSaving(true);
    try {
      if (dialogMode.kind === "create") {
        await createQuickText({
          trigger,
          body,
          description: description.trim() || undefined,
        });
      } else {
        await updateQuickText(dialogMode.row.id, {
          trigger,
          body,
          description: description.trim() ? description.trim() : null,
        });
      }
      toast({ title: "Quick text saved" });
      setDialogMode(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Couldn't save",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteQuickText(pendingDelete.id);
      toast({ title: "Quick text deleted" });
      setPendingDelete(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Couldn't delete",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const sorted = useMemo(
    () => [...quickTexts].sort((a, b) => a.trigger.localeCompare(b.trigger)),
    [quickTexts]
  );

  const truncate = (s: string) =>
    s.length <= PREVIEW_LEN ? s : s.slice(0, PREVIEW_LEN - 1) + "…";

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My Quick Texts</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add new
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Couldn't load quick texts: {error.message}
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <>
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              You don't have any quick texts yet. Click "Add new" above to
              create your first one.
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground mt-3">
            Tip: dotphrase triggers like{" "}
            <span className="font-mono text-[hsl(var(--accent))]">
              .normalvitals
            </span>{" "}
            or{" "}
            <span className="font-mono text-[hsl(var(--accent))]">
              .followup
            </span>{" "}
            save you typing in the chart.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          {sorted.map((q) => (
            <Card key={q.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-[hsl(var(--accent))]">
                    {q.trigger}
                  </div>
                  {q.description && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {q.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {truncate(q.body)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit"
                    onClick={() => openEdit(q)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    onClick={() => setPendingDelete(q)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode?.kind === "edit" ? "Edit quick text" : "New quick text"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qt-trigger">Trigger</Label>
              <Input
                id="qt-trigger"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder=".bp"
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Must start with a dot, then lowercase letters, digits, or
                underscores. Examples: .bp, .normalvitals, .followup_2wk
              </p>
              {trigger.length > 0 && !triggerValid && (
                <p className="text-xs text-destructive">
                  Invalid trigger format.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qt-description">Description (optional)</Label>
              <Input
                id="qt-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this expands to (for your reference)"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qt-body">Body</Label>
              <Textarea
                id="qt-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="The text that will replace the trigger when you type it in a chart."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent)/0.9)]"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quick text?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{pendingDelete?.trigger}". You can
              always recreate it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
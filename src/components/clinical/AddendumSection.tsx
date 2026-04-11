import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, FileWarning, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

interface AddendumSectionProps {
  noteId: string;
  noteStatus: string;
}

export function AddendumSection({ noteId, noteStatus }: AddendumSectionProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [reason, setReason] = useState("");

  const { data: addenda } = useQuery({
    queryKey: ["addenda", noteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_note_addenda")
        .select("*")
        .eq("note_id", noteId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("clinical_note_addenda").insert({
        note_id: noteId,
        author_id: user.id,
        content,
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addenda", noteId] });
      setContent("");
      setReason("");
      setShowForm(false);
      toast.success("Addendum added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isSigned = noteStatus === "signed";

  return (
    <div className="space-y-2">
      {addenda && addenda.length > 0 && (
        <>
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <FileWarning className="h-3 w-3" /> Addenda ({addenda.length})
          </p>
          {addenda.map((a) => (
            <div key={a.id} className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Addendum</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {format(parseISO(a.created_at), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              {a.reason && <p className="text-xs text-muted-foreground italic">Reason: {a.reason}</p>}
              <p className="text-sm">{a.content}</p>
            </div>
          ))}
        </>
      )}

      {isSigned && !showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Addendum
        </Button>
      )}

      {showForm && (
        <div className="border rounded-md p-3 space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Reason for amendment</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Correction, Additional findings" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Addendum content *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Enter addendum text..." rows={3} className="text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => submit.mutate()} disabled={!content.trim() || submit.isPending}>
              {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Submit Addendum
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Phone, Calendar, DollarSign, MessageSquare, StickyNote, Send, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

const NOTE_TYPES = [
  { value: "phone_call", label: "Phone Call", icon: Phone },
  { value: "scheduling", label: "Scheduling", icon: Calendar },
  { value: "billing", label: "Billing", icon: DollarSign },
  { value: "patient_request", label: "Patient Request", icon: MessageSquare },
  { value: "general", label: "General", icon: StickyNote },
] as const;

const typeColors: Record<string, string> = {
  phone_call: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  scheduling: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  billing: "bg-green-500/10 text-green-700 dark:text-green-400",
  patient_request: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  general: "bg-muted text-muted-foreground",
};

export function AdminNotesPanel({
  encounterId,
  patientId,
}: {
  encounterId: string;
  patientId: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [noteType, setNoteType] = useState("general");
  const [content, setContent] = useState("");

  const { data: notes, isLoading } = useQuery({
    queryKey: ["admin-notes", encounterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encounter_admin_notes")
        .select("*, profiles:author_id(display_name)")
        .eq("encounter_id", encounterId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!content.trim()) throw new Error("Note cannot be empty");
      const { error } = await supabase.from("encounter_admin_notes").insert({
        encounter_id: encounterId,
        patient_id: patientId,
        author_id: user!.id,
        note_type: noteType,
        content: content.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notes", encounterId] });
      setContent("");
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Admin Notes</span>
          <Badge variant="secondary" className="text-[10px] ml-auto">{notes?.length ?? 0}</Badge>
        </div>

        {/* Compose */}
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          <Select value={noteType} onValueChange={setNoteType}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <t.icon className="h-3 w-3" /> {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Log a phone call, scheduling note, billing discussion..."
            rows={2}
            className="text-xs resize-none"
          />
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            disabled={!content.trim() || addNote.isPending}
            onClick={() => addNote.mutate()}
          >
            {addNote.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
            Add Note
          </Button>
        </div>

        {/* Notes list */}
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : notes && notes.length > 0 ? (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {notes.map((note: any) => {
              const typeInfo = NOTE_TYPES.find(t => t.value === note.note_type) || NOTE_TYPES[4];
              const Icon = typeInfo.icon;
              return (
                <div key={note.id} className="border rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[9px] h-4 px-1.5 ${typeColors[note.note_type] || typeColors.general}`}>
                      <Icon className="h-2.5 w-2.5 mr-0.5" />{typeInfo.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {format(parseISO(note.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="text-xs">{note.content}</p>
                  <p className="text-[10px] text-muted-foreground">
                    — {(note as any).profiles?.display_name || "Staff"}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground text-center py-3">No admin notes yet</p>
        )}
      </CardContent>
    </Card>
  );
}

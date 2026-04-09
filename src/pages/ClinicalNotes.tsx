import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function ClinicalNotes() {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["clinical-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_notes")
        .select("*, patients(first_name, last_name), providers(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clinical Notes</h1>
        <p className="text-muted-foreground">SOAP notes and documentation</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-32" /></Card>)}</div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium">
                      {(note as any).patients?.first_name} {(note as any).patients?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dr. {(note as any).providers?.last_name ?? "Unknown"} • {format(parseISO(note.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {note.ai_generated && <Badge variant="outline">AI</Badge>}
                    <Badge variant="secondary">{note.status}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {note.subjective && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-1">SUBJECTIVE</p><p className="line-clamp-2">{note.subjective}</p></div>
                  )}
                  {note.objective && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-1">OBJECTIVE</p><p className="line-clamp-2">{note.objective}</p></div>
                  )}
                  {note.assessment && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-1">ASSESSMENT</p><p className="line-clamp-2">{note.assessment}</p></div>
                  )}
                  {note.plan && (
                    <div><p className="text-xs font-semibold text-muted-foreground mb-1">PLAN</p><p className="line-clamp-2">{note.plan}</p></div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No clinical notes yet</p>
            <p className="text-sm text-muted-foreground mt-1">Notes will appear here after appointments are documented</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

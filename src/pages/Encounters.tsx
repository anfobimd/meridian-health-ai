import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Edit } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const statusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  signed: "bg-accent/10 text-accent",
  amended: "bg-muted text-muted-foreground",
};

export default function Encounters() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: encounters, isLoading } = useQuery({
    queryKey: ["encounters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encounters")
        .select("*, patients(first_name, last_name), providers:provider_id(first_name, last_name, credentials)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const createEncounter = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("encounters").insert({
        patient_id: selectedPatient,
        provider_id: selectedProvider || null,
        chief_complaint: chiefComplaint || null,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["encounters"] });
      setDialogOpen(false);
      setSelectedPatient("");
      setSelectedProvider("");
      setChiefComplaint("");
      toast.success("Encounter created");
      navigate(`/encounters/${data.id}/chart`);
    },
    onError: () => toast.error("Failed to create encounter"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Encounters</h1>
          <p className="text-muted-foreground">Clinical encounters and charting</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Encounter</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Start Encounter</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {providers?.map((p) => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name} {p.credentials && `(${p.credentials})`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chief Complaint</Label>
                <Input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. Botox follow-up, TRT labs review, weight loss check-in" />
              </div>
              <Button className="w-full" onClick={() => createEncounter.mutate()} disabled={!selectedPatient || createEncounter.isPending}>
                {createEncounter.isPending ? "Creating..." : "Start Encounter"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
      ) : encounters && encounters.length > 0 ? (
        <div className="space-y-3">
          {encounters.map((enc: any) => (
            <Card key={enc.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/encounters/${enc.id}/chart`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{enc.patients?.first_name} {enc.patients?.last_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {enc.chief_complaint || "No chief complaint"}
                      {enc.providers && ` • Dr. ${enc.providers.last_name}`}
                      {" • "}{format(parseISO(enc.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={statusColors[enc.status] ?? ""}>{enc.status}</Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open encounter chart" onClick={(e) => { e.stopPropagation(); navigate(`/encounters/${enc.id}/chart`); }}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No encounters yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

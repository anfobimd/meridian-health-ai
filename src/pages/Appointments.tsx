import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Calendar, Sparkles, Loader2, DoorOpen, Cpu, AlertTriangle, Brain } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const statusColors: Record<string, string> = {
  booked: "bg-primary/10 text-primary",
  checked_in: "bg-warning/10 text-warning",
  roomed: "bg-blue-500/10 text-blue-600",
  in_progress: "bg-accent/10 text-accent",
  completed: "bg-success/10 text-success",
  no_show: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function Appointments() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [soapDialogOpen, setSoapDialogOpen] = useState(false);
  const [roomingDialogOpen, setRoomingDialogOpen] = useState(false);
  const [selectedApt, setSelectedApt] = useState<any>(null);
  const [soapNote, setSoapNote] = useState<any>(null);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, gender, allergies, medications), providers(id, first_name, last_name, credentials, specialty), treatments(id, name, description, category), rooms:room_id(id, name), devices:device_id(id, name)")
        .order("scheduled_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["all-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: providersList } = useQuery({
    queryKey: ["all-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: treatments } = useQuery({
    queryKey: ["all-treatments"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name, duration_minutes").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms-active"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name, room_type").eq("is_active", true).order("sort_order");
      return data ?? [];
    },
  });

  const { data: devices } = useQuery({
    queryKey: ["devices-active"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("id, name, device_type").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const addAppointment = useMutation({
    mutationFn: async (formData: FormData) => {
      const apt = {
        patient_id: formData.get("patient_id") as string,
        provider_id: formData.get("provider_id") as string || null,
        treatment_id: formData.get("treatment_id") as string || null,
        scheduled_at: formData.get("scheduled_at") as string,
        duration_minutes: parseInt(formData.get("duration") as string) || 30,
        notes: formData.get("notes") as string || null,
        room_id: formData.get("room_id") as string || null,
        device_id: formData.get("device_id") as string || null,
      };
      const { error } = await supabase.from("appointments").insert(apt);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setDialogOpen(false);
      setAiSuggestion(null);
      toast.success("Appointment scheduled");
    },
    onError: () => toast.error("Failed to create appointment"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, room_id, device_id, provider_id }: { id: string; status: string; room_id?: string; device_id?: string; provider_id?: string }) => {
      const updates: any = { status };
      if (status === "checked_in") updates.checked_in_at = new Date().toISOString();
      if (status === "roomed") updates.roomed_at = new Date().toISOString();
      if (status === "completed") updates.completed_at = new Date().toISOString();
      if (room_id) updates.room_id = room_id;
      if (device_id) updates.device_id = device_id;
      if (provider_id) updates.provider_id = provider_id;
      const { error } = await supabase.from("appointments").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setRoomingDialogOpen(false);
      setAiSuggestion(null);
      toast.success("Status updated");
    },
  });

  const requestAiSuggestion = async (treatmentId: string, scheduledAt: string, duration: number) => {
    if (!treatmentId || !scheduledAt) return;
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: { action: "book", treatment_id: treatmentId, scheduled_at: scheduledAt, duration_minutes: duration },
      });
      if (error) throw error;
      setAiSuggestion(data);
      if (data.has_conflict) {
        toast.warning(data.conflict_message || "Device conflict detected!");
      }
    } catch {
      toast.error("Failed to get AI suggestion");
    } finally {
      setLoadingAi(false);
    }
  };

  const openRoomingDialog = async (apt: any) => {
    setSelectedApt(apt);
    setSelectedRoomId("");
    setSelectedDeviceId("");
    setAiSuggestion(null);
    setRoomingDialogOpen(true);
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: {
          action: "room",
          appointment_id: apt.id,
          treatment_id: apt.treatments?.id,
          scheduled_at: apt.scheduled_at,
          duration_minutes: apt.duration_minutes,
          patient_id: apt.patients?.id,
        },
      });
      if (error) throw error;
      setAiSuggestion(data);
      if (data.recommended_room_id) setSelectedRoomId(data.recommended_room_id);
      if (data.recommended_device_id) setSelectedDeviceId(data.recommended_device_id);
    } catch {
      toast.error("Failed to get AI room recommendation");
    } finally {
      setLoadingAi(false);
    }
  };

  const confirmRooming = () => {
    if (!selectedApt) return;
    updateStatus.mutate({
      id: selectedApt.id,
      status: "roomed",
      room_id: selectedRoomId || undefined,
      device_id: selectedDeviceId || undefined,
      provider_id: (!selectedApt.provider_id && aiSuggestion?.recommended_provider_id) ? aiSuggestion.recommended_provider_id : undefined,
    });
  };

  const generateSoapNote = async (apt: any) => {
    setSelectedApt(apt);
    setSoapNote(null);
    setSoapDialogOpen(true);
    setGeneratingNote(true);
    try {
      const { data: priorNotes } = await supabase
        .from("clinical_notes")
        .select("subjective, objective, assessment, plan, created_at")
        .eq("patient_id", apt.patients?.id)
        .order("created_at", { ascending: false })
        .limit(3);

      const { data, error } = await supabase.functions.invoke("ai-soap-note", {
        body: { patient: apt.patients, appointment: apt, treatment: apt.treatments, provider: apt.providers, priorNotes: priorNotes ?? [] },
      });
      if (error) throw error;
      setSoapNote(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate SOAP note");
    } finally {
      setGeneratingNote(false);
    }
  };

  const saveSoapNote = useMutation({
    mutationFn: async () => {
      if (!soapNote || !selectedApt) return;
      const { error } = await supabase.from("clinical_notes").insert({
        patient_id: selectedApt.patients?.id ?? selectedApt.patient_id,
        provider_id: selectedApt.provider_id,
        appointment_id: selectedApt.id,
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
        ai_generated: true,
        status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical-notes"] });
      setSoapDialogOpen(false);
      toast.success("SOAP note saved as draft");
    },
    onError: () => toast.error("Failed to save note"),
  });

  const nextStatus = (current: string) => {
    const flow: Record<string, string> = {
      booked: "checked_in",
      checked_in: "roomed",
      roomed: "in_progress",
      in_progress: "completed",
    };
    return flow[current];
  };

  const handleNextStatus = (apt: any) => {
    const next = nextStatus(apt.status);
    if (!next) return;
    if (next === "roomed") {
      openRoomingDialog(apt);
    } else {
      updateStatus.mutate({ id: apt.id, status: next });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-muted-foreground">Schedule and manage visits</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setAiSuggestion(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Appointment</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); addAppointment.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <select name="patient_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select patient</option>
                  {patients?.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <select name="provider_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={aiSuggestion?.recommended_provider_id ?? ""}>
                  <option value="">AI will auto-assign</option>
                  {providersList?.map((p) => <option key={p.id} value={p.id}>Dr. {p.last_name}, {p.first_name}</option>)}
                </select>
                {aiSuggestion?.recommended_provider_name && (
                  <p className="text-xs text-primary flex items-center gap-1"><Brain className="h-3 w-3" />AI suggests: {aiSuggestion.recommended_provider_name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Treatment</Label>
                <select
                  name="treatment_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  onChange={(e) => {
                    const form = e.target.closest("form");
                    if (!form) return;
                    const fd = new FormData(form);
                    const sa = fd.get("scheduled_at") as string;
                    const dur = parseInt(fd.get("duration") as string) || 30;
                    if (e.target.value && sa) requestAiSuggestion(e.target.value, sa, dur);
                  }}
                >
                  <option value="">Select treatment</option>
                  {treatments?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Date & Time *</Label>
                <Input name="scheduled_at" type="datetime-local" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Duration (min)</Label>
                  <Input name="duration" type="number" defaultValue={30} />
                </div>
                <div className="space-y-2">
                  <Label>Room</Label>
                  <select name="room_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={aiSuggestion?.recommended_room_id ?? ""} onChange={() => {}}>
                    <option value="">None</option>
                    {rooms?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Device</Label>
                <select name="device_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">None</option>
                  {devices?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* AI conflict warning */}
              {aiSuggestion?.has_conflict && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-destructive">{aiSuggestion.conflict_message}</p>
                </div>
              )}
              {aiSuggestion && !aiSuggestion.has_conflict && aiSuggestion.room_reasoning && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <p className="text-xs font-medium text-primary flex items-center gap-1"><Brain className="h-3 w-3" />AI Recommendation</p>
                  <p className="text-xs text-muted-foreground">{aiSuggestion.room_reasoning}</p>
                  {aiSuggestion.provider_reasoning && <p className="text-xs text-muted-foreground">{aiSuggestion.provider_reasoning}</p>}
                </div>
              )}
              {loadingAi && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Getting AI suggestions...</p>}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input name="notes" />
              </div>
              <Button type="submit" className="w-full" disabled={addAppointment.isPending}>
                {addAppointment.isPending ? "Scheduling..." : "Schedule Appointment"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rooming Dialog */}
      <Dialog open={roomingDialogOpen} onOpenChange={setRoomingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary" />
              Room Patient
            </DialogTitle>
          </DialogHeader>
          {loadingAi ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">AI is finding the best room...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {aiSuggestion?.has_conflict && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <p className="text-xs text-destructive">{aiSuggestion.conflict_message}</p>
                </div>
              )}
              {aiSuggestion?.room_reasoning && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <p className="text-xs font-medium text-primary flex items-center gap-1"><Brain className="h-3 w-3" />AI Recommendation</p>
                  <p className="text-xs text-muted-foreground">{aiSuggestion.room_reasoning}</p>
                  {aiSuggestion.provider_reasoning && <p className="text-xs text-muted-foreground mt-1">{aiSuggestion.provider_reasoning}</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label>Room</Label>
                <select value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select room</option>
                  {rooms?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Device</Label>
                <select value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">None</option>
                  {devices?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {!selectedApt?.provider_id && aiSuggestion?.recommended_provider_name && (
                <p className="text-xs text-primary flex items-center gap-1"><Brain className="h-3 w-3" />Provider will be auto-assigned: {aiSuggestion.recommended_provider_name}</p>
              )}
              <Button onClick={confirmRooming} disabled={updateStatus.isPending} className="w-full">
                {updateStatus.isPending ? "Rooming..." : "Confirm Room Assignment"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SOAP Note AI Dialog */}
      <Dialog open={soapDialogOpen} onOpenChange={setSoapDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-Generated SOAP Note
            </DialogTitle>
          </DialogHeader>
          {generatingNote ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating clinical note with AI...</p>
            </div>
          ) : soapNote ? (
            <div className="space-y-4">
              {(["subjective", "objective", "assessment", "plan"] as const).map((section) => (
                <div key={section}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{section}</p>
                  <Textarea value={soapNote[section] || ""} onChange={(e) => setSoapNote({ ...soapNote, [section]: e.target.value })} rows={3} className="text-sm" />
                </div>
              ))}
              <div className="flex gap-2">
                <Button onClick={() => saveSoapNote.mutate()} disabled={saveSoapNote.isPending} className="flex-1">
                  {saveSoapNote.isPending ? "Saving..." : "Save as Draft"}
                </Button>
                <Button variant="outline" onClick={() => setSoapDialogOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No note generated</p>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
      ) : appointments && appointments.length > 0 ? (
        <div className="space-y-3">
          {appointments.map((apt: any) => (
            <Card key={apt.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {apt.patients?.first_name} {apt.patients?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {apt.treatments?.name ?? "General"} • Dr. {apt.providers?.last_name ?? "Unassigned"} • {format(parseISO(apt.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {apt.rooms && (
                        <Badge variant="outline" className="text-[10px] gap-1"><DoorOpen className="h-2.5 w-2.5" />{apt.rooms.name}</Badge>
                      )}
                      {apt.devices && (
                        <Badge variant="outline" className="text-[10px] gap-1"><Cpu className="h-2.5 w-2.5" />{apt.devices.name}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {apt.status === "completed" && (
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => generateSoapNote(apt)}>
                      <Sparkles className="h-3 w-3" /> Generate Note
                    </Button>
                  )}
                  {nextStatus(apt.status) && (
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleNextStatus(apt)}>
                      → {nextStatus(apt.status)!.replace("_", " ")}
                    </Button>
                  )}
                  <Badge variant="secondary" className={statusColors[apt.status] ?? ""}>
                    {apt.status.replace("_", " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No appointments yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Clock, Check, CalendarIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

export default function Waitlist() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [prefDate, setPrefDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const { data: waitlist, isLoading } = useQuery({
    queryKey: ["waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_waitlist")
        .select("*, patients(first_name, last_name), treatments(name), providers(first_name, last_name)")
        .eq("is_fulfilled", false)
        .order("created_at", { ascending: true });
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

  const { data: treatments } = useQuery({
    queryKey: ["treatments-active"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["all-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const addToWaitlist = useMutation({
    mutationFn: async () => {
      const entry = {
        patient_id: patientId,
        treatment_id: treatmentId || null,
        provider_id: providerId || null,
        preferred_date: prefDate ? format(prefDate, "yyyy-MM-dd") : null,
        notes: notes || null,
      };
      const { error } = await supabase.from("appointment_waitlist").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      setDialogOpen(false);
      setPatientId("");
      setTreatmentId("");
      setProviderId("");
      setPrefDate(undefined);
      setNotes("");
      toast.success("Added to waitlist");
    },
    onError: () => toast.error("Failed to add to waitlist"),
  });

  const markFulfilled = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointment_waitlist").update({ is_fulfilled: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success("Marked as fulfilled");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patient Waitlist</h1>
          <p className="text-muted-foreground">Manage patients waiting for appointments</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add to Waitlist</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add to Waitlist</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Desired Treatment</Label>
                <Select value={treatmentId} onValueChange={setTreatmentId}>
                  <SelectTrigger><SelectValue placeholder="Any treatment" /></SelectTrigger>
                  <SelectContent>
                    {treatments?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferred Provider</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger><SelectValue placeholder="Any provider" /></SelectTrigger>
                  <SelectContent>
                    {providers?.map((p) => <SelectItem key={p.id} value={p.id}>Dr. {p.last_name}, {p.first_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferred Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !prefDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {prefDate ? format(prefDate, "PPP") : "Any date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={prefDate}
                      onSelect={setPrefDate}
                      disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests, flexibility..." />
              </div>
              <Button onClick={() => addToWaitlist.mutate()} className="w-full" disabled={!patientId || addToWaitlist.isPending}>
                {addToWaitlist.isPending ? "Adding..." : "Add to Waitlist"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
      ) : waitlist && waitlist.length > 0 ? (
        <div className="space-y-3">
          {waitlist.map((w: any) => (
            <Card key={w.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {w.patients?.first_name} {w.patients?.last_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {w.treatments?.name && <Badge variant="outline" className="text-xs">{w.treatments.name}</Badge>}
                      {w.providers && <Badge variant="secondary" className="text-xs">Dr. {w.providers.last_name}</Badge>}
                      {w.preferred_date && (
                        <span className="text-xs text-muted-foreground">
                          Preferred: {format(new Date(w.preferred_date + "T00:00:00"), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                    {w.notes && <p className="text-xs text-muted-foreground mt-1">{w.notes}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Added {format(new Date(w.created_at), "MMM d 'at' h:mm a")}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => markFulfilled.mutate(w.id)}>
                  <Check className="h-3.5 w-3.5 mr-1" />Fulfilled
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No patients on waitlist</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

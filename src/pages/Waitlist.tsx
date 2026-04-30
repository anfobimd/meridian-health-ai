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
import { Plus, Clock, Check, CalendarIcon, Users, Sparkles, Loader2, MessageSquare, TrendingUp, Trash2, AlertTriangle, Brain, Zap } from "lucide-react";
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
  const [ranking, setRanking] = useState(false);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsTarget, setSmsTarget] = useState<any>(null);
  const [smsDraft, setSmsDraft] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [cancelPredictions, setCancelPredictions] = useState<any[]>([]);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const queryClient = useQueryClient();

  const { data: waitlist, isLoading } = useQuery({
    queryKey: ["waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_waitlist")
        .select("*, patients(first_name, last_name, phone, email), treatments(name), providers(first_name, last_name)")
        .eq("is_fulfilled", false)
        .order("priority_score", { ascending: false });
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
        patient_id: patientId, treatment_id: treatmentId || null,
        provider_id: providerId || null, preferred_date: prefDate ? format(prefDate, "yyyy-MM-dd") : null,
        notes: notes || null,
      };
      const { error } = await supabase.from("appointment_waitlist").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      setDialogOpen(false);
      setPatientId(""); setTreatmentId(""); setProviderId(""); setPrefDate(undefined); setNotes("");
      toast.success("Added to waitlist");
    },
    onError: () => toast.error("Failed to add to waitlist"),
  });

  const markFulfilled = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointment_waitlist").update({ is_fulfilled: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waitlist"] }); toast.success("Marked as fulfilled"); },
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointment_waitlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waitlist"] }); toast.success("Removed from waitlist"); },
  });

  const runAiRanking = async () => {
    setRanking(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-schedule-optimizer", {
        body: { mode: "waitlist_rank", data: {} },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(`Ranked ${data?.ranked?.length || 0} entries by fill probability`);
    } catch { toast.error("Failed to rank waitlist"); }
    setRanking(false);
  };

  const predictCancellations = async () => {
    setLoadingPredictions(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-schedule-optimizer", {
        body: { mode: "cancel_predict", data: {} },
      });
      if (error) throw error;
      setCancelPredictions(data?.predictions || []);
      if (data?.predictions?.length === 0) toast.info("No predicted cancellations for tomorrow");
    } catch { toast.error("Failed to predict cancellations"); }
    setLoadingPredictions(false);
  };

  const openSmsNotify = async (entry: any) => {
    setSmsTarget(entry);
    // Use AI to draft personalized notification
    try {
      const { data } = await supabase.functions.invoke("ai-notification-engine", {
        body: {
          mode: "slot_available_draft",
          data: {
            patient_id: entry.patient_id,
            treatment_name: entry.treatments?.name,
            provider_name: entry.providers ? `Dr. ${entry.providers.last_name}` : null,
          },
        },
      });
      setSmsDraft(data?.sms_draft || `Hi ${entry.patients?.first_name}, a slot just opened up${entry.treatments?.name ? ` for ${entry.treatments.name}` : ""}! Reply YES to book or call us. — Meridian`);
    } catch {
      setSmsDraft(`Hi ${entry.patients?.first_name}, a slot just opened up${entry.treatments?.name ? ` for ${entry.treatments.name}` : ""}! Reply YES to book or call us. — Meridian`);
    }
    setSmsDialogOpen(true);
  };

  const sendSlotSms = async () => {
    if (!smsTarget?.patients?.phone) { toast.error("Patient has no phone number"); return; }
    setSendingSms(true);
    try {
      const { error } = await supabase.functions.invoke("send-sms", { body: { to: smsTarget.patients.phone, body: smsDraft } });
      if (error) throw error;
      await supabase.from("appointment_waitlist").update({ auto_notified_at: new Date().toISOString() } as any).eq("id", smsTarget.id);
      await supabase.from("patient_communication_log").insert({
        patient_id: smsTarget.patient_id, channel: "sms", direction: "outbound",
        content: smsDraft, delivery_status: "sent",
      });
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      setSmsDialogOpen(false);
      toast.success("SMS sent");
    } catch { toast.error("Failed to send SMS"); }
    setSendingSms(false);
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "bg-success/10 text-success border-success/20";
    if (score >= 40) return "bg-warning/10 text-warning border-warning/20";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patient Waitlist</h1>
          <p className="text-muted-foreground">AI-ranked patients waiting for appointments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={predictCancellations} disabled={loadingPredictions}>
            {loadingPredictions ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />}
            Predict Cancellations
          </Button>
          <Button variant="outline" size="sm" onClick={runAiRanking} disabled={ranking}>
            {ranking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            AI Rank
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Add to Waitlist</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add to Waitlist</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Patient *</Label>
                  <Select value={patientId} onValueChange={setPatientId}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>{patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Desired Treatment</Label>
                  <Select value={treatmentId} onValueChange={setTreatmentId}>
                    <SelectTrigger><SelectValue placeholder="Any treatment" /></SelectTrigger>
                    <SelectContent>{treatments?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Provider</Label>
                  <Select value={providerId} onValueChange={setProviderId}>
                    <SelectTrigger><SelectValue placeholder="Any provider" /></SelectTrigger>
                    <SelectContent>{providers?.map((p) => <SelectItem key={p.id} value={p.id}>Dr. {p.last_name}, {p.first_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left", !prefDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />{prefDate ? format(prefDate, "PPP") : "Any date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={prefDate} onSelect={setPrefDate} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} className={cn("p-3 pointer-events-auto")} />
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
      </div>

      {/* Predicted Cancellations Panel */}
      {cancelPredictions.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-warning" />
              Predicted Cancellations — Tomorrow
              <Badge variant="secondary" className="text-[11px]">{cancelPredictions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cancelPredictions.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded border border-warning/20 bg-warning/5 text-xs">
                  <div>
                    <span className="font-medium">{p.patient_name}</span>
                    <span className="text-muted-foreground ml-2">{p.treatment} • {format(new Date(p.scheduled_at), "h:mm a")}</span>
                  </div>
                  <Badge variant={p.risk_level === "high" ? "destructive" : "secondary"} className="text-[11px]">
                    {p.cancel_probability}% risk
                  </Badge>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Brain className="h-2.5 w-2.5" />Pre-notify these patients or prepare waitlist backfills
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SMS Notify Dialog */}
      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Notify Patient — Slot Available</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <p className="text-sm font-medium">{smsTarget?.patients?.first_name} {smsTarget?.patients?.last_name} — {smsTarget?.patients?.phone || "No phone"}</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">Message <Sparkles className="h-3 w-3 text-primary" /><span className="text-[11px] text-primary">AI-drafted</span></Label>
              <Input value={smsDraft} onChange={(e) => setSmsDraft(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">{smsDraft.length}/160 characters</p>
            </div>
            <Button onClick={sendSlotSms} className="w-full" disabled={sendingSms || !smsTarget?.patients?.phone}>
              {sendingSms ? "Sending..." : "Send SMS"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-20" /></Card>)}</div>
      ) : waitlist && waitlist.length > 0 ? (
        <div className="space-y-3">
          {waitlist.map((w: any, idx: number) => (
            <Card key={w.id} className={idx === 0 ? "border-primary/30" : ""}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {idx === 0 ? <TrendingUp className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-primary" />}
                    </div>
                    {(w as any).priority_score != null && (
                      <Badge variant="outline" className={cn("text-[11px] px-1.5", scoreColor((w as any).priority_score))}>
                        {(w as any).priority_score}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {w.patients?.first_name} {w.patients?.last_name}
                      {idx === 0 && <Badge className="ml-2 text-[11px] bg-primary/10 text-primary border-primary/20">Top Match</Badge>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {w.treatments?.name && <Badge variant="outline" className="text-xs">{w.treatments.name}</Badge>}
                      {w.providers && <Badge variant="secondary" className="text-xs">Dr. {w.providers.last_name}</Badge>}
                      {w.preferred_date && (
                        <span className="text-xs text-muted-foreground">Preferred: {format(new Date(w.preferred_date + "T00:00:00"), "MMM d, yyyy")}</span>
                      )}
                    </div>
                    {(w as any).ai_rank_reason && (
                      <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />{(w as any).ai_rank_reason}</p>
                    )}
                    {w.notes && <p className="text-xs text-muted-foreground mt-0.5">{w.notes}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-muted-foreground">Added {format(new Date(w.created_at), "MMM d 'at' h:mm a")}</p>
                      {(w as any).auto_notified_at && (
                        <Badge variant="outline" className="text-[11px] gap-0.5"><MessageSquare className="h-2 w-2" />Notified</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openSmsNotify(w)}>
                    <MessageSquare className="h-3 w-3" />SMS
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => markFulfilled.mutate(w.id)}>
                    <Check className="h-3 w-3" />Fulfilled
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs text-destructive h-8 w-8 p-0" onClick={() => removeEntry.mutate(w.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
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

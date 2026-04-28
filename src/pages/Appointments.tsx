import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, Sparkles, Loader2, DoorOpen, Cpu, AlertTriangle, Brain, Clock, Check, XCircle, Ban, ShieldAlert, Timer, UserCheck, Video, Phone } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, addMinutes } from "date-fns";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { getAvailableSlots, checkConflicts, type TimeSlot } from "@/lib/scheduling";
import { getNoShowRisk } from "@/lib/no-show-risk";

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
  const navigate = useNavigate();
  const [soapDialogOpen, setSoapDialogOpen] = useState(false);
  const [roomingDialogOpen, setRoomingDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedApt, setSelectedApt] = useState<any>(null);
  const [soapNote, setSoapNote] = useState<any>(null);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const queryClient = useQueryClient();

  // Slot picker state
  const [bookingStep, setBookingStep] = useState(0);
  const [bookPatientId, setBookPatientId] = useState("");
  const [bookTreatmentId, setBookTreatmentId] = useState("");
  const [bookProviderId, setBookProviderId] = useState("");
  const [bookDate, setBookDate] = useState<Date | undefined>(undefined);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [conflictResult, setConflictResult] = useState<any>(null);
  const [bookNotes, setBookNotes] = useState("");
  const [bookRoomId, setBookRoomId] = useState("");
  const [bookDeviceId, setBookDeviceId] = useState("");
  const [bookVisitType, setBookVisitType] = useState("in_person");
  const [bookVideoUrl, setBookVideoUrl] = useState("");
  const [bookClinicId, setBookClinicId] = useState("");

  // AI scheduling intelligence state
  const [noShowRisk, setNoShowRisk] = useState<any>(null);
  const [loadingNoShowRisk, setLoadingNoShowRisk] = useState(false);
  const [durationEstimate, setDurationEstimate] = useState<any>(null);
  const [loadingDuration, setLoadingDuration] = useState(false);
  const [providerMatch, setProviderMatch] = useState<any>(null);
  const [loadingProviderMatch, setLoadingProviderMatch] = useState(false);
  const [contraindicationCheck, setContraindicationCheck] = useState<any>(null);
  const [loadingContra, setLoadingContra] = useState(false);

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, gender, allergies, medications, no_show_count), providers(id, first_name, last_name, credentials, specialty), treatments(id, name, description, category), rooms:room_id(id, name), devices:device_id(id, name)")
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

  const { data: clinics } = useQuery({
    queryKey: ["clinics-active"],
    queryFn: async () => {
      const { data } = await supabase.from("clinics").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  // ── AI: No-show risk check when patient is selected ──
  useEffect(() => {
    if (!bookPatientId) { setNoShowRisk(null); return; }
    const run = async () => {
      setLoadingNoShowRisk(true);
      try {
        const { data } = await supabase.functions.invoke("ai-schedule-optimizer", {
          body: { mode: "no_show_risk", data: { patient_id: bookPatientId } },
        });
        setNoShowRisk(data);
      } catch { /* non-fatal */ }
      setLoadingNoShowRisk(false);
    };
    run();
  }, [bookPatientId]);

  // ── AI: Duration estimate + contraindication when patient+treatment selected ──
  useEffect(() => {
    if (!bookPatientId || !bookTreatmentId) { setDurationEstimate(null); setContraindicationCheck(null); return; }
    const run = async () => {
      setLoadingDuration(true);
      setLoadingContra(true);
      try {
        const [durRes, contraRes] = await Promise.all([
          supabase.functions.invoke("ai-schedule-optimizer", {
            body: { mode: "duration_estimate", data: { patient_id: bookPatientId, treatment_id: bookTreatmentId } },
          }),
          supabase.functions.invoke("ai-schedule-optimizer", {
            body: { mode: "contraindication_check", data: { patient_id: bookPatientId, treatment_id: bookTreatmentId } },
          }),
        ]);
        setDurationEstimate(durRes.data);
        setContraindicationCheck(contraRes.data);
      } catch { /* non-fatal */ }
      setLoadingDuration(false);
      setLoadingContra(false);
    };
    run();
  }, [bookPatientId, bookTreatmentId]);

  // ── AI: Provider matching when moving to step 1 ──
  useEffect(() => {
    if (bookingStep !== 1 || !bookPatientId || !bookTreatmentId) { setProviderMatch(null); return; }
    const run = async () => {
      setLoadingProviderMatch(true);
      try {
        const { data } = await supabase.functions.invoke("ai-schedule-optimizer", {
          body: { mode: "provider_match", data: { patient_id: bookPatientId, treatment_id: bookTreatmentId } },
        });
        setProviderMatch(data);
      } catch { /* non-fatal */ }
      setLoadingProviderMatch(false);
    };
    run();
  }, [bookingStep, bookPatientId, bookTreatmentId]);

  const addAppointment = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error("No slot selected");
      const duration = durationEstimate?.suggested_duration || treatments?.find((t) => t.id === bookTreatmentId)?.duration_minutes || 30;

      const result = await checkConflicts(
        bookProviderId || null, bookRoomId || null, bookDeviceId || null,
        selectedSlot.start, addMinutes(selectedSlot.start, duration)
      );
      if (result.hasConflict) {
        setConflictResult(result);
        throw new Error("Conflict detected: " + result.conflicts.map((c) => c.label).join("; "));
      }

      // Auto-link most recent intake form for telehealth bookings
      let intakeFormId: string | null = null;
      if (bookVisitType === "telehealth" && bookPatientId) {
        const { data: recentIntake } = await supabase
          .from("intake_forms")
          .select("id")
          .eq("patient_id", bookPatientId)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .single();
        if (recentIntake) intakeFormId = recentIntake.id;
      }

      const apt: any = {
        patient_id: bookPatientId,
        provider_id: bookProviderId || null,
        treatment_id: bookTreatmentId || null,
        scheduled_at: selectedSlot.start.toISOString(),
        duration_minutes: duration,
        notes: bookNotes || null,
        room_id: bookRoomId || null,
        device_id: bookDeviceId || null,
        visit_type: bookVisitType,
        video_room_url: bookVisitType === "telehealth" ? (bookVideoUrl || null) : null,
        intake_form_id: intakeFormId,
        clinic_id: bookClinicId || null,
      };
      const { error } = await supabase.from("appointments").insert(apt);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      resetBookingForm();
      toast.success("Appointment scheduled");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create appointment"),
  });

  const resetBookingForm = () => {
    setDialogOpen(false);
    setBookingStep(0);
    setBookPatientId(""); setBookTreatmentId(""); setBookProviderId("");
    setBookDate(undefined); setAvailableSlots([]); setSelectedSlot(null);
    setConflictResult(null); setBookNotes(""); setBookRoomId(""); setBookDeviceId("");
    setBookVisitType("in_person"); setBookVideoUrl(""); setBookClinicId("");
    setAiSuggestion(null); setNoShowRisk(null); setDurationEstimate(null);
    setProviderMatch(null); setContraindicationCheck(null);
  };

  const loadSlots = async () => {
    if (!bookProviderId || !bookDate || !bookTreatmentId) return;
    const duration = durationEstimate?.suggested_duration || treatments?.find((t) => t.id === bookTreatmentId)?.duration_minutes || 30;
    setLoadingSlots(true); setSelectedSlot(null); setConflictResult(null);
    try {
      const slots = await getAvailableSlots(bookProviderId, bookDate, duration);
      setAvailableSlots(slots);
    } catch { toast.error("Failed to load available slots"); }
    finally { setLoadingSlots(false); }
  };

  useEffect(() => {
    if (bookProviderId && bookDate && bookTreatmentId) loadSlots();
  }, [bookProviderId, bookDate, bookTreatmentId]);

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
      setRoomingDialogOpen(false); setAiSuggestion(null);
      toast.success("Status updated");
    },
  });

  const CANCEL_REASONS = ["Patient request", "Schedule conflict", "Provider unavailable", "Weather/emergency", "Insurance issue", "No reason given", "Other"];
  const [waitlistMatches, setWaitlistMatches] = useState<any>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [reEngageDraft, setReEngageDraft] = useState<string>("");

  const cancelAppointment = useMutation({
    mutationFn: async () => {
      if (!selectedApt) return;
      const { error } = await supabase.from("appointments").update({
        status: "cancelled", cancellation_reason: cancelReason || "No reason given",
        cancelled_at: new Date().toISOString(),
      }).eq("id", selectedApt.id);
      if (error) throw error;
      const aptTime = new Date(selectedApt.scheduled_at).getTime();
      if (aptTime - Date.now() < 24 * 3600000 && selectedApt.patients?.id) {
        await supabase.from("patients").update({
          late_cancel_count: (selectedApt.patients.late_cancel_count || 0) + 1,
        } as any).eq("id", selectedApt.patients.id);
      }
      setLoadingMatches(true);
      try {
        const { data } = await supabase.functions.invoke("ai-smart-schedule", {
          body: { mode: "cancellation_match", data: { provider_id: selectedApt.provider_id, treatment_id: selectedApt.treatment_id, scheduled_at: selectedApt.scheduled_at, duration_minutes: selectedApt.duration_minutes } },
        });
        if (data?.matches?.length > 0) setWaitlistMatches(data);
      } catch { /* non-fatal */ }
      setLoadingMatches(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (!waitlistMatches) { setCancelDialogOpen(false); setCancelReason(""); }
      toast.success("Appointment cancelled");
    },
  });

  const markNoShow = useMutation({
    mutationFn: async (apt: any) => {
      const { error } = await supabase.from("appointments").update({
        status: "no_show", cancellation_reason: "No-show",
      }).eq("id", apt.id);
      if (error) throw error;
      // Generate re-engagement message
      try {
        const { data } = await supabase.functions.invoke("ai-notification-engine", {
          body: { mode: "re_engage_draft", data: { patient_id: apt.patient_id, no_show_date: apt.scheduled_at, treatment_name: apt.treatments?.name } },
        });
        if (data?.sms_draft) {
          setReEngageDraft(data.sms_draft);
          setSelectedApt(apt);
        }
      } catch { /* non-fatal */ }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Marked as no-show");
    },
  });

  const openRoomingDialog = async (apt: any) => {
    setSelectedApt(apt); setSelectedRoomId(""); setSelectedDeviceId(""); setAiSuggestion(null);
    setRoomingDialogOpen(true); setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: { action: "room", appointment_id: apt.id, treatment_id: apt.treatments?.id, scheduled_at: apt.scheduled_at, duration_minutes: apt.duration_minutes, patient_id: apt.patients?.id },
      });
      if (error) throw error;
      setAiSuggestion(data);
      if (data.recommended_room_id) setSelectedRoomId(data.recommended_room_id);
      if (data.recommended_device_id) setSelectedDeviceId(data.recommended_device_id);
    } catch { toast.error("Failed to get AI room recommendation"); }
    finally { setLoadingAi(false); }
  };

  const confirmRooming = () => {
    if (!selectedApt) return;
    updateStatus.mutate({
      id: selectedApt.id, status: "roomed",
      room_id: selectedRoomId || undefined, device_id: selectedDeviceId || undefined,
      provider_id: (!selectedApt.provider_id && aiSuggestion?.recommended_provider_id) ? aiSuggestion.recommended_provider_id : undefined,
    });
  };

  const generateSoapNote = async (apt: any) => {
    setSelectedApt(apt); setSoapNote(null); setSoapDialogOpen(true); setGeneratingNote(true);
    try {
      const { data: priorNotes } = await supabase.from("clinical_notes").select("subjective, objective, assessment, plan, created_at").eq("patient_id", apt.patients?.id).order("created_at", { ascending: false }).limit(3);
      const { data, error } = await supabase.functions.invoke("ai-soap-note", {
        body: { patient: apt.patients, appointment: apt, treatment: apt.treatments, provider: apt.providers, priorNotes: priorNotes ?? [] },
      });
      if (error) throw error;
      setSoapNote(data);
    } catch (e: any) { toast.error(e.message || "Failed to generate SOAP note"); }
    finally { setGeneratingNote(false); }
  };

  const saveSoapNote = useMutation({
    mutationFn: async () => {
      if (!soapNote || !selectedApt) return;
      const { error } = await supabase.from("clinical_notes").insert({
        patient_id: selectedApt.patients?.id ?? selectedApt.patient_id,
        provider_id: selectedApt.provider_id, appointment_id: selectedApt.id,
        subjective: soapNote.subjective, objective: soapNote.objective,
        assessment: soapNote.assessment, plan: soapNote.plan,
        ai_generated: true, status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clinical-notes"] }); setSoapDialogOpen(false); toast.success("SOAP note saved as draft"); },
    onError: () => toast.error("Failed to save note"),
  });

  const nextStatus = (current: string) => {
    const flow: Record<string, string> = { booked: "checked_in", checked_in: "roomed", roomed: "in_progress", in_progress: "completed" };
    return flow[current];
  };

  const handleNextStatus = (apt: any) => {
    const next = nextStatus(apt.status);
    if (!next) return;
    if (next === "roomed") openRoomingDialog(apt);
    else updateStatus.mutate({ id: apt.id, status: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-muted-foreground">Schedule and manage visits</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetBookingForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Appointment</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>

            {/* Step indicators */}
            <div className="flex items-center gap-2 mb-2">
              {["Patient & Treatment", "Provider", "Date & Slot"].map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    bookingStep > i ? "bg-primary text-primary-foreground" : bookingStep === i ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {bookingStep > i ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">{label}</span>
                  {i < 2 && <div className="w-4 h-px bg-border" />}
                </div>
              ))}
            </div>

            {/* Step 0: Patient + Treatment + AI Insights */}
            {bookingStep === 0 && (
              <div className="space-y-4">
                {/* Visit Type Selector */}
                <div className="space-y-2">
                  <Label>Visit Type</Label>
                  <div className="flex gap-2">
                    {[
                      { value: "in_person", label: "In-Person", icon: Calendar },
                      { value: "telehealth", label: "Telehealth", icon: Video },
                      { value: "phone", label: "Phone", icon: Phone },
                    ].map(({ value, label, icon: Icon }) => (
                      <button key={value} type="button"
                        onClick={() => setBookVisitType(value)}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                          bookVisitType === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40 text-muted-foreground"
                        }`}>
                        <Icon className="h-3.5 w-3.5" />{label}
                      </button>
                    ))}
                  </div>
                </div>

                {bookVisitType === "telehealth" && (
                  <div className="space-y-2">
                    <Label>Video Room URL <span className="text-muted-foreground text-[10px]">(optional — auto-generated if blank)</span></Label>
                    <Input value={bookVideoUrl} onChange={(e) => setBookVideoUrl(e.target.value)} placeholder="https://meet.example.com/room-id" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Patient *</Label>
                  <select value={bookPatientId} onChange={(e) => setBookPatientId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select patient</option>
                    {patients?.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
                  </select>
                </div>

                {/* AI: No-show risk warning */}
                {loadingNoShowRisk && bookPatientId && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Checking patient history…</div>
                )}
                {noShowRisk && noShowRisk.risk_level !== "low" && (
                  <div className={`rounded-md border p-3 space-y-1 ${noShowRisk.risk_level === "high" ? "border-destructive/50 bg-destructive/5" : "border-warning/50 bg-warning/5"}`}>
                    <p className={`text-xs font-medium flex items-center gap-1 ${noShowRisk.risk_level === "high" ? "text-destructive" : "text-warning"}`}>
                      <AlertTriangle className="h-3 w-3" />
                      No-Show Risk: {noShowRisk.risk_level.toUpperCase()} ({noShowRisk.risk_score}%)
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {noShowRisk.no_show_count} no-shows out of {noShowRisk.total_appointments} appointments ({noShowRisk.no_show_rate}% rate)
                    </p>
                    {noShowRisk.needs_deposit && (
                      <p className="text-[10px] font-medium text-destructive flex items-center gap-1">
                        <ShieldAlert className="h-2.5 w-2.5" />{noShowRisk.deposit_reason}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Treatment *</Label>
                  <select value={bookTreatmentId} onChange={(e) => setBookTreatmentId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select treatment</option>
                    {treatments?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
                  </select>
                </div>

                {/* AI: Duration auto-select */}
                {loadingDuration && bookTreatmentId && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Estimating duration…</div>
                )}
                {durationEstimate && durationEstimate.suggested_duration !== durationEstimate.base_duration && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs font-medium text-primary flex items-center gap-1">
                      <Timer className="h-3 w-3" />Duration adjusted: {durationEstimate.base_duration} → {durationEstimate.suggested_duration} min
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{durationEstimate.reason}</p>
                  </div>
                )}

                {/* AI: Contraindication check */}
                {loadingContra && bookTreatmentId && bookPatientId && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Safety check…</div>
                )}
                {contraindicationCheck?.has_warnings && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />Contraindication Alert
                    </p>
                    {contraindicationCheck.recommendations
                      .filter((r: any) => r.severity !== "info")
                      .map((r: any, i: number) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <Badge variant={r.severity === "critical" ? "destructive" : "secondary"} className="text-[9px] flex-shrink-0">{r.severity}</Badge>
                          <p className="text-[10px] text-muted-foreground"><span className="font-medium">{r.label}:</span> {r.detail}</p>
                        </div>
                      ))}
                    <p className="text-[10px] text-muted-foreground italic mt-1">{contraindicationCheck.narrative}</p>
                  </div>
                )}

                <Button className="w-full" disabled={!bookPatientId || !bookTreatmentId} onClick={() => setBookingStep(1)}>
                  Next: Choose Provider →
                </Button>
              </div>
            )}

            {/* Step 1: Provider with AI matching */}
            {bookingStep === 1 && (
              <div className="space-y-4">
                {/* AI Provider Recommendations */}
                {loadingProviderMatch && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />AI matching best providers…</div>
                )}
                {providerMatch?.rankings?.length > 0 && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-primary flex items-center gap-1"><UserCheck className="h-3 w-3" />AI Provider Recommendations</p>
                    {providerMatch.rankings.slice(0, 3).map((r: any, i: number) => {
                      const prov = providersList?.find(p => p.id === r.id);
                      return (
                        <button key={r.id} type="button" onClick={() => setBookProviderId(r.id)}
                          className={`w-full text-left p-2 rounded border text-xs transition-colors ${bookProviderId === r.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                          <div className="flex justify-between items-center">
                            <span className="font-medium">
                              {i === 0 && "🥇 "}
                              {i === 1 && "🥈 "}
                              {i === 2 && "🥉 "}
                              {prov ? `Dr. ${prov.last_name}, ${prov.first_name}` : r.id}
                            </span>
                            <Badge variant="outline" className="text-[9px]">{r.score}%</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{r.reason}</p>
                        </button>
                      );
                    })}
                    {providerMatch.narrative && (
                      <p className="text-[10px] text-muted-foreground italic">{providerMatch.narrative}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Provider</Label>
                  <select value={bookProviderId} onChange={(e) => setBookProviderId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select provider</option>
                    {providersList?.map((p) => <option key={p.id} value={p.id}>Dr. {p.last_name}, {p.first_name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setBookingStep(0)}>← Back</Button>
                  <Button className="flex-1" disabled={!bookProviderId} onClick={() => setBookingStep(2)}>Next: Pick Slot →</Button>
                </div>
              </div>
            )}

            {/* Step 2: Date + Slot picker */}
            {bookingStep === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div>
                    <Label className="text-xs mb-1 block">Select Date</Label>
                    <CalendarWidget mode="single" selected={bookDate} onSelect={(d) => setBookDate(d)} disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} className="rounded-md border" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs mb-1 block">Available Slots</Label>
                    {!bookDate ? (
                      <p className="text-xs text-muted-foreground py-4">Pick a date to see slots</p>
                    ) : loadingSlots ? (
                      <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs text-muted-foreground">Loading slots…</span></div>
                    ) : availableSlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">No available slots on this date</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
                        {availableSlots.map((slot, i) => {
                          const isSelected = selectedSlot?.start.getTime() === slot.start.getTime();
                          return (
                            <button key={i} type="button" onClick={() => { setSelectedSlot(slot); setConflictResult(null); }}
                              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-foreground"}`}>
                              {format(slot.start, "h:mm a")}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {selectedSlot && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs font-medium text-primary flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Selected: {format(selectedSlot.start, "EEE, MMM d")} at {format(selectedSlot.start, "h:mm a")}–{format(selectedSlot.end, "h:mm a")}
                      {durationEstimate && ` (${durationEstimate.suggested_duration} min)`}
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Clinic / Facility</Label>
                  <select value={bookClinicId} onChange={(e) => setBookClinicId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">Select clinic</option>
                    {clinics?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Room</Label>
                    <select value={bookRoomId} onChange={(e) => setBookRoomId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      <option value="">None</option>
                      {rooms?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Device</Label>
                    <select value={bookDeviceId} onChange={(e) => setBookDeviceId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      <option value="">None</option>
                      {devices?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Input value={bookNotes} onChange={(e) => setBookNotes(e.target.value)} placeholder="Optional notes" />
                </div>

                {conflictResult?.hasConflict && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Conflicts Detected</p>
                    {conflictResult.conflicts.map((c: any, i: number) => (
                      <p key={i} className="text-xs text-destructive">• {c.label}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setBookingStep(1)}>← Back</Button>
                  <Button className="flex-1" disabled={!selectedSlot || addAppointment.isPending} onClick={() => addAppointment.mutate()}>
                    {addAppointment.isPending ? "Scheduling…" : "Schedule Appointment"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Rooming Dialog */}
      <Dialog open={roomingDialogOpen} onOpenChange={setRoomingDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" />Room Patient</DialogTitle></DialogHeader>
          {loadingAi ? (
            <div className="flex flex-col items-center py-8 gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">AI is finding the best room...</p></div>
          ) : (
            <div className="space-y-4">
              {aiSuggestion?.has_conflict && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2"><AlertTriangle className="h-4 w-4 text-destructive mt-0.5" /><p className="text-xs text-destructive">{aiSuggestion.conflict_message}</p></div>
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
              <Button onClick={confirmRooming} disabled={updateStatus.isPending} className="w-full">{updateStatus.isPending ? "Rooming..." : "Confirm Room Assignment"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SOAP Note AI Dialog */}
      <Dialog open={soapDialogOpen} onOpenChange={setSoapDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI-Generated SOAP Note</DialogTitle></DialogHeader>
          {generatingNote ? (
            <div className="flex flex-col items-center py-12 gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Generating clinical note with AI...</p></div>
          ) : soapNote ? (
            <div className="space-y-4">
              {(["subjective", "objective", "assessment", "plan"] as const).map((section) => (
                <div key={section}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{section}</p>
                  <Textarea value={soapNote[section] || ""} onChange={(e) => setSoapNote({ ...soapNote, [section]: e.target.value })} rows={3} className="text-sm" />
                </div>
              ))}
              <div className="flex gap-2">
                <Button onClick={() => saveSoapNote.mutate()} disabled={saveSoapNote.isPending} className="flex-1">{saveSoapNote.isPending ? "Saving..." : "Save as Draft"}</Button>
                <Button variant="outline" onClick={() => setSoapDialogOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No note generated</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" />Cancel Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selectedApt && `${selectedApt.patients?.first_name} ${selectedApt.patients?.last_name} — ${selectedApt.treatments?.name ?? "General"}`}</p>
            <div className="space-y-2">
              <Label>Cancellation Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>{CANCEL_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="destructive" className="w-full" onClick={() => cancelAppointment.mutate()} disabled={cancelAppointment.isPending}>
              {cancelAppointment.isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
            {loadingMatches && <p className="text-xs text-muted-foreground text-center">Checking waitlist for matches...</p>}
            {waitlistMatches?.matches?.length > 0 && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" />Waitlist Matches for This Slot</p>
                {waitlistMatches.matches.slice(0, 3).map((m: any, i: number) => (
                  <div key={i} className="p-2 bg-primary/5 rounded border border-primary/20 text-xs">
                    <div className="flex justify-between"><span className="font-medium">{m.patient_name}</span><Badge variant="outline" className="text-[9px]">{m.fit_score}%</Badge></div>
                    <p className="text-muted-foreground mt-0.5">{m.reason}</p>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { setCancelDialogOpen(false); setCancelReason(""); setWaitlistMatches(null); }}>Done</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Re-engagement SMS draft after no-show */}
      <Dialog open={!!reEngageDraft} onOpenChange={() => setReEngageDraft("")}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Re-Engagement Draft</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Send a "We missed you" message to this no-show patient?</p>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <Textarea value={reEngageDraft} onChange={(e) => setReEngageDraft(e.target.value)} rows={3} className="text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">{reEngageDraft.length}/160 characters</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={async () => {
                if (!selectedApt?.patients?.phone) { toast.error("No phone number"); return; }
                try {
                  await supabase.functions.invoke("send-sms", { body: { to: selectedApt.patients.phone, body: reEngageDraft } });
                  toast.success("Re-engagement SMS sent");
                  setReEngageDraft("");
                } catch { toast.error("Failed to send"); }
              }}>Send SMS</Button>
              <Button variant="outline" onClick={() => setReEngageDraft("")}>Skip</Button>
            </div>
          </div>
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
                     <p className="font-medium text-sm flex items-center flex-wrap">
                       <span>{apt.patients?.first_name} {apt.patients?.last_name}</span>
                       {(() => {
                         const risk = getNoShowRisk(apt.patients?.no_show_count);
                         return risk ? (
                           <Badge
                             variant={risk.variant}
                             className="ml-2 text-[10px] h-5"
                             title={`${apt.patients?.no_show_count} prior no-show(s)`}
                           >
                             {risk.label}
                           </Badge>
                         ) : null;
                       })()}
                     </p>
                    <p className="text-xs text-muted-foreground">
                      {apt.treatments?.name ?? "General"} • Dr. {apt.providers?.last_name ?? "Unassigned"} • {format(parseISO(apt.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {apt.visit_type === "telehealth" && <Badge className="bg-blue-500/10 text-blue-600 text-[10px] gap-1"><Video className="h-2.5 w-2.5" />Telehealth</Badge>}
                      {apt.visit_type === "phone" && <Badge className="bg-amber-500/10 text-amber-600 text-[10px] gap-1"><Phone className="h-2.5 w-2.5" />Phone</Badge>}
                      {apt.rooms && <Badge variant="outline" className="text-[10px] gap-1"><DoorOpen className="h-2.5 w-2.5" />{apt.rooms.name}</Badge>}
                      {apt.devices && <Badge variant="outline" className="text-[10px] gap-1"><Cpu className="h-2.5 w-2.5" />{apt.devices.name}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {apt.status === "completed" && (
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => generateSoapNote(apt)}><Sparkles className="h-3 w-3" /> Generate Note</Button>
                  )}
                  {!["cancelled", "no_show", "completed"].includes(apt.status) && (
                    <>
                      <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => { setSelectedApt(apt); setCancelDialogOpen(true); setCancelReason(""); }}>
                        <XCircle className="h-3 w-3 mr-1" />Cancel
                      </Button>
                      {apt.status === "booked" && (
                        <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => markNoShow.mutate(apt)}>
                          <Ban className="h-3 w-3 mr-1" />No-Show
                        </Button>
                      )}
                    </>
                  )}
                  {nextStatus(apt.status) && (
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleNextStatus(apt)}>→ {nextStatus(apt.status)!.replace("_", " ")}</Button>
                  )}
                  <Badge variant="secondary" className={statusColors[apt.status] ?? ""}>{apt.status.replace("_", " ")}</Badge>
                  {apt.cancellation_reason && apt.status === "cancelled" && (
                    <span className="text-[10px] text-muted-foreground italic">{apt.cancellation_reason}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium">No appointments yet</p>
            <p className="text-sm text-muted-foreground">Click "New Appointment" to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

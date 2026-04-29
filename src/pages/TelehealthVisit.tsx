import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QuickTextExpander from "@/components/charting/QuickTextExpander";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, ExternalLink,
  Sparkles, Loader2, ClipboardList, Pill, FileText,
  AlertTriangle, Clock, User, Activity, CheckCircle2,
  Calendar, Send, ArrowLeft, Timer, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInYears, differenceInSeconds } from "date-fns";
import { TelehealthRx } from "@/pages/Prescriptions";
import { LabReferenceStrip } from "@/components/clinical/LabReferenceChip";

// ── Intake Review Panel (reusable) ──
export function IntakeReviewPanel({ appointmentId, patientId }: { appointmentId?: string; patientId: string }) {
  const { data: patient = null } = useQuery({
    queryKey: ["telehealth-patient", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("*").eq("id", patientId).maybeSingle();
      return data ?? null;
    },
  });

  const { data: intakeForm = null } = useQuery({
    queryKey: ["telehealth-intake", appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      const { data: apt } = await supabase.from("appointments").select("intake_form_id").eq("id", appointmentId).maybeSingle();
      if (!apt?.intake_form_id) return null;
      const { data: form } = await supabase.from("intake_forms").select("*").eq("id", apt.intake_form_id).maybeSingle();
      return form ?? null;
    },
    enabled: !!appointmentId,
  });

  const { data: hormoneVisit = null } = useQuery({
    queryKey: ["telehealth-hormone", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("hormone_visits")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: consents = [] } = useQuery({
    queryKey: ["telehealth-consents", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("e_consents").select("consent_type, signed_at")
        .eq("patient_id", patientId).order("signed_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const { data: aiBrief = null, isLoading: briefLoading } = useQuery({
    queryKey: ["telehealth-ai-brief", patientId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-patient-brief", {
        body: { patient_id: patientId, appointment_id: appointmentId },
      });
      if (error) return null;
      return data?.brief ?? null;
    },
  });

  const age = patient?.date_of_birth ? differenceInYears(new Date(), parseISO(patient.date_of_birth)) : null;
  const responses = (intakeForm?.responses as any) || {};

  return (
    <div className="space-y-4 overflow-y-auto h-full p-3">
      {/* Patient Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
          {patient?.first_name?.[0]}{patient?.last_name?.[0]}
        </div>
        <div>
          <p className="font-semibold text-sm">{patient?.first_name} {patient?.last_name}</p>
          <p className="text-xs text-muted-foreground">
            {age && `${age}yo`} {patient?.gender || ""} · {patient?.phone || "No phone"}
          </p>
        </div>
      </div>

      {/* AI Brief */}
      {briefLoading ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading AI brief…
          </CardContent>
        </Card>
      ) : aiBrief ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Brief</p>
            {aiBrief.visit_summary && <p className="text-xs">{aiBrief.visit_summary}</p>}
            {aiBrief.alerts?.length > 0 && (
              <div className="space-y-1">
                {aiBrief.alerts.map((a: string, i: number) => (
                  <p key={i} className="text-xs text-destructive flex items-start gap-1"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{a}</p>
                ))}
              </div>
            )}
            {aiBrief.last_treatment && <p className="text-xs"><span className="text-muted-foreground">Last Tx:</span> {aiBrief.last_treatment}</p>}
            {aiBrief.todays_prep && <p className="text-xs"><span className="text-muted-foreground">Prep:</span> {aiBrief.todays_prep}</p>}
          </CardContent>
        </Card>
      ) : null}

      {(() => {
        const allergies: string[] = Array.isArray(patient?.allergies) ? (patient!.allergies as string[]) : [];
        const medications: string[] = Array.isArray(patient?.medications) ? (patient!.medications as string[]) : [];
        if (allergies.length === 0 && medications.length === 0) return null;
        return (
          <Card>
            <CardContent className="p-3 space-y-2">
              {allergies.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Allergies</p>
                  <p className="text-xs">{allergies.join(", ")}</p>
                </div>
              )}
              {medications.length > 0 && (
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1"><Pill className="h-3 w-3 text-primary" /> Current Meds</p>
                  <p className="text-xs text-muted-foreground">{medications.join(", ")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Intake Form Responses */}
      {intakeForm && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1"><ClipboardList className="h-3 w-3 text-primary" /> Intake Form</p>
            <Badge variant="outline" className="text-[9px]">{intakeForm.form_type} · Submitted {intakeForm.submitted_at ? format(parseISO(intakeForm.submitted_at), "M/d h:mm a") : "—"}</Badge>
            {Object.entries(responses).slice(0, 15).map(([key, val]) => (
              <div key={key} className="text-xs">
                <span className="text-muted-foreground">{key.replace(/_/g, " ")}:</span>{" "}
                <span className="font-medium">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Hormone Visit Labs */}
      {hormoneVisit && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1"><Activity className="h-3 w-3 text-primary" /> Latest Labs ({format(parseISO(hormoneVisit.visit_date), "M/d/yy")})</p>
            <LabReferenceStrip
              labs={[
                { key: "tt",   value: hormoneVisit.lab_tt,   shortLabel: "TT" },
                { key: "ft",   value: hormoneVisit.lab_ft,   shortLabel: "FT" },
                { key: "e2",   value: hormoneVisit.lab_e2,   shortLabel: "E2" },
                { key: "tsh",  value: hormoneVisit.lab_tsh,  shortLabel: "TSH" },
                { key: "a1c",  value: hormoneVisit.lab_a1c,  shortLabel: "A1c" },
                { key: "psa",  value: hormoneVisit.lab_psa,  shortLabel: "PSA" },
                { key: "dhea", value: hormoneVisit.lab_dhea, shortLabel: "DHEA" },
                { key: "vitd", value: hormoneVisit.lab_vitd, shortLabel: "Vit D" },
                { key: "fsh",  value: hormoneVisit.lab_fsh,  shortLabel: "FSH" },
              ]}
            />
            {(hormoneVisit.intake_symptoms?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground">Symptoms</p>
                <div className="flex flex-wrap gap-1">{hormoneVisit.intake_symptoms.map((s: string) => <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Consents */}
      {consents.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-semibold flex items-center gap-1"><FileText className="h-3 w-3" /> Consents</p>
            {consents.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="capitalize">{c.consent_type}</span>
                <span className="text-muted-foreground">{format(parseISO(c.signed_at), "M/d/yy")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Video Panel ──
function VideoPanel({ videoUrl, appointmentId, patientId, onCallEnd }: { videoUrl: string | null; appointmentId: string; patientId?: string; onCallEnd: () => void }) {
  const [callActive, setCallActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  const [creating, setCreating] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string | null>(videoUrl);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setRoomUrl(videoUrl); }, [videoUrl]);

  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callActive]);

  const startCall = async () => {
    setCreating(true);
    try {
      // Create Daily.co room if we don't already have one
      let url = roomUrl;
      let name = roomName;
      let token = providerToken;
      if (!url && patientId) {
        const { data, error } = await supabase.functions.invoke("daily-video", {
          body: {
            action: "create_room",
            appointment_id: appointmentId,
            patient_id: patientId,
            max_participants: 4,
            expires_in_minutes: 120,
          },
        });
        if (error || !data?.room_url) {
          toast.error(data?.error || "Failed to create video room");
          setCreating(false);
          return;
        }
        url = data.room_url;
        name = data.room_name;
        token = data.provider_token;
        setRoomUrl(url);
        setRoomName(name);
        setProviderToken(token);
      }
      if (!url) {
        toast.error("No video room available");
        setCreating(false);
        return;
      }

      setCallActive(true);
      setElapsed(0);
      await supabase.from("appointments").update({ status: "in_progress" as any }).eq("id", appointmentId);
      // Open Daily.co room with provider token (owner privileges)
      const joinUrl = token ? `${url}?t=${token}` : url;
      window.open(joinUrl, "_blank", "width=1280,height=800");
    } finally {
      setCreating(false);
    }
  };

  const endCall = async () => {
    setCallActive(false);
    if (roomName) {
      await supabase.functions.invoke("daily-video", {
        body: { action: "end_session", room_name: roomName },
      }).catch(() => {});
    }
    onCallEnd();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-muted/20 rounded-lg p-6 space-y-6">
      {!callActive ? (
        <>
          <div className="text-center space-y-3">
            <div className="h-20 w-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Video className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Telehealth Visit</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {roomUrl
                ? "Click to start the video call. A new window will open."
                : patientId
                  ? "Click Start to create a secure HIPAA-compliant video room."
                  : "Patient information is required to start a video call."}
            </p>
          </div>
          <Button size="lg" className="gap-2" onClick={startCall} disabled={creating || !patientId}>
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
            {creating ? "Creating room..." : "Start Call"}
          </Button>
          {videoUrl && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(videoUrl, "_blank")}>
              <ExternalLink className="h-3 w-3" /> Open Video Link
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="text-center space-y-2">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Video className="h-8 w-8 text-primary" />
            </div>
            <p className="text-2xl font-mono font-bold text-primary">{formatTime(elapsed)}</p>
            <Badge variant="outline" className="text-xs text-primary border-primary/30">Call Active</Badge>
          </div>

          {videoUrl && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(videoUrl, "_blank")}>
              <ExternalLink className="h-3 w-3" /> Re-open Video Window
            </Button>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant={muted ? "destructive" : "outline"}
              size="icon"
              className="rounded-full h-12 w-12"
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            <Button
              variant={!videoOn ? "destructive" : "outline"}
              size="icon"
              className="rounded-full h-12 w-12"
              onClick={() => setVideoOn(!videoOn)}
              aria-label={videoOn ? "Turn camera off" : "Turn camera on"}
              aria-pressed={!videoOn}
            >
              {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={endCall}
              aria-label="End call"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── SOAP Quick Chart ──
function QuickChart({ encounterId, patientId, readOnly = false }: { encounterId: string | null; patientId: string; readOnly?: boolean }) {
  const [soap, setSoap] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Latest labs (for reference-range chips above Objective)
  const { data: latestLabs } = useQuery({
    queryKey: ["telehealth-soap-labs", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hormone_visits")
        .select("lab_tt, lab_ft, lab_e2, lab_tsh, lab_a1c, lab_psa, lab_dhea, lab_vitd, lab_fsh, lab_hgb, lab_hct, lab_igf1, visit_date")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!patientId,
  });

  // Load existing note
  const { data: existingNote } = useQuery({
    queryKey: ["telehealth-note", encounterId],
    queryFn: async () => {
      if (!encounterId) return null;
      const { data } = await supabase.from("clinical_notes").select("*").eq("appointment_id", encounterId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!encounterId,
  });

  useEffect(() => {
    if (existingNote) {
      setSoap({
        subjective: existingNote.subjective || "",
        objective: existingNote.objective || "",
        assessment: existingNote.assessment || "",
        plan: existingNote.plan || "",
      });
    }
  }, [existingNote]);

  const generateAi = async (section: keyof typeof soap) => {
    setAiLoading(p => ({ ...p, [section]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("ai-chart-soap", {
        body: { section, chief_complaint: "", field_responses: soap, patient_name: "" },
      });
      if (error) throw error;
      setSoap(p => ({ ...p, [section]: data?.text || data?.content || "" }));
    } catch { toast.error("AI generation failed"); }
    setAiLoading(p => ({ ...p, [section]: false }));
  };

  const saveNote = async () => {
    if (!encounterId) return;
    setSaving(true);
    try {
      if (existingNote) {
        await supabase.from("clinical_notes").update(soap as any).eq("id", existingNote.id);
      } else {
        await supabase.from("clinical_notes").insert({
          patient_id: patientId,
          appointment_id: encounterId,
          ...soap,
          status: "draft" as any,
          ai_generated: false,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["telehealth-note", encounterId] });
      toast.success("Note saved");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  return (
    <div className="space-y-3 p-3 overflow-y-auto h-full">
      {(["subjective", "objective", "assessment", "plan"] as const).map(section => (
        <div key={section} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider">{section[0].toUpperCase()}{section.slice(1)}</Label>
            {!readOnly && (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-primary" onClick={() => generateAi(section)} disabled={aiLoading[section]}>
                {aiLoading[section] ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Sparkles className="h-2.5 w-2.5 mr-0.5" />}
                AI
              </Button>
            )}
          </div>
          {section === "objective" && latestLabs && (
            <LabReferenceStrip
              className="mb-1.5"
              compact
              labs={[
                { key: "tt",   value: latestLabs.lab_tt,   shortLabel: "TT" },
                { key: "ft",   value: latestLabs.lab_ft,   shortLabel: "FT" },
                { key: "e2",   value: latestLabs.lab_e2,   shortLabel: "E2" },
                { key: "tsh",  value: latestLabs.lab_tsh,  shortLabel: "TSH" },
                { key: "a1c",  value: latestLabs.lab_a1c,  shortLabel: "A1c" },
                { key: "psa",  value: latestLabs.lab_psa,  shortLabel: "PSA" },
                { key: "hgb",  value: latestLabs.lab_hgb,  shortLabel: "Hgb" },
                { key: "hct",  value: latestLabs.lab_hct,  shortLabel: "Hct" },
                { key: "igf1", value: latestLabs.lab_igf1, shortLabel: "IGF-1" },
              ]}
            />
          )}
          <QuickTextExpander
            value={soap[section]}
            onChange={value => setSoap(p => ({ ...p, [section]: value }))}
            rows={3}
            className="text-xs resize-none"
            readOnly={readOnly}
            placeholder={`Enter ${section}...`}
          />
        </div>
      ))}
      {!readOnly && (
        <Button size="sm" className="w-full" onClick={saveNote} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
          Save Note
        </Button>
      )}
    </div>
  );
}

// ── Main TelehealthVisit Page ──
export default function TelehealthVisit() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [callEnded, setCallEnded] = useState(false);
  const [aftercareSending, setAftercareSending] = useState(false);

  const { data: appointment, isLoading } = useQuery({
    queryKey: ["telehealth-apt", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, phone, email), treatments(name, category), providers:provider_id(first_name, last_name)")
        .eq("id", appointmentId!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!appointmentId,
  });

  // Find or create encounter
  const { data: encounter } = useQuery({
    queryKey: ["telehealth-encounter", appointmentId],
    queryFn: async () => {
      const { data: existing } = await supabase.from("encounters").select("id").eq("appointment_id", appointmentId!).limit(1);
      if (existing && existing.length > 0) return existing[0];
      // Auto-create
      const { data: newEnc, error } = await supabase.from("encounters").insert({
        patient_id: appointment!.patient_id,
        provider_id: appointment!.provider_id,
        appointment_id: appointmentId!,
        chief_complaint: appointment!.treatments?.name || "Telehealth Visit",
        encounter_type: "telehealth",
        status: "in_progress" as any,
        started_at: new Date().toISOString(),
        clinic_id: (appointment as any).clinic_id || null,
      }).select("id").single();
      if (error) throw error;
      return newEnc;
    },
    enabled: !!appointmentId && !!appointment,
  });

  const handleCallEnd = () => {
    setCallEnded(true);
    toast.success("Call ended. Complete your documentation below.");
  };

  // Auto-send aftercare on chart sign
  const sendAutoAftercare = async () => {
    if (!appointment || aftercareSending) return;
    setAftercareSending(true);
    try {
      await supabase.functions.invoke("ai-aftercare-message", {
        body: {
          encounter_id: encounter?.id,
          procedure_type: appointment.treatments?.name || "Telehealth Visit",
          patient_name: `${appointment.patients?.first_name} ${appointment.patients?.last_name}`,
          auto_send: true,
        },
      });
      toast.success("Aftercare instructions sent to patient");
    } catch {
      toast.error("Could not auto-send aftercare");
    }
    setAftercareSending(false);
  };

  const signAndClose = async () => {
    if (!encounter?.id) return;
    await supabase.from("encounters").update({ status: "signed" as any, signed_at: new Date().toISOString() }).eq("id", encounter.id);
    await supabase.from("appointments").update({ status: "completed" as any, completed_at: new Date().toISOString() }).eq("id", appointmentId!);

    // Run aftercare + telehealth summary in parallel
    await Promise.allSettled([
      sendAutoAftercare(),
      supabase.functions.invoke("ai-checkout-review", {
        body: { appointment_id: appointmentId, mode: "telehealth_summary" },
      }).then(({ data }) => {
        if (data?.visit_summary) {
          toast.info(`Follow-up in ${data.follow_up_days || 14} days`, { description: data.follow_up_recommendation });
        }
      }),
    ]);

    queryClient.invalidateQueries({ queryKey: ["telehealth-apt"] });
    toast.success("Encounter signed & closed");
    navigate("/provider-day");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[80vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!appointment) {
    return <div className="text-center py-16 text-muted-foreground">Appointment not found</div>;
  }

  const patient = appointment.patients;

  return (
    <div className="h-full min-h-[600px] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              Telehealth: {patient?.first_name} {patient?.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {appointment.treatments?.name || "Visit"} · {format(parseISO(appointment.scheduled_at), "h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {callEnded && (
            <Button variant="default" size="sm" className="gap-1" onClick={signAndClose}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Sign & Close
            </Button>
          )}
        </div>
      </div>

      {/* 3-panel layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Intake Review */}
        <ResizablePanel defaultSize={25} minSize={20}>
          <IntakeReviewPanel appointmentId={appointmentId!} patientId={appointment.patient_id} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center: Video */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <VideoPanel videoUrl={appointment.video_room_url} appointmentId={appointmentId!} patientId={appointment.patient_id} onCallEnd={handleCallEnd} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Chart + Rx */}
        <ResizablePanel defaultSize={35} minSize={25}>
          <Tabs defaultValue="chart" className="h-full flex flex-col">
            <TabsList className="mx-3 mt-2 shrink-0">
              <TabsTrigger value="chart"><FileText className="h-3 w-3 mr-1" /> Chart</TabsTrigger>
              <TabsTrigger value="prescribe"><Pill className="h-3 w-3 mr-1" /> Prescribe</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="flex-1 overflow-hidden">
              <QuickChart encounterId={encounter?.id || null} patientId={appointment.patient_id} />
            </TabsContent>
            <TabsContent value="prescribe" className="flex-1 overflow-y-auto p-3">
              <TelehealthRx patientId={appointment.patient_id} encounterId={encounter?.id} embedded />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, User, FlaskConical, CheckCircle, Clock, AlertTriangle, Package, Sparkles, Loader2, Camera, Wand2 } from "lucide-react";
import { PhotoGallery } from "@/components/clinical-photos/PhotoGallery";
import { PhotoUpload } from "@/components/clinical-photos/PhotoUpload";
import { ComparisonView } from "@/components/clinical-photos/ComparisonView";
import { TreatmentRecommendations } from "@/components/TreatmentRecommendations";
import { CommunicationTimeline } from "@/components/front-desk/CommunicationTimeline";
import { format, parseISO, differenceInDays } from "date-fns";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

const LAB_FIELDS = [
  { key: "lab_tt", label: "Total Testosterone", unit: "ng/dL" },
  { key: "lab_ft", label: "Free Testosterone", unit: "pg/mL" },
  { key: "lab_e2", label: "Estradiol (E2)", unit: "pg/mL" },
  { key: "lab_p4", label: "Progesterone", unit: "ng/mL" },
  { key: "lab_lh", label: "LH", unit: "mIU/mL" },
  { key: "lab_fsh", label: "FSH", unit: "mIU/mL" },
  { key: "lab_shbg", label: "SHBG", unit: "nmol/L" },
  { key: "lab_prl", label: "Prolactin", unit: "ng/mL" },
  { key: "lab_psa", label: "PSA", unit: "ng/mL" },
  { key: "lab_dhea", label: "DHEA-S", unit: "mcg/dL" },
  { key: "lab_tsh", label: "TSH", unit: "mIU/L" },
  { key: "lab_ft3", label: "Free T3", unit: "pg/mL" },
  { key: "lab_ft4", label: "Free T4", unit: "ng/dL" },
  { key: "lab_hgb", label: "Hemoglobin", unit: "g/dL" },
  { key: "lab_hct", label: "Hematocrit", unit: "%" },
  { key: "lab_rbc", label: "RBC", unit: "M/uL" },
  { key: "lab_glc", label: "Fasting Glucose", unit: "mg/dL" },
  { key: "lab_a1c", label: "HbA1c", unit: "%" },
  { key: "lab_alt", label: "ALT", unit: "U/L" },
  { key: "lab_ast", label: "AST", unit: "U/L" },
  { key: "lab_crt", label: "Creatinine", unit: "mg/dL" },
];

export default function PatientRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: appointments } = useQuery({
    queryKey: ["patient-appointments", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*, providers(first_name, last_name), treatments(name)")
        .eq("patient_id", id!)
        .order("scheduled_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: notes } = useQuery({
    queryKey: ["patient-notes", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_notes")
        .select("*, providers(first_name, last_name)")
        .eq("patient_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: intakeForms } = useQuery({
    queryKey: ["patient-intake", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("intake_forms")
        .select("*")
        .eq("patient_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: hormoneVisits } = useQuery({
    queryKey: ["patient-hormone-visits", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hormone_visits")
        .select("*, providers(first_name, last_name)")
        .eq("patient_id", id!)
        .order("visit_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: packagePurchases } = useQuery({
    queryKey: ["patient-packages", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_package_purchases")
        .select("*, service_packages(name, session_count, price, package_type), patient_package_sessions(*)")
        .eq("patient_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const [aiRec, setAiRec] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);

  const redeemSession = useMutation({
    mutationFn: async ({ purchaseId, treatmentName }: { purchaseId: string; treatmentName: string }) => {
      const purchase = packagePurchases?.find((p: any) => p.id === purchaseId);
      if (!purchase) throw new Error("Purchase not found");
      const revPerSession = purchase.sessions_total > 0 ? purchase.price_paid / purchase.sessions_total : 0;
      const { error } = await supabase.from("patient_package_sessions").insert({
        purchase_id: purchaseId,
        treatment_name: treatmentName,
        revenue_amount: revPerSession,
        redeemed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-packages", id] });
      toast({ title: "Session redeemed" });
    },
    onError: () => toast({ title: "Failed to redeem session", variant: "destructive" }),
  });

  const fetchAiRecommendation = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-package-engine", {
        body: { mode: "recommend_package", patient_id: id },
      });
      if (error) throw error;
      setAiRec(data);
    } catch (e) {
      toast({ title: "AI recommendation failed", variant: "destructive" });
    }
    setAiLoading(false);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading patient record...</div>;
  if (!patient) return <div className="p-8 text-center text-muted-foreground">Patient not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/patients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-serif">{patient.first_name} {patient.last_name}</h1>
          <p className="text-muted-foreground text-sm">Patient Record</p>
        </div>
      </div>

      <Tabs defaultValue="demographics">
        <TabsList>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="appointments">Appointments ({appointments?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="hormone">Hormone ({hormoneVisits?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="intake">Intake ({intakeForms?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="packages">Packages ({packagePurchases?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="recommendations">AI Recs</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="comms">Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Contact Info</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Email:</span> {patient.email ?? "—"}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {patient.phone ?? "—"}</p>
                  <p><span className="text-muted-foreground">DOB:</span> {patient.date_of_birth ?? "—"}</p>
                  <p><span className="text-muted-foreground">Gender:</span> {patient.gender ?? "—"}</p>
                  {(patient as any).preferred_name && <p><span className="text-muted-foreground">Preferred Name:</span> {(patient as any).preferred_name}</p>}
                  {(patient as any).sex_at_birth && <p><span className="text-muted-foreground">Sex at Birth:</span> {(patient as any).sex_at_birth}</p>}
                  {(patient as any).gender_identity && <p><span className="text-muted-foreground">Gender Identity:</span> {(patient as any).gender_identity}</p>}
                  {(patient as any).referral_source && <p><span className="text-muted-foreground">Referral:</span> {(patient as any).referral_source}</p>}
                  {(patient as any).preferred_contact_channel && <p><span className="text-muted-foreground">Preferred Contact:</span> {(patient as any).preferred_contact_channel}</p>}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Address</h3>
                <p className="text-sm">
                  {patient.address ?? "—"}<br />
                  {patient.city && `${patient.city}, `}{patient.state} {patient.zip}
                </p>
                <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mt-4">Insurance</h3>
                <p className="text-sm">{patient.insurance_provider ?? "None"} {patient.insurance_id && `• ${patient.insurance_id}`}</p>
                {(patient as any).photo_id_verified && (
                  <Badge variant="secondary" className="bg-success/10 text-success text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />ID Verified
                  </Badge>
                )}
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Medical</h3>
                <div>
                  <p className="text-xs text-muted-foreground">Allergies</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.allergies?.length ? patient.allergies.map((a: string) => (
                      <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                    )) : <span className="text-sm text-muted-foreground">None listed</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Medications</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.medications?.length ? patient.medications.map((m: string) => (
                      <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                    )) : <span className="text-sm text-muted-foreground">None listed</span>}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Emergency Contact</h3>
                <p className="text-sm">{(patient as any).emergency_contact_name ?? patient.emergency_contact_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {(patient as any).emergency_contact_phone ?? patient.emergency_contact_phone ?? ""}
                  {(patient as any).emergency_contact_relationship && ` • ${(patient as any).emergency_contact_relationship}`}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardContent className="p-6">
              {appointments && appointments.length > 0 ? (
                <div className="space-y-3">
                  {appointments.map((apt: any) => (
                    <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{apt.treatments?.name ?? "General Visit"}</p>
                        <p className="text-xs text-muted-foreground">
                          Dr. {apt.providers?.last_name ?? "Unassigned"} • {format(parseISO(apt.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <Badge variant="secondary">{apt.status.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">No appointments found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="p-6">
              {notes && notes.length > 0 ? (
                <div className="space-y-4">
                  {notes.map((note: any) => (
                    <div key={note.id} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{note.status}</Badge>
                          {note.ai_generated && <Badge variant="outline">AI Generated</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{format(parseISO(note.created_at), "MMM d, yyyy")}</span>
                      </div>
                      {note.subjective && <div className="mb-2"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">SUBJECTIVE</p><p className="text-sm">{note.subjective}</p></div>}
                      {note.assessment && <div className="mb-2"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ASSESSMENT</p><p className="text-sm">{note.assessment}</p></div>}
                      {note.plan && <div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">PLAN</p><p className="text-sm">{note.plan}</p></div>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">No clinical notes found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hormone Visits Tab — ported from HCDSS */}
        <TabsContent value="hormone">
          <div className="space-y-4">
            {hormoneVisits && hormoneVisits.length > 0 ? (
              hormoneVisits.map((visit: any) => (
                <Card key={visit.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">
                          {format(parseISO(visit.visit_date), "MMMM d, yyyy")}
                        </span>
                        {visit.providers && (
                          <span className="text-xs text-muted-foreground">
                            • Dr. {visit.providers.last_name}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          visit.approval_status === "approved"
                            ? "bg-success/10 text-success"
                            : visit.approval_status === "rejected"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/10 text-warning"
                        }
                      >
                        {visit.approval_status === "approved" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {visit.approval_status === "rejected" && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {(!visit.approval_status || visit.approval_status === "pending") && <Clock className="h-3 w-3 mr-1" />}
                        {visit.approval_status ?? "pending"}
                      </Badge>
                    </div>

                    {/* Lab values grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {LAB_FIELDS.filter((f) => visit[f.key] != null).map((f) => (
                        <div key={f.key} className="p-2 bg-muted/50 rounded text-center">
                          <p className="text-[10px] text-muted-foreground font-medium">{f.label}</p>
                          <p className="text-sm font-mono font-semibold">{visit[f.key]}</p>
                          <p className="text-[9px] text-muted-foreground">{f.unit}</p>
                        </div>
                      ))}
                    </div>

                    {/* AI recommendation preview */}
                    {visit.ai_recommendation && (
                      <div className="mt-3 p-3 bg-primary/5 border border-primary/10 rounded-md">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">AI Recommendation</p>
                        <p className="text-xs text-foreground line-clamp-3">{visit.ai_recommendation}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground text-sm">No hormone visits recorded</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="intake">
          <Card>
            <CardContent className="p-6">
              {intakeForms && intakeForms.length > 0 ? (
                <div className="space-y-3">
                  {intakeForms.map((form: any) => (
                    <div key={form.id} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm capitalize">{form.form_type} Intake</p>
                        <span className="text-xs text-muted-foreground">
                          {form.submitted_at ? format(parseISO(form.submitted_at), "MMM d, yyyy") : "Not submitted"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">No intake forms found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Packages Tab */}
        <TabsContent value="packages">
          <div className="space-y-4">
            {/* AI Recommendation Card */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Package Recommendations</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={fetchAiRecommendation} disabled={aiLoading}>
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    {aiLoading ? "Analyzing…" : "Get Suggestions"}
                  </Button>
                </div>
                {aiRec?.recommendations?.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {aiRec.recommendations.slice(0, 3).map((rec: any, i: number) => (
                      <div key={i} className="p-3 bg-background rounded-md border">
                        <p className="text-sm font-medium">{rec.package_name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{rec.reasoning}</p>
                        {rec.estimated_savings && <p className="text-xs text-success mt-1">Savings: {rec.estimated_savings}</p>}
                        {rec.synergy_note && <p className="text-xs text-primary mt-1">💡 {rec.synergy_note}</p>}
                      </div>
                    ))}
                    {aiRec.insight && <p className="text-xs text-muted-foreground mt-2 italic">{aiRec.insight}</p>}
                  </div>
                )}
                {aiRec && (!aiRec.recommendations || aiRec.recommendations.length === 0) && (
                  <p className="text-xs text-muted-foreground mt-2">{aiRec.insight || "No specific recommendations at this time."}</p>
                )}
              </CardContent>
            </Card>

            {/* Active Packages */}
            {packagePurchases && packagePurchases.length > 0 ? (
              packagePurchases.map((purchase: any) => {
                const pct = purchase.sessions_total > 0 ? (purchase.sessions_used / purchase.sessions_total) * 100 : 0;
                const daysLeft = purchase.expires_at ? differenceInDays(parseISO(purchase.expires_at), new Date()) : null;
                const isActive = purchase.status === "active";

                return (
                  <Card key={purchase.id}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{purchase.service_packages?.name}</span>
                        </div>
                        <Badge variant="secondary" className={
                          purchase.status === "active" ? "bg-success/10 text-success" :
                          purchase.status === "completed" ? "bg-primary/10 text-primary" :
                          purchase.status === "expired" ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }>
                          {purchase.status}
                        </Badge>
                      </div>

                      {/* Punch card */}
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {Array.from({ length: purchase.sessions_total }, (_, i) => (
                          <div
                            key={i}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] ${
                              i < purchase.sessions_used
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            }`}
                          >
                            {i < purchase.sessions_used ? "✓" : i + 1}
                          </div>
                        ))}
                      </div>

                      <Progress value={pct} className="h-2 mb-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{purchase.sessions_used}/{purchase.sessions_total} sessions used</span>
                        {daysLeft !== null && (
                          <span className={daysLeft < 7 ? "text-destructive font-medium" : ""}>
                            <Clock className="h-3 w-3 inline mr-0.5" />{daysLeft} days remaining
                          </span>
                        )}
                        {isActive && purchase.sessions_used < purchase.sessions_total && (
                          <Button size="sm" variant="default" className="h-7 text-xs"
                            onClick={() => redeemSession.mutate({ purchaseId: purchase.id, treatmentName: purchase.service_packages?.name || "Session" })}
                            disabled={redeemSession.isPending}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Redeem Session
                          </Button>
                        )}
                      </div>

                      {/* Session history */}
                      {purchase.patient_package_sessions?.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Redeemed Sessions</p>
                          {purchase.patient_package_sessions.map((s: any) => (
                            <div key={s.id} className="flex justify-between text-xs text-muted-foreground">
                              <span>{s.treatment_name || "Session"}</span>
                              <span>{format(parseISO(s.redeemed_at), "MMM d, yyyy")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-3 text-muted-foreground text-sm">No packages purchased</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        {/* Photos Tab */}
        <TabsContent value="photos">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Clinical Photos</h3>
              <Button size="sm" onClick={() => setPhotoUploadOpen(true)}>
                <Camera className="h-4 w-4 mr-1" /> Upload Photos
              </Button>
            </div>
            <PhotoGallery patientId={id!} />
            <div>
              <h3 className="font-semibold text-sm mb-3">Before / After Comparison</h3>
              <ComparisonView patientId={id!} />
            </div>
          </div>
          <PhotoUpload patientId={id!} open={photoUploadOpen} onOpenChange={setPhotoUploadOpen} />
        </TabsContent>

        <TabsContent value="recommendations">
          <TreatmentRecommendations patientId={id!} patientName={`${patient.first_name} ${patient.last_name}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

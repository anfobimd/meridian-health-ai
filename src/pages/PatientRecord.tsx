import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, User, Calendar, ClipboardList, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function PatientRecord() {
  const { id } = useParams();
  const navigate = useNavigate();

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

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading patient record...</div>;
  if (!patient) return <div className="p-8 text-center text-muted-foreground">Patient not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/patients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{patient.first_name} {patient.last_name}</h1>
          <p className="text-muted-foreground">Patient Record</p>
        </div>
      </div>

      <Tabs defaultValue="demographics">
        <TabsList>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="appointments">Appointments ({appointments?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="notes">Clinical Notes ({notes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="intake">Intake Forms ({intakeForms?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Contact Info</h3>
                <div className="space-y-2">
                  <p><span className="text-muted-foreground text-sm">Email:</span> {patient.email ?? "—"}</p>
                  <p><span className="text-muted-foreground text-sm">Phone:</span> {patient.phone ?? "—"}</p>
                  <p><span className="text-muted-foreground text-sm">DOB:</span> {patient.date_of_birth ?? "—"}</p>
                  <p><span className="text-muted-foreground text-sm">Gender:</span> {patient.gender ?? "—"}</p>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Address</h3>
                <p>
                  {patient.address ?? "—"}<br />
                  {patient.city && `${patient.city}, `}{patient.state} {patient.zip}
                </p>
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mt-4">Insurance</h3>
                <p>{patient.insurance_provider ?? "None"} {patient.insurance_id && `• ${patient.insurance_id}`}</p>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Medical</h3>
                <div>
                  <p className="text-sm text-muted-foreground">Allergies</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.allergies?.length ? patient.allergies.map((a: string) => (
                      <Badge key={a} variant="outline">{a}</Badge>
                    )) : <span className="text-sm text-muted-foreground">None listed</span>}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Medications</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {patient.medications?.length ? patient.medications.map((m: string) => (
                      <Badge key={m} variant="outline">{m}</Badge>
                    )) : <span className="text-sm text-muted-foreground">None listed</span>}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Emergency Contact</h3>
                <p>{patient.emergency_contact_name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{patient.emergency_contact_phone ?? ""}</p>
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
                      {note.subjective && <div className="mb-2"><p className="text-xs font-semibold text-muted-foreground">SUBJECTIVE</p><p className="text-sm">{note.subjective}</p></div>}
                      {note.assessment && <div className="mb-2"><p className="text-xs font-semibold text-muted-foreground">ASSESSMENT</p><p className="text-sm">{note.assessment}</p></div>}
                      {note.plan && <div><p className="text-xs font-semibold text-muted-foreground">PLAN</p><p className="text-sm">{note.plan}</p></div>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">No clinical notes found</p>
              )}
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  );
}

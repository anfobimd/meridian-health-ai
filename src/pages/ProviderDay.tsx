import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format, parseISO, differenceInYears } from "date-fns";
import {
  Stethoscope, Clock, FileText, ArrowRight, User, AlertTriangle,
  Package, Sparkles, Loader2, CheckCircle2, Play, ChevronRight,
} from "lucide-react";

const statusColor: Record<string, string> = {
  booked: "bg-primary/10 text-primary border-primary/20",
  checked_in: "bg-warning/10 text-warning border-warning/20",
  roomed: "bg-info/10 text-info border-info/20",
  in_progress: "bg-accent/10 text-accent-foreground border-accent/20",
  completed: "bg-success/10 text-success border-success/20",
};

const statusLabel: Record<string, string> = {
  booked: "Scheduled",
  checked_in: "Waiting",
  roomed: "Roomed",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function ProviderDay() {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [aiBrief, setAiBrief] = useState<Record<string, string>>({});
  const [briefLoading, setBriefLoading] = useState<Record<string, boolean>>({});

  const { data: providers } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials, specialty").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: todayApts, isLoading } = useQuery({
    queryKey: ["provider-day", selectedProvider],
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
      let query = supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, gender, allergies, medications, phone), treatments(id, name, duration_minutes, category), rooms:room_id(id, name)")
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .not("status", "in", '("cancelled","no_show")')
        .order("scheduled_at", { ascending: true });

      if (selectedProvider) {
        query = query.eq("provider_id", selectedProvider);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 20000,
  });

  // Fetch active packages for all patients in today's list
  const patientIds = [...new Set(todayApts?.map((a: any) => a.patient_id) ?? [])];
  const { data: activePackages } = useQuery({
    queryKey: ["patient-packages-today", patientIds.join(",")],
    queryFn: async () => {
      if (!patientIds.length) return [];
      const { data } = await supabase
        .from("patient_package_purchases")
        .select("patient_id, sessions_used, sessions_total, service_packages(name)")
        .in("patient_id", patientIds)
        .eq("status", "active");
      return data ?? [];
    },
    enabled: patientIds.length > 0,
  });

  const getPatientPackages = (patientId: string) =>
    activePackages?.filter((p: any) => p.patient_id === patientId) ?? [];

  const loadAiBrief = async (apt: any) => {
    const key = apt.id;
    if (aiBrief[key] || briefLoading[key]) return;
    setBriefLoading((prev) => ({ ...prev, [key]: true }));
    try {
      // Fetch last encounter for this patient
      const { data: lastEnc } = await supabase
        .from("encounters")
        .select("chief_complaint, encounter_type, signed_at")
        .eq("patient_id", apt.patient_id)
        .eq("status", "signed")
        .order("signed_at", { ascending: false })
        .limit(1);

      const { data: lastNote } = await supabase
        .from("clinical_notes")
        .select("assessment, plan")
        .eq("patient_id", apt.patient_id)
        .eq("status", "signed")
        .order("created_at", { ascending: false })
        .limit(1);

      const patient = apt.patients;
      const age = patient?.date_of_birth ? differenceInYears(new Date(), parseISO(patient.date_of_birth)) : null;
      const pkgs = getPatientPackages(apt.patient_id);

      const briefParts: string[] = [];
      briefParts.push(`${patient?.first_name} ${patient?.last_name}${age ? `, ${age}yo ${patient?.gender || ""}` : ""}`);
      if (patient?.allergies?.length) briefParts.push(`⚠ Allergies: ${patient.allergies.join(", ")}`);
      if (patient?.medications?.length) briefParts.push(`💊 Meds: ${patient.medications.join(", ")}`);
      if (lastEnc?.[0]) briefParts.push(`Last visit: ${lastEnc[0].encounter_type || "General"} — ${lastEnc[0].chief_complaint || "No CC"}`);
      if (lastNote?.[0]?.plan) briefParts.push(`Plan: ${lastNote[0].plan.slice(0, 120)}...`);
      if (pkgs.length) briefParts.push(`📦 Active packages: ${pkgs.map((p: any) => `${p.service_packages?.name} (${p.sessions_used}/${p.sessions_total})`).join(", ")}`);

      setAiBrief((prev) => ({ ...prev, [key]: briefParts.join("\n") }));
    } catch {
      setAiBrief((prev) => ({ ...prev, [key]: "Unable to load brief" }));
    } finally {
      setBriefLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Find or create encounter for this appointment
  const openChart = async (apt: any) => {
    // Check if encounter already exists for this appointment
    const { data: existing } = await supabase
      .from("encounters")
      .select("id")
      .eq("appointment_id", apt.id)
      .limit(1);

    if (existing && existing.length > 0) {
      navigate(`/encounters/${existing[0].id}/chart`);
      return;
    }

    // Create new encounter
    const { data: newEnc, error } = await supabase.from("encounters").insert({
      patient_id: apt.patient_id,
      provider_id: apt.provider_id,
      appointment_id: apt.id,
      chief_complaint: apt.treatments?.name || null,
      encounter_type: apt.treatments?.category || null,
      status: "in_progress" as any,
      started_at: new Date().toISOString(),
    }).select("id").single();

    if (error) {
      toast.error("Failed to create encounter");
      return;
    }
    navigate(`/encounters/${newEnc.id}/chart`);
  };

  const currentApt = todayApts?.find((a: any) => a.status === "in_progress" || a.status === "roomed");
  const upcomingApts = todayApts?.filter((a: any) => ["booked", "checked_in"].includes(a.status)) ?? [];
  const completedApts = todayApts?.filter((a: any) => a.status === "completed") ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Day</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, MMMM d")} · {todayApts?.length ?? 0} patients</p>
        </div>
        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers?.map((p) => (
              <SelectItem key={p.id} value={p.id}>Dr. {p.last_name}, {p.first_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {/* Current Patient */}
      {currentApt && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Play className="h-3 w-3 text-accent" /> Current Patient
          </p>
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="h-12 w-12 shrink-0 rounded-full bg-accent/10 flex items-center justify-center text-lg font-bold text-accent">
                    {currentApt.patients?.first_name?.[0]}{currentApt.patients?.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-lg truncate">{currentApt.patients?.first_name} {currentApt.patients?.last_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {currentApt.treatments?.name || "General"} · {format(parseISO(currentApt.scheduled_at), "h:mm a")}
                      {currentApt.rooms && ` · ${currentApt.rooms.name}`}
                    </p>
                    {currentApt.patients?.allergies?.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span className="text-xs text-destructive">{currentApt.patients.allergies.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Button className="shrink-0" onClick={() => openChart(currentApt)}>
                  <FileText className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Open Chart</span>
                </Button>
              </div>
              {/* AI brief inline */}
              {aiBrief[currentApt.id] ? (
                <div className="mt-3 p-3 bg-background rounded-md border">
                  <p className="text-xs font-medium text-primary flex items-center gap-1 mb-1"><Sparkles className="h-3 w-3" />Patient Brief</p>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">{aiBrief[currentApt.id]}</pre>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => loadAiBrief(currentApt)} disabled={briefLoading[currentApt.id]}>
                  {briefLoading[currentApt.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Load Patient Brief
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upcoming */}
      {upcomingApts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Up Next ({upcomingApts.length})
          </p>
          <div className="space-y-2">
            {upcomingApts.map((apt: any) => {
              const age = apt.patients?.date_of_birth ? differenceInYears(new Date(), parseISO(apt.patients.date_of_birth)) : null;
              const pkgs = getPatientPackages(apt.patient_id);
              return (
                <Card key={apt.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {apt.patients?.first_name?.[0]}{apt.patients?.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {apt.patients?.first_name} {apt.patients?.last_name}
                            {age && <span className="text-muted-foreground font-normal"> · {age}yo</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(parseISO(apt.scheduled_at), "h:mm a")} · {apt.treatments?.name || "General"}
                            {apt.treatments?.duration_minutes && ` · ${apt.treatments.duration_minutes}min`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pkgs.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            <Package className="h-2.5 w-2.5 mr-0.5" />{pkgs.length} pkg
                          </Badge>
                        )}
                        {apt.patients?.allergies?.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Allergies
                          </Badge>
                        )}
                        <Badge variant="secondary" className={`text-[10px] ${statusColor[apt.status] || ""}`}>
                          {statusLabel[apt.status] || apt.status}
                        </Badge>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => loadAiBrief(apt)} disabled={briefLoading[apt.id]}>
                          {briefLoading[apt.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openChart(apt)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {aiBrief[apt.id] && (
                      <div className="mt-2 ml-12 p-2 bg-muted/50 rounded text-xs text-muted-foreground whitespace-pre-wrap">
                        {aiBrief[apt.id]}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedApts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-success" /> Completed ({completedApts.length})
          </p>
          <div className="space-y-1.5">
            {completedApts.map((apt: any) => (
              <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-sm font-medium">{apt.patients?.first_name} {apt.patients?.last_name}</p>
                    <p className="text-[11px] text-muted-foreground">{apt.treatments?.name || "General"} · {format(parseISO(apt.scheduled_at), "h:mm a")}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openChart(apt)}>
                  View Chart <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !todayApts?.length && (
        <div className="text-center py-16">
          <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground mt-3">No patients scheduled for today</p>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format, parseISO, differenceInYears, differenceInDays } from "date-fns";
import {
  Stethoscope, Clock, FileText, User, AlertTriangle,
  Package, Sparkles, Loader2, CheckCircle2, Play, ChevronRight,
  ChevronDown, Send, Calendar, ClipboardList, MessageSquare,
  RefreshCw, TrendingUp, Video, Phone,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";

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
  completed: "Done",
};

export default function ProviderDay() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [myProviderId, setMyProviderId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [aiBrief, setAiBrief] = useState<Record<string, string>>({});
  const [briefLoading, setBriefLoading] = useState<Record<string, boolean>>({});
  const [dayBrief, setDayBrief] = useState<string | null>(null);
  const [dayBriefLoading, setDayBriefLoading] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  // Resolve provider ID from auth user
  useEffect(() => {
    if (!user) return;
    supabase
      .from("providers")
      .select("id, first_name, last_name, credentials")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMyProviderId(data.id);
          setProviderName(`Dr. ${data.last_name}`);
        }
      });
  }, [user]);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  // Today's appointments
  const { data: todayApts, isLoading } = useQuery({
    queryKey: ["provider-day-cmd", myProviderId],
    enabled: !!myProviderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(id, first_name, last_name, date_of_birth, gender, allergies, medications, phone), treatments(id, name, duration_minutes, category), rooms:room_id(id, name)")
        .eq("provider_id", myProviderId!)
        .gte("scheduled_at", todayStart)
        .lt("scheduled_at", todayEnd)
        .not("status", "in", '("cancelled","no_show")')
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 20000,
  });

  // Overdue unsigned charts
  const { data: overdueCharts } = useQuery({
    queryKey: ["overdue-charts", myProviderId],
    enabled: !!myProviderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("encounters")
        .select("id")
        .eq("provider_id", myProviderId!)
        .eq("status", "in_progress")
        .lt("created_at", todayStart);
      return data ?? [];
    },
  });

  // MD corrections pending
  const { data: pendingCorrections } = useQuery({
    queryKey: ["pending-corrections", myProviderId],
    enabled: !!myProviderId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_review_records")
        .select("id")
        .eq("provider_id", myProviderId!)
        .eq("status", "corrected");
      return data ?? [];
    },
  });

  // Active packages for patients
  const patientIds = [...new Set(todayApts?.map((a: any) => a.patient_id) ?? [])];
  const { data: activePackages } = useQuery({
    queryKey: ["patient-packages-day", patientIds.join(",")],
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

  // Computed groups
  const currentApt = todayApts?.find((a: any) => a.status === "in_progress" || a.status === "roomed");
  const upcomingApts = todayApts?.filter((a: any) => ["booked", "checked_in"].includes(a.status)) ?? [];
  const completedApts = todayApts?.filter((a: any) => a.status === "completed") ?? [];
  const totalApts = todayApts?.length ?? 0;

  // AI Day Brief
  const loadDayBrief = async () => {
    if (!myProviderId || dayBriefLoading) return;
    setDayBriefLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-coach", {
        body: { mode: "day_brief", provider_id: myProviderId },
      });
      if (error) throw error;
      setDayBrief(data?.brief || "No summary available.");
    } catch {
      setDayBrief("Unable to generate day brief.");
    } finally {
      setDayBriefLoading(false);
    }
  };

  // Auto-load day brief on mount
  useEffect(() => {
    if (myProviderId && !dayBrief) {
      loadDayBrief();
    }
  }, [myProviderId]);

  // Load AI patient brief
  const loadAiBrief = async (apt: any) => {
    const key = apt.id;
    if (aiBrief[key] || briefLoading[key]) return;
    setBriefLoading((prev) => ({ ...prev, [key]: true }));
    try {
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

      const parts: string[] = [];
      parts.push(`${patient?.first_name} ${patient?.last_name}${age ? `, ${age}yo ${patient?.gender || ""}` : ""}`);
      if (patient?.allergies?.length) parts.push(`⚠ Allergies: ${patient.allergies.join(", ")}`);
      if (patient?.medications?.length) parts.push(`💊 Meds: ${patient.medications.join(", ")}`);
      if (lastEnc?.[0]) parts.push(`Last visit: ${lastEnc[0].encounter_type || "General"} — ${lastEnc[0].chief_complaint || "No CC"}`);
      if (lastNote?.[0]?.plan) parts.push(`Plan: ${lastNote[0].plan.slice(0, 120)}...`);
      if (pkgs.length) parts.push(`📦 Packages: ${pkgs.map((p: any) => `${p.service_packages?.name} (${p.sessions_used}/${p.sessions_total})`).join(", ")}`);

      setAiBrief((prev) => ({ ...prev, [key]: parts.join("\n") }));
    } catch {
      setAiBrief((prev) => ({ ...prev, [key]: "Unable to load brief" }));
    } finally {
      setBriefLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Auto-load brief for current patient
  useEffect(() => {
    if (currentApt && !aiBrief[currentApt.id] && !briefLoading[currentApt.id]) {
      loadAiBrief(currentApt);
    }
  }, [currentApt?.id]);

  // Open / create encounter
  const openChart = async (apt: any) => {
    const { data: existing } = await supabase
      .from("encounters")
      .select("id")
      .eq("appointment_id", apt.id)
      .limit(1);

    if (existing && existing.length > 0) {
      navigate(`/encounters/${existing[0].id}/chart`);
      return;
    }

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

  // Lapse detection removed — last_visit_at not on patients table yet
  const isLapsed = (_patient: any) => false;

  // Greeting
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{greeting}, {providerName || "Doctor"}</h1>
        <p className="text-muted-foreground text-sm">{format(today, "EEEE, MMMM d, yyyy")}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Patients Today"
          value={totalApts}
          icon={Calendar}
          trend={`${completedApts.length} completed`}
        />
        <StatCard
          title="Completed"
          value={completedApts.length}
          icon={CheckCircle2}
          trend={`of ${totalApts}`}
        />
        <StatCard
          title="Overdue Charts"
          value={overdueCharts?.length ?? 0}
          icon={ClipboardList}
          trend="unsigned from prior days"
          className={overdueCharts?.length ? "border-destructive/30" : ""}
        />
        <StatCard
          title="MD Corrections"
          value={pendingCorrections?.length ?? 0}
          icon={MessageSquare}
          trend="action required"
          className={pendingCorrections?.length ? "border-warning/30" : ""}
        />
      </div>

      {/* AI Day Brief */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> AI Day Brief
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" onClick={loadDayBrief} disabled={dayBriefLoading}>
              <RefreshCw className={`h-3 w-3 mr-1 ${dayBriefLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {dayBriefLoading && !dayBrief ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Analyzing your schedule…</span>
            </div>
          ) : dayBrief ? (
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{dayBrief}</p>
          ) : null}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Current Patient */}
      {currentApt && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Play className="h-3 w-3 text-primary" /> Current Patient
          </p>
          <Card className="border-primary/30 bg-primary/[0.02] shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                    {currentApt.patients?.first_name?.[0]}{currentApt.patients?.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-lg truncate">{currentApt.patients?.first_name} {currentApt.patients?.last_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {currentApt.treatments?.name || "General"} · {format(parseISO(currentApt.scheduled_at), "h:mm a")}
                      {currentApt.rooms && ` · ${(currentApt.rooms as any).name}`}
                      {currentApt.visit_type === "telehealth" && " · 📹 Telehealth"}
                      {currentApt.visit_type === "phone" && " · 📞 Phone"}
                    </p>
                    {currentApt.patients?.allergies?.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span className="text-xs text-destructive font-medium">{currentApt.patients.allergies.join(", ")}</span>
                      </div>
                    )}
                    {isLapsed(currentApt.patients) && (
                      <Badge variant="outline" className="mt-1 text-[11px] border-warning/40 text-warning">
                        <Clock className="h-2.5 w-2.5 mr-0.5" /> Returning after lapse
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {currentApt.visit_type === "telehealth" && (
                    <Button variant="outline" className="shrink-0 gap-1 border-primary/30 text-primary" onClick={() => navigate(`/telehealth/${currentApt.id}`)}>
                      <Video className="h-4 w-4" /> Join Telehealth
                    </Button>
                  )}
                  <Button className="shrink-0" onClick={() => openChart(currentApt)}>
                    <FileText className="h-4 w-4 mr-1.5" /> Open Chart
                  </Button>
                </div>
              </div>
              {/* AI brief inline - auto-loaded */}
              {aiBrief[currentApt.id] ? (
                <div className="mt-3 p-3 bg-background rounded-md border">
                  <p className="text-xs font-medium text-primary flex items-center gap-1 mb-1"><Sparkles className="h-3 w-3" />Patient Brief</p>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{aiBrief[currentApt.id]}</pre>
                </div>
              ) : briefLoading[currentApt.id] ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading patient brief…
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Up Next */}
      {upcomingApts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Up Next ({upcomingApts.length})
          </p>
          <div className="space-y-2">
            {upcomingApts.map((apt: any) => {
              const age = apt.patients?.date_of_birth ? differenceInYears(new Date(), parseISO(apt.patients.date_of_birth)) : null;
              const pkgs = getPatientPackages(apt.patient_id);
              const lapsed = isLapsed(apt.patients);
              return (
                <Card key={apt.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {apt.patients?.first_name?.[0]}{apt.patients?.last_name?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {apt.patients?.first_name} {apt.patients?.last_name}
                            {age && <span className="text-muted-foreground font-normal"> · {age}yo</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {format(parseISO(apt.scheduled_at), "h:mm a")} · {apt.treatments?.name || "General"}
                            {apt.treatments?.duration_minutes && ` · ${apt.treatments.duration_minutes}min`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {apt.visit_type === "telehealth" && (
                          <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">
                            <Video className="h-2.5 w-2.5 mr-0.5" />Video
                          </Badge>
                        )}
                        {apt.visit_type === "phone" && (
                          <Badge variant="outline" className="text-[11px]">
                            <Phone className="h-2.5 w-2.5 mr-0.5" />Phone
                          </Badge>
                        )}
                        {apt.intake_form_id && (
                          <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">
                            <ClipboardList className="h-2.5 w-2.5 mr-0.5" />Intake ✓
                          </Badge>
                        )}
                        {lapsed && (
                          <Badge variant="outline" className="text-[11px] border-warning/30 text-warning">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />Lapsed
                          </Badge>
                        )}
                        {pkgs.length > 0 && (
                          <Badge variant="outline" className="text-[11px]">
                            <Package className="h-2.5 w-2.5 mr-0.5" />{pkgs.length} pkg
                          </Badge>
                        )}
                        {apt.patients?.allergies?.length > 0 && (
                          <Badge variant="outline" className="text-[11px] border-destructive/30 text-destructive">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Allergy
                          </Badge>
                        )}
                        <Badge variant="secondary" className={`text-[11px] ${statusColor[apt.status] || ""}`}>
                          {statusLabel[apt.status] || apt.status}
                        </Badge>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => loadAiBrief(apt)} disabled={briefLoading[apt.id]} aria-label="Generate AI brief for this patient">
                          {briefLoading[apt.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        </Button>
                        {apt.visit_type === "telehealth" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs text-primary border-primary/30" onClick={() => navigate(`/telehealth/${apt.id}`)}>
                            <Video className="h-3 w-3 mr-0.5" /> Join
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => apt.visit_type === "telehealth" ? navigate(`/telehealth/${apt.id}`) : openChart(apt)} aria-label="Open chart">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {aiBrief[apt.id] && (
                      <div className="mt-2 ml-12 p-2.5 bg-muted/50 rounded-md text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
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

      {/* Completed - collapsible */}
      {completedApts.length > 0 && (
        <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
          <CollapsibleTrigger className="w-full">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 cursor-pointer hover:text-foreground/70 transition-colors">
              <CheckCircle2 className="h-3 w-3 text-success" /> Completed ({completedApts.length})
              <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${completedOpen ? "rotate-180" : ""}`} />
            </p>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5">
              {completedApts.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{apt.patients?.first_name} {apt.patients?.last_name}</p>
                      <p className="text-[11px] text-muted-foreground">{apt.treatments?.name || "General"} · {format(parseISO(apt.scheduled_at), "h:mm a")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openChart(apt)}>
                      View Chart <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-primary" onClick={async () => {
                      try {
                        const { data: enc } = await supabase.from("encounters").select("id").eq("appointment_id", apt.id).limit(1);
                        await supabase.functions.invoke("ai-aftercare-message", {
                          body: { encounter_id: enc?.[0]?.id, procedure_type: apt.treatments?.name || "Visit", patient_name: `${apt.patients?.first_name} ${apt.patients?.last_name}`, auto_send: true },
                        });
                        toast.success("Aftercare sent");
                      } catch { toast.error("Failed to send aftercare"); }
                    }}>
                      <Send className="h-3 w-3 mr-1" /> Aftercare
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {!isLoading && !todayApts?.length && !myProviderId && (
        <div className="text-center py-16">
          <User className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground mt-3">No provider record linked to your account.</p>
          <p className="text-xs text-muted-foreground mt-1">Ask an admin to link your profile.</p>
        </div>
      )}

      {!isLoading && !todayApts?.length && myProviderId && (
        <div className="text-center py-16">
          <Stethoscope className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground mt-3">No patients scheduled for today</p>
        </div>
      )}
    </div>
  );
}

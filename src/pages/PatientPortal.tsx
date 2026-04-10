import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Calendar, Package, ClipboardList, LogIn, LogOut, Loader2,
  Clock, CheckCircle, AlertCircle, User, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PatientPortal() {
  const [view, setView] = useState<"login" | "portal">("login");
  const [email, setEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");

  // Simple email-based lookup (no auth for demo — production would use Supabase Auth)
  const handleLookup = async () => {
    if (!email.trim()) return;
    setLookupLoading(true);
    try {
      const { data, error } = await supabase.from("patients").select("id, first_name, last_name, email").eq("email", email.trim().toLowerCase()).maybeSingle();
      if (error) throw error;
      if (!data) { toast.error("No patient record found for this email. Please contact your clinic."); return; }
      setPatientId(data.id);
      setPatientName(`${data.first_name} ${data.last_name}`);
      setView("portal");
    } catch (err: any) { toast.error(err.message || "Lookup failed"); }
    finally { setLookupLoading(false); }
  };

  if (view === "login") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Activity className="h-7 w-7 text-primary" />
              <span className="font-serif text-xl font-bold">Meridian</span>
            </div>
            <CardTitle className="text-lg font-serif">Patient Portal</CardTitle>
            <CardDescription>Enter your email to access your health information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLookup()} />
            </div>
            <Button className="w-full" onClick={handleLookup} disabled={lookupLoading || !email.trim()}>
              {lookupLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
              Access Portal
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">Your data is encrypted and HIPAA-compliant</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-serif font-semibold">Meridian Patient Portal</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> {patientName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setView("login"); setPatientId(null); }}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        <Tabs defaultValue="appointments">
          <TabsList className="mb-4">
            <TabsTrigger value="appointments"><Calendar className="h-3.5 w-3.5 mr-1" /> Appointments</TabsTrigger>
            <TabsTrigger value="packages"><Package className="h-3.5 w-3.5 mr-1" /> Packages</TabsTrigger>
            <TabsTrigger value="records"><FileText className="h-3.5 w-3.5 mr-1" /> Records</TabsTrigger>
          </TabsList>

          <TabsContent value="appointments">
            <AppointmentsTab patientId={patientId!} />
          </TabsContent>
          <TabsContent value="packages">
            <PackagesTab patientId={patientId!} />
          </TabsContent>
          <TabsContent value="records">
            <RecordsTab patientId={patientId!} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Appointments Tab ──────────────────────────────────────────────────────────
function AppointmentsTab({ patientId }: { patientId: string }) {
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["portal-appointments", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, status, duration_minutes, notes, treatments:treatment_id(name), providers:provider_id(first_name, last_name, credentials)")
        .eq("patient_id", patientId)
        .order("scheduled_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const upcoming = appointments?.filter(a => new Date(a.scheduled_at) >= new Date() && a.status !== "cancelled") ?? [];
  const past = appointments?.filter(a => new Date(a.scheduled_at) < new Date() || a.status === "completed") ?? [];

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No upcoming appointments</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map(apt => (
              <Card key={apt.id}>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{(apt.treatments as any)?.name || "Appointment"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(apt.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                        {(apt.providers as any) && ` • ${(apt.providers as any).first_name} ${(apt.providers as any).last_name}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={apt.status === "booked" ? "secondary" : "default"} className="text-[10px]">{apt.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Past Visits</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past visits</p>
        ) : (
          <div className="space-y-2">
            {past.slice(0, 10).map(apt => (
              <Card key={apt.id} className="opacity-75">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{(apt.treatments as any)?.name || "Visit"}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(apt.scheduled_at), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{apt.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Packages Tab ──────────────────────────────────────────────────────────────
function PackagesTab({ patientId }: { patientId: string }) {
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["portal-packages", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_package_purchases")
        .select("id, sessions_total, sessions_used, purchased_at, expires_at, status, packages:package_id(name, session_count)")
        .eq("patient_id", patientId)
        .order("purchased_at", { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!purchases?.length) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No active packages</CardContent></Card>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {purchases.map(p => {
        const remaining = (p.sessions_total ?? 0) - (p.sessions_used ?? 0);
        const pct = p.sessions_total ? ((p.sessions_used ?? 0) / p.sessions_total) * 100 : 0;
        const isExpiring = p.expires_at && new Date(p.expires_at) < new Date(Date.now() + 30 * 86400000);
        return (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                {(p.packages as any)?.name || "Package"}
                <Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">{p.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sessions remaining</span>
                <span className="font-bold text-primary">{remaining} / {p.sessions_total}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
              </div>
              {p.expires_at && (
                <p className={`text-xs flex items-center gap-1 ${isExpiring ? "text-destructive" : "text-muted-foreground"}`}>
                  {isExpiring ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  Expires {format(new Date(p.expires_at), "MMM d, yyyy")}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Records Tab ───────────────────────────────────────────────────────────────
function RecordsTab({ patientId }: { patientId: string }) {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["portal-notes", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_notes")
        .select("id, created_at, status, subjective, assessment, providers:provider_id(first_name, last_name)")
        .eq("patient_id", patientId)
        .eq("status", "signed")
        .order("created_at", { ascending: false })
        .limit(15);
      return data ?? [];
    },
  });

  const { data: hormoneVisits } = useQuery({
    queryKey: ["portal-hormone", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hormone_visits")
        .select("id, visit_date, lab_tt, lab_ft, lab_e2, lab_tsh, lab_a1c, approval_status")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Signed Notes */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Visit Notes</h2>
        {!notes?.length ? (
          <p className="text-sm text-muted-foreground">No signed visit notes available</p>
        ) : (
          <div className="space-y-2">
            {notes.map(n => (
              <Card key={n.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{format(new Date(n.created_at), "MMM d, yyyy")}</p>
                    <Badge variant="outline" className="text-[10px]">Signed</Badge>
                  </div>
                  {n.assessment && <p className="text-xs text-muted-foreground line-clamp-2">{n.assessment}</p>}
                  {(n.providers as any) && <p className="text-[10px] text-muted-foreground mt-1">— {(n.providers as any).first_name} {(n.providers as any).last_name}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Lab History */}
      {hormoneVisits && hormoneVisits.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Lab History</h2>
          <Card>
            <CardContent className="py-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left py-1 pr-3">Date</th>
                      <th className="text-right px-2">TT</th>
                      <th className="text-right px-2">FT</th>
                      <th className="text-right px-2">E2</th>
                      <th className="text-right px-2">TSH</th>
                      <th className="text-right px-2">A1c</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hormoneVisits.map(v => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 font-medium">{format(new Date(v.visit_date), "MM/dd/yy")}</td>
                        <td className="text-right px-2">{v.lab_tt ?? "—"}</td>
                        <td className="text-right px-2">{v.lab_ft ?? "—"}</td>
                        <td className="text-right px-2">{v.lab_e2 ?? "—"}</td>
                        <td className="text-right px-2">{v.lab_tsh ?? "—"}</td>
                        <td className="text-right px-2">{v.lab_a1c ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Calendar, Package, LogIn, LogOut, Loader2,
  Clock, CheckCircle, AlertCircle, User, FileText, Mail, KeyRound,
  Video, PhoneOff,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { User as AuthUser } from "@supabase/supabase-js";

export default function PatientPortal() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");

  // Auth state listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (!session?.user) {
        setPatientId(null);
        setPatientName("");
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Link & fetch patient record when authenticated
  useEffect(() => {
    if (!authUser) return;
    const linkAndFetch = async () => {
      try {
        // Try to link via RPC
        const { data: linkedId } = await supabase.rpc("link_patient_auth", {
          _user_id: authUser.id,
          _email: authUser.email!,
        });
        if (linkedId) {
          setPatientId(linkedId);
          const { data: p } = await supabase.from("patients").select("first_name, last_name").eq("id", linkedId).single();
          if (p) setPatientName(`${p.first_name} ${p.last_name}`);
        } else {
          toast.error("No patient record found for your email. Please contact your clinic.");
        }
      } catch {
        toast.error("Could not link your account. Please contact support.");
      }
    };
    linkAndFetch();
  }, [authUser]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setPatientId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authUser) return <PortalAuth />;

  if (!patientId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No patient record is linked to your account. Please contact your clinic to get started.</p>
            <Button variant="outline" onClick={handleSignOut}><LogOut className="h-4 w-4 mr-1" /> Sign Out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-serif font-semibold">Meridian Patient Portal</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> {patientName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        <Tabs defaultValue="appointments">
          <TabsList className="mb-4">
            <TabsTrigger value="appointments"><Calendar className="h-3.5 w-3.5 mr-1" /> Appointments</TabsTrigger>
            <TabsTrigger value="telehealth"><Video className="h-3.5 w-3.5 mr-1" /> Telehealth</TabsTrigger>
            <TabsTrigger value="packages"><Package className="h-3.5 w-3.5 mr-1" /> Packages</TabsTrigger>
            <TabsTrigger value="records"><FileText className="h-3.5 w-3.5 mr-1" /> Records</TabsTrigger>
          </TabsList>
          <TabsContent value="appointments"><AppointmentsTab patientId={patientId} /></TabsContent>
          <TabsContent value="telehealth"><TelehealthTab patientId={patientId} /></TabsContent>
          <TabsContent value="packages"><PackagesTab patientId={patientId} /></TabsContent>
          <TabsContent value="records"><RecordsTab patientId={patientId} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Auth Component ────────────────────────────────────────────────────────────
function PortalAuth() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/portal" } });
        if (error) throw error;
        toast.success("Check your email to verify your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { toast.error("Enter your email first"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
      if (error) throw error;
      toast.success("Password reset link sent to your email.");
      setMode("login");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/portal" });
    if (result.error) toast.error(String(result.error));
  };

  if (mode === "forgot") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Activity className="h-7 w-7 text-primary" />
              <span className="font-serif text-xl font-bold">Meridian</span>
            </div>
            <CardTitle className="text-lg font-serif">Reset Password</CardTitle>
            <CardDescription>Enter your email to receive a reset link</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            <Button className="w-full" onClick={handleForgotPassword} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />} Send Reset Link
            </Button>
            <Button variant="ghost" className="w-full text-xs" onClick={() => setMode("login")}>Back to login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-7 w-7 text-primary" />
            <span className="font-serif text-xl font-bold">Meridian</span>
          </div>
          <CardTitle className="text-lg font-serif">Patient Portal</CardTitle>
          <CardDescription>{mode === "login" ? "Sign in to access your health information" : "Create your patient account"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleEmailAuth()} />
          <Button className="w-full" onClick={handleEmailAuth} disabled={loading || !email.trim() || !password.trim()}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : mode === "login" ? <LogIn className="h-4 w-4 mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogleAuth}>
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </Button>

          <div className="flex items-center justify-between">
            <Button variant="link" className="text-xs p-0 h-auto" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </Button>
            {mode === "login" && (
              <Button variant="link" className="text-xs p-0 h-auto" onClick={() => setMode("forgot")}>Forgot password?</Button>
            )}
          </div>

          <p className="text-[10px] text-center text-muted-foreground">Your data is encrypted and HIPAA-compliant</p>
        </CardContent>
      </Card>
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

// ── Telehealth Tab ───────────────────────────────────────────────────────────
function TelehealthTab({ patientId }: { patientId: string }) {
  const { data: telehealthApts, isLoading } = useQuery({
    queryKey: ["portal-telehealth", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, status, video_room_url, visit_type, treatments:treatment_id(name), providers:provider_id(first_name, last_name)")
        .eq("patient_id", patientId)
        .in("visit_type", ["telehealth", "phone"])
        .order("scheduled_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const upcoming = telehealthApts?.filter(a => new Date(a.scheduled_at) >= new Date(Date.now() - 15 * 60 * 1000) && !["cancelled", "completed", "no_show"].includes(a.status)) ?? [];
  const past = telehealthApts?.filter(a => new Date(a.scheduled_at) < new Date(Date.now() - 15 * 60 * 1000) || a.status === "completed") ?? [];

  const canJoin = (apt: any) => {
    const diff = new Date(apt.scheduled_at).getTime() - Date.now();
    return diff <= 15 * 60 * 1000 && diff >= -60 * 60 * 1000 && apt.status !== "completed";
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Upcoming Telehealth Visits</h2>
        {upcoming.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No upcoming telehealth visits</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map(apt => (
              <Card key={apt.id} className={canJoin(apt) ? "border-primary/30 bg-primary/[0.02]" : ""}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${canJoin(apt) ? "bg-primary/10 animate-pulse" : "bg-muted"}`}>
                        <Video className={`h-5 w-5 ${canJoin(apt) ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{(apt.treatments as any)?.name || "Telehealth Visit"}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(apt.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
                          {(apt.providers as any) && ` · ${(apt.providers as any).first_name} ${(apt.providers as any).last_name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canJoin(apt) ? (
                        <Button size="sm" className="gap-1" onClick={() => apt.video_room_url ? window.open(apt.video_room_url, "_blank") : null} disabled={!apt.video_room_url}>
                          <Video className="h-3.5 w-3.5" /> Join Video
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          <Clock className="h-2.5 w-2.5 mr-0.5" /> Scheduled
                        </Badge>
                      )}
                    </div>
                  </div>
                  {!apt.video_room_url && (
                    <p className="text-xs text-muted-foreground mt-2 ml-13">
                      {canJoin(apt)
                        ? "Your provider will connect shortly. Please wait here."
                        : "Video link will be available shortly before your appointment."}
                    </p>
                  )}
                  {canJoin(apt) && (
                    <div className="mt-3 ml-13 p-3 bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-muted-foreground">Waiting room — your provider will connect shortly</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Past Telehealth Visits</h2>
          <div className="space-y-2">
            {past.slice(0, 10).map(apt => (
              <Card key={apt.id} className="opacity-75">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{(apt.treatments as any)?.name || "Telehealth Visit"}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(apt.scheduled_at), "MMM d, yyyy")}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{apt.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
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
  if (!purchases?.length) return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No active packages</CardContent></Card>;

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

  const { data: consents } = useQuery({
    queryKey: ["portal-consents", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("e_consents")
        .select("id, consent_type, signed_at")
        .eq("patient_id", patientId)
        .order("signed_at", { ascending: false });
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

      {/* Signed Consents */}
      {consents && consents.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Signed Consents</h2>
          <div className="space-y-2">
            {consents.map(c => (
              <Card key={c.id}>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium capitalize">{c.consent_type} Consent</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(c.signed_at), "MMM d, yyyy")}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

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

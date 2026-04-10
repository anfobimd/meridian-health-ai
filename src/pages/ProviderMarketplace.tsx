import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Briefcase, Sparkles, Loader2, Clock, DollarSign, TrendingUp,
  Brain, User, CheckCircle, XCircle, Plus, Trash2, Star, Inbox,
} from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SKILL_OPTIONS = ["Botox", "Dysport", "Juvederm", "Restylane", "Sculptra", "PRP", "Kybella", "GLP-1", "Semaglutide", "Tirzepatide", "B12 Injections", "CO2 Laser", "IPL", "RF Microneedling", "Laser Hair Removal"];
const CERT_LEVELS = ["beginner", "intermediate", "expert"];

// Simulated current provider ID — in production this comes from auth
const CURRENT_PROVIDER_ID = null; // Will use first provider as fallback

export default function ProviderMarketplace() {
  const queryClient = useQueryClient();
  const [coachingOpen, setCoachingOpen] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  const [editBio, setEditBio] = useState("");

  // ── Fetch current provider (first active as demo) ──
  const { data: currentProvider, isLoading: providerLoading } = useQuery({
    queryKey: ["current-provider-mp"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("*").eq("is_active", true).order("last_name").limit(1).maybeSingle();
      if (data) setEditBio(data.marketplace_bio || "");
      return data;
    },
  });

  const providerId = currentProvider?.id;

  // ── Skills ──
  const { data: skills } = useQuery({
    queryKey: ["my-skills", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("provider_skills").select("*").eq("provider_id", providerId!);
      return data ?? [];
    },
    enabled: !!providerId,
  });

  // ── Availability ──
  const { data: availability } = useQuery({
    queryKey: ["my-availability", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("provider_availability").select("*").eq("provider_id", providerId!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!providerId,
  });

  // ── Membership ──
  const { data: membership } = useQuery({
    queryKey: ["my-membership", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("provider_memberships").select("*").eq("provider_id", providerId!).eq("is_active", true).maybeSingle();
      return data;
    },
    enabled: !!providerId,
  });

  // ── Booking Requests ──
  const { data: bookings } = useQuery({
    queryKey: ["my-bookings", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketplace_bookings")
        .select("*, patients(first_name, last_name), treatments(name)")
        .eq("provider_id", providerId!)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    enabled: !!providerId,
  });

  // ── Earnings Summary ──
  const { data: earnings } = useQuery({
    queryKey: ["my-earnings", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_earnings")
        .select("*")
        .eq("provider_id", providerId!)
        .order("service_date", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!providerId,
  });

  // ── Provider Intelligence (for coaching) ──
  const { data: intel } = useQuery({
    queryKey: ["my-intel", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_provider_intelligence").select("*").eq("provider_id", providerId!).maybeSingle();
      return data;
    },
    enabled: !!providerId,
  });

  // ── Coaching Actions ──
  const { data: coachingActions } = useQuery({
    queryKey: ["my-coaching", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("coaching_actions").select("*").eq("provider_id", providerId!).eq("is_resolved", false).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!providerId,
  });

  // ── Mutations ──
  const saveBioMutation = useMutation({
    mutationFn: async (bio: string) => {
      const { error } = await supabase.from("providers").update({ marketplace_bio: bio }).eq("id", providerId!);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["current-provider-mp"] }); toast.success("Bio saved"); },
  });

  const generateBioMutation = async () => {
    setGeneratingBio(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: {
          mode: "generate_bio",
          provider: {
            first_name: currentProvider?.first_name,
            last_name: currentProvider?.last_name,
            specialty: currentProvider?.specialty,
            credentials: currentProvider?.credentials,
            skills: (skills ?? []).map((s: any) => `${s.skill_name} (${s.certification_level})`),
          },
        },
      });
      if (error) throw error;
      if (data?.bio) { setEditBio(data.bio); saveBioMutation.mutate(data.bio); }
    } catch { toast.error("Failed to generate bio"); }
    finally { setGeneratingBio(false); }
  };

  const addSkillMutation = useMutation({
    mutationFn: async (skill: { skill_name: string; modality: string; certification_level: string }) => {
      const { error } = await supabase.from("provider_skills").insert({ ...skill, provider_id: providerId! });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my-skills"] }); toast.success("Skill added"); },
  });

  const removeSkillMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from("provider_skills").delete().eq("id", id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-skills"] }),
  });

  const addAvailabilityMutation = useMutation({
    mutationFn: async (avail: { day_of_week: number; start_time: string; end_time: string }) => {
      const { error } = await supabase.from("provider_availability").insert({ ...avail, provider_id: providerId! });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my-availability"] }); toast.success("Availability added"); },
  });

  const removeAvailabilityMutation = useMutation({
    mutationFn: async (id: string) => { await supabase.from("provider_availability").delete().eq("id", id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-availability"] }),
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("marketplace_bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["my-bookings"] }); toast.success("Booking updated"); },
  });

  const runCoachingMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-provider-coach", { body: { provider_id: providerId } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Coaching analysis complete");
      queryClient.invalidateQueries({ queryKey: ["my-coaching"] });
      queryClient.invalidateQueries({ queryKey: ["my-intel"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Earnings Calculations ──
  const totalNet = earnings?.reduce((s, e) => s + (e.net_revenue || 0), 0) ?? 0;
  const totalMinutes = earnings?.reduce((s, e) => s + (e.time_minutes || 0), 0) ?? 0;
  const totalHours = totalMinutes / 60;
  const effectiveRate = totalHours > 0 ? totalNet / totalHours : 0;
  const thisMonthEarnings = earnings?.filter((e) => {
    const d = new Date(e.service_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, e) => s + (e.net_revenue || 0), 0) ?? 0;

  const pendingBookings = bookings?.filter((b: any) => b.status === "pending") ?? [];

  if (providerLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" /> My Marketplace
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentProvider?.first_name} {currentProvider?.last_name}{currentProvider?.credentials ? `, ${currentProvider.credentials}` : ""} — Self-service profile & booking management
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCoachingOpen(true)}>
          <Brain className="h-4 w-4 mr-1" /> AI Coach
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-mono font-bold">${thisMonthEarnings.toLocaleString()}</p>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">MTD Net Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-mono font-bold">${effectiveRate.toFixed(0)}</p>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Effective $/hr</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Inbox className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-mono font-bold">{pendingBookings.length}</p>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Pending Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Star className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-mono font-bold">{membership?.tier || "—"}</p>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Membership Tier</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile"><User className="h-3 w-3 mr-1" /> My Profile</TabsTrigger>
          <TabsTrigger value="bookings" className="gap-1">
            <Inbox className="h-3 w-3" /> Booking Inbox
            {pendingBookings.length > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1.5 py-0">{pendingBookings.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="earnings"><DollarSign className="h-3 w-3 mr-1" /> Earnings</TabsTrigger>
        </TabsList>

        {/* ═══ PROFILE TAB ═══ */}
        <TabsContent value="profile" className="space-y-4">
          {/* Bio */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                Marketplace Bio
                <Button variant="ghost" size="sm" onClick={generateBioMutation} disabled={generatingBio}>
                  {generatingBio ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  AI Generate
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={4} placeholder="Your marketplace bio..." />
              <Button size="sm" onClick={() => saveBioMutation.mutate(editBio)} disabled={saveBioMutation.isPending}>Save Bio</Button>
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Skills & Certifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {(skills ?? []).map((s: any) => (
                  <Badge key={s.id} variant="secondary" className="text-xs gap-1">
                    {s.skill_name} ({s.certification_level})
                    <button onClick={() => removeSkillMutation.mutate(s.id)} className="ml-1 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </Badge>
                ))}
                {(!skills || skills.length === 0) && <p className="text-sm text-muted-foreground">No skills added yet</p>}
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                addSkillMutation.mutate({
                  skill_name: fd.get("skill_name") as string,
                  modality: fd.get("modality") as string,
                  certification_level: fd.get("cert") as string,
                });
                e.currentTarget.reset();
              }} className="grid grid-cols-4 gap-2">
                <select name="modality" className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                  <option value="injectables">Injectables</option>
                  <option value="weight_loss">Weight Loss</option>
                  <option value="laser">Laser</option>
                </select>
                <select name="skill_name" required className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                  <option value="">Skill...</option>
                  {SKILL_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select name="cert" className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                  {CERT_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <Button type="submit" size="sm"><Plus className="h-3 w-3" /></Button>
              </form>
            </CardContent>
          </Card>

          {/* Availability */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Availability</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                {(availability ?? []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b">
                    <span>{DAYS[a.day_of_week]} {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}</span>
                    <button onClick={() => removeAvailabilityMutation.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                {(!availability || availability.length === 0) && <p className="text-sm text-muted-foreground">No availability set</p>}
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                addAvailabilityMutation.mutate({
                  day_of_week: parseInt(fd.get("day") as string),
                  start_time: fd.get("start") as string,
                  end_time: fd.get("end") as string,
                });
                e.currentTarget.reset();
              }} className="grid grid-cols-4 gap-2">
                <select name="day" className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <Input name="start" type="time" defaultValue="09:00" className="h-8" />
                <Input name="end" type="time" defaultValue="17:00" className="h-8" />
                <Button type="submit" size="sm"><Plus className="h-3 w-3" /></Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ BOOKING INBOX TAB ═══ */}
        <TabsContent value="bookings" className="space-y-3">
          {(!bookings || bookings.length === 0) ? (
            <Card><CardContent className="py-12 text-center"><Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">No booking requests yet</p></CardContent></Card>
          ) : (
            bookings.map((b: any) => (
              <Card key={b.id}>
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{b.patients?.first_name} {b.patients?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{b.treatments?.name || "—"} · {new Date(b.requested_at).toLocaleDateString()}</p>
                    {b.ai_match_reasoning && <p className="text-xs text-muted-foreground/70 mt-1 italic">{b.ai_match_reasoning}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={b.status === "confirmed" ? "default" : b.status === "pending" ? "secondary" : "outline"}>
                      {b.status}
                    </Badge>
                    {b.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateBookingMutation.mutate({ id: b.id, status: "declined" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Decline
                        </Button>
                        <Button size="sm" onClick={() => updateBookingMutation.mutate({ id: b.id, status: "confirmed" })}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Accept
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ═══ EARNINGS TAB ═══ */}
        <TabsContent value="earnings" className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-mono font-bold">${totalNet.toLocaleString()}</p>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">All-Time Net</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-mono font-bold">{totalHours.toFixed(1)}h</p>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Hours</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3 text-center">
              <p className="text-xl font-mono font-bold">{earnings?.length ?? 0}</p>
              <p className="text-[10px] uppercase text-muted-foreground font-bold">Sessions</p>
            </CardContent></Card>
          </div>

          {/* Recent earnings list */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Recent Earnings</CardTitle></CardHeader>
            <CardContent>
              {(!earnings || earnings.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">No earnings recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {earnings.slice(0, 15).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium capitalize">{e.modality?.replace("_", " ")}</p>
                        <p className="text-xs text-muted-foreground">{new Date(e.service_date).toLocaleDateString()} · {e.time_minutes}min</p>
                      </div>
                      <span className="font-mono font-bold text-sm">${(e.net_revenue || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ AI COACHING SHEET ═══ */}
      <Sheet open={coachingOpen} onOpenChange={setCoachingOpen}>
        <SheetContent className="w-[450px] sm:max-w-[450px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> AI Coaching</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {intel && (
              <div className="grid grid-cols-2 gap-2">
                <Card><CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Correction Rate</p>
                  <p className="text-lg font-bold">{((intel.correction_rate || 0) * 100).toFixed(1)}%</p>
                </CardContent></Card>
                <Card><CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Coaching Status</p>
                  <Badge variant="outline" className={`mt-1 ${intel.coaching_status === "probation" ? "border-red-300 text-red-600" : intel.coaching_status === "monitoring" ? "border-orange-300 text-orange-600" : ""}`}>
                    {intel.coaching_status || "none"}
                  </Badge>
                </CardContent></Card>
              </div>
            )}

            {intel?.coaching_notes && (
              <Card><CardContent className="pt-3 pb-2">
                <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">AI Summary</p>
                <p className="text-sm">{intel.coaching_notes}</p>
              </CardContent></Card>
            )}

            <Button className="w-full" onClick={() => runCoachingMutation.mutate()} disabled={runCoachingMutation.isPending}>
              {runCoachingMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
              Run AI Coaching Analysis
            </Button>

            <div>
              <p className="text-xs font-bold mb-2">Action Items</p>
              {(!coachingActions || coachingActions.length === 0) ? (
                <p className="text-sm text-muted-foreground">No actions. Run AI analysis to generate recommendations.</p>
              ) : (
                <div className="space-y-2">
                  {coachingActions.map((action: any) => (
                    <Card key={action.id}>
                      <CardContent className="pt-3 pb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{action.action_type}</Badge>
                          <span className="text-sm font-medium">{action.title}</span>
                        </div>
                        {action.description && <p className="text-xs text-muted-foreground mt-1">{action.description}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

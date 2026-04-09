import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Store, Settings, Users, Search, Plus, Sparkles, Loader2, Star, Clock, Brain,
  Trash2, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MODALITY_OPTIONS = ["injectables", "weight_loss", "laser"];
const SKILL_OPTIONS: Record<string, string[]> = {
  injectables: ["Botox", "Dysport", "Juvederm", "Restylane", "Sculptra", "PRP", "Kybella"],
  weight_loss: ["GLP-1", "Semaglutide", "Tirzepatide", "B12 Injections", "Lipo-C"],
  laser: ["CO2 Laser", "IPL", "RF Microneedling", "Laser Hair Removal", "Halo", "BBL"],
};
const CERT_LEVELS = ["beginner", "intermediate", "expert"];

export default function Marketplace() {
  const queryClient = useQueryClient();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);

  // Queries
  const { data: config } = useQuery({
    queryKey: ["marketplace-config"],
    queryFn: async () => {
      const { data } = await supabase.from("marketplace_config").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["marketplace-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("*").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: allSkills } = useQuery({
    queryKey: ["provider-skills"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_skills").select("*");
      return data ?? [];
    },
  });

  const { data: allAvailability } = useQuery({
    queryKey: ["provider-availability"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_availability").select("*").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: memberships } = useQuery({
    queryKey: ["provider-memberships"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_memberships").select("*").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: bookings } = useQuery({
    queryKey: ["marketplace-bookings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketplace_bookings")
        .select("*, patients(first_name, last_name), providers(first_name, last_name), treatments(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["all-patients-mp"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: treatmentsList } = useQuery({
    queryKey: ["all-treatments-mp"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name, duration_minutes, category").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  // Mutations
  const toggleMarketplace = useMutation({
    mutationFn: async (active: boolean) => {
      if (config) {
        await supabase.from("marketplace_config").update({ is_active: active }).eq("id", config.id);
      } else {
        await supabase.from("marketplace_config").insert({ is_active: active });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketplace-config"] }); toast.success("Marketplace updated"); },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: any) => {
      if (config) {
        await supabase.from("marketplace_config").update(updates).eq("id", config.id);
      } else {
        await supabase.from("marketplace_config").insert(updates);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketplace-config"] }); toast.success("Settings saved"); },
  });

  const toggleProviderMarketplace = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await supabase.from("providers").update({ marketplace_enabled: enabled }).eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketplace-providers"] }); },
  });

  const saveProviderBio = useMutation({
    mutationFn: async ({ id, bio }: { id: string; bio: string }) => {
      await supabase.from("providers").update({ marketplace_bio: bio }).eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketplace-providers"] }); toast.success("Bio saved"); },
  });

  const addSkill = useMutation({
    mutationFn: async (skill: { provider_id: string; skill_name: string; modality: string; certification_level: string }) => {
      const { error } = await supabase.from("provider_skills").insert(skill);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["provider-skills"] }); toast.success("Skill added"); },
  });

  const removeSkill = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("provider_skills").delete().eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["provider-skills"] }); },
  });

  const addAvailability = useMutation({
    mutationFn: async (avail: { provider_id: string; day_of_week: number; start_time: string; end_time: string }) => {
      const { error } = await supabase.from("provider_availability").insert(avail);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["provider-availability"] }); toast.success("Availability added"); },
  });

  const removeAvailability = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("provider_availability").delete().eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["provider-availability"] }); },
  });

  const createBooking = useMutation({
    mutationFn: async (booking: { patient_id: string; provider_id: string; treatment_id: string; ai_match_reasoning?: string }) => {
      // Create appointment first
      const { data: apt, error: aptErr } = await supabase.from("appointments").insert({
        patient_id: booking.patient_id,
        provider_id: booking.provider_id,
        treatment_id: booking.treatment_id,
        scheduled_at: new Date().toISOString(),
        status: "booked" as const,
      }).select("id").single();
      if (aptErr) throw aptErr;
      // Create marketplace booking
      const { error } = await supabase.from("marketplace_bookings").insert({
        ...booking,
        appointment_id: apt.id,
        status: "confirmed",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setMatchResults(null);
      toast.success("Booking created");
    },
  });

  const generateBio = async (provider: any) => {
    setGeneratingBio(true);
    try {
      const providerSkills = (allSkills ?? []).filter((s: any) => s.provider_id === provider.id);
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: {
          mode: "generate_bio",
          provider: {
            first_name: provider.first_name,
            last_name: provider.last_name,
            specialty: provider.specialty,
            credentials: provider.credentials,
            skills: providerSkills.map((s: any) => `${s.skill_name} (${s.certification_level})`),
          },
        },
      });
      if (error) throw error;
      if (data?.bio) {
        await saveProviderBio.mutateAsync({ id: provider.id, bio: data.bio });
        setSelectedProvider({ ...provider, marketplace_bio: data.bio });
      }
    } catch {
      toast.error("Failed to generate bio");
    } finally {
      setGeneratingBio(false);
    }
  };

  const findProviders = async (treatmentId: string, date: string) => {
    if (!treatmentId) return;
    setMatchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-smart-schedule", {
        body: { mode: "marketplace_match", treatment_id: treatmentId, preferred_date: date },
      });
      if (error) throw error;
      setMatchResults(data);
    } catch {
      toast.error("Failed to find matches");
    } finally {
      setMatchLoading(false);
    }
  };

  const marketplaceProviders = (providers ?? []).filter((p: any) => p.marketplace_enabled);

  const openProfile = (provider: any) => {
    setSelectedProvider(provider);
    setProfileDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="h-6 w-6 text-primary" />Provider Marketplace</h1>
          <p className="text-muted-foreground">Manage provider availability, skills, and intelligent matching</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Marketplace</span>
          <Switch checked={config?.is_active ?? false} onCheckedChange={(v) => toggleMarketplace.mutate(v)} />
          <Badge variant={config?.is_active ? "default" : "outline"}>{config?.is_active ? "Active" : "Inactive"}</Badge>
        </div>
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers"><Users className="h-4 w-4 mr-1" />Provider Profiles</TabsTrigger>
          <TabsTrigger value="booking"><Search className="h-4 w-4 mr-1" />Booking & Matching</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1" />Settings</TabsTrigger>
        </TabsList>

        {/* Provider Profiles Tab */}
        <TabsContent value="providers" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(providers ?? []).map((p: any) => {
              const skills = (allSkills ?? []).filter((s: any) => s.provider_id === p.id);
              const avail = (allAvailability ?? []).filter((a: any) => a.provider_id === p.id);
              const membership = (memberships ?? []).find((m: any) => m.provider_id === p.id);
              return (
                <Card key={p.id} className={!p.marketplace_enabled ? "opacity-60" : ""}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{p.first_name} {p.last_name}{p.credentials ? `, ${p.credentials}` : ""}</p>
                        <p className="text-sm text-muted-foreground">{p.specialty || "General"}</p>
                      </div>
                      <Switch checked={p.marketplace_enabled} onCheckedChange={(v) => toggleProviderMarketplace.mutate({ id: p.id, enabled: v })} />
                    </div>
                    {membership && (
                      <Badge variant="secondary" className="text-xs">{membership.tier} — ${membership.monthly_rate}/mo</Badge>
                    )}
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 4).map((s: any) => (
                          <Badge key={s.id} variant="outline" className="text-xs">{s.skill_name}</Badge>
                        ))}
                        {skills.length > 4 && <Badge variant="outline" className="text-xs">+{skills.length - 4}</Badge>}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {avail.length > 0 ? `${avail.length} time slots` : "No availability set"}
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => openProfile(p)}>
                      Edit Profile
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Booking & Matching Tab */}
        <TabsContent value="booking" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />Find a Provider</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                findProviders(fd.get("treatment_id") as string, fd.get("preferred_date") as string);
              }} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Treatment *</Label>
                  <select name="treatment_id" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select treatment</option>
                    {treatmentsList?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Date</Label>
                  <Input name="preferred_date" type="date" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={matchLoading} className="w-full">
                    {matchLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Matching...</> : <><Search className="h-4 w-4 mr-1" />Find Matches</>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {matchResults?.matches && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">AI-Ranked Matches</h3>
              {matchResults.matches.map((m: any, i: number) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">#{i + 1}</Badge>
                        <p className="font-medium">{m.provider_name}</p>
                        {m.score && <Badge className="text-xs">{m.score}% match</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.reasoning}</p>
                    </div>
                    <Button size="sm" onClick={() => {
                      const fd = document.querySelector<HTMLFormElement>("[data-booking-form]");
                      if (m.provider_id) {
                        createBooking.mutate({
                          patient_id: matchResults.patient_id || patients?.[0]?.id || "",
                          provider_id: m.provider_id,
                          treatment_id: matchResults.treatment_id,
                          ai_match_reasoning: m.reasoning,
                        });
                      }
                    }}>
                      Book
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Recent Bookings</CardTitle></CardHeader>
            <CardContent>
              {bookings && bookings.length > 0 ? (
                <div className="space-y-2">
                  {bookings.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{b.patients?.first_name} {b.patients?.last_name}</p>
                        <p className="text-xs text-muted-foreground">→ {b.providers?.first_name} {b.providers?.last_name} · {b.treatments?.name}</p>
                      </div>
                      <Badge variant={b.status === "confirmed" ? "default" : b.status === "completed" ? "secondary" : "outline"}>
                        {b.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No bookings yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Membership Tiers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {config?.membership_tiers && typeof config.membership_tiers === "object" &&
                Object.entries(config.membership_tiers as Record<string, any>).map(([key, tier]) => (
                  <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{tier.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {tier.modalities ? tier.modalities.join(", ") : `${tier.modalities_count} modality(ies)`}
                      </p>
                    </div>
                    <Badge variant="secondary">${tier.monthly}/mo</Badge>
                  </div>
                ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                updateConfig.mutate({ laser_hourly_rate: parseFloat(fd.get("laser_rate") as string) || 150 });
              }} className="flex items-end gap-3">
                <div className="space-y-2 flex-1">
                  <Label>Laser Hourly Rate ($)</Label>
                  <Input name="laser_rate" type="number" defaultValue={config?.laser_hourly_rate ?? 150} />
                </div>
                <Button type="submit" size="sm">Save</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Modalities</CardTitle></CardHeader>
            <CardContent>
              {config?.modalities && Array.isArray(config.modalities) && (config.modalities as any[]).map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <Badge variant="outline">{m.key}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Provider Profile Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProvider?.first_name} {selectedProvider?.last_name} — Marketplace Profile</DialogTitle>
          </DialogHeader>
          {selectedProvider && (
            <div className="space-y-6">
              {/* Bio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Marketplace Bio</Label>
                  <Button variant="ghost" size="sm" onClick={() => generateBio(selectedProvider)} disabled={generatingBio}>
                    {generatingBio ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    AI Generate
                  </Button>
                </div>
                <Textarea
                  value={selectedProvider.marketplace_bio || ""}
                  onChange={(e) => setSelectedProvider({ ...selectedProvider, marketplace_bio: e.target.value })}
                  rows={3}
                  placeholder="Provider bio for marketplace listing..."
                />
                <Button size="sm" variant="outline" onClick={() => saveProviderBio.mutate({ id: selectedProvider.id, bio: selectedProvider.marketplace_bio || "" })}>
                  Save Bio
                </Button>
              </div>

              {/* Skills */}
              <div className="space-y-2">
                <Label>Skills & Modalities</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(allSkills ?? []).filter((s: any) => s.provider_id === selectedProvider.id).map((s: any) => (
                    <Badge key={s.id} variant="secondary" className="text-xs gap-1">
                      {s.skill_name} ({s.certification_level})
                      <button onClick={() => removeSkill.mutate(s.id)} className="ml-1 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  addSkill.mutate({
                    provider_id: selectedProvider.id,
                    skill_name: fd.get("skill_name") as string,
                    modality: fd.get("modality") as string,
                    certification_level: fd.get("cert") as string,
                  });
                  e.currentTarget.reset();
                }} className="grid grid-cols-4 gap-2">
                  <select name="modality" className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                    {MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select name="skill_name" required className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                    <option value="">Skill...</option>
                    {Object.values(SKILL_OPTIONS).flat().map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select name="cert" className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                    {CERT_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button type="submit" size="sm"><Plus className="h-3 w-3" /></Button>
                </form>
              </div>

              {/* Availability */}
              <div className="space-y-2">
                <Label>Availability</Label>
                <div className="space-y-1 mb-2">
                  {(allAvailability ?? []).filter((a: any) => a.provider_id === selectedProvider.id).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b">
                      <span>{DAYS[a.day_of_week]} {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}</span>
                      <button onClick={() => removeAvailability.mutate(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  addAvailability.mutate({
                    provider_id: selectedProvider.id,
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

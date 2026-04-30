import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pill, AlertTriangle, Eye, EyeOff, Sparkles, Loader2, ShieldCheck, Activity } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Hormone", "Injectable", "Oral", "Topical", "Peptide", "Supplement", "Controlled", "Other"];
const ROUTES = ["oral", "sublingual", "injectable", "topical", "transdermal", "subcutaneous", "intramuscular", "other"];

export default function Medications() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [category, setCategory] = useState("general");
  const [route, setRoute] = useState("oral");
  const [isControlled, setIsControlled] = useState(false);
  const [aiDosing, setAiDosing] = useState<any>(null);
  const [aiDosingLoading, setAiDosingLoading] = useState(false);
  const [aiInteraction, setAiInteraction] = useState<any>(null);
  const [aiInteractionLoading, setAiInteractionLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: medications, isLoading } = useQuery({
    queryKey: ["medications", showInactive],
    queryFn: async () => {
      let q = supabase.from("medications").select("*").order("name");
      if (!showInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const addMedication = useMutation({
    mutationFn: async (formData: FormData) => {
      const med = {
        name: formData.get("name") as string,
        generic_name: formData.get("generic_name") as string || null,
        category, route,
        default_dose: formData.get("default_dose") as string || null,
        default_unit: formData.get("default_unit") as string || null,
        is_controlled: isControlled,
        schedule_class: isControlled ? (formData.get("schedule_class") as string || null) : null,
        notes: formData.get("notes") as string || null,
      };
      const { error } = await supabase.from("medications").insert(med);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications"] });
      setDialogOpen(false);
      setIsControlled(false); setCategory("general"); setRoute("oral");
      setAiDosing(null); setAiInteraction(null);
      toast.success("Medication added");
    },
    onError: () => toast.error("Failed to add medication"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("medications").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["medications"] }); toast.success("Updated"); },
  });

  // ─── AI: Dosing Suggest ───
  const fetchDosing = async (name: string, generic: string) => {
    if (!name) return;
    setAiDosingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", {
        body: { mode: "dosing_suggest", data: { medication_name: name, generic_name: generic, category, route } },
      });
      if (error) throw error;
      setAiDosing(data);
    } catch { toast.error("AI dosing check failed"); }
    setAiDosingLoading(false);
  };

  // ─── AI: Interaction Check ───
  const fetchInteraction = async (name: string, generic: string) => {
    if (!name) return;
    setAiInteractionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", {
        body: { mode: "interaction_check", data: { medication_name: name, generic_name: generic } },
      });
      if (error) throw error;
      setAiInteraction(data);
    } catch { toast.error("AI interaction check failed"); }
    setAiInteractionLoading(false);
  };

  const severityColor = (s: string) => {
    switch (s) {
      case "contraindicated": return "text-destructive border-destructive";
      case "major": return "text-destructive border-destructive/50";
      case "moderate": return "text-warning border-warning/50";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Medications & Formulary</h1>
          <p className="text-muted-foreground">Manage clinic medication catalog with AI-powered safety checks</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setAiDosing(null); setAiInteraction(null); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Medication</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Medication</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMedication.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Brand Name *</Label><Input name="name" required /></div>
                  <div className="space-y-2"><Label>Generic Name</Label><Input name="generic_name" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c.toLowerCase()}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Route</Label>
                    <Select value={route} onValueChange={setRoute}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROUTES.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Default Dose</Label><Input name="default_dose" placeholder="e.g. 200" defaultValue={aiDosing?.suggested_dose || ""} /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input name="default_unit" placeholder="e.g. mg, mL, IU" defaultValue={aiDosing?.suggested_unit || ""} /></div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={isControlled} onCheckedChange={setIsControlled} />
                    <AlertTriangle className="h-4 w-4 text-warning" />Controlled Substance
                  </label>
                </div>
                {isControlled && (
                  <div className="space-y-2">
                    <Label>DEA Schedule</Label>
                    <Select name="schedule_class" defaultValue="III">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["II", "III", "IV", "V"].map(s => <SelectItem key={s} value={s}>Schedule {s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2"><Label>Notes</Label><Input name="notes" placeholder="Special instructions, storage requirements..." /></div>

                {/* AI Buttons */}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" disabled={aiDosingLoading}
                    onClick={() => {
                      const form = document.querySelector<HTMLFormElement>('form');
                      const name = form?.querySelector<HTMLInputElement>('[name="name"]')?.value || "";
                      const generic = form?.querySelector<HTMLInputElement>('[name="generic_name"]')?.value || "";
                      fetchDosing(name, generic);
                    }}>
                    {aiDosingLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    AI Dosing
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1" disabled={aiInteractionLoading}
                    onClick={() => {
                      const form = document.querySelector<HTMLFormElement>('form');
                      const name = form?.querySelector<HTMLInputElement>('[name="name"]')?.value || "";
                      const generic = form?.querySelector<HTMLInputElement>('[name="generic_name"]')?.value || "";
                      fetchInteraction(name, generic);
                    }}>
                    {aiInteractionLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                    Interaction Check
                  </Button>
                </div>

                {/* AI Dosing Panel */}
                {aiDosing && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold">AI Dosing Recommendation</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Dose:</span> <strong>{aiDosing.suggested_dose} {aiDosing.suggested_unit}</strong></div>
                        {aiDosing.frequency && <div><span className="text-muted-foreground">Frequency:</span> <strong>{aiDosing.frequency}</strong></div>}
                        {aiDosing.dose_range && <div><span className="text-muted-foreground">Range:</span> {aiDosing.dose_range}</div>}
                      </div>
                      {aiDosing.monitoring_requirements?.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase mt-1">Monitoring Required</p>
                          {aiDosing.monitoring_requirements.map((m: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs mt-1">
                              <Activity className="h-3 w-3 text-warning shrink-0" />
                              <span><strong>{m.test}</strong> — {m.frequency}{m.reason ? ` (${m.reason})` : ""}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {aiDosing.credential_restrictions?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {aiDosing.credential_restrictions.map((r: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[11px] border-warning/30 text-warning">{r}</Badge>
                          ))}
                        </div>
                      )}
                      {aiDosing.warnings?.length > 0 && (
                        <div className="space-y-1 mt-1">
                          {aiDosing.warnings.map((w: string, i: number) => (
                            <p key={i} className="text-xs text-destructive flex items-start gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{w}
                            </p>
                          ))}
                        </div>
                      )}
                      {aiDosing.notes && <p className="text-xs text-muted-foreground italic">{aiDosing.notes}</p>}
                    </CardContent>
                  </Card>
                )}

                {/* AI Interaction Panel */}
                {aiInteraction && (
                  <Card className={`border-${aiInteraction.overall_risk === "warning" ? "destructive" : aiInteraction.overall_risk === "caution" ? "warning" : "success"}/20`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold">Formulary Interaction Check</span>
                        <Badge variant="outline" className={`text-[11px] ${aiInteraction.overall_risk === "warning" ? "border-destructive text-destructive" : aiInteraction.overall_risk === "caution" ? "border-warning text-warning" : "border-success text-success"}`}>
                          {aiInteraction.overall_risk}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{aiInteraction.summary}</p>
                      {aiInteraction.interactions?.length > 0 && (
                        <div className="space-y-1.5">
                          {aiInteraction.interactions.map((int: any, i: number) => (
                            <div key={i} className={`p-2 rounded border text-xs ${severityColor(int.severity)}`}>
                              <div className="flex items-center gap-2">
                                <strong>{int.medication}</strong>
                                <Badge variant="outline" className={`text-[11px] ${severityColor(int.severity)}`}>{int.severity}</Badge>
                              </div>
                              <p className="text-muted-foreground mt-0.5">{int.description}</p>
                              {int.clinical_action && <p className="text-primary mt-0.5">→ {int.clinical_action}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Button type="submit" className="w-full" disabled={addMedication.isPending}>
                  {addMedication.isPending ? "Adding..." : "Add Medication"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-6 h-28" /></Card>)}
        </div>
      ) : medications && medications.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {medications.map((m: any) => (
            <Card key={m.id} className={!m.is_active ? "opacity-60" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{m.name}</p>
                      {m.is_controlled && (
                        <Badge variant="destructive" className="text-[11px] px-1.5 py-0">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />C{m.schedule_class}
                        </Badge>
                      )}
                    </div>
                    {m.generic_name && <p className="text-sm text-muted-foreground italic">{m.generic_name}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline">{m.category}</Badge>
                      <Badge variant="secondary" className="text-xs">{m.route}</Badge>
                      {m.default_dose && <span className="text-xs text-muted-foreground">{m.default_dose} {m.default_unit}</span>}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Switch checked={m.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: m.id, is_active: v })} className="scale-75" />
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center"><Pill className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">No medications in formulary</p></CardContent></Card>
      )}
    </div>
  );
}

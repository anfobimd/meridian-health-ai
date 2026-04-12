import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pill, Sparkles, Loader2, AlertTriangle, ShieldCheck, Search, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

const ROUTES = ["oral", "sublingual", "injectable", "topical", "transdermal", "subcutaneous", "intramuscular", "other"];
const FREQUENCIES = ["once daily", "twice daily", "three times daily", "every 12 hours", "every 8 hours", "weekly", "biweekly", "monthly", "as needed", "other"];

interface TelehealthRxProps {
  patientId?: string;
  encounterId?: string;
  embedded?: boolean;
}

export function TelehealthRx({ patientId, encounterId, embedded = false }: TelehealthRxProps) {
  const [rxDialogOpen, setRxDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMedId, setSelectedMedId] = useState("");
  const [selectedMedName, setSelectedMedName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("once daily");
  const [route, setRoute] = useState("oral");
  const [quantity, setQuantity] = useState("");
  const [refills, setRefills] = useState("0");
  const [pharmacy, setPharmacy] = useState("");
  const [rxNotes, setRxNotes] = useState("");

  // AI states
  const [aiDosing, setAiDosing] = useState<any>(null);
  const [aiDosingLoading, setAiDosingLoading] = useState(false);
  const [aiInteraction, setAiInteraction] = useState<any>(null);
  const [aiInteractionLoading, setAiInteractionLoading] = useState(false);

  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Get current provider
  const { data: currentProvider } = useQuery({
    queryKey: ["current-provider", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("providers").select("id").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Get patient prescriptions
  const { data: prescriptions, isLoading: rxLoading } = useQuery({
    queryKey: ["prescriptions", patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*, providers:provider_id(first_name, last_name, credentials)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!patientId,
  });

  // Search medications catalog
  const { data: medResults } = useQuery({
    queryKey: ["med-search", searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      const { data } = await supabase
        .from("medications")
        .select("id, name, generic_name, category, route, default_dose, default_unit, is_controlled, schedule_class")
        .eq("is_active", true)
        .ilike("name", `%${searchTerm}%`)
        .limit(10);
      return data ?? [];
    },
    enabled: searchTerm.length >= 2,
  });

  const selectMedication = (med: any) => {
    setSelectedMedId(med.id);
    setSelectedMedName(med.name + (med.generic_name ? ` (${med.generic_name})` : ""));
    setSearchTerm("");
    if (med.default_dose && med.default_unit) setDosage(`${med.default_dose} ${med.default_unit}`);
    if (med.route) setRoute(med.route);
  };

  // AI dosing check
  const fetchAiDosing = async () => {
    if (!selectedMedName || !patientId) return;
    setAiDosingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: { mode: "prescribe_check", data: { patient_id: patientId, medication_name: selectedMedName, current_dosage: dosage, route, frequency } },
      });
      if (error) throw error;
      setAiDosing(data);
      if (data?.suggested_dosage && !dosage) setDosage(data.suggested_dosage);
    } catch { toast.error("AI dosing check failed"); }
    setAiDosingLoading(false);
  };

  // AI interaction check
  const fetchInteractionCheck = async () => {
    if (!selectedMedName || !patientId) return;
    setAiInteractionLoading(true);
    try {
      const activeMeds = (prescriptions ?? []).filter((p: any) => p.is_active).map((p: any) => p.medication_name);
      const { data, error } = await supabase.functions.invoke("ai-catalog-advisor", {
        body: { mode: "interaction_check", data: { medication_name: selectedMedName, active_medications: activeMeds } },
      });
      if (error) throw error;
      setAiInteraction(data);
    } catch { toast.error("Interaction check failed"); }
    setAiInteractionLoading(false);
  };

  const writeRx = useMutation({
    mutationFn: async () => {
      if (!patientId || !selectedMedName) throw new Error("Missing data");
      const rx = {
        patient_id: patientId,
        encounter_id: encounterId || null,
        provider_id: currentProvider?.id || null,
        medication_name: selectedMedName,
        dosage: dosage || null,
        frequency: frequency || null,
        route: route || null,
        quantity: quantity ? parseInt(quantity) : null,
        refills: refills ? parseInt(refills) : 0,
        pharmacy: pharmacy || null,
        notes: rxNotes || null,
        start_date: new Date().toISOString().split("T")[0],
        is_active: true,
      };
      const { error } = await supabase.from("prescriptions").insert(rx);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions", patientId] });
      resetRxForm();
      toast.success("Prescription written");
    },
    onError: (e: any) => toast.error(e.message || "Failed to write prescription"),
  });

  const discontinueRx = useMutation({
    mutationFn: async (rxId: string) => {
      const { error } = await supabase.from("prescriptions").update({ is_active: false, end_date: new Date().toISOString().split("T")[0] }).eq("id", rxId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prescriptions", patientId] });
      toast.success("Prescription discontinued");
    },
  });

  const resetRxForm = () => {
    setRxDialogOpen(false);
    setSearchTerm(""); setSelectedMedId(""); setSelectedMedName("");
    setDosage(""); setFrequency("once daily"); setRoute("oral");
    setQuantity(""); setRefills("0"); setPharmacy(""); setRxNotes("");
    setAiDosing(null); setAiInteraction(null);
  };

  const activePrescriptions = (prescriptions ?? []).filter((p: any) => p.is_active);
  const inactivePrescriptions = (prescriptions ?? []).filter((p: any) => !p.is_active);

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={embedded ? "text-base font-semibold" : "text-2xl font-bold"}>Prescriptions</h2>
          {!embedded && <p className="text-muted-foreground text-sm">Manage patient medications and write new prescriptions</p>}
        </div>
        <Dialog open={rxDialogOpen} onOpenChange={(o) => { if (!o) resetRxForm(); else setRxDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size={embedded ? "sm" : "default"} disabled={!patientId}>
              <Plus className="h-4 w-4 mr-1" />New Rx
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-primary" />Write Prescription</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {/* Medication Search */}
              <div className="space-y-2">
                <Label>Medication *</Label>
                {selectedMedName ? (
                  <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                    <Pill className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium flex-1">{selectedMedName}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setSelectedMedId(""); setSelectedMedName(""); }}>
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search formulary..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                    {medResults && medResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-48 overflow-y-auto">
                        {medResults.map((med: any) => (
                          <button key={med.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0" onClick={() => selectMedication(med)}>
                            <span className="font-medium">{med.name}</span>
                            {med.generic_name && <span className="text-muted-foreground italic ml-1">({med.generic_name})</span>}
                            <div className="flex gap-1.5 mt-0.5">
                              <Badge variant="outline" className="text-[9px]">{med.category}</Badge>
                              <Badge variant="secondary" className="text-[9px]">{med.route}</Badge>
                              {med.is_controlled && <Badge variant="destructive" className="text-[9px]">C{med.schedule_class}</Badge>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dosage + Frequency */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Dosage</Label>
                  <Input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 200 mg" />
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Route + Quantity */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Route</Label>
                  <Select value={route} onValueChange={setRoute}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROUTES.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Qty</Label>
                  <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="30" />
                </div>
                <div className="space-y-2">
                  <Label>Refills</Label>
                  <Input type="number" value={refills} onChange={(e) => setRefills(e.target.value)} min="0" max="12" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pharmacy</Label>
                <Input value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} placeholder="Pharmacy name or address" />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={rxNotes} onChange={(e) => setRxNotes(e.target.value)} placeholder="Special instructions..." rows={2} />
              </div>

              {/* AI Buttons */}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="flex-1" disabled={!selectedMedName || aiDosingLoading} onClick={fetchAiDosing}>
                  {aiDosingLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  AI Dosing Check
                </Button>
                <Button type="button" variant="outline" size="sm" className="flex-1" disabled={!selectedMedName || aiInteractionLoading} onClick={fetchInteractionCheck}>
                  {aiInteractionLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                  Interaction Check
                </Button>
              </div>

              {/* AI Dosing Result */}
              {aiDosing && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold">AI Dosing Recommendation</span>
                    </div>
                    {aiDosing.suggested_dosage && (
                      <p className="text-xs"><span className="text-muted-foreground">Suggested:</span> <strong>{aiDosing.suggested_dosage}</strong></p>
                    )}
                    {aiDosing.titration_schedule && (
                      <p className="text-xs"><span className="text-muted-foreground">Titration:</span> {aiDosing.titration_schedule}</p>
                    )}
                    {aiDosing.monitoring_labs?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {aiDosing.monitoring_labs.map((lab: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-[9px]">{lab}</Badge>
                        ))}
                      </div>
                    )}
                    {aiDosing.contraindications?.length > 0 && (
                      <div className="space-y-1">
                        {aiDosing.contraindications.map((c: string, i: number) => (
                          <p key={i} className="text-xs text-destructive flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{c}
                          </p>
                        ))}
                      </div>
                    )}
                    {aiDosing.notes && <p className="text-xs text-muted-foreground italic">{aiDosing.notes}</p>}
                  </CardContent>
                </Card>
              )}

              {/* AI Interaction Result */}
              {aiInteraction && (
                <Card className={`border-${aiInteraction.overall_risk === "warning" ? "destructive" : "primary"}/20`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold">Interaction Check</span>
                      <Badge variant="outline" className={`text-[9px] ${aiInteraction.overall_risk === "warning" ? "border-destructive text-destructive" : aiInteraction.overall_risk === "caution" ? "border-warning text-warning" : "border-success text-success"}`}>
                        {aiInteraction.overall_risk}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{aiInteraction.summary}</p>
                    {aiInteraction.interactions?.map((int: any, i: number) => (
                      <div key={i} className="p-2 rounded border text-xs">
                        <strong>{int.medication}</strong> — <span className="text-muted-foreground">{int.description}</span>
                        {int.clinical_action && <p className="text-primary mt-0.5">→ {int.clinical_action}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Button className="w-full" disabled={!selectedMedName || writeRx.isPending} onClick={() => writeRx.mutate()}>
                {writeRx.isPending ? "Writing..." : "Write Prescription"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!patientId ? (
        <Card><CardContent className="py-12 text-center"><Pill className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="mt-4 text-muted-foreground">Select a patient to view prescriptions</p></CardContent></Card>
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active ({activePrescriptions.length})</TabsTrigger>
            <TabsTrigger value="history">History ({inactivePrescriptions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-2 mt-3">
            {rxLoading ? (
              <div className="space-y-2">{[1,2].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16" /></Card>)}</div>
            ) : activePrescriptions.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No active prescriptions</CardContent></Card>
            ) : (
              activePrescriptions.map((rx: any) => (
                <Card key={rx.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Pill className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{rx.medication_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {rx.dosage} • {rx.frequency} • {rx.route}
                          {rx.refills != null && ` • ${rx.refills} refills`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {rx.providers ? `Dr. ${rx.providers.last_name}` : "Unknown"} • Started {rx.start_date ? format(parseISO(rx.start_date), "MMM d, yyyy") : "N/A"}
                          {rx.pharmacy && ` • ${rx.pharmacy}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-success/10 text-success text-[10px]"><CheckCircle className="h-2.5 w-2.5 mr-0.5" />Active</Badge>
                      <Button size="sm" variant="ghost" className="text-xs text-destructive h-7" onClick={() => discontinueRx.mutate(rx.id)}>
                        <XCircle className="h-3 w-3 mr-1" />D/C
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2 mt-3">
            {inactivePrescriptions.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No past prescriptions</CardContent></Card>
            ) : (
              inactivePrescriptions.map((rx: any) => (
                <Card key={rx.id} className="opacity-70">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Pill className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{rx.medication_name}</p>
                        <p className="text-xs text-muted-foreground">{rx.dosage} • {rx.frequency} • {rx.route}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {rx.start_date && format(parseISO(rx.start_date), "MMM d")} – {rx.end_date ? format(parseISO(rx.end_date), "MMM d, yyyy") : "ongoing"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />Discontinued</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );

  return content;
}

// Standalone page with patient picker
export default function PrescriptionsPage() {
  const [selectedPatientId, setSelectedPatientId] = useState("");

  const { data: patients } = useQuery({
    queryKey: ["patients-for-rx"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <Label className="text-sm mb-1.5 block">Select Patient</Label>
        <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Choose a patient...</option>
          {patients?.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
        </select>
      </div>
      <TelehealthRx patientId={selectedPatientId || undefined} />
    </div>
  );
}

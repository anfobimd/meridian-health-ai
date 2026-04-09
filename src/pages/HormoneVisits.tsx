import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FlaskConical, Plus, CheckCircle, Clock, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const LAB_FIELDS = [
  { key: "lab_tt", label: "Total Testosterone", unit: "ng/dL", category: "Hormones" },
  { key: "lab_ft", label: "Free Testosterone", unit: "pg/mL", category: "Hormones" },
  { key: "lab_e2", label: "Estradiol (E2)", unit: "pg/mL", category: "Hormones" },
  { key: "lab_p4", label: "Progesterone", unit: "ng/mL", category: "Hormones" },
  { key: "lab_lh", label: "LH", unit: "mIU/mL", category: "Hormones" },
  { key: "lab_fsh", label: "FSH", unit: "mIU/mL", category: "Hormones" },
  { key: "lab_shbg", label: "SHBG", unit: "nmol/L", category: "Hormones" },
  { key: "lab_prl", label: "Prolactin", unit: "ng/mL", category: "Hormones" },
  { key: "lab_psa", label: "PSA", unit: "ng/mL", category: "Hormones" },
  { key: "lab_dhea", label: "DHEA-S", unit: "mcg/dL", category: "Hormones" },
  { key: "lab_tsh", label: "TSH", unit: "mIU/L", category: "Thyroid" },
  { key: "lab_ft3", label: "Free T3", unit: "pg/mL", category: "Thyroid" },
  { key: "lab_ft4", label: "Free T4", unit: "ng/dL", category: "Thyroid" },
  { key: "lab_hgb", label: "Hemoglobin", unit: "g/dL", category: "CBC" },
  { key: "lab_hct", label: "Hematocrit", unit: "%", category: "CBC" },
  { key: "lab_rbc", label: "RBC", unit: "M/uL", category: "CBC" },
  { key: "lab_glc", label: "Fasting Glucose", unit: "mg/dL", category: "Metabolic" },
  { key: "lab_a1c", label: "HbA1c", unit: "%", category: "Metabolic" },
  { key: "lab_alt", label: "ALT", unit: "U/L", category: "Liver" },
  { key: "lab_ast", label: "AST", unit: "U/L", category: "Liver" },
  { key: "lab_crt", label: "Creatinine", unit: "mg/dL", category: "Renal" },
];

const approvalColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  modified: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

export default function HormoneVisits() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: visits, isLoading } = useQuery({
    queryKey: ["hormone-visits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hormone_visits")
        .select("*, patients(id, first_name, last_name, date_of_birth, gender), providers!hormone_visits_provider_id_fkey(first_name, last_name)")
        .order("visit_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const createVisit = useMutation({
    mutationFn: async () => {
      const labData: Record<string, number | null> = {};
      LAB_FIELDS.forEach((f) => {
        const val = labValues[f.key];
        labData[f.key] = val ? parseFloat(val) : null;
      });
      const { error } = await supabase.from("hormone_visits").insert({
        patient_id: selectedPatient,
        provider_id: selectedProvider || null,
        ...labData,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hormone-visits"] });
      setDialogOpen(false);
      setLabValues({});
      setSelectedPatient("");
      setSelectedProvider("");
      toast.success("Hormone visit created");
    },
    onError: () => toast.error("Failed to create visit"),
  });

  const getAiRecommendation = async (visit: any) => {
    setAiLoading(visit.id);
    setAiResult(null);
    setAiDialogOpen(true);

    try {
      const { data: priorVisits } = await supabase
        .from("hormone_visits")
        .select("*")
        .eq("patient_id", visit.patient_id)
        .neq("id", visit.id)
        .order("visit_date", { ascending: false })
        .limit(5);

      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: { patient: visit.patients, visit, priorVisits: priorVisits ?? [] },
      });
      if (error) throw error;
      setAiResult(data);

      // Save recommendation to the visit
      await supabase.from("hormone_visits").update({
        ai_recommendation: data.summary,
        ai_sections: data,
      }).eq("id", visit.id);
      queryClient.invalidateQueries({ queryKey: ["hormone-visits"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate recommendation");
    } finally {
      setAiLoading(null);
    }
  };

  const categories = LAB_FIELDS.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, typeof LAB_FIELDS>);

  const filledLabCount = (visit: any) => LAB_FIELDS.filter((f) => visit[f.key] != null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif">Hormone Labs</h1>
          <p className="text-muted-foreground text-sm">Hormone visit tracking with AI-powered recommendations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Visit</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif">New Hormone Visit</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient *</Label>
                  <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>
                      {patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {providers?.map((p) => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name} {p.credentials && `(${p.credentials})`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {Object.entries(categories).map(([cat, fields]) => (
                <div key={cat}>
                  <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-muted-foreground border-b pb-1 mb-3">{cat}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {fields.map((f) => (
                      <div key={f.key} className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">{f.label}</Label>
                          <Input type="number" step="any" placeholder="—" value={labValues[f.key] ?? ""} onChange={(e) => setLabValues((p) => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <span className="text-[11px] text-muted-foreground pb-2 min-w-[50px]">{f.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Button className="w-full" onClick={() => createVisit.mutate()} disabled={!selectedPatient || createVisit.isPending}>
                {createVisit.isPending ? "Creating..." : "Create Visit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* AI Recommendation Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Hormone Recommendation
            </DialogTitle>
          </DialogHeader>
          {aiLoading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing labs and generating recommendation...</p>
            </div>
          ) : aiResult ? (
            <div className="space-y-4">
              <div className="p-3 bg-primary/5 rounded-lg">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Summary</p>
                <p className="text-sm">{aiResult.summary}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Treatment Recommendation</p>
                <p className="text-sm whitespace-pre-wrap">{aiResult.treatment_recommendation}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Monitoring Plan</p>
                <p className="text-sm whitespace-pre-wrap">{aiResult.monitoring_plan}</p>
              </div>
              <div className="p-3 bg-destructive/5 rounded-lg">
                <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1">Risk Flags</p>
                <p className="text-sm whitespace-pre-wrap">{aiResult.risk_flags}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No recommendation generated</p>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Card key={i} className="animate-pulse"><CardContent className="p-5 h-24" /></Card>)}</div>
      ) : visits && visits.length > 0 ? (
        <div className="space-y-3">
          {visits.map((visit: any) => (
            <Card key={visit.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FlaskConical className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{visit.patients?.first_name} {visit.patients?.last_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(visit.visit_date), "MMM d, yyyy 'at' h:mm a")}
                        {visit.providers && ` • Dr. ${visit.providers.last_name}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {filledLabCount(visit)} labs recorded
                        {visit.ai_recommendation && " • AI recommendation available"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => getAiRecommendation(visit)} disabled={aiLoading === visit.id}>
                      {aiLoading === visit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI Rec
                    </Button>
                    <Badge variant="secondary" className={approvalColors[visit.approval_status ?? "pending"]}>
                      {visit.approval_status === "approved" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {visit.approval_status === "rejected" && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {(!visit.approval_status || visit.approval_status === "pending") && <Clock className="h-3 w-3 mr-1" />}
                      {visit.approval_status ?? "pending"}
                    </Badge>
                  </div>
                </div>
                {(visit.lab_tt || visit.lab_e2 || visit.lab_tsh) && (
                  <div className="mt-3 flex gap-4 text-xs flex-wrap">
                    {visit.lab_tt != null && <span className="px-2 py-0.5 bg-muted rounded text-muted-foreground">TT: <span className="font-mono font-medium text-foreground">{visit.lab_tt}</span> ng/dL</span>}
                    {visit.lab_e2 != null && <span className="px-2 py-0.5 bg-muted rounded text-muted-foreground">E2: <span className="font-mono font-medium text-foreground">{visit.lab_e2}</span> pg/mL</span>}
                    {visit.lab_tsh != null && <span className="px-2 py-0.5 bg-muted rounded text-muted-foreground">TSH: <span className="font-mono font-medium text-foreground">{visit.lab_tsh}</span> mIU/L</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground text-sm">No hormone visits yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Record first hormone visit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Heart, Thermometer, Weight, Activity, Save, Loader2, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

interface VitalsPanelProps {
  encounterId: string;
  patientId: string;
}

function Delta({ current, previous, unit, invert }: { current: string; previous: number | null; unit?: string; invert?: boolean }) {
  if (!previous || !current) return null;
  const diff = parseFloat(current) - previous;
  if (Math.abs(diff) < 0.01) return null;
  const isUp = diff > 0;
  const color = invert ? (isUp ? "text-destructive" : "text-green-600") : (isUp ? "text-green-600" : "text-destructive");
  return (
    <span className={`text-[10px] flex items-center gap-0.5 ${color}`}>
      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {isUp ? "+" : ""}{diff.toFixed(1)}{unit || ""}
    </span>
  );
}

export function VitalsPanel({ encounterId, patientId }: VitalsPanelProps) {
  const queryClient = useQueryClient();
  const [vitals, setVitals] = useState({
    bp_systolic: "",
    bp_diastolic: "",
    heart_rate: "",
    temperature: "",
    weight_lbs: "",
    height_in: "",
    o2_sat: "",
    pain_scale: "",
  });

  // Fetch current encounter vitals
  const { data: existing } = useQuery({
    queryKey: ["vitals", encounterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vitals")
        .select("*")
        .eq("encounter_id", encounterId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setVitals({
          bp_systolic: data.bp_systolic?.toString() || "",
          bp_diastolic: data.bp_diastolic?.toString() || "",
          heart_rate: data.heart_rate?.toString() || "",
          temperature: data.temperature?.toString() || "",
          weight_lbs: data.weight_lbs?.toString() || "",
          height_in: data.height_in?.toString() || "",
          o2_sat: data.o2_sat?.toString() || "",
          pain_scale: data.pain_scale?.toString() || "",
        });
      }
      return data;
    },
  });

  // Fetch prior visit vitals for deltas
  const { data: priorVitals } = useQuery({
    queryKey: ["vitals-prior", patientId, encounterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vitals")
        .select("*")
        .eq("patient_id", patientId)
        .neq("encounter_id", encounterId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch baseline weight for GLP-1 tracking
  const { data: baselineWeight } = useQuery({
    queryKey: ["vitals-baseline-weight", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vitals")
        .select("weight_lbs, recorded_at")
        .eq("patient_id", patientId)
        .not("weight_lbs", "is", null)
        .order("recorded_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const bmi = vitals.weight_lbs && vitals.height_in
    ? ((parseFloat(vitals.weight_lbs) / (parseFloat(vitals.height_in) ** 2)) * 703).toFixed(1)
    : null;

  const bmiColor = useMemo(() => {
    if (!bmi) return "";
    const val = parseFloat(bmi);
    if (val >= 30) return "text-destructive bg-destructive/10";
    if (val >= 25) return "text-amber-600 bg-amber-100 dark:bg-amber-900/30";
    return "text-green-600 bg-green-100 dark:bg-green-900/30";
  }, [bmi]);

  // Weight loss percentage from baseline
  const weightLossPct = useMemo(() => {
    if (!vitals.weight_lbs || !baselineWeight?.weight_lbs) return null;
    const current = parseFloat(vitals.weight_lbs);
    const baseline = baselineWeight.weight_lbs;
    if (baseline <= 0) return null;
    const pct = ((baseline - current) / baseline) * 100;
    return Math.abs(pct) > 0.1 ? pct.toFixed(1) : null;
  }, [vitals.weight_lbs, baselineWeight]);

  // BP contraindication warning
  const bpWarning = useMemo(() => {
    const sys = parseInt(vitals.bp_systolic);
    const dia = parseInt(vitals.bp_diastolic);
    if (sys >= 160 || dia >= 100) return "BP ≥160/100 — Contraindication for filler/injectable procedures. Consult before proceeding.";
    if (sys >= 140 || dia >= 90) return "Elevated BP — Monitor closely during procedure.";
    return null;
  }, [vitals.bp_systolic, vitals.bp_diastolic]);

  const save = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const payload = {
        patient_id: patientId,
        encounter_id: encounterId,
        bp_systolic: vitals.bp_systolic ? parseInt(vitals.bp_systolic) : null,
        bp_diastolic: vitals.bp_diastolic ? parseInt(vitals.bp_diastolic) : null,
        heart_rate: vitals.heart_rate ? parseInt(vitals.heart_rate) : null,
        temperature: vitals.temperature ? parseFloat(vitals.temperature) : null,
        weight_lbs: vitals.weight_lbs ? parseFloat(vitals.weight_lbs) : null,
        height_in: vitals.height_in ? parseFloat(vitals.height_in) : null,
        o2_sat: vitals.o2_sat ? parseFloat(vitals.o2_sat) : null,
        pain_scale: vitals.pain_scale ? parseInt(vitals.pain_scale) : null,
        bmi: bmi ? parseFloat(bmi) : null,
        recorded_by: user?.id,
      };

      if (existing?.id) {
        const { error } = await supabase.from("vitals").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vitals").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vitals", encounterId] });
      toast.success("Vitals saved");
    },
    onError: (e: any) => toast.error(`Failed: ${e.message}`),
  });

  const update = (key: string, value: string) => setVitals(prev => ({ ...prev, [key]: value }));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" /> Vitals
          </p>
          <Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>

        {/* BP Warning */}
        {bpWarning && (
          <div className={`flex items-start gap-2 text-xs p-2 rounded ${
            bpWarning.includes("Contraindication") ? "bg-destructive/10 text-destructive" : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
          }`}>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{bpWarning}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Blood Pressure */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Heart className="h-3 w-3" /> Blood Pressure
            </Label>
            <div className="flex items-center gap-1">
              <Input type="number" placeholder="SYS" value={vitals.bp_systolic} onChange={e => update("bp_systolic", e.target.value)} className="h-8 text-xs" />
              <span className="text-muted-foreground">/</span>
              <Input type="number" placeholder="DIA" value={vitals.bp_diastolic} onChange={e => update("bp_diastolic", e.target.value)} className="h-8 text-xs" />
            </div>
            {priorVitals?.bp_systolic && (
              <p className="text-[10px] text-muted-foreground">Prior: {priorVitals.bp_systolic}/{priorVitals.bp_diastolic}</p>
            )}
          </div>

          {/* Heart Rate */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Heart Rate (bpm)</Label>
            <Input type="number" placeholder="72" value={vitals.heart_rate} onChange={e => update("heart_rate", e.target.value)} className="h-8 text-xs" />
            <div className="flex items-center gap-1">
              {priorVitals?.heart_rate && <p className="text-[10px] text-muted-foreground">Prior: {priorVitals.heart_rate}</p>}
              <Delta current={vitals.heart_rate} previous={priorVitals?.heart_rate || null} />
            </div>
          </div>

          {/* Temperature */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Thermometer className="h-3 w-3" /> Temp (°F)
            </Label>
            <Input type="number" step="0.1" placeholder="98.6" value={vitals.temperature} onChange={e => update("temperature", e.target.value)} className="h-8 text-xs" />
          </div>

          {/* O2 Sat */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">O₂ Sat (%)</Label>
            <Input type="number" step="0.1" placeholder="98" value={vitals.o2_sat} onChange={e => update("o2_sat", e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Weight */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Weight className="h-3 w-3" /> Weight (lbs)
            </Label>
            <Input type="number" step="0.1" placeholder="150" value={vitals.weight_lbs} onChange={e => update("weight_lbs", e.target.value)} className="h-8 text-xs" />
            <div className="flex items-center gap-1.5">
              {priorVitals?.weight_lbs && <p className="text-[10px] text-muted-foreground">Prior: {priorVitals.weight_lbs}</p>}
              <Delta current={vitals.weight_lbs} previous={priorVitals?.weight_lbs || null} unit=" lbs" invert />
            </div>
            {weightLossPct && (
              <p className={`text-[10px] font-medium ${parseFloat(weightLossPct) > 0 ? "text-green-600" : "text-amber-600"}`}>
                {parseFloat(weightLossPct) > 0 ? "↓" : "↑"} {Math.abs(parseFloat(weightLossPct))}% from baseline
              </p>
            )}
          </div>

          {/* Height */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Height (in)</Label>
            <Input type="number" step="0.1" placeholder="67" value={vitals.height_in} onChange={e => update("height_in", e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Pain Scale */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Pain Scale (0-10)</Label>
            <Input type="number" min="0" max="10" placeholder="0" value={vitals.pain_scale} onChange={e => update("pain_scale", e.target.value)} className="h-8 text-xs" />
          </div>

          {/* BMI */}
          {bmi && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">BMI (calc)</Label>
              <div className="h-8 flex items-center">
                <Badge variant="secondary" className={`text-xs font-mono ${bmiColor}`}>{bmi}</Badge>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

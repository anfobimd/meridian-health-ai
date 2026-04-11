import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Heart, Thermometer, Weight, Activity, Save, Loader2 } from "lucide-react";

interface VitalsPanelProps {
  encounterId: string;
  patientId: string;
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

  const bmi = vitals.weight_lbs && vitals.height_in
    ? ((parseFloat(vitals.weight_lbs) / (parseFloat(vitals.height_in) ** 2)) * 703).toFixed(1)
    : null;

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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Heart className="h-3 w-3" /> Blood Pressure
            </Label>
            <div className="flex items-center gap-1">
              <Input type="number" placeholder="SYS" value={vitals.bp_systolic} onChange={e => update("bp_systolic", e.target.value)} className="h-8 text-xs" />
              <span className="text-muted-foreground">/</span>
              <Input type="number" placeholder="DIA" value={vitals.bp_diastolic} onChange={e => update("bp_diastolic", e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Heart Rate (bpm)</Label>
            <Input type="number" placeholder="72" value={vitals.heart_rate} onChange={e => update("heart_rate", e.target.value)} className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Thermometer className="h-3 w-3" /> Temp (°F)
            </Label>
            <Input type="number" step="0.1" placeholder="98.6" value={vitals.temperature} onChange={e => update("temperature", e.target.value)} className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">O₂ Sat (%)</Label>
            <Input type="number" step="0.1" placeholder="98" value={vitals.o2_sat} onChange={e => update("o2_sat", e.target.value)} className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Weight className="h-3 w-3" /> Weight (lbs)
            </Label>
            <Input type="number" step="0.1" placeholder="150" value={vitals.weight_lbs} onChange={e => update("weight_lbs", e.target.value)} className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Height (in)</Label>
            <Input type="number" step="0.1" placeholder="67" value={vitals.height_in} onChange={e => update("height_in", e.target.value)} className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Pain Scale (0-10)</Label>
            <Input type="number" min="0" max="10" placeholder="0" value={vitals.pain_scale} onChange={e => update("pain_scale", e.target.value)} className="h-8 text-xs" />
          </div>

          {bmi && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">BMI (calc)</Label>
              <div className="h-8 flex items-center">
                <Badge variant="secondary" className="text-xs font-mono">{bmi}</Badge>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

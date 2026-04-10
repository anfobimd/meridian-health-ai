
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Package, ArrowRight, Plus, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TreatmentRecommendationsProps {
  patientId: string;
  patientName: string;
}

interface Recommendation {
  treatment_name: string;
  treatment_id?: string | null;
  category: string;
  reasoning: string;
  estimated_cost: string;
  priority: "high" | "medium" | "low";
  synergy_with?: string | null;
  package_suggestion?: { name: string; package_id?: string | null; savings: string } | null;
}

interface RecResult {
  recommendations: Recommendation[];
  summary: string;
  next_visit_suggestion: string;
}

export function TreatmentRecommendations({ patientId, patientName }: TreatmentRecommendationsProps) {
  const [result, setResult] = useState<RecResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<string[]>([]);
  const [goalInput, setGoalInput] = useState("");

  const addGoal = () => {
    const trimmed = goalInput.trim();
    if (trimmed && !goals.includes(trimmed)) {
      setGoals([...goals, trimmed]);
      setGoalInput("");
    }
  };

  const removeGoal = (g: string) => setGoals(goals.filter((x) => x !== g));

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-treatment-rec", {
        body: { patient_id: patientId, goals },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      toast({ title: "Recommendation failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const priorityColor = (p: string) => {
    if (p === "high") return "destructive";
    if (p === "medium") return "default";
    return "secondary";
  };

  return (
    <div className="space-y-4">
      {/* Goals input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Treatment Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add patient goals (optional) then generate personalized treatment suggestions for {patientName}.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g., Anti-aging, Skin tightening, Weight loss..."
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addGoal())}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={addGoal} disabled={!goalInput.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {goals.map((g) => (
                <Badge key={g} variant="secondary" className="gap-1">
                  {g}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeGoal(g)} />
                </Badge>
              ))}
            </div>
          )}
          <Button onClick={fetchRecommendations} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {loading ? "Analyzing patient profile..." : "Generate Recommendations"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Summary */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium">{result.summary}</p>
              {result.next_visit_suggestion && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" /> <strong>Next visit:</strong> {result.next_visit_suggestion}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recommendation cards */}
          <div className="grid gap-3">
            {result.recommendations.map((rec, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{rec.treatment_name}</h4>
                        <Badge variant={priorityColor(rec.priority)} className="text-[10px]">
                          {rec.priority}
                        </Badge>
                        {rec.category && (
                          <Badge variant="outline" className="text-[10px]">
                            {rec.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{rec.reasoning}</p>
                      {rec.synergy_with && (
                        <p className="text-xs text-primary">
                          ✨ Pairs well with: {rec.synergy_with}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{rec.estimated_cost}</p>
                    </div>
                  </div>
                  {rec.package_suggestion && (
                    <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Package className="h-3 w-3" />
                        {rec.package_suggestion.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        Save {rec.package_suggestion.savings}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

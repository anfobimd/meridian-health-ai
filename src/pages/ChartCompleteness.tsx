import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, ClipboardCheck, AlertTriangle, Sparkles, Loader2, Brain, TrendingDown, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

interface CompletenessItem {
  encounterId: string;
  patientName: string;
  providerName: string;
  providerId: string;
  signedAt: string;
  encounterType: string;
  checks: { label: string; passed: boolean }[];
  score: number;
}

export default function ChartCompleteness() {
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [overdueData, setOverdueData] = useState<any>(null);
  const [loadingOverdue, setLoadingOverdue] = useState(false);

  const { data: completenessData, isLoading } = useQuery({
    queryKey: ["chart-completeness"],
    queryFn: async () => {
      const { data: encounters } = await supabase
        .from("encounters")
        .select(`
          id, encounter_type, signed_at, template_id, provider_id,
          patients(first_name, last_name),
          providers(first_name, last_name, credentials),
          appointments(id, treatment_id, treatments(name, requires_gfe))
        `)
        .not("signed_at", "is", null)
        .order("signed_at", { ascending: false })
        .limit(100);

      if (!encounters) return [];

      const encounterIds = encounters.map((e: any) => e.id);
      const { data: fieldResponses } = await supabase
        .from("encounter_field_responses")
        .select("encounter_id, field_key, value, value_json")
        .in("encounter_id", encounterIds);

      const { data: consents } = await supabase
        .from("e_consents")
        .select("patient_id, consent_type, signed_at");

      const { data: notes } = await supabase
        .from("clinical_notes")
        .select("appointment_id, status, subjective, objective, assessment, plan")
        .in("status", ["signed", "draft"]);

      const results: CompletenessItem[] = encounters.map((enc: any) => {
        const encFields = fieldResponses?.filter((f: any) => f.encounter_id === enc.id) ?? [];
        const hasTemplate = !!enc.template_id;
        const hasFieldData = encFields.length > 0;
        const requiresGfe = enc.appointments?.treatments?.requires_gfe === true;
        const patientConsent = consents?.some((c: any) => c.consent_type === "treatment" && c.signed_at) ?? false;
        const relatedNote = notes?.find((n: any) => n.appointment_id === enc.appointments?.id);
        const hasSoap = relatedNote ? !!(relatedNote.subjective && relatedNote.objective && relatedNote.assessment && relatedNote.plan) : false;

        const checks = [
          { label: "Template Applied", passed: hasTemplate },
          { label: "Chart Fields Documented", passed: hasFieldData },
          { label: "SOAP Note Complete", passed: hasSoap },
          { label: "Treatment Consent", passed: patientConsent || !requiresGfe },
          { label: "GFE on File", passed: !requiresGfe || patientConsent },
          { label: "Encounter Signed", passed: !!enc.signed_at },
        ];

        const passedCount = checks.filter(c => c.passed).length;
        const score = Math.round((passedCount / checks.length) * 100);

        return {
          encounterId: enc.id,
          patientName: `${enc.patients?.first_name || ""} ${enc.patients?.last_name || ""}`,
          providerName: `${enc.providers?.first_name || ""} ${enc.providers?.last_name || ""}`,
          providerId: enc.provider_id,
          signedAt: enc.signed_at,
          encounterType: enc.encounter_type || "General",
          checks,
          score,
        };
      });

      return results.sort((a, b) => a.score - b.score);
    },
  });

  const avgScore = completenessData && completenessData.length > 0
    ? Math.round(completenessData.reduce((s, c) => s + c.score, 0) / completenessData.length)
    : 0;
  const incomplete = completenessData?.filter(c => c.score < 100).length ?? 0;
  const perfect = completenessData?.filter(c => c.score === 100).length ?? 0;

  // AI pattern detection
  const runPatternDetection = async () => {
    if (!completenessData?.length) return;
    setLoadingAi(true);
    try {
      // Aggregate patterns
      const byProvider: Record<string, { name: string; scores: number[]; failedChecks: Record<string, number> }> = {};
      const byDayOfWeek: Record<string, { scores: number[]; failedChecks: Record<string, number> }> = {};
      const byType: Record<string, { scores: number[]; failedChecks: Record<string, number> }> = {};

      completenessData.forEach(item => {
        // By provider
        if (!byProvider[item.providerName]) byProvider[item.providerName] = { name: item.providerName, scores: [], failedChecks: {} };
        byProvider[item.providerName].scores.push(item.score);
        item.checks.filter(c => !c.passed).forEach(c => {
          byProvider[item.providerName].failedChecks[c.label] = (byProvider[item.providerName].failedChecks[c.label] || 0) + 1;
        });

        // By day of week
        const day = format(parseISO(item.signedAt), "EEEE");
        if (!byDayOfWeek[day]) byDayOfWeek[day] = { scores: [], failedChecks: {} };
        byDayOfWeek[day].scores.push(item.score);
        item.checks.filter(c => !c.passed).forEach(c => {
          byDayOfWeek[day].failedChecks[c.label] = (byDayOfWeek[day].failedChecks[c.label] || 0) + 1;
        });

        // By encounter type
        if (!byType[item.encounterType]) byType[item.encounterType] = { scores: [], failedChecks: {} };
        byType[item.encounterType].scores.push(item.score);
        item.checks.filter(c => !c.passed).forEach(c => {
          byType[item.encounterType].failedChecks[c.label] = (byType[item.encounterType].failedChecks[c.label] || 0) + 1;
        });
      });

      const { data, error } = await supabase.functions.invoke("ai-chart-review", {
        body: {
          mode: "pattern_detect",
          data: {
            total_charts: completenessData.length,
            avg_score: avgScore,
            by_provider: Object.entries(byProvider).map(([name, d]) => ({
              name,
              avg_score: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
              top_failures: Object.entries(d.failedChecks).sort(([,a], [,b]) => b - a).slice(0, 3),
              chart_count: d.scores.length,
            })),
            by_day: Object.entries(byDayOfWeek).map(([day, d]) => ({
              day,
              avg_score: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
              top_failures: Object.entries(d.failedChecks).sort(([,a], [,b]) => b - a).slice(0, 3),
            })),
            by_type: Object.entries(byType).map(([type, d]) => ({
              type,
              avg_score: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
              top_failures: Object.entries(d.failedChecks).sort(([,a], [,b]) => b - a).slice(0, 3),
            })),
          },
        },
      });
      if (error) throw error;
      setAiAnalysis(data);
    } catch { toast.error("Failed to run pattern detection"); }
    setLoadingAi(false);
  };

  // Overdue charting prediction
  const runOverduePrediction = async () => {
    setLoadingOverdue(true);
    try {
      // Fetch unsigned encounters
      const { data: unsigned } = await supabase
        .from("encounters")
        .select("id, started_at, provider_id, encounter_type, providers(first_name, last_name)")
        .is("signed_at", null)
        .not("started_at", "is", null)
        .order("started_at", { ascending: true })
        .limit(50);

      const now = new Date();
      const predictions = (unsigned || []).map((enc: any) => {
        const started = new Date(enc.started_at);
        const hoursAgo = Math.round((now.getTime() - started.getTime()) / 3600000);
        const isOverdue = hoursAgo > 24;
        const riskLevel = hoursAgo > 72 ? "critical" : hoursAgo > 48 ? "high" : hoursAgo > 24 ? "moderate" : "low";
        return {
          encounter_id: enc.id,
          provider: `${enc.providers?.first_name || ""} ${enc.providers?.last_name || ""}`,
          encounter_type: enc.encounter_type || "General",
          hours_since_start: hoursAgo,
          risk_level: riskLevel,
          is_overdue: isOverdue,
        };
      }).filter(p => p.hours_since_start > 12).sort((a, b) => b.hours_since_start - a.hours_since_start);

      // Group by provider for digest
      const byProvider: Record<string, number> = {};
      predictions.forEach(p => { byProvider[p.provider] = (byProvider[p.provider] || 0) + 1; });

      setOverdueData({
        predictions,
        by_provider: Object.entries(byProvider).map(([name, count]) => ({ name, overdue_count: count })).sort((a, b) => b.overdue_count - a.overdue_count),
        total_overdue: predictions.filter(p => p.is_overdue).length,
      });
    } catch { toast.error("Failed to check overdue charts"); }
    setLoadingOverdue(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Chart Completeness Review</h1>
          <p className="text-muted-foreground">AI-powered administrative completeness scoring and pattern detection</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runOverduePrediction} disabled={loadingOverdue}>
            {loadingOverdue ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5 mr-1.5" />}
            Overdue Prediction
          </Button>
          <Button variant="outline" size="sm" onClick={runPatternDetection} disabled={loadingAi || !completenessData?.length}>
            {loadingAi ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            AI Pattern Detect
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground font-medium uppercase">Avg Completeness</p><p className="text-2xl font-bold mt-1">{avgScore}%</p><Progress value={avgScore} className="h-1.5 mt-2" /></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground font-medium uppercase">Reviewed</p><p className="text-2xl font-bold mt-1">{completenessData?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground font-medium uppercase">Incomplete</p><p className="text-2xl font-bold mt-1 text-warning">{incomplete}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground font-medium uppercase">Fully Complete</p><p className="text-2xl font-bold mt-1 text-success">{perfect}</p></CardContent></Card>
      </div>

      {/* Overdue Prediction Panel */}
      {overdueData && overdueData.total_overdue > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-warning" />
              Overdue Chart Prediction — {overdueData.total_overdue} unsigned charts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">By Provider</p>
                {overdueData.by_provider.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 text-sm">
                    <span>{p.name}</span>
                    <Badge variant={p.overdue_count > 3 ? "destructive" : "secondary"} className="text-[11px]">{p.overdue_count} overdue</Badge>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Most Critical</p>
                {overdueData.predictions.slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 text-xs">
                    <span>{p.provider} • {p.encounter_type}</span>
                    <Badge variant={p.risk_level === "critical" ? "destructive" : p.risk_level === "high" ? "secondary" : "outline"} className="text-[11px]">
                      {p.hours_since_start}h ago
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Pattern Analysis Panel */}
      {aiAnalysis && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              AI Documentation Pattern Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiAnalysis.narrative && (
              <p className="text-sm text-muted-foreground">{aiAnalysis.narrative}</p>
            )}
            {aiAnalysis.patterns && aiAnalysis.patterns.length > 0 && (
              <div className="space-y-2">
                {aiAnalysis.patterns.map((p: any, i: number) => (
                  <div key={i} className={`rounded-md border p-3 text-xs ${p.severity === "critical" ? "border-destructive/30 bg-destructive/5" : p.severity === "warning" ? "border-warning/30 bg-warning/5" : "border-primary/30 bg-primary/5"}`}>
                    <p className="font-medium">{p.label || p.flag}</p>
                    <p className="text-muted-foreground mt-0.5">{p.detail}</p>
                  </div>
                ))}
              </div>
            )}
            {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                {aiAnalysis.recommendations.map((r: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">• {typeof r === "string" ? r : r.detail || r.label}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Encounter Completeness
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-48 m-4" />
          ) : completenessData && completenessData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Checklist</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completenessData.map((item) => (
                  <TableRow key={item.encounterId}>
                    <TableCell className="font-medium">{item.patientName}</TableCell>
                    <TableCell className="text-sm">{item.providerName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px]">{item.encounterType}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(parseISO(item.signedAt), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={item.score === 100 ? "secondary" : "outline"}
                        className={`text-[11px] ${item.score < 67 ? "border-destructive text-destructive" : item.score < 100 ? "border-warning text-warning" : "text-success"}`}>
                        {item.score}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {item.checks.map((check) => (
                          <span key={check.label} title={check.label} className="inline-flex items-center">
                            {check.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No signed encounters to review</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

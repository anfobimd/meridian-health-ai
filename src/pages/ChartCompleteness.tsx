import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, ClipboardCheck, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";

interface CompletenessItem {
  encounterId: string;
  patientName: string;
  providerName: string;
  signedAt: string;
  encounterType: string;
  checks: { label: string; passed: boolean }[];
  score: number;
}

export default function ChartCompleteness() {
  const { data: completenessData, isLoading } = useQuery({
    queryKey: ["chart-completeness"],
    queryFn: async () => {
      // Fetch signed encounters with related data
      const { data: encounters } = await supabase
        .from("encounters")
        .select(`
          id, encounter_type, signed_at, template_id,
          patients(first_name, last_name),
          providers(first_name, last_name, credentials),
          appointments(id, treatment_id, treatments(name, requires_gfe))
        `)
        .not("signed_at", "is", null)
        .order("signed_at", { ascending: false })
        .limit(100);

      if (!encounters) return [];

      // Get encounter IDs
      const encounterIds = encounters.map((e: any) => e.id);

      // Fetch field responses for these encounters
      const { data: fieldResponses } = await supabase
        .from("encounter_field_responses")
        .select("encounter_id, field_key, value, value_json")
        .in("encounter_id", encounterIds);

      // Fetch consents for patients
      const patientIds = [...new Set(encounters.map((e: any) => e.patients?.first_name ? e.id : null).filter(Boolean))];
      const { data: consents } = await supabase
        .from("e_consents")
        .select("patient_id, consent_type, signed_at");

      // Fetch clinical notes
      const { data: notes } = await supabase
        .from("clinical_notes")
        .select("appointment_id, status, subjective, objective, assessment, plan")
        .in("status", ["signed", "draft"]);

      // Build completeness for each encounter
      const results: CompletenessItem[] = encounters.map((enc: any) => {
        const encFields = fieldResponses?.filter((f: any) => f.encounter_id === enc.id) ?? [];
        const hasTemplate = !!enc.template_id;
        const hasFieldData = encFields.length > 0;
        const requiresGfe = enc.appointments?.treatments?.requires_gfe === true;

        // Check consent exists for patient
        const patientConsent = consents?.some((c: any) =>
          c.consent_type === "treatment" && c.signed_at
        ) ?? false;

        // Check SOAP note completeness
        const relatedNote = notes?.find((n: any) => n.appointment_id === enc.appointments?.id);
        const hasSoap = relatedNote
          ? !!(relatedNote.subjective && relatedNote.objective && relatedNote.assessment && relatedNote.plan)
          : false;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chart Completeness Review</h1>
        <p className="text-muted-foreground">Administrative checklist for consent, GFE, documentation on signed encounters</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Avg Completeness</p>
            <p className="text-2xl font-bold mt-1">{avgScore}%</p>
            <Progress value={avgScore} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Reviewed</p>
            <p className="text-2xl font-bold mt-1">{completenessData?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Incomplete</p>
            <p className="text-2xl font-bold mt-1 text-warning">{incomplete}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase">Fully Complete</p>
            <p className="text-2xl font-bold mt-1 text-success">{perfect}</p>
          </CardContent>
        </Card>
      </div>

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
                    <TableCell><Badge variant="outline" className="text-[10px]">{item.encounterType}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(parseISO(item.signedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.score === 100 ? "secondary" : "outline"}
                        className={`text-[10px] ${item.score < 67 ? "border-destructive text-destructive" : item.score < 100 ? "border-warning text-warning" : "text-success"}`}
                      >
                        {item.score}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {item.checks.map((check) => (
                          <span key={check.label} title={check.label} className="inline-flex items-center">
                            {check.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
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

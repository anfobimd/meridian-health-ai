import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, Loader2, ClipboardList, Stethoscope, X } from "lucide-react";

interface PatientBrief {
  visit_summary: string;
  alerts: string[];
  last_treatment: string;
  todays_prep: string;
}

export function PatientBriefCard({ patientId, patientName, onClose }: {
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<PatientBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-patient-brief", {
        body: { patient_id: patientId },
      });
      if (fnErr) throw fnErr;
      setBrief(data.brief);
    } catch (e: any) {
      setError(e.message || "Failed to generate brief");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Patient Brief — {patientName}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        {!brief && !loading && !error && (
          <Button size="sm" onClick={loadBrief} className="w-full">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Brief
          </Button>
        )}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Generating brief…</span>
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />{error}
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={loadBrief}>Retry</Button>
          </div>
        )}
        {brief && (
          <div className="space-y-2.5 text-sm">
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Visit Summary</p>
              <p>{brief.visit_summary}</p>
            </div>
            {brief.alerts.length > 0 && (
              <div>
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Alerts</p>
                <div className="flex flex-wrap gap-1">
                  {brief.alerts.map((a, i) => (
                    <Badge key={i} variant="destructive" className="text-[10px]">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <Stethoscope className="h-3 w-3" />Last Treatment
              </p>
              <p>{brief.last_treatment}</p>
            </div>
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <ClipboardList className="h-3 w-3" />Today's Prep
              </p>
              <p>{brief.todays_prep}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

const statusIcons: Record<string, any> = {
  approved: CheckCircle,
  corrected: AlertTriangle,
};

const statusColors: Record<string, string> = {
  approved: "bg-primary/10 text-primary",
  corrected: "bg-destructive/10 text-destructive",
  pending_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  pending_ai: "bg-muted text-muted-foreground",
};

export default function MdFeedbackInbox() {
  const { user } = useAuth();
  const [myProviderId, setMyProviderId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setMyProviderId(data?.id ?? null));
  }, [user]);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["md-feedback", myProviderId],
    enabled: !!myProviderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_review_records")
        .select("*, patients(first_name, last_name), encounters(encounter_type, chief_complaint)")
        .eq("provider_id", myProviderId!)
        .in("status", ["approved", "corrected", "pending_review"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const correctedCount = reviews?.filter((r: any) => r.status === "corrected").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">MD Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Review comments and corrections from physician oversight
        </p>
      </div>

      {correctedCount > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {correctedCount} chart{correctedCount !== 1 ? "s" : ""} with corrections requiring your attention
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !myProviderId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <MessageSquare className="mx-auto h-10 w-10 mb-2" />
            <p>No provider record linked to your account.</p>
          </CardContent>
        </Card>
      ) : !reviews?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <MessageSquare className="mx-auto h-10 w-10 mb-2" />
            <p>No feedback yet. Your reviewed charts will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r: any) => {
            const StatusIcon = statusIcons[r.status] || MessageSquare;
            return (
              <Card key={r.id} className={r.status === "corrected" ? "border-destructive/20" : ""}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className="h-4 w-4 flex-shrink-0" />
                      <p className="font-medium text-sm">
                        {r.patients?.first_name} {r.patients?.last_name}
                      </p>
                      <Badge className={statusColors[r.status] || ""}>{r.status.replace("_", " ")}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.updated_at), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  {r.encounters?.encounter_type && (
                    <p className="text-xs text-muted-foreground">
                      Type: {r.encounters.encounter_type}
                      {r.encounters.chief_complaint && ` — ${r.encounters.chief_complaint}`}
                    </p>
                  )}
                  {r.md_comment && (
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-medium mb-1 text-muted-foreground">MD Comment</p>
                      <p className="text-sm">{r.md_comment}</p>
                    </div>
                  )}
                  {r.md_action && (
                    <p className="text-xs">
                      <span className="font-medium">Action:</span> {r.md_action}
                    </p>
                  )}
                  {r.correction_details && (
                    <div className="rounded-md bg-destructive/5 p-3">
                      <p className="text-xs font-medium mb-1 text-destructive">Corrections</p>
                      <pre className="text-xs whitespace-pre-wrap">
                        {typeof r.correction_details === "string"
                          ? r.correction_details
                          : JSON.stringify(r.correction_details, null, 2)}
                      </pre>
                    </div>
                  )}
                  {r.ai_risk_tier && (
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>Risk: {r.ai_risk_tier}</span>
                      {r.review_duration_seconds && (
                        <span>• Review time: {r.review_duration_seconds}s</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

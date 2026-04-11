import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, MessageSquare, AlertTriangle, CheckCircle, FileText,
  Send, ChevronDown, ChevronRight, Check,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  approved: "bg-primary/10 text-primary",
  corrected: "bg-destructive/10 text-destructive",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  pending_ai: "bg-muted text-muted-foreground",
  acknowledged: "bg-muted text-muted-foreground",
};

export default function MdFeedbackInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [myProviderId, setMyProviderId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "action_required" | "approved">("all");

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
        .select("*, patients(first_name, last_name), encounters(encounter_type, chief_complaint, id), reviewer:reviewer_id(first_name, last_name, credentials)")
        .eq("provider_id", myProviderId!)
        .in("status", ["approved", "corrected", "pending_review"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const correctedCount = reviews?.filter((r: any) => r.status === "corrected").length ?? 0;

  const filteredReviews = reviews?.filter((r: any) => {
    if (filter === "action_required") return r.status === "corrected";
    if (filter === "approved") return r.status === "approved";
    return true;
  }) || [];

  // Acknowledge mutation
  const acknowledge = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from("chart_review_records")
        .update({ status: "approved", md_action: "acknowledged_by_provider" })
        .eq("id", reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["md-feedback"] });
      toast.success("Correction acknowledged");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Reply via messages
  const sendReply = useMutation({
    mutationFn: async ({ reviewId, reviewerId, text }: { reviewId: string; reviewerId: string; text: string }) => {
      // Find reviewer's user_id from providers
      const { data: reviewer } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", reviewerId)
        .single();
      if (!reviewer?.user_id) throw new Error("Reviewer not found");

      const { error } = await supabase.from("messages").insert({
        sender_id: user!.id,
        recipient_id: reviewer.user_id,
        subject: `Re: Chart Review ${reviewId.slice(0, 8)}`,
        body: text,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success("Reply sent to reviewer");
      setReplyText(prev => ({ ...prev, [vars.reviewId]: "" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">MD Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Review comments and corrections from physician oversight
        </p>
      </div>

      {/* Action required banner */}
      {correctedCount > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                {correctedCount} chart{correctedCount !== 1 ? "s" : ""} with corrections requiring your attention
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setFilter("action_required")}>
              Show Action Required
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {([
          { key: "all", label: "All", count: reviews?.length },
          { key: "action_required", label: "Action Required", count: correctedCount },
          { key: "approved", label: "Approved", count: reviews?.filter((r: any) => r.status === "approved").length },
        ] as const).map(({ key, label, count }) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => setFilter(key)}
          >
            {label} {(count ?? 0) > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">{count}</Badge>}
          </Button>
        ))}
      </div>

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
      ) : !filteredReviews.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CheckCircle className="mx-auto h-10 w-10 mb-2" />
            <p className="text-sm">
              {filter === "action_required" ? "No corrections requiring action." : "No feedback yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((r: any) => {
            const isExpanded = expandedId === r.id;
            const isCorrected = r.status === "corrected";
            const reviewerName = r.reviewer
              ? `${r.reviewer.first_name} ${r.reviewer.last_name}, ${r.reviewer.credentials || "MD"}`
              : "Reviewing Physician";

            return (
              <Card key={r.id} className={cn(isCorrected && "border-destructive/30")}>
                <CardContent className="py-0">
                  {/* Header row — always visible */}
                  <button
                    className="w-full py-4 flex items-start justify-between text-left"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isCorrected ? (
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm flex items-center gap-2">
                          {r.patients?.first_name} {r.patients?.last_name}
                          <Badge className={cn("text-[10px]", statusColors[r.status] || "")}>
                            {r.status === "corrected" ? "Correction Required" : r.status.replace("_", " ")}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.encounters?.encounter_type && `${r.encounters.encounter_type} — `}
                          {r.encounters?.chief_complaint || "No chief complaint"}
                          <span className="mx-1.5">·</span>
                          Reviewed by {reviewerName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(r.updated_at), "MMM d, h:mm a")}
                      </span>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="pb-4 space-y-3">
                      <Separator />

                      {/* MD Comment */}
                      {r.md_comment && (
                        <div className="rounded-md bg-muted p-3">
                          <p className="text-xs font-medium mb-1 text-muted-foreground">MD Comment</p>
                          <p className="text-sm whitespace-pre-wrap">{r.md_comment}</p>
                        </div>
                      )}

                      {/* Correction details */}
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

                      {/* Risk & review metadata */}
                      {(r.ai_risk_tier || r.review_duration_seconds) && (
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {r.ai_risk_tier && <span>Risk: <Badge variant="outline" className="text-[10px]">{r.ai_risk_tier}</Badge></span>}
                          {r.review_duration_seconds && <span>Review time: {r.review_duration_seconds}s</span>}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Open chart link */}
                        {r.encounters?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => navigate(`/encounters/${r.encounters.id}`)}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" /> View Chart
                          </Button>
                        )}

                        {/* Acknowledge correction */}
                        {isCorrected && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs"
                            onClick={() => acknowledge.mutate(r.id)}
                            disabled={acknowledge.isPending}
                          >
                            {acknowledge.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                            Acknowledge Correction
                          </Button>
                        )}
                      </div>

                      {/* Reply thread */}
                      <div className="space-y-2">
                        <Separator />
                        <p className="text-xs font-medium text-muted-foreground">Reply to Reviewer</p>
                        <div className="flex gap-2">
                          <Textarea
                            value={replyText[r.id] || ""}
                            onChange={(e) => setReplyText(prev => ({ ...prev, [r.id]: e.target.value }))}
                            placeholder="Type a reply to the reviewing physician…"
                            rows={2}
                            className="flex-1 text-sm"
                          />
                          <Button
                            size="sm"
                            disabled={!(replyText[r.id]?.trim()) || sendReply.isPending || !r.reviewer_id}
                            onClick={() => sendReply.mutate({
                              reviewId: r.id,
                              reviewerId: r.reviewer_id,
                              text: replyText[r.id],
                            })}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
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

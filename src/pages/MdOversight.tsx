import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Shield, AlertTriangle, CheckCircle, Clock, Brain, FileText, XCircle, Loader2 } from "lucide-react";

type RiskTier = "low" | "medium" | "high" | "critical";

const tierColors: Record<RiskTier, string> = {
  low: "border-l-green-500",
  medium: "border-l-yellow-500",
  high: "border-l-orange-500",
  critical: "border-l-red-500",
};

const tierBadge: Record<RiskTier, string> = {
  low: "bg-green-500/10 text-green-700 border-green-500/30",
  medium: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  high: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  critical: "bg-red-500/10 text-red-700 border-red-500/30",
};

export default function MdOversight() {
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("pending_review");
  const [mdComment, setMdComment] = useState("");
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // Fetch review queue
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["chart-reviews", filterTier, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from("chart_review_records")
        .select("*, encounters(*, patients(*), providers(*)), ai_chart_analysis(*)")
        .order("ai_priority_score", { ascending: false });

      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterTier !== "all") query = query.eq("ai_risk_tier", filterTier);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch provider intelligence for selected review
  const { data: providerIntel } = useQuery({
    queryKey: ["provider-intel", selectedReview?.provider_id],
    queryFn: async () => {
      if (!selectedReview?.provider_id) return null;
      const { data } = await supabase
        .from("ai_provider_intelligence")
        .select("*")
        .eq("provider_id", selectedReview.provider_id)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedReview?.provider_id,
  });

  // Timer effect
  useEffect(() => {
    if (reviewStartTime) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - reviewStartTime) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reviewStartTime]);

  // AI comment draft mutation
  const draftCommentMutation = useMutation({
    mutationFn: async () => {
      const analysis = selectedReview?.ai_chart_analysis?.[0];
      if (!analysis) throw new Error("No analysis available");
      const { data, error } = await supabase.functions.invoke("ai-chart-review", {
        body: { encounter_id: selectedReview.encounter_id, action: "draft_comment" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.comment) setMdComment(data.comment);
      else toast.info("Comment drafted based on AI analysis");
    },
  });

  // Submit review action
  const submitReviewMutation = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      const duration = reviewStartTime ? Math.floor((Date.now() - reviewStartTime) / 1000) : 0;
      const threshold = selectedReview?.rubber_stamp_threshold_seconds || 30;

      // Anti-rubber-stamp check
      if (duration < 15) {
        throw new Error("Minimum review time is 15 seconds. Please review the chart thoroughly.");
      }

      const { error } = await supabase
        .from("chart_review_records")
        .update({
          status: action === "approve" ? "approved" : action === "correct" ? "corrected" : "rejected",
          md_action: action,
          md_comment: mdComment || null,
          review_completed_at: new Date().toISOString(),
          review_duration_seconds: duration,
          correction_details: action === "correct" ? { comment: mdComment } : null,
        })
        .eq("id", selectedReview.id);

      if (error) throw error;

      // Flag rubber-stamp if under threshold
      if (duration < threshold && action === "approve") {
        console.warn(`Rubber-stamp detected: ${duration}s < ${threshold}s threshold`);
      }
    },
    onSuccess: (_, { action }) => {
      toast.success(`Chart ${action === "approve" ? "approved" : action === "correct" ? "correction noted" : "rejected"}`);
      setSelectedReview(null);
      setMdComment("");
      setReviewStartTime(null);
      setElapsed(0);
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ["chart-reviews"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const openReview = (review: any) => {
    setSelectedReview(review);
    setReviewStartTime(Date.now());
    setMdComment("");
    setElapsed(0);
    // Mark as in_review
    supabase.from("chart_review_records").update({
      status: "in_review",
      review_started_at: new Date().toISOString(),
    }).eq("id", review.id).then(() => {
      queryClient.invalidateQueries({ queryKey: ["chart-reviews"] });
    });
  };

  const handleAction = (action: string) => {
    const analysis = selectedReview?.ai_chart_analysis?.[0];
    const riskTier = analysis?.risk_tier || selectedReview?.ai_risk_tier;
    // Secondary confirmation for critical charts without comment
    if (riskTier === "critical" && action === "approve" && !mdComment.trim()) {
      setConfirmAction(action);
      return;
    }
    submitReviewMutation.mutate({ action });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const analysis = selectedReview?.ai_chart_analysis?.[0];
  const encounter = selectedReview?.encounters;
  const patient = encounter?.patients;
  const provider = encounter?.providers;
  const threshold = selectedReview?.rubber_stamp_threshold_seconds || 30;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> MD Chart Review
          </h1>
          <p className="text-sm text-muted-foreground mt-1">AI-prioritized chart review queue</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterTier} onValueChange={setFilterTier}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Risk Tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending_ai">Pending AI</SelectItem>
              <SelectItem value="pending_review">Ready for Review</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="corrected">Corrected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Queue Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Risk</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>AI Flags</TableHead>
                <TableHead className="w-[80px]">Doc Score</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : reviews?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    No charts in queue
                  </TableCell>
                </TableRow>
              ) : (
                reviews?.map((review: any) => {
                  const a = review.ai_chart_analysis?.[0];
                  const enc = review.encounters;
                  const pat = enc?.patients;
                  const prov = enc?.providers;
                  const tier = (a?.risk_tier || review.ai_risk_tier || "low") as RiskTier;
                  const flags = (a?.ai_flags as any[]) || [];

                  return (
                    <TableRow
                      key={review.id}
                      className={`cursor-pointer border-l-4 ${tierColors[tier]} hover:bg-muted/50`}
                      onClick={() => openReview(review)}
                    >
                      <TableCell>
                        <Badge variant="outline" className={tierBadge[tier]}>
                          {tier.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {pat?.first_name} {pat?.last_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {prov?.first_name} {prov?.last_name}{prov?.credentials ? `, ${prov.credentials}` : ""}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(a?.brief as any)?.procedure_summary?.substring(0, 50) || enc?.chief_complaint || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {flags.slice(0, 2).map((f: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵"} {f.flag}
                            </Badge>
                          ))}
                          {flags.length > 2 && (
                            <Badge variant="outline" className="text-[10px]">+{flags.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div
                            className="h-8 w-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                            style={{
                              borderColor: (a?.documentation_score || 0) >= 80 ? "hsl(var(--primary))" : (a?.documentation_score || 0) >= 50 ? "orange" : "red",
                            }}
                          >
                            {a?.documentation_score ?? "—"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={review.status === "pending_ai" ? "secondary" : review.status === "approved" ? "default" : "outline"}>
                          {review.status === "pending_ai" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {review.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review Panel Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={(o) => { if (!o) { setSelectedReview(null); setReviewStartTime(null); setElapsed(0); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Chart Review — {patient?.first_name} {patient?.last_name}
              </span>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 text-sm font-mono ${elapsed >= threshold ? "text-green-600" : "text-orange-500"}`}>
                  <Clock className="h-4 w-4" />
                  {formatTime(elapsed)} / {formatTime(threshold)}
                </div>
                {elapsed < threshold && (
                  <span className="text-[10px] text-orange-500">Below threshold</span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {analysis ? (
            <div className="space-y-4">
              {/* AI Brief Card */}
              <Card className="bg-sidebar text-sidebar-foreground">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" /> AI Pre-Review Brief
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-sidebar-foreground/50">Procedure</p>
                    <p className="font-medium text-sidebar-foreground">{(analysis.brief as any)?.procedure_summary || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sidebar-foreground/50">Documentation</p>
                    <p className="font-medium text-sidebar-foreground">{(analysis.brief as any)?.documentation_status || "—"} ({analysis.documentation_score}%)</p>
                  </div>
                  <div>
                    <p className="text-sidebar-foreground/50">Risk Score</p>
                    <Badge variant="outline" className={tierBadge[(analysis.risk_tier || "low") as RiskTier]}>
                      {analysis.risk_score}/100 — {(analysis.risk_tier || "low").toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sidebar-foreground/50">Patient Context</p>
                    <p className="font-medium text-sidebar-foreground">{(analysis.brief as any)?.patient_context || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sidebar-foreground/50">Recommended Action</p>
                    <p className="font-medium text-sidebar-foreground">{analysis.recommended_action || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sidebar-foreground/50">Est. Review Time</p>
                    <p className="font-medium text-sidebar-foreground">{formatTime(analysis.estimated_review_seconds || 30)}</p>
                  </div>
                </CardContent>
              </Card>

              {/* AI Flags */}
              {((analysis.ai_flags as any[]) || []).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" /> AI Flags ({(analysis.ai_flags as any[]).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(analysis.ai_flags as any[]).map((flag: any, i: number) => (
                      <div key={i} className={`p-2 rounded border text-sm ${flag.severity === "critical" ? "border-red-300 bg-red-50" : flag.severity === "warning" ? "border-yellow-300 bg-yellow-50" : "border-blue-300 bg-blue-50"}`}>
                        <span className="font-medium">{flag.flag}</span>
                        <span className="text-muted-foreground ml-2">— {flag.detail}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Provider Intelligence Strip */}
              {providerIntel && (
                <Card className="border-dashed">
                  <CardContent className="py-3 flex items-center gap-6 text-xs">
                    <span className="font-medium">Provider Intelligence:</span>
                    <span>Charts: {providerIntel.total_charts}</span>
                    <span>Correction Rate: {((providerIntel.correction_rate as number) * 100).toFixed(1)}%</span>
                    <span>Avg Doc Score: {providerIntel.avg_documentation_score}</span>
                    {providerIntel.coaching_status !== "none" && (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        Coaching: {providerIntel.coaching_status}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* SOAP Note Tabs */}
              <Tabs defaultValue="soap">
                <TabsList>
                  <TabsTrigger value="soap"><FileText className="h-3 w-3 mr-1" /> SOAP Note</TabsTrigger>
                  <TabsTrigger value="encounter">Encounter Details</TabsTrigger>
                </TabsList>
                <TabsContent value="soap" className="space-y-3">
                  {["subjective", "objective", "assessment", "plan"].map((section) => (
                    <div key={section}>
                      <p className="text-xs font-bold uppercase text-muted-foreground mb-1">{section}</p>
                      <p className="text-sm bg-muted/50 p-3 rounded">
                        {(analysis.brief as any)?.[section] || encounter?.chief_complaint || "Not documented"}
                      </p>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="encounter" className="text-sm space-y-2">
                  <p><strong>Type:</strong> {encounter?.encounter_type || "General"}</p>
                  <p><strong>Chief Complaint:</strong> {encounter?.chief_complaint || "—"}</p>
                  <p><strong>Started:</strong> {encounter?.started_at ? new Date(encounter.started_at).toLocaleString() : "—"}</p>
                  <p><strong>Status:</strong> {encounter?.status}</p>
                </TabsContent>
              </Tabs>

              {/* MD Action Area */}
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">MD Comment</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => draftCommentMutation.mutate()}
                      disabled={draftCommentMutation.isPending}
                    >
                      {draftCommentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
                      Draft AI Comment
                    </Button>
                  </div>
                  <Textarea
                    value={mdComment}
                    onChange={(e) => setMdComment(e.target.value)}
                    placeholder="Add review comments, corrections, or notes..."
                    rows={3}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleAction("reject")}
                      disabled={submitReviewMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction("correct")}
                      disabled={submitReviewMutation.isPending || !mdComment.trim()}
                    >
                      <AlertTriangle className="h-4 w-4 mr-1" /> Correction
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction("approve")}
                      disabled={submitReviewMutation.isPending}
                    >
                      {submitReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve & Sign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              AI analysis pending...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for critical charts */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Confirm Critical Chart Approval
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">This is a <strong>CRITICAL</strong> risk chart and you haven't added a comment. Are you sure you want to approve without comment?</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { submitReviewMutation.mutate({ action: confirmAction! }); }}>
              Approve Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Shield, AlertTriangle, CheckCircle, Clock, Brain, FileText, XCircle,
  Loader2, FlaskConical, User, Edit3, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";

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

const approvalBadge: Record<string, { label: string; class: string }> = {
  pending: { label: "Pending", class: "bg-amber-100 text-amber-800 border-amber-200" },
  approved: { label: "Approved", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  modified: { label: "Modified", class: "bg-blue-100 text-blue-800 border-blue-200" },
  rejected: { label: "Rejected", class: "bg-red-100 text-red-800 border-red-200" },
};

export default function MdOversight() {
  const [activeTab, setActiveTab] = useState("charts");
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [selectedHormone, setSelectedHormone] = useState<any>(null);
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("pending_review");
  const [hormoneFilter, setHormoneFilter] = useState("pending");
  const [mdComment, setMdComment] = useState("");
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [editedTreatment, setEditedTreatment] = useState("");
  const [editedMonitoring, setEditedMonitoring] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ treatment: true, monitoring: true });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // ── Chart Reviews Query ──
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
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

  // ── Hormone Approvals Query ──
  const { data: hormoneVisits, isLoading: hormonesLoading } = useQuery({
    queryKey: ["approval-visits", hormoneFilter],
    queryFn: async () => {
      let query = supabase
        .from("hormone_visits")
        .select("*, patients(first_name, last_name, date_of_birth, gender), providers(first_name, last_name, credentials)")
        .not("ai_recommendation", "is", null)
        .order("created_at", { ascending: false });
      if (hormoneFilter !== "all") query = query.eq("approval_status", hormoneFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Provider Intelligence ──
  const { data: providerIntel } = useQuery({
    queryKey: ["provider-intel", selectedReview?.provider_id],
    queryFn: async () => {
      if (!selectedReview?.provider_id) return null;
      const { data } = await supabase.from("ai_provider_intelligence").select("*").eq("provider_id", selectedReview.provider_id).maybeSingle();
      return data;
    },
    enabled: !!selectedReview?.provider_id,
  });

  // ── Counts for tab badges ──
  const pendingCharts = reviews?.filter((r: any) => ["pending_review", "pending_ai"].includes(r.status)).length ?? 0;
  const pendingHormones = hormoneVisits?.filter((v: any) => v.approval_status === "pending").length ?? 0;

  // ── Timer ──
  useEffect(() => {
    if (reviewStartTime) {
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - reviewStartTime) / 1000)), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reviewStartTime]);

  // ── AI Draft Comment ──
  const draftCommentMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-chart-review", {
        body: { encounter_id: selectedReview.encounter_id, action: "draft_comment" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => { if (data?.comment) setMdComment(data.comment); },
  });

  // ── Submit Chart Review ──
  const submitReviewMutation = useMutation({
    mutationFn: async ({ action }: { action: string }) => {
      const duration = reviewStartTime ? Math.floor((Date.now() - reviewStartTime) / 1000) : 0;
      if (duration < 15) throw new Error("Minimum review time is 15 seconds.");
      const { error } = await supabase.from("chart_review_records").update({
        status: action === "approve" ? "approved" : action === "correct" ? "corrected" : "rejected",
        md_action: action, md_comment: mdComment || null,
        review_completed_at: new Date().toISOString(), review_duration_seconds: duration,
        correction_details: action === "correct" ? { comment: mdComment } : null,
      }).eq("id", selectedReview.id);
      if (error) throw error;
    },
    onSuccess: (_, { action }) => {
      toast.success(`Chart ${action === "approve" ? "approved" : action === "correct" ? "correction noted" : "rejected"}`);
      setSelectedReview(null); setMdComment(""); setReviewStartTime(null); setElapsed(0); setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ["chart-reviews"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Batch Approve Low-Risk Charts ──
  const batchApproveMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(batchSelected);
      for (const id of ids) {
        const review = reviews?.find((r: any) => r.id === id);
        if (!review) continue;
        const { error } = await supabase.from("chart_review_records").update({
          status: "approved", md_action: "approve", md_comment: "Batch approved — low risk",
          review_completed_at: new Date().toISOString(), review_duration_seconds: 30,
        }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${batchSelected.size} charts batch approved`);
      setBatchSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["chart-reviews"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Hormone Approval ──
  const hormoneApprovalMutation = useMutation({
    mutationFn: async ({ status, visitId }: { status: string; visitId: string }) => {
      const { error } = await supabase.from("hormone_visits").update({
        approval_status: status, approval_notes: approvalNotes || null,
        approved_at: new Date().toISOString(),
        edited_treatment: editedTreatment || null, edited_monitoring: editedMonitoring || null,
      }).eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-visits"] });
      toast.success(`Recommendation ${status === "approved" ? "approved" : status === "modified" ? "modified & approved" : "rejected"}`);
      setSelectedHormone(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openChartReview = (review: any) => {
    setSelectedReview(review); setReviewStartTime(Date.now()); setMdComment(""); setElapsed(0);
    supabase.from("chart_review_records").update({ status: "in_review", review_started_at: new Date().toISOString() })
      .eq("id", review.id).then(() => queryClient.invalidateQueries({ queryKey: ["chart-reviews"] }));
  };

  const openHormoneReview = (visit: any) => {
    const sections = visit.ai_sections as any;
    setSelectedHormone(visit);
    setEditedTreatment(visit.edited_treatment || sections?.treatment_recommendation || "");
    setEditedMonitoring(visit.edited_monitoring || sections?.monitoring_plan || "");
    setApprovalNotes(visit.approval_notes || "");
  };

  const handleChartAction = (action: string) => {
    const analysis = selectedReview?.ai_chart_analysis?.[0];
    const riskTier = analysis?.risk_tier || selectedReview?.ai_risk_tier;
    if (riskTier === "critical" && action === "approve" && !mdComment.trim()) {
      setConfirmAction(action); return;
    }
    submitReviewMutation.mutate({ action });
  };

  const handleHormoneApprove = (visitId: string) => {
    const visit = hormoneVisits?.find((v: any) => v.id === visitId);
    const aiSections = visit?.ai_sections as any;
    const isModified = editedTreatment !== (aiSections?.treatment_recommendation || "") || editedMonitoring !== (aiSections?.monitoring_plan || "");
    hormoneApprovalMutation.mutate({ status: isModified ? "modified" : "approved", visitId });
  };

  const toggleBatch = (id: string) => {
    setBatchSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const lowRiskReviews = reviews?.filter((r: any) => (r.ai_risk_tier === "low" || r.ai_risk_tier === "medium") && r.status === "pending_review") || [];

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const analysis = selectedReview?.ai_chart_analysis?.[0];
  const encounter = selectedReview?.encounters;
  const patient = encounter?.patients;
  const threshold = selectedReview?.rubber_stamp_threshold_seconds || 30;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Unified Oversight Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Chart reviews + hormone approvals in one queue</p>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Chart Reviews Pending</p>
            <p className="text-2xl font-bold mt-1">{pendingCharts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Hormone Approvals Pending</p>
            <p className="text-2xl font-bold mt-1">{pendingHormones}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Queue</p>
            <p className="text-2xl font-bold mt-1">{pendingCharts + pendingHormones}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Batch-Eligible (Low/Med)</p>
            <p className="text-2xl font-bold mt-1">{lowRiskReviews.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Unified Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="charts" className="gap-1">
            <FileText className="h-3 w-3" /> Chart Reviews
            {pendingCharts > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1.5 py-0">{pendingCharts}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="hormones" className="gap-1">
            <FlaskConical className="h-3 w-3" /> Hormone Approvals
            {pendingHormones > 0 && <Badge variant="destructive" className="ml-1 text-[9px] px-1.5 py-0">{pendingHormones}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ═══════ CHART REVIEWS TAB ═══════ */}
        <TabsContent value="charts" className="space-y-4">
          <div className="flex items-center justify-between">
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
            {batchSelected.size > 0 && (
              <Button size="sm" onClick={() => batchApproveMutation.mutate()} disabled={batchApproveMutation.isPending}>
                {batchApproveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Batch Approve ({batchSelected.size})
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[80px]">Risk</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Procedure</TableHead>
                    <TableHead>AI Reason</TableHead>
                    <TableHead className="w-[80px]">Doc Score</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : reviews?.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">No charts in queue</TableCell></TableRow>
                  ) : (
                    reviews?.map((review: any) => {
                      const a = review.ai_chart_analysis?.[0];
                      const enc = review.encounters;
                      const pat = enc?.patients;
                      const prov = enc?.providers;
                      const tier = (a?.risk_tier || review.ai_risk_tier || "low") as RiskTier;
                      const flags = (a?.ai_flags as any[]) || [];
                      const canBatch = (tier === "low" || tier === "medium") && review.status === "pending_review";

                      return (
                        <TableRow key={review.id} className={`cursor-pointer border-l-4 ${tierColors[tier]} hover:bg-muted/50`}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {canBatch && (
                              <Checkbox checked={batchSelected.has(review.id)} onCheckedChange={() => toggleBatch(review.id)} />
                            )}
                          </TableCell>
                          <TableCell onClick={() => openChartReview(review)}>
                            <Badge variant="outline" className={tierBadge[tier]}>{tier.toUpperCase()}</Badge>
                          </TableCell>
                          <TableCell className="font-medium" onClick={() => openChartReview(review)}>
                            {pat?.first_name} {pat?.last_name}
                          </TableCell>
                          <TableCell className="text-sm" onClick={() => openChartReview(review)}>
                            {prov?.first_name} {prov?.last_name}{prov?.credentials ? `, ${prov.credentials}` : ""}
                          </TableCell>
                          <TableCell className="text-sm" onClick={() => openChartReview(review)}>
                            {(a?.brief as any)?.procedure_summary?.substring(0, 50) || enc?.chief_complaint || "—"}
                          </TableCell>
                          <TableCell onClick={() => openChartReview(review)}>
                            <div className="flex gap-1 flex-wrap">
                              {flags.slice(0, 2).map((f: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px]">
                                  {f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵"} {f.flag}
                                </Badge>
                              ))}
                              {flags.length > 2 && <Badge variant="outline" className="text-[10px]">+{flags.length - 2}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell onClick={() => openChartReview(review)}>
                            <div className="h-8 w-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                              style={{ borderColor: (a?.documentation_score || 0) >= 80 ? "hsl(var(--primary))" : (a?.documentation_score || 0) >= 50 ? "orange" : "red" }}>
                              {a?.documentation_score ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell onClick={() => openChartReview(review)}>
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
        </TabsContent>

        {/* ═══════ HORMONE APPROVALS TAB ═══════ */}
        <TabsContent value="hormones" className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={hormoneFilter} onValueChange={setHormoneFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="modified">Modified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hormonesLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !hormoneVisits?.length ? (
            <Card><CardContent className="py-12 text-center"><CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" /><p className="text-muted-foreground">No recommendations to review</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {hormoneVisits.map((visit: any) => {
                const badge = approvalBadge[visit.approval_status] || approvalBadge.pending;
                const pat = visit.patients;
                const sections = visit.ai_sections as any;
                return (
                  <Card key={visit.id} className="cursor-pointer transition-all hover:shadow-md" onClick={() => openHormoneReview(visit)}>
                    <CardContent className="py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{pat?.last_name}, {pat?.first_name}</p>
                            <p className="text-xs text-muted-foreground">{pat?.gender?.charAt(0).toUpperCase()}{pat?.gender?.slice(1)} · {pat?.date_of_birth ? format(parseISO(pat.date_of_birth), "MM/dd/yyyy") : ""}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 flex-1">
                          {(visit.intake_focus || []).slice(0, 3).map((f: string) => (
                            <Badge key={f} variant="outline" className="text-[10px] px-1.5 py-0">
                              {f.replace("hormone_", "").replace("peptide_", "").replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{format(parseISO(visit.visit_date), "MMM d, yyyy")}</span>
                          <Badge className={`${badge.class} border text-[10px]`}>{badge.label}</Badge>
                        </div>
                      </div>
                      {sections?.summary && <p className="text-xs text-muted-foreground mt-2 line-clamp-2 pl-12">{sections.summary}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════ CHART REVIEW DIALOG ═══════ */}
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
                  <Clock className="h-4 w-4" />{formatTime(elapsed)} / {formatTime(threshold)}
                </div>
                {elapsed < threshold && <span className="text-[10px] text-orange-500">Below threshold</span>}
              </div>
            </DialogTitle>
          </DialogHeader>

          {analysis ? (
            <div className="space-y-4">
              <Card className="bg-sidebar text-sidebar-foreground">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> AI Pre-Review Brief</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div><p className="text-sidebar-foreground/50">Procedure</p><p className="font-medium text-sidebar-foreground">{(analysis.brief as any)?.procedure_summary || "—"}</p></div>
                  <div><p className="text-sidebar-foreground/50">Documentation</p><p className="font-medium text-sidebar-foreground">{(analysis.brief as any)?.documentation_status || "—"} ({analysis.documentation_score}%)</p></div>
                  <div><p className="text-sidebar-foreground/50">Risk Score</p><Badge variant="outline" className={tierBadge[(analysis.risk_tier || "low") as RiskTier]}>{analysis.risk_score}/100 — {(analysis.risk_tier || "low").toUpperCase()}</Badge></div>
                  <div><p className="text-sidebar-foreground/50">Patient Context</p><p className="font-medium text-sidebar-foreground">{(analysis.brief as any)?.patient_context || "—"}</p></div>
                  <div><p className="text-sidebar-foreground/50">Recommended Action</p><p className="font-medium text-sidebar-foreground">{analysis.recommended_action || "—"}</p></div>
                  <div><p className="text-sidebar-foreground/50">Est. Review Time</p><p className="font-medium text-sidebar-foreground">{formatTime(analysis.estimated_review_seconds || 30)}</p></div>
                </CardContent>
              </Card>

              {((analysis.ai_flags as any[]) || []).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> AI Flags ({(analysis.ai_flags as any[]).length})</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(analysis.ai_flags as any[]).map((flag: any, i: number) => (
                      <div key={i} className={`p-2 rounded border text-sm ${flag.severity === "critical" ? "border-red-300 bg-red-50" : flag.severity === "warning" ? "border-yellow-300 bg-yellow-50" : "border-blue-300 bg-blue-50"}`}>
                        <span className="font-medium">{flag.flag}</span><span className="text-muted-foreground ml-2">— {flag.detail}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {providerIntel && (
                <Card className="border-dashed">
                  <CardContent className="py-3 flex items-center gap-6 text-xs">
                    <span className="font-medium">Provider Intelligence:</span>
                    <span>Charts: {providerIntel.total_charts}</span>
                    <span>Correction Rate: {((providerIntel.correction_rate as number) * 100).toFixed(1)}%</span>
                    <span>Avg Doc Score: {providerIntel.avg_documentation_score}</span>
                    {providerIntel.coaching_status !== "none" && (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">Coaching: {providerIntel.coaching_status}</Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              <Tabs defaultValue="soap">
                <TabsList>
                  <TabsTrigger value="soap"><FileText className="h-3 w-3 mr-1" /> SOAP Note</TabsTrigger>
                  <TabsTrigger value="encounter">Encounter Details</TabsTrigger>
                </TabsList>
                <TabsContent value="soap" className="space-y-3">
                  {["subjective", "objective", "assessment", "plan"].map((section) => (
                    <div key={section}>
                      <p className="text-xs font-bold uppercase text-muted-foreground mb-1">{section}</p>
                      <p className="text-sm bg-muted/50 p-3 rounded">{(analysis.brief as any)?.[section] || encounter?.chief_complaint || "Not documented"}</p>
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

              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">MD Comment</span>
                    <Button variant="outline" size="sm" onClick={() => draftCommentMutation.mutate()} disabled={draftCommentMutation.isPending}>
                      {draftCommentMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
                      Draft AI Comment
                    </Button>
                  </div>
                  <Textarea value={mdComment} onChange={(e) => setMdComment(e.target.value)} placeholder="Add review comments..." rows={3} />
                  <div className="flex gap-2 justify-end">
                    <Button variant="destructive" size="sm" onClick={() => handleChartAction("reject")} disabled={submitReviewMutation.isPending}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleChartAction("correct")} disabled={submitReviewMutation.isPending || !mdComment.trim()}>
                      <AlertTriangle className="h-4 w-4 mr-1" /> Correction
                    </Button>
                    <Button size="sm" onClick={() => handleChartAction("approve")} disabled={submitReviewMutation.isPending}>
                      {submitReviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve & Sign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />AI analysis pending...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Critical chart confirmation */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Confirm Critical Chart Approval</DialogTitle></DialogHeader>
          <p className="text-sm">This is a <strong>CRITICAL</strong> risk chart without comment. Approve anyway?</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => submitReviewMutation.mutate({ action: confirmAction! })}>Approve Anyway</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ HORMONE REVIEW DIALOG ═══════ */}
      <Dialog open={!!selectedHormone} onOpenChange={(o) => { if (!o) setSelectedHormone(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedHormone && (selectedHormone.ai_sections as any) && (() => {
            const aiSections = selectedHormone.ai_sections as any;
            const hPatient = selectedHormone.patients as any;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <Sparkles className="h-5 w-5 text-primary" /> Review AI Recommendation
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {hPatient?.last_name}, {hPatient?.first_name} · {format(parseISO(selectedHormone.visit_date), "MMMM d, yyyy")}
                  </p>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  {(selectedHormone.peptide_contraindications as string[] || []).length > 0 && (
                    <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <p className="text-xs font-bold text-destructive uppercase tracking-wider">Contraindication Flags</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(selectedHormone.peptide_contraindications as string[]).map((c: string) => (
                          <Badge key={c} variant="destructive" className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-primary/5 rounded-lg">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Clinical Summary</p>
                    <p className="text-sm">{aiSections.summary}</p>
                  </div>

                  {/* Editable Treatment */}
                  <div className="border rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedSections(p => ({ ...p, treatment: !p.treatment }))} className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Treatment Plan</span><Badge variant="outline" className="text-[9px] ml-1">editable</Badge></div>
                      {expandedSections.treatment ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.treatment && (
                      <div className="p-3">
                        <Textarea value={editedTreatment} onChange={(e) => setEditedTreatment(e.target.value)} className="min-h-[180px] text-sm font-mono" />
                        {editedTreatment !== (aiSections.treatment_recommendation || "") && (
                          <div className="flex items-center gap-2 mt-2">
                            <Edit3 className="h-3 w-3 text-amber-600" /><span className="text-[10px] text-amber-600 font-medium">Modified from AI original</span>
                            <Button variant="ghost" size="sm" className="text-[10px] h-6 ml-auto" onClick={() => setEditedTreatment(aiSections.treatment_recommendation || "")}>Reset to AI version</Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Editable Monitoring */}
                  <div className="border rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedSections(p => ({ ...p, monitoring: !p.monitoring }))} className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Monitoring Plan</span><Badge variant="outline" className="text-[9px] ml-1">editable</Badge></div>
                      {expandedSections.monitoring ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.monitoring && (
                      <div className="p-3">
                        <Textarea value={editedMonitoring} onChange={(e) => setEditedMonitoring(e.target.value)} className="min-h-[120px] text-sm font-mono" />
                        {editedMonitoring !== (aiSections.monitoring_plan || "") && (
                          <div className="flex items-center gap-2 mt-2">
                            <Edit3 className="h-3 w-3 text-amber-600" /><span className="text-[10px] text-amber-600 font-medium">Modified from AI original</span>
                            <Button variant="ghost" size="sm" className="text-[10px] h-6 ml-auto" onClick={() => setEditedMonitoring(aiSections.monitoring_plan || "")}>Reset to AI version</Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Physician Notes</p>
                    <Textarea value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder="Optional notes..." className="mt-1.5 min-h-[80px] text-sm" />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <Button variant="destructive" size="sm" onClick={() => hormoneApprovalMutation.mutate({ status: "rejected", visitId: selectedHormone.id })} disabled={hormoneApprovalMutation.isPending}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => handleHormoneApprove(selectedHormone.id)} disabled={hormoneApprovalMutation.isPending}>
                      {hormoneApprovalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

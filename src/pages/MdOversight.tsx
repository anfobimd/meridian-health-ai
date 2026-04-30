import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Shield, AlertTriangle, CheckCircle, Clock, Brain, FileText, XCircle,
  Loader2, FlaskConical, User, Edit3, ChevronDown, ChevronUp, Sparkles, Building2,
  Target, Activity, Pill, Beaker,
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
  low: "bg-success/10 text-success border-success/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  high: "bg-warning/10 text-warning border-warning/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
};

const approvalBadge: Record<string, { label: string; class: string }> = {
  pending: { label: "Pending", class: "bg-warning/10 text-warning border-warning/30" },
  approved: { label: "Approved", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  modified: { label: "Modified", class: "bg-info/10 text-info border-info/30" },
  rejected: { label: "Rejected", class: "bg-destructive/10 text-destructive border-destructive/30" },
};

const LAB_REFS: Record<string, { label: string; unit: string; low: number; high: number }> = {
  lab_tt: { label: "Total Testosterone", unit: "ng/dL", low: 300, high: 1000 },
  lab_ft: { label: "Free Testosterone", unit: "pg/mL", low: 8.7, high: 25.1 },
  lab_e2: { label: "Estradiol", unit: "pg/mL", low: 10, high: 40 },
  lab_p4: { label: "Progesterone", unit: "ng/mL", low: 0.2, high: 1.4 },
  lab_lh: { label: "LH", unit: "mIU/mL", low: 1.7, high: 8.6 },
  lab_fsh: { label: "FSH", unit: "mIU/mL", low: 1.5, high: 12.4 },
  lab_shbg: { label: "SHBG", unit: "nmol/L", low: 16.5, high: 55.9 },
  lab_prl: { label: "Prolactin", unit: "ng/mL", low: 4, high: 15 },
  lab_psa: { label: "PSA", unit: "ng/mL", low: 0, high: 4 },
  lab_dhea: { label: "DHEA-S", unit: "mcg/dL", low: 80, high: 560 },
  lab_tsh: { label: "TSH", unit: "mIU/L", low: 0.4, high: 4.0 },
  lab_ft3: { label: "Free T3", unit: "pg/mL", low: 2.0, high: 4.4 },
  lab_ft4: { label: "Free T4", unit: "ng/dL", low: 0.8, high: 1.7 },
  lab_hgb: { label: "Hemoglobin", unit: "g/dL", low: 13.5, high: 17.5 },
  lab_hct: { label: "Hematocrit", unit: "%", low: 38.3, high: 48.6 },
  lab_rbc: { label: "RBC", unit: "M/uL", low: 4.5, high: 5.5 },
  lab_glc: { label: "Glucose", unit: "mg/dL", low: 70, high: 100 },
  lab_a1c: { label: "HbA1c", unit: "%", low: 4, high: 5.6 },
  lab_alt: { label: "ALT", unit: "U/L", low: 7, high: 56 },
  lab_ast: { label: "AST", unit: "U/L", low: 10, high: 40 },
  lab_crt: { label: "Creatinine", unit: "mg/dL", low: 0.7, high: 1.3 },
  lab_igf1: { label: "IGF-1", unit: "ng/mL", low: 100, high: 300 },
  lab_fins: { label: "Fasting Insulin", unit: "µIU/mL", low: 2, high: 20 },
  lab_crp: { label: "hs-CRP", unit: "mg/L", low: 0, high: 3 },
  lab_b12: { label: "Vitamin B12", unit: "pg/mL", low: 200, high: 900 },
  lab_folate: { label: "Folate", unit: "ng/mL", low: 3, high: 20 },
  lab_vitd: { label: "Vitamin D", unit: "ng/mL", low: 30, high: 100 },
  lab_igfbp3: { label: "IGF-BP3", unit: "mg/L", low: 3.4, high: 7.8 },
  lab_calcitonin: { label: "Calcitonin", unit: "pg/mL", low: 0, high: 10 },
};

export default function MdOversight() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("charts");
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [selectedHormone, setSelectedHormone] = useState<any>(null);
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("pending_review");
  const [filterClinic, setFilterClinic] = useState("all");
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
  const [labsOpen, setLabsOpen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // ── MD's assigned clinics ──
  const { data: assignedClinics = [] } = useQuery({
    queryKey: ["md-assigned-clinics", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: provider } = await supabase.from("providers").select("id").eq("user_id", user.id).single();
      if (!provider) return [];
      const { data } = await supabase
        .from("md_coverage_assignments")
        .select("clinic_id, clinics(id, name, contract_id, contracts(name))")
        .eq("md_provider_id", provider.id);
      return data?.map((d: any) => ({ id: d.clinic_id, name: d.clinics?.name, contractName: d.clinics?.contracts?.name })) || [];
    },
    enabled: !!user?.id,
  });

  const assignedClinicIds = assignedClinics.map((c: any) => c.id);

  // ── Chart Reviews Query ──
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["chart-reviews", filterTier, filterStatus, filterClinic],
    queryFn: async () => {
      let query = supabase
        .from("chart_review_records")
        .select("*, encounters(*, patients(*), providers(*)), ai_chart_analysis(*)")
        .order("ai_priority_score", { ascending: false });
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterTier !== "all") query = query.eq("ai_risk_tier", filterTier);
      const { data, error } = await query;
      if (error) throw error;
      let results = data || [];
      if (filterClinic !== "all") {
        results = results.filter((r: any) => r.encounters?.clinic_id === filterClinic);
      } else if (assignedClinicIds.length > 0) {
        results = results.filter((r: any) => !r.encounters?.clinic_id || assignedClinicIds.includes(r.encounters.clinic_id));
      }
      return results;
    },
  });

  // ── Hormone Approvals Query (removed NOT NULL filter on ai_recommendation) ──
  const { data: hormoneVisits, isLoading: hormonesLoading } = useQuery({
    queryKey: ["approval-visits", hormoneFilter],
    queryFn: async () => {
      let query = supabase
        .from("hormone_visits")
        .select("*, patients(first_name, last_name, date_of_birth, gender), providers(first_name, last_name, credentials)")
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

  // ── Generate AI Rec for hormone visit ──
  const generateAiRecMutation = useMutation({
    mutationFn: async (visit: any) => {
      const pat = visit.patients;
      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: {
          patient: {
            first_name: pat?.first_name,
            last_name: pat?.last_name,
            gender: pat?.gender,
            focus: visit.intake_focus || [],
            symptoms: visit.intake_symptoms || [],
            goals: visit.intake_goals || [],
            contraindications: visit.peptide_contraindications || [],
          },
          visit,
          priorVisits: [],
        },
      });
      if (error) throw error;
      // Save to hormone_visits
      await supabase.from("hormone_visits").update({
        ai_recommendation: data.summary || "AI recommendation generated",
        ai_sections: {
          summary: data.summary || "",
          treatment_recommendation: data.treatment_recommendation || "",
          monitoring_plan: data.monitoring_plan || "",
          risk_flags: data.risk_flags || "",
        },
      }).eq("id", visit.id);
      return data;
    },
    onSuccess: () => {
      toast.success("AI recommendation generated");
      queryClient.invalidateQueries({ queryKey: ["approval-visits"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to generate AI rec"),
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
    setLabsOpen(false);
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

  // Helper: get non-null lab values from a hormone visit
  const getLabValues = (visit: any) => {
    const labs: { key: string; label: string; value: number; unit: string; flag: "low" | "high" | "normal" }[] = [];
    for (const [key, ref] of Object.entries(LAB_REFS)) {
      const val = visit?.[key];
      if (val != null) {
        const flag = val < ref.low ? "low" : val > ref.high ? "high" : "normal";
        labs.push({ key, label: ref.label, value: val, unit: ref.unit, flag });
      }
    }
    return labs;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Oversight Hub
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Chart reviews + hormone approvals</p>
        </div>
        {assignedClinics.length > 0 && (
          <Select value={filterClinic} onValueChange={setFilterClinic}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <Building2 className="h-3 w-3 mr-1" />
              <SelectValue placeholder="All My Clinics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All My Clinics</SelectItem>
              {assignedClinics.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.contractName ? ` (${c.contractName})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 flex items-start gap-2">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase text-muted-foreground font-bold truncate">Charts Pending</p>
              <p className="text-2xl font-bold mt-0.5">{pendingCharts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-start gap-2">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase text-muted-foreground font-bold truncate">Hormones</p>
              <p className="text-2xl font-bold mt-0.5">{pendingHormones}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-start gap-2">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase text-muted-foreground font-bold truncate">Total Queue</p>
              <p className="text-2xl font-bold mt-0.5">{pendingCharts + pendingHormones}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-start gap-2">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase text-muted-foreground font-bold truncate">Batch Ready</p>
              <p className="text-2xl font-bold mt-0.5">{lowRiskReviews.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unified Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="charts" className="gap-1 text-xs sm:text-sm">
            <FileText className="h-3 w-3" /> <span className="hidden xs:inline">Chart</span> Reviews
            {pendingCharts > 0 && <Badge variant="destructive" className="ml-1 text-[11px] px-1.5 py-0">{pendingCharts}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="hormones" className="gap-1 text-xs sm:text-sm">
            <FlaskConical className="h-3 w-3" /> <span className="hidden xs:inline">Hormone</span> Approvals
            {pendingHormones > 0 && <Badge variant="destructive" className="ml-1 text-[11px] px-1.5 py-0">{pendingHormones}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ═══════ CHART REVIEWS TAB ═══════ */}
        <TabsContent value="charts" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div className="flex gap-2 flex-wrap">
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="w-[110px] sm:w-[130px] h-8 text-xs"><SelectValue placeholder="Risk Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[120px] sm:w-[150px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
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
                Batch ({batchSelected.size})
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[700px]">
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
                                <Badge key={i} variant="outline" className="text-[11px]">
                                  {f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵"} {f.flag}
                                </Badge>
                              ))}
                              {flags.length > 2 && <Badge variant="outline" className="text-[11px]">+{flags.length - 2}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell onClick={() => openChartReview(review)}>
                            <div className="h-8 w-8 rounded-full border-2 flex items-center justify-center text-[11px] font-bold"
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
                const hasAiRec = !!visit.ai_recommendation;
                return (
                  <Card key={visit.id} className="cursor-pointer transition-all hover:shadow-md" onClick={() => hasAiRec ? openHormoneReview(visit) : undefined}>
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
                            <Badge key={f} variant="outline" className="text-[11px] px-1.5 py-0">
                              {f.replace("hormone_", "").replace("peptide_", "").replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{format(parseISO(visit.visit_date), "MMM d, yyyy")}</span>
                          {hasAiRec ? (
                            <Badge className={`${badge.class} border text-[11px]`}>{badge.label}</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={(e) => { e.stopPropagation(); generateAiRecMutation.mutate(visit); }}
                              disabled={generateAiRecMutation.isPending}
                            >
                              {generateAiRecMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                              Generate AI Rec
                            </Button>
                          )}
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <span className="flex items-center gap-2 text-sm sm:text-base truncate">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                Review — {patient?.first_name} {patient?.last_name}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`flex items-center gap-1 text-xs sm:text-sm font-mono ${elapsed >= threshold ? "text-success" : "text-warning"}`}>
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />{formatTime(elapsed)}/{formatTime(threshold)}
                </div>
                {elapsed < threshold && <span className="text-[11px] sm:text-[11px] text-warning">Below min</span>}
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
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> AI Flags ({(analysis.ai_flags as any[]).length})</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(analysis.ai_flags as any[]).map((flag: any, i: number) => (
                      <div key={i} className={`p-2 rounded border text-sm ${flag.severity === "critical" ? "border-destructive/30 bg-destructive/10" : flag.severity === "warning" ? "border-warning/30 bg-warning/10" : "border-info/30 bg-info/10"}`}>
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
                      <Badge variant="outline" className="text-warning border-warning/30">Coaching: {providerIntel.coaching_status}</Badge>
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
          <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Confirm Critical Chart Approval</DialogTitle></DialogHeader>
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
          {selectedHormone && (() => {
            const aiSections = selectedHormone.ai_sections as any;
            const hPatient = selectedHormone.patients as any;
            const labValues = getLabValues(selectedHormone);
            const abnormalLabs = labValues.filter(l => l.flag !== "normal");

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
                  {/* ── Intake Context Section ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(selectedHormone.intake_focus as string[] || []).length > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Target className="h-3.5 w-3.5 text-primary" />
                          <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Focus Areas</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedHormone.intake_focus as string[]).map((f: string) => (
                            <Badge key={f} variant="secondary" className="text-[11px]">
                              {f.replace("hormone_", "").replace("peptide_", "").replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(selectedHormone.intake_symptoms as string[] || []).length > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Activity className="h-3.5 w-3.5 text-primary" />
                          <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Reported Symptoms</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedHormone.intake_symptoms as string[]).map((s: string) => (
                            <Badge key={s} variant="outline" className="text-[11px]">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(selectedHormone.intake_goals as string[] || []).length > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-primary" />
                          <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Patient Goals</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedHormone.intake_goals as string[]).map((g: string) => (
                            <Badge key={g} variant="outline" className="text-[11px]">{g}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(selectedHormone.peptide_categories as string[] || []).length > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Pill className="h-3.5 w-3.5 text-primary" />
                          <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Peptide Categories</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(selectedHormone.peptide_categories as string[]).map((c: string) => (
                            <Badge key={c} variant="secondary" className="text-[11px]">{c.replace("peptide_", "").replace(/_/g, " ")}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Contraindications ── */}
                  {(selectedHormone.peptide_contraindications as string[] || []).length > 0 && (
                    <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <p className="text-xs font-bold text-destructive uppercase tracking-wider">Contraindication Flags</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(selectedHormone.peptide_contraindications as string[]).map((c: string) => (
                          <Badge key={c} variant="destructive" className="text-[11px]">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Lab Values Panel ── */}
                  {labValues.length > 0 && (
                    <Collapsible open={labsOpen} onOpenChange={setLabsOpen}>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                          <div className="flex items-center gap-2">
                            <Beaker className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Lab Values ({labValues.length})</span>
                            {abnormalLabs.length > 0 && (
                              <Badge variant="destructive" className="text-[11px] px-1.5 py-0">{abnormalLabs.length} abnormal</Badge>
                            )}
                          </div>
                          {labsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                          {labValues.map((lab) => (
                            <div key={lab.key} className={`p-2 rounded border text-xs ${lab.flag === "low" ? "border-info/30 bg-info/10" : lab.flag === "high" ? "border-destructive/30 bg-destructive/10" : "border-border bg-background"}`}>
                              <p className="text-muted-foreground text-[11px]">{lab.label}</p>
                              <p className="font-bold">
                                {lab.value} <span className="font-normal text-muted-foreground">{lab.unit}</span>
                                {lab.flag !== "normal" && (
                                  <span className={`ml-1 font-bold ${lab.flag === "low" ? "text-info" : "text-destructive"}`}>
                                    {lab.flag === "low" ? "↓" : "↑"}
                                  </span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* ── AI Recommendation Sections ── */}
                  {aiSections ? (
                    <>
                      <div className="p-3 bg-primary/5 rounded-lg">
                        <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-1">Clinical Summary</p>
                        <p className="text-sm">{aiSections.summary}</p>
                      </div>

                      {aiSections.risk_flags && (
                        <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                          <p className="text-[11px] font-bold text-warning uppercase tracking-wider mb-1">Risk Flags</p>
                          <p className="text-sm text-warning">{aiSections.risk_flags}</p>
                        </div>
                      )}

                      {/* Editable Treatment */}
                      <div className="border rounded-lg overflow-hidden">
                        <button onClick={() => setExpandedSections(p => ({ ...p, treatment: !p.treatment }))} className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Treatment Plan</span><Badge variant="outline" className="text-[11px] ml-1">editable</Badge></div>
                          {expandedSections.treatment ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {expandedSections.treatment && (
                          <div className="p-3">
                            <Textarea value={editedTreatment} onChange={(e) => setEditedTreatment(e.target.value)} className="min-h-[180px] text-sm font-mono" />
                            {editedTreatment !== (aiSections.treatment_recommendation || "") && (
                              <div className="flex items-center gap-2 mt-2">
                                <Edit3 className="h-3 w-3 text-warning" /><span className="text-[11px] text-warning font-medium">Modified from AI original</span>
                                <Button variant="ghost" size="sm" className="text-[11px] h-6 ml-auto" onClick={() => setEditedTreatment(aiSections.treatment_recommendation || "")}>Reset to AI version</Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Editable Monitoring */}
                      <div className="border rounded-lg overflow-hidden">
                        <button onClick={() => setExpandedSections(p => ({ ...p, monitoring: !p.monitoring }))} className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Monitoring Plan</span><Badge variant="outline" className="text-[11px] ml-1">editable</Badge></div>
                          {expandedSections.monitoring ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {expandedSections.monitoring && (
                          <div className="p-3">
                            <Textarea value={editedMonitoring} onChange={(e) => setEditedMonitoring(e.target.value)} className="min-h-[120px] text-sm font-mono" />
                            {editedMonitoring !== (aiSections.monitoring_plan || "") && (
                              <div className="flex items-center gap-2 mt-2">
                                <Edit3 className="h-3 w-3 text-warning" /><span className="text-[11px] text-warning font-medium">Modified from AI original</span>
                                <Button variant="ghost" size="sm" className="text-[11px] h-6 ml-auto" onClick={() => setEditedMonitoring(aiSections.monitoring_plan || "")}>Reset to AI version</Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center border rounded-lg border-dashed">
                      <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground mb-3">AI recommendation not yet generated</p>
                      <Button
                        size="sm"
                        onClick={() => generateAiRecMutation.mutate(selectedHormone)}
                        disabled={generateAiRecMutation.isPending}
                      >
                        {generateAiRecMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                        Generate AI Recommendation
                      </Button>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Physician Notes</p>
                    <Textarea value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder="Optional notes..." className="mt-1.5 min-h-[80px] text-sm" />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <Button variant="destructive" size="sm" onClick={() => hormoneApprovalMutation.mutate({ status: "rejected", visitId: selectedHormone.id })} disabled={hormoneApprovalMutation.isPending}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => handleHormoneApprove(selectedHormone.id)} disabled={hormoneApprovalMutation.isPending || !aiSections}>
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

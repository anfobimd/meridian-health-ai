import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle, XCircle, Edit3, Clock, Sparkles, AlertTriangle, User,
  FlaskConical, FileText, Shield, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";

const approvalBadge: Record<string, { label: string; class: string; icon: any }> = {
  pending: { label: "Pending Review", class: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  approved: { label: "Approved", class: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle },
  modified: { label: "Modified & Approved", class: "bg-blue-100 text-blue-800 border-blue-200", icon: Edit3 },
  rejected: { label: "Rejected", class: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
};

export default function PhysicianApproval() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("visit");
  const queryClient = useQueryClient();

  const [reviewVisitId, setReviewVisitId] = useState<string | null>(highlightId);
  const [editedTreatment, setEditedTreatment] = useState("");
  const [editedMonitoring, setEditedMonitoring] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    treatment: true, monitoring: true, risks: true,
  });

  // Fetch visits pending approval
  const { data: visits, isLoading } = useQuery({
    queryKey: ["approval-visits", filterStatus],
    queryFn: async () => {
      let query = supabase
        .from("hormone_visits")
        .select("*, patients(first_name, last_name, date_of_birth, gender), providers(first_name, last_name, credentials)")
        .not("ai_recommendation", "is", null)
        .order("created_at", { ascending: false });

      if (filterStatus !== "all") {
        query = query.eq("approval_status", filterStatus);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allProviders } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("is_active", true);
      return data ?? [];
    },
  });

  const currentVisit = visits?.find(v => v.id === reviewVisitId);
  const aiSections = currentVisit?.ai_sections as any;

  // Initialize editable fields when visit changes
  const openReview = (visit: any) => {
    const sections = visit.ai_sections as any;
    setReviewVisitId(visit.id);
    setEditedTreatment(visit.edited_treatment || sections?.treatment_recommendation || "");
    setEditedMonitoring(visit.edited_monitoring || sections?.monitoring_plan || "");
    setApprovalNotes(visit.approval_notes || "");
  };

  const approvalMutation = useMutation({
    mutationFn: async ({ status, visitId }: { status: string; visitId: string }) => {
      const { error } = await supabase.from("hormone_visits").update({
        approval_status: status,
        approval_notes: approvalNotes || null,
        approved_at: new Date().toISOString(),
        edited_treatment: editedTreatment || null,
        edited_monitoring: editedMonitoring || null,
      }).eq("id", visitId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-visits"] });
      toast.success(`Recommendation ${status === "approved" ? "approved" : status === "modified" ? "modified & approved" : "rejected"}`);
      setReviewVisitId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleApprove = (visitId: string) => {
    const isModified = currentVisit && (
      editedTreatment !== (aiSections?.treatment_recommendation || "") ||
      editedMonitoring !== (aiSections?.monitoring_plan || "")
    );
    approvalMutation.mutate({ status: isModified ? "modified" : "approved", visitId });
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const pendingCount = visits?.filter(v => v.approval_status === "pending").length ?? 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-serif">Physician Approval Queue</h1>
          <p className="text-muted-foreground text-sm">
            Review AI-generated hormone & peptide recommendations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-xs px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="modified">Modified</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Visit Queue */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-12">Loading...</p>
      ) : !visits?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No {filterStatus === "all" ? "" : filterStatus} recommendations to review</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visits.map((visit: any) => {
            const badge = approvalBadge[visit.approval_status] || approvalBadge.pending;
            const BadgeIcon = badge.icon;
            const patient = visit.patients;
            const provider = visit.providers;
            const sections = visit.ai_sections as any;

            return (
              <Card
                key={visit.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  visit.id === highlightId ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => openReview(visit)}
              >
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Patient Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {patient?.last_name}, {patient?.first_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {patient?.gender?.charAt(0).toUpperCase()}{patient?.gender?.slice(1)} · {patient?.date_of_birth ? format(parseISO(patient.date_of_birth), "MM/dd/yyyy") : ""}
                        </p>
                      </div>
                    </div>

                    {/* Focus Tags */}
                    <div className="flex flex-wrap gap-1 flex-1">
                      {(visit.intake_focus || []).slice(0, 3).map((f: string) => (
                        <Badge key={f} variant="outline" className="text-[10px] px-1.5 py-0">
                          {f.replace("hormone_", "").replace("peptide_", "").replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>

                    {/* Date & Status */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(visit.visit_date), "MMM d, yyyy")}
                      </span>
                      <Badge className={`${badge.class} border text-[10px] gap-1`}>
                        <BadgeIcon className="h-3 w-3" />
                        {badge.label}
                      </Badge>
                    </div>
                  </div>

                  {/* AI Summary Preview */}
                  {sections?.summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 pl-12">
                      {sections.summary}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewVisitId} onOpenChange={(open) => { if (!open) setReviewVisitId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {currentVisit && aiSections && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Review AI Recommendation
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {(currentVisit as any).patients?.last_name}, {(currentVisit as any).patients?.first_name} ·{" "}
                  {format(parseISO(currentVisit.visit_date), "MMMM d, yyyy")}
                </p>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Contraindication Alerts */}
                {(currentVisit.peptide_contraindications as string[] || []).length > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <p className="text-xs font-bold text-destructive uppercase tracking-wider">Contraindication Flags</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(currentVisit.peptide_contraindications as string[]).map((c: string) => (
                        <Badge key={c} variant="destructive" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clinical Summary - read-only */}
                <div className="p-3 bg-primary/5 rounded-lg">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Clinical Summary</p>
                  <p className="text-sm">{aiSections.summary}</p>
                </div>

                {/* Editable Treatment Plan */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection("treatment")}
                    className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Treatment Plan</span>
                      <Badge variant="outline" className="text-[9px] ml-1">editable</Badge>
                    </div>
                    {expandedSections.treatment ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedSections.treatment && (
                    <div className="p-3">
                      <Textarea
                        value={editedTreatment}
                        onChange={(e) => setEditedTreatment(e.target.value)}
                        className="min-h-[180px] text-sm font-mono"
                        placeholder="Treatment recommendations..."
                      />
                      {editedTreatment !== (aiSections.treatment_recommendation || "") && (
                        <div className="flex items-center gap-2 mt-2">
                          <Edit3 className="h-3 w-3 text-amber-600" />
                          <span className="text-[10px] text-amber-600 font-medium">Modified from AI original</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-6 ml-auto"
                            onClick={() => setEditedTreatment(aiSections.treatment_recommendation || "")}
                          >
                            Reset to AI version
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Editable Monitoring Plan */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection("monitoring")}
                    className="flex items-center justify-between w-full p-3 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Monitoring Plan</span>
                      <Badge variant="outline" className="text-[9px] ml-1">editable</Badge>
                    </div>
                    {expandedSections.monitoring ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedSections.monitoring && (
                    <div className="p-3">
                      <Textarea
                        value={editedMonitoring}
                        onChange={(e) => setEditedMonitoring(e.target.value)}
                        className="min-h-[120px] text-sm font-mono"
                        placeholder="Monitoring plan..."
                      />
                      {editedMonitoring !== (aiSections.monitoring_plan || "") && (
                        <div className="flex items-center gap-2 mt-2">
                          <Edit3 className="h-3 w-3 text-amber-600" />
                          <span className="text-[10px] text-amber-600 font-medium">Modified from AI original</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-6 ml-auto"
                            onClick={() => setEditedMonitoring(aiSections.monitoring_plan || "")}
                          >
                            Reset to AI version
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Risk Flags - read-only */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection("risks")}
                    className="flex items-center justify-between w-full p-3 bg-destructive/5 hover:bg-destructive/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-medium text-destructive">Risk Flags & Escalation</span>
                    </div>
                    {expandedSections.risks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedSections.risks && (
                    <div className="p-3">
                      <p className="text-sm whitespace-pre-wrap">{aiSections.risk_flags || "No flags identified."}</p>
                    </div>
                  )}
                </div>

                {/* Approval Notes */}
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Physician Notes</Label>
                  <Textarea
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Optional notes for approval, modifications, or rejection reason..."
                    className="mt-1.5 min-h-[80px] text-sm"
                  />
                </div>

                {/* Lab Snapshot */}
                <details className="group">
                  <summary className="text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer flex items-center gap-1">
                    <FlaskConical className="h-3 w-3" /> Lab Values Snapshot
                    <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                    {[
                      { k: "lab_tt", l: "Total T" }, { k: "lab_ft", l: "Free T" },
                      { k: "lab_e2", l: "E2" }, { k: "lab_tsh", l: "TSH" },
                      { k: "lab_hct", l: "HCT" }, { k: "lab_psa", l: "PSA" },
                      { k: "lab_igf1", l: "IGF-1" }, { k: "lab_a1c", l: "A1c" },
                      { k: "lab_fsh", l: "FSH" }, { k: "lab_lh", l: "LH" },
                      { k: "lab_crp", l: "CRP" }, { k: "lab_vitd", l: "Vit D" },
                    ].map(({ k, l }) => {
                      const val = (currentVisit as any)[k];
                      return val != null ? (
                        <div key={k} className="bg-muted/50 rounded px-2 py-1">
                          <p className="text-[10px] text-muted-foreground">{l}</p>
                          <p className="text-sm font-medium">{val}</p>
                        </div>
                      ) : null;
                    })}
                  </div>
                </details>

                {/* Action Buttons */}
                {currentVisit.approval_status === "pending" ? (
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => handleApprove(currentVisit.id)}
                      disabled={approvalMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {editedTreatment !== (aiSections.treatment_recommendation || "") ||
                       editedMonitoring !== (aiSections.monitoring_plan || "")
                        ? "Approve with Modifications"
                        : "Approve"}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={() => approvalMutation.mutate({ status: "rejected", visitId: currentVisit.id })}
                      disabled={approvalMutation.isPending || !approvalNotes.trim()}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {(() => {
                      const b = approvalBadge[currentVisit.approval_status] || approvalBadge.pending;
                      const Icon = b.icon;
                      return (
                        <Badge className={`${b.class} border gap-1`}>
                          <Icon className="h-3 w-3" /> {b.label}
                        </Badge>
                      );
                    })()}
                    {currentVisit.approved_at && (
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(currentVisit.approved_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Clock, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type ClearanceStatus = "sent" | "client_submitted" | "pending_review" | "approved" | "changes_requested" | "rejected";

const STATUS_LABELS: Record<ClearanceStatus, string> = {
  sent: "Sent",
  client_submitted: "Submitted",
  pending_review: "Pending Review",
  approved: "Approved",
  changes_requested: "Changes Requested",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<ClearanceStatus, string> = {
  sent: "bg-blue-100 text-blue-800",
  client_submitted: "bg-yellow-100 text-yellow-800",
  pending_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  changes_requested: "bg-purple-100 text-purple-800",
  rejected: "bg-red-100 text-red-800",
};

interface ClearanceRequest {
  id: string;
  status: ClearanceStatus;
  created_at: string;
  submitted_at: string | null;
  admin_notes: string | null;
  resubmission_count: number;
  patient: { id: string; first_name: string; last_name: string; email: string | null; date_of_birth: string | null };
  appointment: { id: string; scheduled_start: string | null; treatment_id: string | null } | null;
}

export default function IntakeClearanceQueue() {
  const [statusFilter, setStatusFilter] = useState<ClearanceStatus>("pending_review");
  const [selected, setSelected] = useState<ClearanceRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionMode, setActionMode] = useState<"approve" | "changes" | "reject" | null>(null);
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["clearance-queue", statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("intake-clearance", {
        body: { action: "list_queue", status: statusFilter, limit: 100 },
      });
      if (error) throw error;
      return (data?.requests ?? []) as ClearanceRequest[];
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action, admin_notes }: { id: string; action: "approve" | "request_changes" | "reject"; admin_notes?: string }) => {
      const { data, error } = await supabase.functions.invoke("intake-clearance", {
        body: { action, id, admin_notes },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      const msg = variables.action === "approve" ? "Clearance approved" : variables.action === "reject" ? "Clearance rejected, refund initiated" : "Changes requested, patient notified";
      toast.success(msg);
      setSelected(null);
      setActionMode(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["clearance-queue"] });
    },
    onError: (err: any) => toast.error(err?.message || "Action failed"),
  });

  const submitAction = () => {
    if (!selected || !actionMode) return;
    if ((actionMode === "changes" || actionMode === "reject") && !adminNotes.trim()) {
      toast.error("Please provide notes explaining the decision");
      return;
    }
    mutation.mutate({
      id: selected.id,
      action: actionMode === "approve" ? "approve" : actionMode === "changes" ? "request_changes" : "reject",
      admin_notes: adminNotes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
<div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" /> Intake Clearance Queue
        </h1>
        <p className="text-muted-foreground">Review patient intake submissions before appointments proceed.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Filter by Status</CardTitle>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ClearanceStatus)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="client_submitted">Just Submitted</SelectItem>
                <SelectItem value="changes_requested">Changes Requested</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="sent">Sent (no reply)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !requests?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No clearance requests with this status.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resubmissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.patient.first_name} {r.patient.last_name}
                      {r.patient.email && <div className="text-xs text-muted-foreground">{r.patient.email}</div>}
                    </TableCell>
                    <TableCell>
                      {r.appointment?.scheduled_start ? format(new Date(r.appointment.scheduled_start), "MMM d, yyyy h:mm a") : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.submitted_at ? format(new Date(r.submitted_at), "MMM d, h:mm a") : <span className="text-muted-foreground">Not yet</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[r.status]} variant="outline">{STATUS_LABELS[r.status]}</Badge>
                    </TableCell>
                    <TableCell>{r.resubmission_count > 0 ? <Badge variant="secondary">{r.resubmission_count}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setSelected(r); setActionMode(null); setAdminNotes(""); }}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review / Action Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Clearance Review — {selected?.patient.first_name} {selected?.patient.last_name}
            </DialogTitle>
            <DialogDescription>
              Submitted {selected?.submitted_at ? format(new Date(selected.submitted_at), "MMM d, yyyy 'at' h:mm a") : "not yet"}
              {selected?.resubmission_count ? ` · Resubmission #${selected.resubmission_count}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selected?.appointment && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" /> Appointment
                </div>
                <div>
                  {selected.appointment.scheduled_start
                    ? format(new Date(selected.appointment.scheduled_start), "EEEE, MMM d, yyyy 'at' h:mm a")
                    : "Not scheduled"}
                </div>
              </div>
            )}

            {!actionMode && (
              <div className="flex gap-2 justify-end">
                <Button variant="destructive" onClick={() => setActionMode("reject")}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject + Refund
                </Button>
                <Button variant="outline" onClick={() => setActionMode("changes")}>
                  <AlertCircle className="h-4 w-4 mr-1" /> Request Changes
                </Button>
                <Button onClick={() => setActionMode("approve")}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
              </div>
            )}

            {actionMode && (
              <div className="space-y-3">
                <div>
                  <Label>
                    {actionMode === "approve"
                      ? "Approval note (optional)"
                      : actionMode === "changes"
                        ? "Changes needed from patient"
                        : "Rejection reason (for audit trail)"}
                  </Label>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    placeholder={
                      actionMode === "approve"
                        ? "Any notes for the record"
                        : "Explain what the patient needs to update or why this was rejected"
                    }
                  />
                  {actionMode === "reject" && selected?.appointment && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Rejection will cancel the appointment and issue a full deposit refund via Stripe.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {actionMode ? (
              <>
                <Button variant="ghost" onClick={() => { setActionMode(null); setAdminNotes(""); }}>Back</Button>
                <Button
                  onClick={submitAction}
                  disabled={mutation.isPending}
                  variant={actionMode === "reject" ? "destructive" : "default"}
                >
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Confirm {actionMode === "approve" ? "Approval" : actionMode === "changes" ? "Request" : "Rejection"}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

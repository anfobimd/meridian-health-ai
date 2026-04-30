import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PaymentPanel } from "./PaymentPanel";
import { FollowUpBooker } from "./FollowUpBooker";
import {
  CheckCircle2, AlertTriangle, Loader2, Sparkles, CreditCard,
  XCircle, CircleCheck, Send,
} from "lucide-react";

interface OpenItem {
  item: string;
  severity: "warning" | "critical";
  resolved: boolean;
}

export function CheckoutPanel({ appointmentId, open, onOpenChange }: {
  appointmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);
  const [canCheckout, setCanCheckout] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [paymentSuggestions, setPaymentSuggestions] = useState<any[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<any>({ total: 0, balance_due: 0, invoice_count: 0 });
  const [reviewed, setReviewed] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [aftercareSent, setAftercareSent] = useState(false);

  const runReview = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-checkout-review", {
        body: { appointment_id: appointmentId, mode: "payment_suggestions" },
      });
      if (error) throw error;
      setOpenItems(data.open_items || []);
      setCanCheckout(data.can_checkout);
      setFollowUp(data.follow_up_suggestion || "");
      setFollowUpDays(data.follow_up_days || null);
      setPatientId(data.patient_id || null);
      setPatientName(data.patient_name || null);
      setPaymentSuggestions(data.payment_suggestions || []);
      setInvoiceSummary(data.invoice_summary || { total: 0, balance_due: 0, invoice_count: 0 });
      setReviewed(true);
    } catch (e: any) {
      toast.error(e.message || "Checkout review failed");
    } finally {
      setLoading(false);
    }
  };

  const completeCheckout = async () => {
    try {
      const { error } = await supabase.from("appointments").update({
        status: "completed" as any,
        completed_at: new Date().toISOString(),
      }).eq("id", appointmentId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      toast.success("Patient checked out");
      onOpenChange(false);
    } catch {
      toast.error("Failed to complete checkout");
    }
  };

  const sendAftercare = async () => {
    // Trigger aftercare message
    try {
      await supabase.functions.invoke("ai-aftercare-message", {
        body: { appointment_id: appointmentId },
      });
      setAftercareSent(true);
      toast.success("Aftercare instructions sent");
    } catch {
      toast.error("Failed to send aftercare");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />Checkout Review
          </DialogTitle>
        </DialogHeader>

        {!reviewed ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Run AI checkout review to check for open items, apply credits, and complete this visit.
            </p>
            <Button onClick={runReview} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              {loading ? "Reviewing…" : "Run Checkout Review"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Open Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checklist</h4>
              {openItems.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CircleCheck className="h-4 w-4" />All clear — no open items
                </div>
              ) : (
                openItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {item.severity === "critical" ? (
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    )}
                    <span>{item.item}</span>
                    <Badge variant={item.severity === "critical" ? "destructive" : "secondary"} className="ml-auto text-[11px]">
                      {item.severity}
                    </Badge>
                  </div>
                ))
              )}
            </div>

            <Separator />

            {/* Payment Panel */}
            {(invoiceSummary.balance_due > 0 || paymentSuggestions.length > 0) && (
              <>
                <PaymentPanel
                  invoiceSummary={invoiceSummary}
                  paymentSuggestions={paymentSuggestions}
                  onPaymentComplete={() => setPaymentDone(true)}
                />
                <Separator />
              </>
            )}

            {/* Follow-up Booking */}
            {patientId && followUp && (
              <>
                <FollowUpBooker
                  patientId={patientId}
                  patientName={patientName || "Patient"}
                  suggestion={followUp}
                  suggestedDays={followUpDays}
                />
                <Separator />
              </>
            )}

            {/* Aftercare */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aftercare</h4>
              {aftercareSent ? (
                <div className="flex items-center gap-2 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />Aftercare instructions sent
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={sendAftercare}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />Send Aftercare Instructions
                </Button>
              )}
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={!canCheckout}
                onClick={completeCheckout}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {canCheckout ? "Complete Checkout" : "Resolve Items First"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CreditCard, Package, Tag, CheckCircle2, DollarSign,
} from "lucide-react";

interface PaymentSuggestion {
  type: "package_credit" | "membership_discount";
  label: string;
  package_id?: string;
  remaining_sessions?: number;
  membership_id?: string;
  discount_percent?: number;
}

interface InvoiceSummary {
  total: number;
  balance_due: number;
  invoice_count: number;
}

// Maps the panel's simple method toggle to the DB payment_method enum.
const METHOD_MAP: Record<string, string> = { card: "credit_card", cash: "cash" };

export function PaymentPanel({
  appointmentId,
  patientId,
  invoiceSummary,
  paymentSuggestions,
  onPaymentComplete,
}: {
  appointmentId: string;
  patientId: string | null;
  invoiceSummary: InvoiceSummary;
  paymentSuggestions: PaymentSuggestion[];
  onPaymentComplete: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedMethod, setSelectedMethod] = useState<string>("card");
  const [appliedCredits, setAppliedCredits] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const packageCredits = paymentSuggestions.filter(s => s.type === "package_credit");
  const memberDiscounts = paymentSuggestions.filter(s => s.type === "membership_discount");

  const toggleCredit = (id: string) => {
    setAppliedCredits(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Calculate adjusted balance
  let adjustedBalance = invoiceSummary.balance_due;
  for (const s of paymentSuggestions) {
    if (s.type === "package_credit" && s.package_id && appliedCredits.has(s.package_id)) {
      // Package credit covers the session entirely
      adjustedBalance = 0;
    }
    if (s.type === "membership_discount" && s.membership_id && appliedCredits.has(s.membership_id)) {
      adjustedBalance = adjustedBalance * (1 - (s.discount_percent || 10) / 100);
    }
  }
  adjustedBalance = +Math.max(0, adjustedBalance).toFixed(2);

  const handleCollect = async () => {
    if (!patientId) {
      toast.error("No patient on file for this payment");
      return;
    }
    setProcessing(true);
    try {
      // Find the open (unpaid) invoice for this visit. CheckoutPanel creates it
      // just before this panel becomes reachable.
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id, total, amount_paid")
        .eq("appointment_id", appointmentId)
        .neq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (invErr) throw invErr;
      if (!inv) {
        toast.error("No open invoice to collect against");
        return;
      }

      // Record the cash/card payment. When a package credit fully covers the
      // visit, adjustedBalance is 0 and we skip the $0 payment row but still
      // settle the invoice below.
      if (adjustedBalance > 0) {
        const { error: payErr } = await supabase.from("payments").insert({
          invoice_id: inv.id,
          patient_id: patientId,
          amount: adjustedBalance,
          method: (METHOD_MAP[selectedMethod] ?? "other") as any,
          notes: appliedCredits.size > 0 ? "Credits/discounts applied at checkout" : null,
        });
        if (payErr) throw payErr;
      }

      // Settle the invoice. The panel collects the full (post-credit) balance in
      // one step, so the visit is paid in full at checkout. NOTE: credit and
      // discount accounting is simplified for alpha — we clear the balance and
      // record the cash actually collected, rather than itemizing each credit as
      // a separate ledger adjustment. Revisit if partial payments are needed.
      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          amount_paid: Number(inv.total),
          balance_due: 0,
          status: "paid",
        })
        .eq("id", inv.id);
      if (updErr) throw updErr;

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["frontdesk-today"] });
      toast.success(adjustedBalance > 0 ? `$${adjustedBalance.toFixed(2)} collected` : "Credit applied — invoice settled");
      onPaymentComplete();
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <DollarSign className="h-3 w-3" />Payment
      </h4>

      {/* Invoice Summary */}
      <div className="bg-muted/50 rounded-md p-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Visit Total</span>
          <span className="font-medium">${invoiceSummary.total.toFixed(2)}</span>
        </div>
        {invoiceSummary.balance_due !== invoiceSummary.total && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Balance Due</span>
            <span className="font-medium">${invoiceSummary.balance_due.toFixed(2)}</span>
          </div>
        )}
        {appliedCredits.size > 0 && adjustedBalance !== invoiceSummary.balance_due && (
          <>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>After Credits</span>
              <span className="text-primary">${adjustedBalance.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>

      {/* Package Credits */}
      {packageCredits.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Package className="h-3 w-3" />Available Package Credits
          </p>
          {packageCredits.map((s) => (
            <Button
              key={s.package_id}
              variant={appliedCredits.has(s.package_id!) ? "default" : "outline"}
              size="sm"
              className="w-full justify-start text-xs h-8"
              onClick={() => toggleCredit(s.package_id!)}
            >
              {appliedCredits.has(s.package_id!) && <CheckCircle2 className="h-3 w-3 mr-1.5" />}
              {s.label}
            </Button>
          ))}
        </div>
      )}

      {/* Membership Discounts */}
      {memberDiscounts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <Tag className="h-3 w-3" />Membership Discounts
          </p>
          {memberDiscounts.map((s) => (
            <Button
              key={s.membership_id}
              variant={appliedCredits.has(s.membership_id!) ? "default" : "outline"}
              size="sm"
              className="w-full justify-start text-xs h-8"
              onClick={() => toggleCredit(s.membership_id!)}
            >
              {appliedCredits.has(s.membership_id!) && <CheckCircle2 className="h-3 w-3 mr-1.5" />}
              {s.label}
            </Button>
          ))}
        </div>
      )}

      {/* Payment Method */}
      {adjustedBalance > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">Payment Method</p>
          <div className="flex gap-1.5">
            {[
              { id: "card", label: "Card", icon: CreditCard },
              { id: "cash", label: "Cash", icon: DollarSign },
            ].map(m => (
              <Button
                key={m.id}
                variant={selectedMethod === m.id ? "default" : "outline"}
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={() => setSelectedMethod(m.id)}
              >
                <m.icon className="h-3 w-3 mr-1" />{m.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full" size="sm" onClick={handleCollect} disabled={processing}>
        {processing ? "Processing…" : adjustedBalance > 0 ? `Collect $${adjustedBalance.toFixed(2)}` : "Apply Credit & Complete"}
      </Button>
    </div>
  );
}

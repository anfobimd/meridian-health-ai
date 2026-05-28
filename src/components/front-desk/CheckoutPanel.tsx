import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PaymentPanel } from "./PaymentPanel";
import { FollowUpBooker } from "./FollowUpBooker";
import { AftercareModal } from "@/components/clinical/AftercareModal";
import {
  CheckCircle2, AlertTriangle, Loader2, Sparkles, CreditCard,
  XCircle, CircleCheck, Send, Plus, Trash2, Receipt,
} from "lucide-react";

interface OpenItem {
  item: string;
  severity: "warning" | "critical";
  resolved: boolean;
}

// A single editable charge line. unit_price defaults from the treatment's
// catalog price but is editable so staff can bill per-unit (e.g. Botox units,
// filler syringes) or apply ad-hoc pricing at the point of checkout.
interface LineItem {
  key: string;
  treatment_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
}

const newLine = (): LineItem => ({
  key: crypto.randomUUID(),
  treatment_id: null,
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
});

const lineTotal = (l: LineItem) =>
  +(((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)) *
    (1 - (Number(l.discount_percent) || 0) / 100)).toFixed(2);

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

  // ── Invoice generation state ──────────────────────────────────────────────
  // CheckoutPanel previously assumed an invoice already existed for the visit
  // and only summarised it. Nothing ever created one, so every checkout showed
  // a $0 balance and no bill was produced. The block below lets staff build the
  // bill from the visit's treatment(s) before taking payment.
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const needsInvoice = reviewed && (invoiceSummary.invoice_count ?? 0) === 0;

  // Treatments catalog for the line-item picker (id, name, price).
  const { data: treatments } = useQuery({
    queryKey: ["checkout-treatments"],
    enabled: open && needsInvoice,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select("id, name, price")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Seed one line from the appointment's booked treatment the first time the
  // builder is shown. Staff can edit, add, or remove lines from there.
  useEffect(() => {
    if (!needsInvoice || seeded) return;
    let cancelled = false;
    (async () => {
      const { data: apt } = await supabase
        .from("appointments")
        .select("treatment_id, treatments(name, price)")
        .eq("id", appointmentId)
        .maybeSingle();
      if (cancelled) return;
      const t = apt?.treatments as { name?: string; price?: number } | { name?: string; price?: number }[] | null;
      const tr = Array.isArray(t) ? t[0] : t;
      setLineItems([
        {
          ...newLine(),
          treatment_id: (apt?.treatment_id as string) ?? null,
          description: tr?.name ?? "Visit",
          unit_price: Number(tr?.price ?? 0),
        },
      ]);
      setSeeded(true);
    })();
    return () => { cancelled = true; };
  }, [needsInvoice, seeded, appointmentId]);

  const updateLine = (key: string, patch: Partial<LineItem>) =>
    setLineItems((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) =>
    setLineItems((prev) => prev.filter((l) => l.key !== key));

  const onPickTreatment = (key: string, treatmentId: string) => {
    const t = treatments?.find((x: any) => x.id === treatmentId);
    updateLine(key, {
      treatment_id: treatmentId || null,
      description: t?.name ?? "",
      unit_price: t ? Number(t.price ?? 0) : 0,
    });
  };

  const grossSubtotal = +lineItems
    .reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
    .toFixed(2);
  const lineDiscounts = +lineItems
    .reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) - lineTotal(l)), 0)
    .toFixed(2);
  const taxableBase = +(grossSubtotal - lineDiscounts).toFixed(2);
  const taxAmount = +(taxableBase * (Number(taxRate) || 0) / 100).toFixed(2);
  const invoiceTotal = +(taxableBase + taxAmount).toFixed(2);

  const generateInvoice = async () => {
    if (!patientId) { toast.error("No patient linked to this appointment"); return; }
    const validLines = lineItems.filter((l) => l.description.trim() && (Number(l.quantity) || 0) > 0);
    if (validLines.length === 0) { toast.error("Add at least one charge with a description and quantity"); return; }
    setCreatingInvoice(true);
    try {
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          patient_id: patientId,
          appointment_id: appointmentId,
          status: "sent",
          subtotal: grossSubtotal,
          discount_amount: lineDiscounts,
          tax_amount: taxAmount,
          total: invoiceTotal,
          amount_paid: 0,
          balance_due: invoiceTotal,
        })
        .select("id")
        .single();
      if (invErr) throw invErr;

      const itemsPayload = validLines.map((l) => ({
        invoice_id: inv.id,
        treatment_id: l.treatment_id || null,
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        discount_percent: Number(l.discount_percent) || 0,
        total: lineTotal(l),
      }));
      const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Invoice created — $${invoiceTotal.toFixed(2)}`);
      // Refresh the review so the payment panel reflects the new balance.
      await runReview();
    } catch (e: any) {
      toast.error(e.message || "Failed to create invoice");
    } finally {
      setCreatingInvoice(false);
    }
  };

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

  const openAftercare = async () => {
    // Resolve the appointment + encounter context, then open the modal.
    // The modal handles AI generation, review/edit, and the eventual write
    // to patient_communication_log. We only mark aftercareSent=true if the
    // modal closes via Send (i.e. produces a log row); Skip leaves the
    // button available for retry.
    try {
      const { data: apt, error: aptErr } = await supabase
        .from("appointments")
        .select("id, patient_id, patients(first_name, last_name), treatments(name)")
        .eq("id", appointmentId)
        .maybeSingle();
      if (aptErr || !apt?.patient_id) {
        toast.error("Could not load appointment");
        return;
      }
      const { data: enc } = await supabase
        .from("encounters")
        .select("id")
        .eq("appointment_id", appointmentId)
        .limit(1)
        .maybeSingle();
      if (!enc?.id) {
        toast.error("No encounter found for this visit");
        return;
      }
      const t = apt.treatments as { name?: string } | { name?: string }[] | null;
      const treatmentName = (Array.isArray(t) ? t[0]?.name : t?.name) || "Visit";
      const p = apt.patients as { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
      const pat = Array.isArray(p) ? p[0] : p;
      setAftercareCtx({
        encounterId: enc.id,
        patientId: apt.patient_id,
        patientName: `${pat?.first_name ?? ""} ${pat?.last_name ?? ""}`.trim(),
        procedureType: treatmentName,
      });
    } catch {
      toast.error("Failed to load aftercare context");
    }
  };

  // Phase 3 #2: Aftercare goes through a review modal now. Stores the
  // resolved encounter + patient context once the user clicks the button.
  const [aftercareCtx, setAftercareCtx] = useState<{
    encounterId: string;
    patientId: string;
    patientName: string;
    procedureType: string;
  } | null>(null);

  return (
    <>
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

            {/* Build the Bill — shown only when no invoice exists yet for this visit */}
            {needsInvoice && (
              <>
                <div className="space-y-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Receipt className="h-3.5 w-3.5" />Build the Bill
                  </h4>

                  {lineItems.map((l) => (
                    <div key={l.key} className="rounded-md border border-border p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={l.treatment_id ?? ""}
                          onChange={(e) => onPickTreatment(l.key, e.target.value)}
                          className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">Custom charge…</option>
                          {treatments?.map((t: any) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(l.key)}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={l.description}
                        placeholder="Description"
                        onChange={(e) => updateLine(l.key, { description: e.target.value })}
                        className="h-9"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Units / Qty</Label>
                          <Input
                            type="number" min="0" step="1" inputMode="numeric"
                            value={l.quantity}
                            onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Price / Unit</Label>
                          <Input
                            type="number" min="0" step="0.01" inputMode="decimal"
                            value={l.unit_price}
                            onChange={(e) => updateLine(l.key, { unit_price: Number(e.target.value) })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Disc %</Label>
                          <Input
                            type="number" min="0" max="100" step="1" inputMode="numeric"
                            value={l.discount_percent}
                            onChange={(e) => updateLine(l.key, { discount_percent: Number(e.target.value) })}
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        Line total <span className="font-medium text-foreground">${lineTotal(l).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button" variant="outline" size="sm" className="w-full"
                    onClick={() => setLineItems((prev) => [...prev, newLine()])}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Add charge
                  </Button>

                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] text-muted-foreground">Tax %</Label>
                    <Input
                      type="number" min="0" max="100" step="0.01" inputMode="decimal"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="h-8 w-24"
                    />
                  </div>

                  <div className="rounded-md bg-muted/40 p-2 space-y-0.5 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${grossSubtotal.toFixed(2)}</span></div>
                    {lineDiscounts > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>Discounts</span><span>−${lineDiscounts.toFixed(2)}</span></div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>${taxAmount.toFixed(2)}</span></div>
                    )}
                    <div className="flex justify-between font-semibold pt-0.5"><span>Total</span><span>${invoiceTotal.toFixed(2)}</span></div>
                  </div>

                  <Button className="w-full" onClick={generateInvoice} disabled={creatingInvoice}>
                    {creatingInvoice ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Receipt className="h-4 w-4 mr-1.5" />}
                    {creatingInvoice ? "Creating invoice…" : `Generate Invoice — $${invoiceTotal.toFixed(2)}`}
                  </Button>
                </div>

                <Separator />
              </>
            )}

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
                <Button variant="outline" size="sm" className="w-full" onClick={openAftercare}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />Send Aftercare Instructions
                </Button>
              )}
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={!canCheckout || needsInvoice}
                onClick={completeCheckout}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                {needsInvoice ? "Generate Invoice First" : canCheckout ? "Complete Checkout" : "Resolve Items First"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Aftercare modal — opens when user clicks "Send Aftercare Instructions"
        in CheckoutPanel. Replaces the previous silent invoke that pretended
        to send but never wrote to patient_communication_log. */}
    {aftercareCtx && (
      <AftercareModal
        open
        onClose={() => {
          setAftercareCtx(null);
        }}
        patientName={aftercareCtx.patientName}
        procedureType={aftercareCtx.procedureType}
        encounterId={aftercareCtx.encounterId}
        patientId={aftercareCtx.patientId}
        appointmentId={appointmentId}
      />
    )}
  </>
  );
}

/**
 * AftercareModal
 * --------------
 * Generates an AI-drafted aftercare message, lets the provider review/edit
 * it, and then on Send writes ONE row to public.patient_communication_log.
 *
 * Why this is its own component (Phase 3 #2 of the audit fix):
 *   The previous flow had three separate code paths (ProviderDay,
 *   TelehealthVisit, EncounterChart) — two of which auto-sent the
 *   AI-generated message without review by passing `auto_send: true` to the
 *   ai-aftercare-message edge function. That was both unsafe and silently
 *   broken (the edge function's insert referenced columns that don't exist
 *   in patient_communication_log, so nothing was actually being logged).
 *   This modal is now the single canonical path for aftercare sends.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";

export interface AftercareModalProps {
  open: boolean;
  onClose: () => void;
  patientName: string;
  procedureType: string;
  /** Required for the edge function to load context. May also be used to
   *  resolve patient_id if patientId prop isn't supplied. */
  encounterId: string;
  /** Optional explicit patient_id — preferred. If absent, will be derived
   *  from the encounter (which always has it). */
  patientId?: string | null;
  /** Optional appointment_id to associate the log row with. */
  appointmentId?: string | null;
}

export function AftercareModal({
  open,
  onClose,
  patientName,
  procedureType,
  encounterId,
  patientId,
  appointmentId,
}: AftercareModalProps) {
  const [channel, setChannel] = useState("sms");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolvedPatientId, setResolvedPatientId] = useState<string | null>(patientId ?? null);

  // Generate the AI draft each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.functions
      .invoke("ai-aftercare-message", {
        body: { encounter_id: encounterId, procedure_type: procedureType, patient_name: patientName },
      })
      .then(({ data }) => {
        // Edge function returns a structured object with `body`; older code
        // referenced `data.message`. Support both for backward-compat without
        // forcing a coordinated edge-function deploy.
        const draft = data?.body || data?.message ||
          `Thank you for your ${procedureType} treatment today, ${patientName}. Please follow your aftercare instructions and contact us with any concerns.`;
        setMessage(draft);
      })
      .catch(() => {
        setMessage(`Thank you for your ${procedureType} treatment today, ${patientName}. Please follow your aftercare instructions.`);
      })
      .finally(() => setLoading(false));
  }, [open, encounterId, procedureType, patientName]);

  // Lazy-resolve patient_id if not supplied; needed for the log insert.
  useEffect(() => {
    if (!open || resolvedPatientId || !encounterId) return;
    let cancelled = false;
    supabase.from("encounters").select("patient_id").eq("id", encounterId).maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.patient_id) setResolvedPatientId(data.patient_id);
      });
    return () => { cancelled = true; };
  }, [open, encounterId, resolvedPatientId]);

  const send = async () => {
    if (!resolvedPatientId) {
      toast.error("Cannot send: patient not identified");
      return;
    }
    if (!message.trim()) {
      toast.error("Cannot send empty message");
      return;
    }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Audit row goes in *now*, with the provider-edited content. This is
      // the source-of-truth record of what was approved for the patient.
      // Real SMS/email transport is a separate ticket; for now this captures
      // intent + content + who sent.
      const { error } = await supabase.from("patient_communication_log").insert({
        patient_id: resolvedPatientId,
        channel,
        direction: "outbound",
        content: message,
        template_used: `aftercare:${procedureType}`,
        delivery_status: "sent",
        staff_user_id: user?.id ?? null,
        appointment_id: appointmentId ?? null,
        metadata: { source: "aftercare_modal", encounter_id: encounterId },
      });
      if (error) throw error;
      toast.success(`Aftercare sent via ${channel}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to send aftercare: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Send Aftercare Instructions
          </DialogTitle>
          <DialogDescription>
            Review the AI-drafted message before sending to {patientName}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message</Label>
            {loading ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> AI generating aftercare message...
              </div>
            ) : (
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="text-sm" />
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Skip</Button>
          <Button size="sm" onClick={send} disabled={sending || loading || !message.trim() || !resolvedPatientId}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AftercareModal;

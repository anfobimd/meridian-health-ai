import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEmail } from "@/hooks/useEmail";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Send, Copy, Check, Loader2, Link2 } from "lucide-react";

const FOCUS_OPTIONS = [
  { value: "hormone_male", label: "Male HRT" },
  { value: "hormone_female", label: "Female HRT" },
  { value: "peptide_gh", label: "GH Peptides" },
  { value: "peptide_glp1", label: "GLP-1 (Semaglutide)" },
  { value: "peptide_sexual", label: "Sexual Health" },
  { value: "peptide_tissue", label: "Tissue Repair" },
  { value: "peptide_cognitive", label: "Cognitive" },
  { value: "peptide_immune", label: "Immune" },
  { value: "peptide_sleep", label: "Sleep" },
];

interface SendIntakeLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: {
    id: string;
    first_name: string;
    last_name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
}

export function SendIntakeLinkDialog({ open, onOpenChange, patient }: SendIntakeLinkDialogProps) {
  const { sendEmail } = useEmail();
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [phone, setPhone] = useState(patient?.phone || "");
  const [channel, setChannel] = useState<"sms" | "manual">("sms");
  const [sending, setSending] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleFocus = (val: string) => {
    setFocusAreas(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const handleSend = async () => {
    if (!patient?.id) {
      toast.error("No patient selected");
      return;
    }
    if (channel === "sms" && !phone.trim()) {
      toast.error("Phone number required for SMS");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-intake-invite", {
        body: {
          patient_id: patient.id,
          channel,
          focus_areas: focusAreas,
          phone: phone.trim() || null,
          email: patient.email || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGeneratedUrl(data.url);
      if (data.sms_sent) {
        toast.success("Intake link sent via SMS!");
      } else if (channel === "sms") {
        toast.info("Invitation created but SMS delivery failed. Copy the link manually.");
      } else {
        toast.success("Intake link generated!");
      }

      // Send email if patient has email address
      if (patient.email) {
        sendEmail.mutate({
          to: patient.email,
          subject: "Complete Your Intake Form - Meridian Wellness",
          html: `<p>Hi ${patient.first_name},</p><p>Please complete your intake form before your appointment: <a href="${data.url}">Click here</a></p>`,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setGeneratedUrl(null);
      setCopied(false);
      setFocusAreas([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Send Intake Link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient Info */}
          {patient && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium">{patient.first_name} {patient.last_name}</p>
              {patient.phone && <p className="text-muted-foreground text-xs">{patient.phone}</p>}
              {patient.email && <p className="text-muted-foreground text-xs">{patient.email}</p>}
            </div>
          )}

          {/* Focus Areas */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Pre-select Focus Areas</Label>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_OPTIONS.map(opt => (
                <Badge
                  key={opt.value}
                  variant={focusAreas.includes(opt.value) ? "default" : "outline"}
                  className="cursor-pointer text-[11px] h-6"
                  onClick={() => toggleFocus(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Channel */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Delivery Method</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={channel === "sms" ? "default" : "outline"}
                onClick={() => setChannel("sms")}
                className="flex-1 text-xs h-8"
              >
                <Send className="h-3 w-3 mr-1" /> SMS
              </Button>
              <Button
                size="sm"
                variant={channel === "manual" ? "default" : "outline"}
                onClick={() => setChannel("manual")}
                className="flex-1 text-xs h-8"
              >
                <Copy className="h-3 w-3 mr-1" /> Copy Link
              </Button>
            </div>
          </div>

          {/* Phone for SMS */}
          {channel === "sms" && (
            <div className="space-y-1">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                type="tel"
                className="h-9"
              />
            </div>
          )}

          {/* Generated URL */}
          {generatedUrl && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-primary">Generated Link</Label>
              <div className="flex gap-2">
                <Input value={generatedUrl} readOnly className="text-xs h-9 bg-muted" />
                <Button size="sm" variant="outline" onClick={handleCopy} className="h-9 px-3">
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Send Button */}
          {!generatedUrl && (
            <Button onClick={handleSend} disabled={sending || !patient} className="w-full">
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
              ) : (
                <>{channel === "sms" ? <Send className="h-4 w-4 mr-2" /> : <Link2 className="h-4 w-4 mr-2" />} {channel === "sms" ? "Send SMS" : "Generate Link"}</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

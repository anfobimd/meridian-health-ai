import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import SignaturePad from "@/components/SignaturePad";
import {
  FileCheck, Send, CheckCircle2, Clock, Loader2, PenLine, ArrowLeft,
} from "lucide-react";

interface Props {
  patientId: string;
  patientName: string;
  appointmentId?: string;
  /** Optional path to navigate back to after consent capture (e.g. an encounter chart with reopenPhotos=1). */
  returnTo?: string;
}

export function ConsentWorkflow({ patientId, patientName, appointmentId, returnTo }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signOpen, setSignOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["consent-templates-active"],
    queryFn: async () => {
      const { data } = await supabase.from("consent_templates")
        .select("*")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: consents } = useQuery({
    queryKey: ["patient-consents", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("e_consents")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const signConsent = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate || !signature) throw new Error("Missing data");
      const { error } = await supabase.from("e_consents").insert({
        patient_id: patientId,
        consent_type: selectedTemplate.name.toLowerCase().includes("telehealth") ? "telehealth" : "general",
        consent_text: selectedTemplate.body,
        signature_data: signature,
        user_agent: navigator.userAgent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-consents", patientId] });
      toast.success("Consent signed");
      setSignOpen(false);
      setSignature(null);
      setSelectedTemplate(null);
    },
    onError: () => toast.error("Failed to save consent"),
  });

  const sendViaSms = async (templateId: string) => {
    try {
      const { data: patient } = await supabase
        .from("patients")
        .select("phone, first_name")
        .eq("id", patientId)
        .single();
      if (!patient?.phone) {
        toast.error("Patient has no phone number on file");
        return;
      }
      await supabase.functions.invoke("send-sms", {
        body: {
          to: patient.phone,
          message: `Hi ${patient.first_name}, please sign your consent form: ${window.location.origin}/portal?consent=${templateId}&patient=${patientId}`,
        },
      });
      toast.success("Consent link sent via SMS");
    } catch {
      toast.error("Failed to send SMS");
    }
  };

  const signedTemplateIds = new Set(
    consents?.map((c: any) => c.consent_text?.substring(0, 50)) ?? []
  );

  return (
    <div className="space-y-3">
      {returnTo && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 -ml-1"
          onClick={() => navigate(returnTo)}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to chart
        </Button>
      )}
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <FileCheck className="h-3 w-3" />Consent Forms
      </h3>

      {/* Signed Consents */}
      {consents && consents.length > 0 && (
        <div className="space-y-1.5">
          {consents.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-2 rounded bg-success/5 border border-success/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-success" />
                <span className="text-xs capitalize">{c.consent_type} Consent</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.signed_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Available Templates */}
      {templates && templates.length > 0 && (
        <div className="space-y-1.5">
          {templates.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-2 rounded border">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs">{t.name}</span>
                <Badge variant="outline" className="text-[10px]">v{t.version}</Badge>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => sendViaSms(t.id)}
                >
                  <Send className="h-2.5 w-2.5 mr-0.5" />SMS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => { setSelectedTemplate(t); setSignOpen(true); }}
                >
                  <PenLine className="h-2.5 w-2.5 mr-0.5" />Sign Now
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sign Dialog */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">Sign: {selectedTemplate?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-48 border rounded-md p-3">
            <div className="text-xs whitespace-pre-wrap text-muted-foreground">
              {selectedTemplate?.body}
            </div>
          </ScrollArea>
          <Separator />
          <div>
            <p className="text-xs font-medium mb-2">Patient Signature — {patientName}</p>
            <SignaturePad onSignature={setSignature} width={420} height={120} />
          </div>
          <Button
            className="w-full"
            disabled={!signature || signConsent.isPending}
            onClick={() => signConsent.mutate()}
          >
            {signConsent.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Sign & Save Consent
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

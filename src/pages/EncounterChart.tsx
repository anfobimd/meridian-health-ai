import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import QuickTextExpander from "@/components/charting/QuickTextExpander";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Sparkles, FileText, Save, CheckCircle2,
  ArrowLeft, Loader2, ClipboardList, AlertTriangle, ShieldAlert, Send, X, Eye,
  Lock, Unlock, Info, Camera,
} from "lucide-react";
import { VitalsPanel } from "@/components/encounter/VitalsPanel";
import { AddendumSection } from "@/components/clinical/AddendumSection";
import { AdminNotesPanel } from "@/components/front-desk/AdminNotesPanel";
import { PhotoConsentGate } from "@/components/clinical/PhotoConsentGate";
import { PhotoGallery } from "@/components/clinical-photos/PhotoGallery";

type FieldConfig = {
  options?: string[];
  min?: number;
  max?: number;
  label_lo?: string;
  label_hi?: string;
  unit?: string;
  ref_range?: string;
};

type TemplateField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  config: FieldConfig;
  unit: string | null;
  is_required: boolean;
  ai_variable: string | null;
  sort_order: number;
  placeholder?: string;
};

type TemplateSection = {
  id: string;
  section_key: string;
  title: string;
  icon: string;
  sort_order: number;
  is_required: boolean;
  is_collapsible: boolean;
  fields: TemplateField[];
};

type OrderSet = {
  id: string;
  order_type: string;
  order_key: string;
  label: string;
  description: string | null;
  is_auto_added: boolean;
};

/* ── Drug Interaction Alert Component ── */
function DrugInteractionBanner({
  patientMeds,
  allergies,
  procedureType,
  onDismiss,
}: {
  patientMeds: string[];
  allergies: string[];
  procedureType: string;
  onDismiss: () => void;
}) {
  const alerts = useMemo(() => {
    const warnings: string[] = [];
    const medsLower = patientMeds.map(m => m.toLowerCase());
    const allergyLower = allergies.map(a => a.toLowerCase());
    const procLower = procedureType.toLowerCase();

    const isInjectableOrFiller = ["filler", "botox", "injection", "prp", "kybella"].some(k => procLower.includes(k));
    const isLaser = ["laser", "ipl", "bbl", "resurfacing"].some(k => procLower.includes(k));

    // Blood thinner warnings for injectables
    if (isInjectableOrFiller) {
      const thinners = ["aspirin", "warfarin", "coumadin", "plavix", "clopidogrel", "eliquis", "apixaban", "xarelto", "rivaroxaban", "ibuprofen", "advil", "motrin", "fish oil", "vitamin e"];
      const found = medsLower.filter(m => thinners.some(t => m.includes(t)));
      if (found.length) warnings.push(`Blood thinner risk: Patient takes ${found.join(", ")}. Increased bruising/bleeding risk with injectables.`);
    }

    // Accutane + laser
    if (isLaser) {
      const accutane = ["accutane", "isotretinoin", "claravis", "absorica"];
      const found = medsLower.filter(m => accutane.some(a => m.includes(a)));
      if (found.length) warnings.push(`Accutane/isotretinoin detected. Laser/IPL contraindicated for 6+ months post-treatment.`);
    }

    // Lidocaine allergy for injectables
    if (isInjectableOrFiller && allergyLower.some(a => a.includes("lidocaine") || a.includes("novocaine"))) {
      warnings.push(`Lidocaine/anesthetic allergy noted. Confirm numbing protocol before procedure.`);
    }

    return warnings;
  }, [patientMeds, allergies, procedureType]);

  if (!alerts.length) return null;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-xs font-semibold text-destructive">Drug Interaction Alert</p>
            {alerts.map((a, i) => (
              <p key={i} className="text-xs text-destructive/80">{a}</p>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onDismiss}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Aftercare Modal ── */
function AftercareModal({
  open,
  onClose,
  patientName,
  procedureType,
  encounterId,
}: {
  open: boolean;
  onClose: () => void;
  patientName: string;
  procedureType: string;
  encounterId: string;
}) {
  const [channel, setChannel] = useState("sms");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.functions
      .invoke("ai-aftercare-message", {
        body: { encounter_id: encounterId, procedure_type: procedureType, patient_name: patientName },
      })
      .then(({ data }) => {
        setMessage(data?.message || `Thank you for your ${procedureType} treatment today, ${patientName}. Please follow your aftercare instructions and contact us with any concerns.`);
      })
      .catch(() => {
        setMessage(`Thank you for your ${procedureType} treatment today, ${patientName}. Please follow your aftercare instructions.`);
      })
      .finally(() => setLoading(false));
  }, [open, encounterId, procedureType, patientName]);

  const send = async () => {
    setSending(true);
    try {
      // In production this would call send-sms or email function
      toast.success(`Aftercare sent via ${channel}`);
      onClose();
    } catch {
      toast.error("Failed to send aftercare");
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
            Chart signed. Send personalized aftercare to {patientName}?
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
          <Button size="sm" onClick={send} disabled={sending || loading}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main EncounterChart ── */
export default function EncounterChart() {
  const { encounterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isReadOnly = role === "front_desk";

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [checkboxValues, setCheckboxValues] = useState<Record<string, string[]>>({});
  const [soapNotes, setSoapNotes] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [drugAlertDismissed, setDrugAlertDismissed] = useState(false);
  const [showAftercareModal, setShowAftercareModal] = useState(false);
  const [safetyWarnings, setSafetyWarnings] = useState<string[]>([]);
  const [photosOpen, setPhotosOpen] = useState(false);

  // Fetch encounter
  const { data: encounter } = useQuery({
    queryKey: ["encounter", encounterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encounters")
        .select("*, patients(first_name, last_name, date_of_birth, gender, allergies, medications), providers:provider_id(first_name, last_name, credentials)")
        .eq("id", encounterId!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!encounterId,
  });

  // Fetch clinical note (for signed encounters / addenda)
  const { data: clinicalNote } = useQuery({
    queryKey: ["clinical-note", encounterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_notes")
        .select("*")
        .eq("appointment_id", encounter?.appointment_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!encounter?.appointment_id,
  });

  // Fetch available templates
  const { data: templates } = useQuery({
    queryKey: ["chart-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_templates")
        .select("*")
        .eq("is_active", true)
        .order("usage_count", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch template sections & fields
  const templateId = encounter?.template_id;
  const { data: sections } = useQuery({
    queryKey: ["template-sections", templateId],
    queryFn: async () => {
      const { data: secs, error: secErr } = await supabase
        .from("chart_template_sections")
        .select("*")
        .eq("template_id", templateId!)
        .order("sort_order");
      if (secErr) throw secErr;

      const sectionIds = secs.map((s: any) => s.id);
      const { data: fields, error: fieldErr } = await supabase
        .from("chart_template_fields")
        .select("*")
        .in("section_id", sectionIds)
        .order("sort_order");
      if (fieldErr) throw fieldErr;

      return secs.map((s: any) => ({
        ...s,
        icon: (s as any).icon || "📋",
        section_key: (s as any).section_key || s.title,
        is_collapsible: (s as any).is_collapsible ?? true,
        fields: fields
          .filter((f: any) => f.section_id === s.id)
          .map((f: any) => ({
            ...f,
            config: typeof f.config === "string" ? JSON.parse(f.config) : (f.config || {}),
            field_key: (f as any).field_key || f.label,
          })),
      })) as TemplateSection[];
    },
    enabled: !!templateId,
  });

  // Fetch order sets
  const { data: orderSets } = useQuery({
    queryKey: ["template-orders", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_template_orders")
        .select("*")
        .eq("template_id", templateId!)
        .order("sort_order");
      if (error) throw error;
      return data as OrderSet[];
    },
    enabled: !!templateId,
  });

  useEffect(() => {
    if (sections) setOpenSections(new Set(sections.map(s => s.id)));
  }, [sections]);

  useEffect(() => {
    if (orderSets) setSelectedOrders(new Set(orderSets.filter(o => o.is_auto_added).map(o => o.id)));
  }, [orderSets]);

  // ─── Completeness calculation ───
  const completeness = useMemo(() => {
    if (!sections) return { percent: 0, filled: 0, total: 0, missingLabels: [] as string[] };
    const requiredFields = sections.flatMap(s => s.fields.filter(f => f.is_required));
    const total = requiredFields.length;
    if (total === 0) return { percent: 100, filled: 0, total: 0, missingLabels: [] };
    const missingLabels: string[] = [];
    const filled = requiredFields.filter(f => {
      const key = f.field_key || f.id;
      const hasValue = f.field_type === "checkbox"
        ? (checkboxValues[key] || []).length > 0
        : !!fieldValues[key]?.trim();
      if (!hasValue) missingLabels.push(f.label);
      return hasValue;
    }).length;
    return { percent: Math.round((filled / total) * 100), filled, total, missingLabels };
  }, [sections, fieldValues, checkboxValues]);

  // ─── Safety field check on sign ───
  const runSafetyCheck = useCallback((): string[] => {
    const warnings: string[] = [];
    const allFields = sections?.flatMap(s => s.fields) || [];

    // Check for blank lot numbers, injection sites
    const safetyFields = allFields.filter(f => {
      const label = f.label.toLowerCase();
      return label.includes("lot") || label.includes("batch") || label.includes("injection site") || label.includes("units") || label.includes("volume");
    });

    for (const f of safetyFields) {
      const key = f.field_key || f.id;
      if (!fieldValues[key]?.trim()) {
        warnings.push(`"${f.label}" is empty — required for safety documentation.`);
      }
    }

    // Check SOAP completeness
    if (!soapNotes.assessment?.trim()) warnings.push("Assessment section is empty.");
    if (!soapNotes.plan?.trim()) warnings.push("Plan section is empty.");

    return warnings;
  }, [sections, fieldValues, soapNotes]);

  // Select template
  const selectTemplate = useMutation({
    mutationFn: async (tplId: string) => {
      const { error } = await supabase
        .from("encounters")
        .update({ template_id: tplId, status: "in_progress" } as any)
        .eq("id", encounterId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", encounterId] });
      toast.success("Template applied");
    },
  });

  const suggestedTemplates = templates?.filter((t: any) => {
    if (!encounter?.chief_complaint) return true;
    const cc = encounter.chief_complaint.toLowerCase();
    const keywords = (t as any).cc_keywords || t.keywords || [];
    return keywords.some((kw: string) => cc.includes(kw.toLowerCase()));
  }).slice(0, 8) || [];

  const updateField = useCallback((key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleCheckbox = useCallback((fieldKey: string, option: string) => {
    setCheckboxValues(prev => {
      const current = prev[fieldKey] || [];
      const next = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, [fieldKey]: next };
    });
  }, []);

  // AI SOAP generation
  const generateAiSoap = async (section: keyof typeof soapNotes) => {
    setAiLoading(prev => ({ ...prev, [section]: true }));
    try {
      const template = templates?.find((t: any) => t.id === templateId);
      const patient = encounter?.patients;
      const context = {
        section,
        template_name: (template as any)?.name || "General",
        template_category: (template as any)?.category || "general",
        patient_name: `${patient?.first_name} ${patient?.last_name}`,
        patient_age: patient?.date_of_birth ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / 31557600000) : null,
        patient_gender: patient?.gender,
        chief_complaint: encounter?.chief_complaint,
        field_responses: { ...fieldValues, ...Object.fromEntries(Object.entries(checkboxValues).map(([k, v]) => [k, v.join(", ")])) },
        allergies: patient?.allergies,
        medications: patient?.medications,
      };

      const { data, error } = await supabase.functions.invoke("ai-chart-soap", { body: context });
      if (error) throw error;
      const text = data?.text || data?.content || "";
      setSoapNotes(prev => ({ ...prev, [section]: text }));
      toast.success(`AI ${section} generated`);
    } catch (err: any) {
      toast.error(`AI generation failed: ${err.message}`);
    } finally {
      setAiLoading(prev => ({ ...prev, [section]: false }));
    }
  };

  // Reopen a signed encounter for editing (status toggle back to in_progress)
  const reopenEncounter = async () => {
    if (!encounterId) return;
    if (!confirm("Reopen this signed chart for editing? The chart will be returned to in-progress status.")) return;
    try {
      setSaving(true);
      const { error: encErr } = await supabase
        .from("encounters")
        .update({ status: "in_progress", signed_at: null, completed_at: null })
        .eq("id", encounterId);
      if (encErr) throw encErr;

      if (clinicalNote?.id) {
        const { error: noteErr } = await supabase
          .from("clinical_notes")
          .update({ status: "draft", signed_at: null })
          .eq("id", clinicalNote.id);
        if (noteErr) throw noteErr;
      }

      toast.success("Chart reopened for editing");
      queryClient.invalidateQueries({ queryKey: ["encounter", encounterId] });
      queryClient.invalidateQueries({ queryKey: ["clinical-note", encounterId] });
    } catch (err: any) {
      toast.error(`Reopen failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Save encounter
  const saveEncounter = async (sign = false) => {
    if (sign) {
      // Safety check
      const warnings = runSafetyCheck();
      if (warnings.length > 0) {
        setSafetyWarnings(warnings);
        return;
      }
      // Completeness gate
      if (completeness.percent < 100 && completeness.total > 0) {
        toast.error(`Cannot sign: ${completeness.total - completeness.filled} required fields still empty.`);
        return;
      }
    }

    setSaving(true);
    try {
      const allFields = sections?.flatMap(s => s.fields) || [];
      const responses = allFields
        .filter(f => fieldValues[f.field_key || f.id] || checkboxValues[f.field_key || f.id]?.length)
        .map(f => {
          const key = f.field_key || f.id;
          const isCheckbox = f.field_type === "checkbox";
          return {
            encounter_id: encounterId!,
            field_id: f.id,
            value: isCheckbox ? (checkboxValues[key] || []).join(", ") : (fieldValues[key] || null),
            ai_suggested: false,
          };
        });

      if (responses.length > 0) {
        const { error: respErr } = await supabase.from("encounter_field_responses").upsert(responses, { onConflict: "encounter_id,field_id" });
        if (respErr) throw respErr;
      }

      if (Object.values(soapNotes).some(v => v.trim())) {
        const { error: noteErr } = await supabase.from("clinical_notes").insert({
          patient_id: encounter!.patient_id,
          provider_id: encounter!.provider_id,
          appointment_id: encounter!.appointment_id,
          subjective: soapNotes.subjective || null,
          objective: soapNotes.objective || null,
          assessment: soapNotes.assessment || null,
          plan: soapNotes.plan || null,
          ai_generated: true,
          status: sign ? "signed" : "draft",
          signed_at: sign ? new Date().toISOString() : null,
        });
        if (noteErr) throw noteErr;
      }

      const { error: encErr } = await supabase
        .from("encounters")
        .update({
          status: sign ? "signed" : "in_progress",
          ...(sign ? { signed_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}),
        })
        .eq("id", encounterId!);
      if (encErr) throw encErr;

      toast.success(sign ? "Chart signed & locked" : "Chart saved as draft");

      if (sign) {
        // Show aftercare modal instead of immediate navigate
        setShowAftercareModal(true);
      }
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Render smart field
  const renderField = (field: TemplateField) => {
    const key = field.field_key || field.id;
    const config = field.config || {};

    switch (field.field_type) {
      case "measurement":
      case "text":
        return (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {field.label} {field.is_required && <span className="text-destructive">*</span>}
              {field.unit && <span className="ml-1 text-xs opacity-60">({field.unit})</span>}
            </Label>
            <Input
              type={field.field_type === "measurement" ? "number" : "text"}
              placeholder={field.placeholder || (config.ref_range ? `Ref: ${config.ref_range}` : "")}
              value={fieldValues[key] || ""}
              onChange={(e) => updateField(key, e.target.value)}
              className="h-9"
            />
          </div>
        );
      case "select":
        return (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {field.label} {field.is_required && <span className="text-destructive">*</span>}
            </Label>
            <Select value={fieldValues[key] || ""} onValueChange={(v) => updateField(key, v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {config.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case "scale": {
        const min = config.min ?? 0;
        const max = config.max ?? 10;
        const val = fieldValues[key] ? parseInt(fieldValues[key]) : min;
        return (
          <div key={key} className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {field.label}
              <span className="ml-2 text-sm font-semibold text-primary">{fieldValues[key] || min}</span>
            </Label>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{config.label_lo || min}</span>
              <Slider min={min} max={max} step={1} value={[val]} onValueChange={([v]) => updateField(key, String(v))} className="flex-1" />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{config.label_hi || max}</span>
            </div>
          </div>
        );
      }
      case "checkbox":
        return (
          <div key={key} className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {field.label} {field.is_required && <span className="text-destructive">*</span>}
            </Label>
            <div className="flex flex-wrap gap-2">
              {config.options?.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer bg-muted/50 rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors">
                  <Checkbox checked={(checkboxValues[key] || []).includes(opt)} onCheckedChange={() => toggleCheckbox(key, opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        );
      default:
        return (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
            <Input value={fieldValues[key] || ""} onChange={(e) => updateField(key, e.target.value)} className="h-9" />
          </div>
        );
    }
  };

  const activeTemplate = templates?.find((t: any) => t.id === templateId) as any;
  const isSigned = encounter?.status === "signed" || isReadOnly;
  const patientMeds = encounter?.patients?.medications || [];
  const patientAllergies = encounter?.patients?.allergies || [];
  const procedureType = activeTemplate?.name || encounter?.chief_complaint || "";

  // Template selection screen
  if (!templateId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/encounters")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Select Chart Template</h1>
            <p className="text-muted-foreground text-sm">
              {encounter?.patients?.first_name} {encounter?.patients?.last_name}
              {encounter?.chief_complaint && ` — ${encounter.chief_complaint}`}
            </p>
          </div>
        </div>

        {encounter?.chief_complaint && suggestedTemplates.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Suggested Templates
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {suggestedTemplates.map((t: any) => (
                <Card key={t.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all" onClick={() => selectTemplate.mutate(t.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{t.icon || "📋"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>
                          {t.usage_count > 0 && <span className="text-[10px] text-muted-foreground">{t.usage_count} uses</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Templates</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates?.map((t: any) => (
              <Card key={t.id} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all" onClick={() => selectTemplate.mutate(t.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{t.icon || "📋"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>
                      <Badge variant="secondary" className="text-[10px] mt-2">{t.category}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Active charting screen
  return (
    <div className="space-y-4">
      {/* Read-only banner for front desk */}
      {isReadOnly && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-primary font-medium">Read-only view — clinical fields cannot be edited by front desk staff</p>
          </CardContent>
        </Card>
      )}

      {/* Header with completeness bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/encounters")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <span className="text-2xl">{activeTemplate?.icon || "📋"}</span>
                {activeTemplate?.name || "Chart"}
                {encounter?.status === "signed" && <Badge className="text-[10px] bg-green-600">Signed</Badge>}
                {isReadOnly && <Badge variant="outline" className="text-[10px]"><Eye className="h-2.5 w-2.5 mr-0.5" />View Only</Badge>}
              </h1>
              <p className="text-sm text-muted-foreground">
                {encounter?.patients?.first_name} {encounter?.patients?.last_name}
                {encounter?.chief_complaint && ` — ${encounter.chief_complaint}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPhotosOpen(true)} className="gap-1">
              <Camera className="h-4 w-4" /> View Photos
            </Button>
            {!isSigned && !isReadOnly && (
              <>
                <Button variant="outline" size="sm" onClick={() => saveEncounter(false)} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveEncounter(true)}
                  disabled={saving || (completeness.total > 0 && completeness.percent < 100)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Sign & Lock
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Completeness bar */}
        {!isSigned && completeness.total > 0 && (
          <div className="flex items-center gap-3 px-1">
            <Progress value={completeness.percent} className="h-2 flex-1" />
            <span className={`text-xs font-medium ${completeness.percent === 100 ? "text-green-600" : "text-muted-foreground"}`}>
              {completeness.percent}% complete ({completeness.filled}/{completeness.total} required)
            </span>
          </div>
        )}
      </div>

      {/* Drug interaction alert */}
      {!drugAlertDismissed && !isSigned && (patientMeds.length > 0 || patientAllergies.length > 0) && (
        <DrugInteractionBanner
          patientMeds={patientMeds}
          allergies={patientAllergies}
          procedureType={procedureType}
          onDismiss={() => setDrugAlertDismissed(true)}
        />
      )}

      {/* Safety warnings dialog */}
      <Dialog open={safetyWarnings.length > 0} onOpenChange={() => setSafetyWarnings([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Safety Check — Missing Fields
            </DialogTitle>
            <DialogDescription>
              The following safety-related fields are incomplete. Please review before signing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {safetyWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm p-2 bg-amber-50 dark:bg-amber-950/20 rounded">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSafetyWarnings([])}>
              Go Back & Fix
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setSafetyWarnings([]);
                // Force sign bypassing safety check
                setSaving(true);
                saveEncounterForce();
              }}
            >
              Sign Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aftercare modal */}
      <AftercareModal
        open={showAftercareModal}
        onClose={() => {
          setShowAftercareModal(false);
          navigate("/encounters");
        }}
        patientName={`${encounter?.patients?.first_name || ""} ${encounter?.patients?.last_name || ""}`}
        procedureType={procedureType}
        encounterId={encounterId!}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart Area */}
        <div className="lg:col-span-2 space-y-4">
          {sections?.map((section) => (
            <Collapsible
              key={section.id}
              open={openSections.has(section.id)}
              onOpenChange={(open) => {
                setOpenSections(prev => {
                  const next = new Set(prev);
                  open ? next.add(section.id) : next.delete(section.id);
                  return next;
                });
              }}
            >
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{section.icon}</span>
                      <span className="font-semibold text-sm">{section.title}</span>
                      {section.is_required && <Badge variant="outline" className="text-[9px]">Required</Badge>}
                    </div>
                    {openSections.has(section.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </CardContent>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-4 pb-4 pt-0">
                    <Separator className="mb-4" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {section.fields.map(renderField)}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}

          {/* SOAP Notes with AI */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">SOAP Note</span>
                {!isSigned && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto text-xs"
                    onClick={() => {
                      generateAiSoap("subjective");
                      generateAiSoap("objective");
                      generateAiSoap("assessment");
                      generateAiSoap("plan");
                    }}
                    disabled={Object.values(aiLoading).some(Boolean)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    AI Generate All
                  </Button>
                )}
              </div>

              {/* Inline helper / status banner */}
              {isReadOnly ? (
                <div className="flex items-start gap-2 rounded-md border border-muted bg-muted/40 p-2.5 text-xs">
                  <Eye className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">View-only access.</span>{" "}
                    Your role can view this chart but cannot edit clinical fields. Ask a provider to make changes.
                  </p>
                </div>
              ) : encounter?.status === "signed" ? (
                <div className="flex items-start justify-between gap-3 rounded-md border border-green-600/30 bg-green-600/5 p-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-700" />
                    <p className="text-muted-foreground">
                      <span className="font-medium text-green-700">Chart signed &amp; locked.</span>{" "}
                      SOAP fields are read-only. To make corrections, add an{" "}
                      <span className="font-medium text-foreground">Addendum</span> below, or reopen the chart to edit.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={reopenEncounter}
                    disabled={saving}
                  >
                    <Unlock className="h-3 w-3 mr-1" />
                    Reopen
                  </Button>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Editing draft.</span>{" "}
                    Use <span className="font-medium">Save Draft</span> to keep working later, or{" "}
                    <span className="font-medium">Sign &amp; Lock</span> when the note is final
                    (this locks all clinical fields — only addenda can be added afterward).
                  </p>
                </div>
              )}

              {(["subjective", "objective", "assessment", "plan"] as const).map((section) => (
                <div key={section} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section}
                    </Label>
                    {!isSigned && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary" onClick={() => generateAiSoap(section)} disabled={aiLoading[section]}>
                        {aiLoading[section] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                        AI Draft
                      </Button>
                    )}
                  </div>
                  <QuickTextExpander
                    value={soapNotes[section]}
                    onChange={(value) => setSoapNotes(prev => ({ ...prev, [section]: value }))}
                    placeholder={`Enter ${section}...`}
                    className="min-h-[80px] text-sm"
                    readOnly={isSigned}
                  />
                </div>
              ))}

              {/* Addendum section for signed notes */}
              {clinicalNote && (
                <AddendumSection noteId={clinicalNote.id} noteStatus={clinicalNote.status} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {encounter && <VitalsPanel encounterId={encounterId!} patientId={encounter.patient_id} />}

          {/* Patient Summary */}
          <Card>
            <CardContent className="p-4">
              <p className="font-semibold text-sm mb-2">Patient</p>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p className="text-foreground font-medium">{encounter?.patients?.first_name} {encounter?.patients?.last_name}</p>
                {encounter?.patients?.date_of_birth && (
                  <p>DOB: {encounter.patients.date_of_birth} · Age: {Math.floor((Date.now() - new Date(encounter.patients.date_of_birth).getTime()) / 31557600000)}y</p>
                )}
                {encounter?.patients?.gender && <p>Gender: {encounter.patients.gender}</p>}
                {patientAllergies.length > 0 && (
                  <p className="text-destructive">⚠ Allergies: {patientAllergies.join(", ")}</p>
                )}
                {patientMeds.length > 0 && (
                  <p>💊 Medications: {patientMeds.join(", ")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Billing Codes */}
          {activeTemplate?.default_icd10?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="font-semibold text-sm mb-2">Billing Codes</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">ICD-10</p>
                    <div className="flex flex-wrap gap-1">
                      {activeTemplate.default_icd10.map((code: string) => (
                        <Badge key={code} variant="outline" className="text-[10px] font-mono">{code}</Badge>
                      ))}
                    </div>
                  </div>
                  {activeTemplate?.default_cpt?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">CPT</p>
                      <div className="flex flex-wrap gap-1">
                        {activeTemplate.default_cpt.map((code: string) => (
                          <Badge key={code} className="text-[10px] font-mono bg-primary/10 text-primary">{code}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Sets */}
          {orderSets && orderSets.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4" /> Orders
                  </p>
                  <Badge variant="secondary" className="text-[10px]">{selectedOrders.size} selected</Badge>
                </div>
                <div className="space-y-2">
                  {orderSets.map((order) => {
                    const typeIcons: Record<string, string> = { lab: "🔬", rx: "💊", appointment: "📅", billing: "💰", system: "📤", marketing: "📱" };
                    return (
                      <label
                        key={order.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedOrders.has(order.id) ? "border-primary/30 bg-primary/5" : "border-transparent hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={selectedOrders.has(order.id)}
                          onCheckedChange={() => {
                            setSelectedOrders(prev => {
                              const next = new Set(prev);
                              next.has(order.id) ? next.delete(order.id) : next.add(order.id);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium flex items-center gap-1.5">
                            <span>{typeIcons[order.order_type] || "📋"}</span>
                            {order.label}
                          </p>
                          {order.description && <p className="text-[10px] text-muted-foreground mt-0.5">{order.description}</p>}
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0">{order.order_type}</Badge>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Admin Notes Panel — visible for front_desk, admin, super_admin */}
          {encounter && (role === "front_desk" || role === "admin" || role === "super_admin") && (
            <AdminNotesPanel encounterId={encounterId!} patientId={encounter.patient_id} />
          )}
        </div>
      </div>

      {/* Clinical Photos modal */}
      <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> Clinical Photos
            </DialogTitle>
          </DialogHeader>
          {encounter?.patient_id ? (
            <PhotoConsentGate
              patientId={encounter.patient_id}
              fallback={
                <div className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Photo viewing is gated by patient consent. Please ensure consent is on file.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPhotosOpen(false);
                      navigate("/front-desk");
                    }}
                    className="gap-1"
                  >
                    <FileText className="h-4 w-4" /> Capture / record consent
                  </Button>
                </div>
              }
            >
              <PhotoGallery patientId={encounter.patient_id} />
            </PhotoConsentGate>
          ) : (
            <p className="text-sm text-muted-foreground p-4">
              Patient information not loaded.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  // Force sign (bypass safety check)
  async function saveEncounterForce() {
    try {
      const allFields = sections?.flatMap(s => s.fields) || [];
      const responses = allFields
        .filter(f => fieldValues[f.field_key || f.id] || checkboxValues[f.field_key || f.id]?.length)
        .map(f => {
          const key = f.field_key || f.id;
          const isCheckbox = f.field_type === "checkbox";
          return {
            encounter_id: encounterId!,
            field_id: f.id,
            value: isCheckbox ? (checkboxValues[key] || []).join(", ") : (fieldValues[key] || null),
            ai_suggested: false,
          };
        });

      if (responses.length > 0) {
        const { error: respErr } = await supabase.from("encounter_field_responses").upsert(responses, { onConflict: "encounter_id,field_id" });
        if (respErr) throw respErr;
      }

      if (Object.values(soapNotes).some(v => v.trim())) {
        const { error: noteErr } = await supabase.from("clinical_notes").insert({
          patient_id: encounter!.patient_id,
          provider_id: encounter!.provider_id,
          appointment_id: encounter!.appointment_id,
          subjective: soapNotes.subjective || null,
          objective: soapNotes.objective || null,
          assessment: soapNotes.assessment || null,
          plan: soapNotes.plan || null,
          ai_generated: true,
          status: "signed",
          signed_at: new Date().toISOString(),
        });
        if (noteErr) throw noteErr;
      }

      const { error: encErr } = await supabase
        .from("encounters")
        .update({ status: "signed", signed_at: new Date().toISOString(), completed_at: new Date().toISOString() })
        .eq("id", encounterId!);
      if (encErr) throw encErr;

      toast.success("Chart signed & locked");
      setShowAftercareModal(true);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }
}

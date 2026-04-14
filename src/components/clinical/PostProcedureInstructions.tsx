// src/components/clinical/PostProcedureInstructions.tsx
//
// Template-based post-procedure instruction library with AI personalization.
// Supports SMS and email delivery to patients.
//
// Props:
//   - treatmentType?: string
//   - patientId?: string
//   - encounterId?: string

import { useState, useEffect } from "react";
import { Send, Wand2, FileText, Loader2, MessageSquare, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface InstructionTemplate {
  id: string;
  treatment_type: string;
  title: string;
  content: string;
  instructions: string[];
  warnings?: string[];
}

interface PostProcedureInstructionsProps {
  treatmentType?: string;
  patientId?: string;
  encounterId?: string;
}

// Default templates for common medspa procedures
const DEFAULT_TEMPLATES: Record<string, InstructionTemplate> = {
  botox: {
    id: "botox",
    treatment_type: "Botox",
    title: "Post-Botox Care Instructions",
    content:
      "Botox results continue to improve over 7-14 days as the neurotoxin takes full effect. Follow these instructions to optimize your results.",
    instructions: [
      "Avoid lying down for 4 hours after treatment",
      "Do not massage or apply pressure to injection sites",
      "Avoid strenuous exercise and heavy lifting for 24 hours",
      "Stay upright and keep head elevated",
      "Do not use saunas, steam rooms, or hot yoga for 48 hours",
      "Avoid excessive sun exposure and heat",
      "Do not undergo facial treatments or extractions for 2 weeks",
      "Wait at least 2 weeks before starting other skin treatments",
    ],
    warnings: [
      "Do not rub or manipulate the treatment area",
      "Avoid alcohol for 24 hours as it may increase bruising",
      "Some redness and swelling is normal and should resolve within hours",
    ],
  },
  filler: {
    id: "filler",
    treatment_type: "Dermal Filler",
    title: "Post-Filler Care Instructions",
    content:
      "Following these guidelines will help minimize swelling and bruising while optimizing your filler results.",
    instructions: [
      "Apply ice for 15 minutes every hour for the first 24 hours",
      "Avoid NSAIDs (ibuprofen, aspirin) for 48 hours to reduce bruising",
      "Avoid blood thinning supplements (fish oil, vitamin E, ginkgo) for 1 week",
      "Do not massage or apply pressure to injection sites for 48 hours",
      "Stay upright for at least 6 hours after treatment",
      "Avoid strenuous exercise for 48 hours",
      "Do not expose skin to excessive heat for 48 hours",
      "Sleep on your back with head elevated for the first night",
    ],
    warnings: [
      "Some swelling and bruising is normal and typically resolves in 7-10 days",
      "Do not drive or operate machinery immediately after treatment",
      "Contact us immediately if you experience severe pain or signs of infection",
    ],
  },
  laser: {
    id: "laser",
    treatment_type: "Laser Treatment",
    title: "Post-Laser Care Instructions",
    content:
      "Laser treatments require strict sun protection and careful skin care to prevent complications and optimize results.",
    instructions: [
      "Apply sunscreen SPF 50+ daily for at least 2 weeks",
      "Avoid direct sun exposure for 48 hours",
      "Wear protective clothing and hats when outdoors",
      "Do not apply makeup for 24 hours unless medically necessary",
      "Use gentle, fragrance-free cleansers only",
      "Avoid hot water and take lukewarm baths instead",
      "Do not swim or use hot tubs for 48 hours",
      "Avoid sweating and strenuous exercise for 48 hours",
      "Do not use retinoids, vitamin C, or active ingredients for 1 week",
      "Avoid chemical peels or other active treatments for 2 weeks",
    ],
    warnings: [
      "Your skin may be sensitive and feel sunburned for 24-48 hours",
      "Do not pick at any peeling or blistering skin",
      "Avoid products with alcohol or fragrance",
      "Contact us immediately if you develop signs of infection or excessive blistering",
    ],
  },
  hrt: {
    id: "hrt",
    treatment_type: "Hormone Replacement Therapy",
    title: "HRT Care and Monitoring Instructions",
    content:
      "Hormone replacement therapy requires consistent medication use and regular monitoring to ensure optimal outcomes.",
    instructions: [
      "Take medication exactly as prescribed",
      "Take medication at the same time each day for consistency",
      "Do not stop taking medication without consulting your provider",
      "Keep all follow-up appointments for blood work and monitoring",
      "Report any new symptoms or side effects immediately",
      "Maintain a symptom journal if possible",
      "Stay well-hydrated and maintain healthy diet",
      "Get regular exercise as recommended by your provider",
      "Attend regular check-ups (as scheduled)",
    ],
    warnings: [
      "Do not adjust your dose without medical supervision",
      "Report unusual symptoms immediately",
      "Some adjustment period may be needed to find optimal dosing",
      "Blood work monitoring is essential for your safety",
    ],
  },
  "glp-1": {
    id: "glp-1",
    treatment_type: "GLP-1 Therapy",
    title: "GLP-1 Injection Instructions",
    content:
      "GLP-1 receptor agonists require proper injection technique and dietary adjustments for optimal results.",
    instructions: [
      "Start with the lowest dose as prescribed",
      "Increase gradually as tolerated per protocol",
      "Inject at the same time each week",
      "Rotate injection sites to prevent lipohypertrophy",
      "Eat smaller portions to manage GI side effects",
      "Stay well-hydrated throughout the day",
      "Take medication with plenty of water",
      "Avoid high-fat meals which may worsen side effects",
      "Monitor blood sugar if diabetic",
      "Report persistent nausea or vomiting",
    ],
    warnings: [
      "Nausea is common initially and usually subsides",
      "Do not exceed prescribed dose without medical approval",
      "Do not skip doses without consulting your provider",
      "Monitor for signs of pancreatitis: severe abdominal pain",
      "Stop and report immediately if vision changes occur",
    ],
  },
};

export function PostProcedureInstructions({
  treatmentType: initialTreatmentType,
  patientId,
  encounterId,
}: PostProcedureInstructionsProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<InstructionTemplate | null>(null);
  const [instructionText, setInstructionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [templates, setTemplates] = useState<InstructionTemplate[]>([]);
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [sendingMethod, setSendingMethod] = useState<"sms" | "email">("sms");

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  // Auto-select template based on treatmentType
  useEffect(() => {
    if (initialTreatmentType && templates.length > 0) {
      const matching = templates.find(
        (t) => t.treatment_type.toLowerCase() === initialTreatmentType.toLowerCase()
      );
      if (matching) {
        selectTemplate(matching);
      }
    }
  }, [initialTreatmentType, templates]);

  // Fetch patient contact info if patientId provided
  useEffect(() => {
    if (patientId) {
      fetchPatientContact();
    }
  }, [patientId]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("instruction_templates")
        .select("*")
        .order("treatment_type");

      if (error) {
        console.warn("Templates table not found, using defaults:", error);
        setTemplates(Object.values(DEFAULT_TEMPLATES));
        return;
      }

      setTemplates((data || []) as InstructionTemplate[]);
    } catch (err) {
      console.warn("Error loading templates, using defaults:", err);
      setTemplates(Object.values(DEFAULT_TEMPLATES));
    }
  };

  const fetchPatientContact = async () => {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("phone, email")
        .eq("id", patientId)
        .single();

      if (!error && data) {
        setPatientPhone(data.phone || "");
        setPatientEmail(data.email || "");
      }
    } catch (err) {
      console.error("Error fetching patient contact:", err);
    }
  };

  const selectTemplate = (template: InstructionTemplate) => {
    setSelectedTemplate(template);
    setInstructionText(template.content);
  };

  const handlePersonalize = async () => {
    if (!instructionText) {
      toast.error("No instruction text to personalize");
      return;
    }

    try {
      setCustomizing(true);

      const { data, error } = await supabase.functions.invoke("ai-aftercare-message", {
        body: {
          procedure_type: selectedTemplate?.treatment_type || "procedure",
          template_text: instructionText,
          patient_id: patientId,
        },
      });

      if (error) {
        toast.error("Failed to personalize instructions");
        return;
      }

      if (data?.personalizedText) {
        setInstructionText(data.personalizedText);
        toast.success("Instructions personalized with AI");
      }
    } catch (err) {
      console.error("Error personalizing:", err);
      toast.error("Failed to personalize instructions");
    } finally {
      setCustomizing(false);
    }
  };

  const handleSend = async (method: "sms" | "email") => {
    if (!instructionText) {
      toast.error("No instructions to send");
      return;
    }

    if (method === "sms" && !patientPhone) {
      toast.error("Patient phone number not available");
      return;
    }

    if (method === "email" && !patientEmail) {
      toast.error("Patient email not available");
      return;
    }

    try {
      setLoading(true);

      if (method === "sms") {
        const { error } = await supabase.functions.invoke("send-sms", {
          body: {
            to: patientPhone,
            message: `Here are your post-procedure instructions:\n\n${instructionText}\n\nContact us if you have any questions.`,
          },
        });

        if (error) {
          toast.error("Failed to send SMS");
          return;
        }

        toast.success("Instructions sent via SMS");
      } else {
        const { error } = await supabase.functions.invoke("send-email", {
          body: {
            to: patientEmail,
            templateId: "post_procedure_instructions",
            data: {
              patientId,
              instructions: instructionText,
              treatmentType: selectedTemplate?.treatment_type || "procedure",
            },
          },
        });

        if (error) {
          toast.error("Failed to send email");
          return;
        }

        toast.success("Instructions sent via email");
      }
    } catch (err) {
      console.error("Error sending:", err);
      toast.error("Failed to send instructions");
    } finally {
      setLoading(false);
    }
  };

  const handleAttachToChart = async () => {
    if (!instructionText || !encounterId) {
      toast.error("Missing encounter or instruction text");
      return;
    }

    try {
      setLoading(true);

      // Create a note entry in the encounter
      const { error } = await (supabase as any)
        .from("encounter_notes")
        .insert({
          encounter_id: encounterId,
          note_type: "post_procedure_instructions",
          content: instructionText,
          created_at: new Date().toISOString(),
        });

      if (error) {
        toast.error("Failed to attach to chart");
        return;
      }

      toast.success("Instructions attached to encounter chart");
    } catch (err) {
      console.error("Error attaching to chart:", err);
      toast.error("Failed to attach to chart");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Post-Procedure Instructions
          </CardTitle>
          <CardDescription>
            Deliver care instructions to optimize patient recovery and outcomes
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Template Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Template</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedTemplate?.id || ""}
            onValueChange={(value) => {
              const template = templates.find((t) => t.id === value);
              if (template) selectTemplate(template);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a procedure type..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.treatment_type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Instructions Editor */}
      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedTemplate.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Instructions List */}
            {selectedTemplate.instructions && selectedTemplate.instructions.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Key Instructions:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {selectedTemplate.instructions.map((instr, idx) => (
                    <li key={idx}>{instr}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {selectedTemplate.warnings && selectedTemplate.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <h4 className="font-semibold text-sm text-amber-900">Important Warnings:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-900">
                  {selectedTemplate.warnings.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Editor */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Instructions Text</label>
              <Textarea
                value={instructionText}
                onChange={(e) => setInstructionText(e.target.value)}
                rows={10}
                placeholder="Edit instructions here..."
                className="font-mono text-sm"
              />
            </div>

            {/* Character Count */}
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{instructionText.length} characters</span>
              <Badge variant="outline">
                {Math.ceil(instructionText.length / 160)} SMS messages
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {selectedTemplate && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handlePersonalize}
            disabled={customizing || !instructionText}
            variant="outline"
            className="gap-2"
          >
            {customizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Personalizing...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                AI Personalize
              </>
            )}
          </Button>

          {/* Send Menu */}
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={loading || !instructionText} className="gap-2">
                <Send className="h-4 w-4" />
                Send to Patient
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Instructions</DialogTitle>
                <DialogDescription>Choose how to deliver these instructions to the patient.</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="sms" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="sms" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    SMS
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="sms" className="space-y-4 mt-4">
                  {patientPhone ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Send instructions to {patientPhone}
                      </p>
                      <Button
                        onClick={() => handleSend("sms")}
                        disabled={loading}
                        className="w-full"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          "Send via SMS"
                        )}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">Patient phone number not available</p>
                  )}
                </TabsContent>

                <TabsContent value="email" className="space-y-4 mt-4">
                  {patientEmail ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Send instructions to {patientEmail}
                      </p>
                      <Button
                        onClick={() => handleSend("email")}
                        disabled={loading}
                        className="w-full"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          "Send via Email"
                        )}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">Patient email not available</p>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          {encounterId && (
            <Button
              onClick={handleAttachToChart}
              disabled={loading}
              variant="outline"
              className="gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Attaching...
                </>
              ) : (
                "Attach to Chart"
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLabExtraction, applyLabsToForm } from "@/hooks/useLabExtraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList, ArrowRight, ArrowLeft, Upload, Sparkles, Loader2, AlertTriangle,
  CheckCircle, FileText, FlaskConical, Brain, Shield, Target, Syringe, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const FOCUS_OPTIONS = [
  { value: "hormone_male", label: "Male Hormone Optimization (TRT)", icon: "💪" },
  { value: "hormone_female", label: "Female Hormone Optimization (HRT)", icon: "🌸" },
  { value: "peptide_gh", label: "GH Secretagogues (Ipamorelin, CJC-1295, Tesamorelin)", icon: "📈" },
  { value: "peptide_glp1", label: "GLP-1 Agents (Semaglutide, Tirzepatide)", icon: "⚖️" },
  { value: "peptide_sexual", label: "Sexual Health (PT-141 / Bremelanotide)", icon: "❤️" },
  { value: "peptide_tissue", label: "Tissue Repair (BPC-157, TB-500)", icon: "🩹" },
  { value: "peptide_cognitive", label: "Cognitive Enhancement (Selank, Semax)", icon: "🧠" },
  { value: "peptide_immune", label: "Immune Support (Thymosin Alpha-1)", icon: "🛡️" },
  { value: "peptide_sleep", label: "Sleep & Recovery (DSIP, Epithalon)", icon: "😴" },
];

const SYMPTOM_OPTIONS: Record<string, string[]> = {
  hormone_male: ["Fatigue/low energy", "Low libido", "Erectile dysfunction", "Brain fog", "Muscle loss", "Weight gain (visceral)", "Mood changes/irritability", "Sleep disturbance", "Night sweats", "Decreased motivation"],
  hormone_female: ["Hot flashes", "Night sweats", "Vaginal dryness", "Low libido", "Fatigue", "Brain fog", "Mood swings", "Weight gain", "Hair thinning", "Sleep disruption", "Anxiety", "Joint pain"],
  peptide_gh: ["Poor sleep quality", "Slow recovery", "Low energy", "Increased body fat", "Decreased muscle mass", "Poor skin elasticity", "Joint stiffness"],
  peptide_glp1: ["Uncontrolled appetite", "Insulin resistance", "Elevated A1c", "Difficulty losing weight", "Elevated fasting glucose", "Metabolic syndrome"],
  peptide_sexual: ["Low libido", "Arousal difficulty", "Sexual dysfunction", "Decreased sensation"],
  peptide_tissue: ["Chronic tendon/ligament injury", "Slow wound healing", "Joint pain", "Post-surgical recovery", "Gut issues (leaky gut)", "Chronic inflammation"],
  peptide_cognitive: ["Brain fog", "Poor focus/concentration", "Memory issues", "Anxiety", "Stress sensitivity", "Mood instability"],
  peptide_immune: ["Frequent infections", "Chronic fatigue", "Autoimmune concerns", "Post-viral syndrome", "Immune dysregulation"],
  peptide_sleep: ["Insomnia", "Poor sleep quality", "Difficulty staying asleep", "Daytime fatigue", "Accelerated aging concerns"],
};

const GOAL_OPTIONS = ["Optimize hormone levels", "Improve energy & vitality", "Weight management", "Improve body composition", "Enhance sexual function", "Improve sleep", "Cognitive performance", "Athletic recovery", "Anti-aging / longevity", "Immune support", "Tissue healing", "Mood stabilization"];

const ROUTE_OPTIONS = ["IM injection", "SubQ injection", "Topical cream/gel", "Oral capsule", "Sublingual", "Pellet implant", "Patch", "Intranasal", "No preference"];

const CONTRAINDICATION_ITEMS = [
  { key: "active_cancer", label: "Active malignancy or cancer history (<5 years)", category: "Universal", severity: "absolute" },
  { key: "abnormal_screening", label: "Abnormal cancer screening (unresolved)", category: "Universal", severity: "absolute" },
  { key: "pregnant", label: "Pregnant or trying to conceive", category: "Universal", severity: "absolute" },
  { key: "breastfeeding", label: "Currently breastfeeding", category: "Universal", severity: "absolute" },
  { key: "psa_elevated", label: "PSA > 4.0 ng/mL (male)", category: "Hormone", severity: "absolute" },
  { key: "prolactin_high", label: "Prolactin > 20 ng/mL (male) or > 25 ng/mL (female)", category: "Hormone", severity: "absolute" },
  { key: "hct_high", label: "Hematocrit > 54% (male) or > 50% (female on T)", category: "Hormone", severity: "absolute" },
  { key: "liver_disease", label: "Active liver disease", category: "Hormone", severity: "relative" },
  { key: "dvt_pe_history", label: "History of DVT/PE or active thrombosis", category: "Hormone", severity: "relative" },
  { key: "uncontrolled_htn", label: "Uncontrolled hypertension", category: "Both", severity: "relative" },
  { key: "pancreatitis", label: "History of pancreatitis (GLP-1 contraindication)", category: "Peptide", severity: "absolute" },
  { key: "medullary_thyroid", label: "Personal/family hx medullary thyroid cancer (GLP-1)", category: "Peptide", severity: "absolute" },
  { key: "ana_positive", label: "ANA positive (Thymosin Alpha-1 contraindication)", category: "Peptide", severity: "absolute" },
  { key: "organ_transplant", label: "Organ transplant on immunosuppression", category: "Peptide", severity: "absolute" },
];

const CORE_LAB_FIELDS = [
  { key: "lab_tt", label: "Total Testosterone", unit: "ng/dL", category: "Hormones" },
  { key: "lab_ft", label: "Free Testosterone", unit: "pg/mL", category: "Hormones" },
  { key: "lab_e2", label: "Estradiol (E2)", unit: "pg/mL", category: "Hormones" },
  { key: "lab_p4", label: "Progesterone", unit: "ng/mL", category: "Hormones" },
  { key: "lab_lh", label: "LH", unit: "mIU/mL", category: "Hormones" },
  { key: "lab_fsh", label: "FSH", unit: "mIU/mL", category: "Hormones" },
  { key: "lab_shbg", label: "SHBG", unit: "nmol/L", category: "Hormones" },
  { key: "lab_prl", label: "Prolactin", unit: "ng/mL", category: "Hormones" },
  { key: "lab_psa", label: "PSA", unit: "ng/mL", category: "Hormones" },
  { key: "lab_dhea", label: "DHEA-S", unit: "mcg/dL", category: "Hormones" },
  { key: "lab_tsh", label: "TSH", unit: "mIU/L", category: "Thyroid" },
  { key: "lab_ft3", label: "Free T3", unit: "pg/mL", category: "Thyroid" },
  { key: "lab_ft4", label: "Free T4", unit: "ng/dL", category: "Thyroid" },
  { key: "lab_hgb", label: "Hemoglobin", unit: "g/dL", category: "CBC" },
  { key: "lab_hct", label: "Hematocrit", unit: "%", category: "CBC" },
  { key: "lab_rbc", label: "RBC", unit: "M/uL", category: "CBC" },
  { key: "lab_glc", label: "Fasting Glucose", unit: "mg/dL", category: "Metabolic" },
  { key: "lab_a1c", label: "HbA1c", unit: "%", category: "Metabolic" },
  { key: "lab_alt", label: "ALT", unit: "U/L", category: "Liver" },
  { key: "lab_ast", label: "AST", unit: "U/L", category: "Liver" },
  { key: "lab_crt", label: "Creatinine", unit: "mg/dL", category: "Renal" },
];

const PEPTIDE_LAB_FIELDS = [
  { key: "lab_igf1", label: "IGF-1", unit: "ng/mL", category: "GH Panel", when: ["peptide_gh"] },
  { key: "lab_igfbp3", label: "IGF-BP3", unit: "mg/L", category: "GH Panel", when: ["peptide_gh"] },
  { key: "lab_fins", label: "Fasting Insulin", unit: "µIU/mL", category: "Metabolic", when: ["peptide_gh", "peptide_glp1"] },
  { key: "lab_crp", label: "hs-CRP", unit: "mg/L", category: "Inflammation", when: ["peptide_gh", "peptide_tissue", "peptide_immune"] },
  { key: "lab_calcitonin", label: "Calcitonin", unit: "pg/mL", category: "GLP-1 Safety", when: ["peptide_glp1"] },
  { key: "lab_b12", label: "Vitamin B12", unit: "pg/mL", category: "Cognitive", when: ["peptide_cognitive"] },
  { key: "lab_folate", label: "Folate", unit: "ng/mL", category: "Cognitive", when: ["peptide_cognitive"] },
  { key: "lab_vitd", label: "Vitamin D (25-OH)", unit: "ng/mL", category: "Cognitive", when: ["peptide_cognitive", "peptide_immune"] },
];

const PEPTIDE_QUAL_FIELDS = [
  { key: "lab_apoe", label: "APOE Genotype", placeholder: "e.g. e3/e4", when: ["peptide_cognitive"] },
  { key: "lab_ana", label: "ANA / anti-dsDNA", placeholder: "Positive / Negative", when: ["peptide_immune"] },
  { key: "lab_rpr", label: "RPR (syphilis screen)", placeholder: "Reactive / Non-reactive", when: ["peptide_immune"] },
  { key: "lab_cd4cd8", label: "CD4/CD8 ratio", placeholder: "e.g. 1.5", when: ["peptide_immune"] },
  { key: "lab_igg", label: "Immunoglobulins IgG/IgA/IgM", placeholder: "e.g. IgG 1200", when: ["peptide_immune"] },
];

const STEPS = [
  { title: "Demographics", icon: ClipboardList },
  { title: "Focus & Symptoms", icon: Target },
  { title: "Labs", icon: FlaskConical },
  { title: "History & Contraindications", icon: Shield },
  { title: "Goals & Review", icon: CheckCircle },
];

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function HormoneIntake() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { extractFromImage, extractFromText } = useLabExtraction();
  const [step, setStep] = useState(0);

  // Step 1: Demographics
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [sex, setSex] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [menoStatus, setMenoStatus] = useState("");
  const [uterineStatus, setUterineStatus] = useState("");

  // Step 2: Focus & Symptoms
  const [focus, setFocus] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);

  // Step 3: Labs
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractedFields, setExtractedFields] = useState<string[]>([]);
  const [labPasteText, setLabPasteText] = useState("");

  // Step 4: History
  const [priorTherapy, setPriorTherapy] = useState("");
  const [medications, setMedications] = useState("");
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Step 5: Goals
  const [goals, setGoals] = useState<string[]>([]);
  const [preferredRoutes, setPreferredRoutes] = useState<string[]>([]);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("id, first_name, last_name, date_of_birth, gender").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("is_active", true).order("last_name");
      return data ?? [];
    },
  });

  const selectedPatientData = patients?.find(p => p.id === selectedPatient);

  // Determine which symptom categories are relevant
  const relevantSymptoms = focus.flatMap(f => SYMPTOM_OPTIONS[f] ?? []);
  const uniqueSymptoms = [...new Set(relevantSymptoms)];

  // Determine which peptide labs to show
  const peptideLabsToShow = PEPTIDE_LAB_FIELDS.filter(f => f.when.some(w => focus.includes(w)));
  const peptideQualToShow = PEPTIDE_QUAL_FIELDS.filter(f => f.when.some(w => focus.includes(w)));

  // Check for hard-stop contraindications
  const absoluteContraindications = CONTRAINDICATION_ITEMS
    .filter(c => c.severity === "absolute" && contraindications.includes(c.key));

  // Lab extraction from uploaded file
  const handleLabUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      let mediaType = file.type;
      let base64: string;

      if (file.type === "application/pdf") {
        // Convert PDF first page to PNG image for AI vision
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/png");
        base64 = dataUrl.split(",")[1];
        mediaType = "image/png";
      } else {
        // Image file — read directly
        const reader = new FileReader();
        base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const data = await extractFromImage.mutateAsync({ mediaType, base64Data: base64 });
      if (data?.labs) {
        const extracted: string[] = [];
        for (const [key, val] of Object.entries(data.labs)) {
          if (val != null && val !== "") {
            setLabValues(prev => ({ ...prev, [`lab_${key}`]: String(val) }));
            extracted.push(`lab_${key}`);
          }
        }
        setExtractedFields(extracted);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to extract labs");
    } finally {
      setExtracting(false);
    }
  }, [extractFromImage]);

  // Lab extraction from pasted text
  const handleLabPaste = async () => {
    if (!labPasteText.trim()) {
      toast.error("Please paste lab data");
      return;
    }
    setExtracting(true);
    try {
      const data = await extractFromText.mutateAsync({ text: labPasteText });
      if (data?.labs) {
        const updated = applyLabsToForm(data.labs, labValues);
        setLabValues(updated);
        const extracted = Object.keys(data.labs).filter(key => data.labs[key] != null).map(k => `lab_${k}`);
        setExtractedFields(extracted);
        setLabPasteText("");
        toast.success(`Applied ${extracted.length} lab values from pasted text`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to extract labs from text");
    } finally {
      setExtracting(false);
    }
  };

  // Submit intake
  const submitIntake = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("Patient required");

      // Build lab data
      const labData: Record<string, any> = {};
      [...CORE_LAB_FIELDS, ...PEPTIDE_LAB_FIELDS].forEach(f => {
        const val = labValues[f.key];
        labData[f.key] = val ? parseFloat(val) : null;
      });
      // Qualitative labs
      PEPTIDE_QUAL_FIELDS.forEach(f => {
        labData[f.key] = labValues[f.key] || null;
      });

      // Update patient with intake data
      await supabase.from("patients").update({
        gender: sex || undefined,
        weight_lbs: weightLbs ? parseFloat(weightLbs) : null,
        height_in: heightIn ? parseFloat(heightIn) : null,
        meno_status: menoStatus || null,
        uterine_status: uterineStatus || null,
        focus,
        symptoms,
        goals,
        preferred_routes: preferredRoutes,
        prior_therapy: priorTherapy || null,
        contraindications,
        medications: medications ? medications.split(",").map(m => m.trim()) : null,
      } as any).eq("id", selectedPatient);

      // Create hormone visit with all lab data
      const { data: visit, error } = await supabase.from("hormone_visits").insert({
        patient_id: selectedPatient,
        provider_id: selectedProvider || null,
        ...labData,
        peptide_categories: focus.filter(f => f.startsWith("peptide_")),
        intake_symptoms: symptoms,
        intake_goals: goals,
        intake_focus: focus,
        peptide_contraindications: contraindications,
      } as any).select().single();
      if (error) throw error;
      return visit;
    },
    onSuccess: (visit) => {
      queryClient.invalidateQueries({ queryKey: ["hormone-visits"] });
      toast.success("Intake submitted successfully");
      // Auto-trigger AI recommendation
      if (visit) generateAiRec(visit);
    },
    onError: (e: any) => toast.error(e.message || "Failed to submit intake"),
  });

  const generateAiRec = async (visit: any) => {
    setAiLoading(true);
    setAiResult(null);
    setAiDialogOpen(true);
    try {
      const { data: priorVisits } = await supabase
        .from("hormone_visits")
        .select("*")
        .eq("patient_id", visit.patient_id)
        .neq("id", visit.id)
        .order("visit_date", { ascending: false })
        .limit(5);

      const { data, error } = await supabase.functions.invoke("ai-hormone-rec", {
        body: {
          patient: { ...selectedPatientData, gender: sex, focus, symptoms, goals, contraindications, prior_therapy: priorTherapy, medications, preferred_routes: preferredRoutes, meno_status: menoStatus, uterine_status: uterineStatus, weight_lbs: weightLbs, height_in: heightIn },
          visit,
          priorVisits: priorVisits ?? [],
        },
      });
      if (error) throw error;
      setAiResult(data);
      await supabase.from("hormone_visits").update({
        ai_recommendation: data.summary,
        ai_sections: data,
      }).eq("id", visit.id);
    } catch (e: any) {
      toast.error(e.message || "AI recommendation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedPatient && !!sex;
      case 1: return focus.length > 0;
      case 2: return true;
      case 3: return true;
      case 4: return goals.length > 0;
      default: return true;
    }
  };

  const coreLabCategories = CORE_LAB_FIELDS.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, typeof CORE_LAB_FIELDS>);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-serif">Hormone & Peptide Intake</h1>
        <p className="text-muted-foreground text-sm">5-step clinical intake with AI-powered lab extraction and recommendations</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-medium transition-colors min-w-0 ${
                i === step ? "bg-primary text-primary-foreground" :
                i < step ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20" :
                "bg-muted text-muted-foreground"
              }`}
            >
              <s.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline truncate">{s.title}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
            {i < STEPS.length - 1 && <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif flex items-center gap-2">
            {(() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
            Step {step + 1}: {STEPS[step].title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* STEP 0: Demographics */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient *</Label>
                  <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>{patients?.map(p => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>{providers?.map(p => <SelectItem key={p.id} value={p.id}>{p.last_name}, {p.first_name} {p.credentials && `(${p.credentials})`}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Biological Sex *</Label>
                  <Select value={sex} onValueChange={setSex}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weight (lbs)</Label>
                  <Input type="number" placeholder="e.g. 185" value={weightLbs} onChange={e => setWeightLbs(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Height (inches)</Label>
                  <Input type="number" placeholder="e.g. 70" value={heightIn} onChange={e => setHeightIn(e.target.value)} />
                </div>
              </div>
              {sex === "female" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-accent/30 rounded-lg">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Menopausal Status</Label>
                    <Select value={menoStatus} onValueChange={setMenoStatus}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre">Pre-menopausal</SelectItem>
                        <SelectItem value="peri">Peri-menopausal</SelectItem>
                        <SelectItem value="post">Post-menopausal</SelectItem>
                        <SelectItem value="surgical">Surgical menopause</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Uterine Status</Label>
                    <Select value={uterineStatus} onValueChange={setUterineStatus}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="intact">Uterus intact</SelectItem>
                        <SelectItem value="hysterectomy">Hysterectomy</SelectItem>
                        <SelectItem value="partial">Partial hysterectomy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 1: Focus & Symptoms */}
          {step === 1 && (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-3">Select all treatment areas of interest:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FOCUS_OPTIONS.map(opt => (
                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${focus.includes(opt.value) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                      <Checkbox checked={focus.includes(opt.value)} onCheckedChange={checked => setFocus(prev => checked ? [...prev, opt.value] : prev.filter(f => f !== opt.value))} />
                      <span className="text-lg">{opt.icon}</span>
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {uniqueSymptoms.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Current Symptoms (select all that apply)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {uniqueSymptoms.map(sym => (
                      <label key={sym} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${symptoms.includes(sym) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        <Checkbox checked={symptoms.includes(sym)} onCheckedChange={checked => setSymptoms(prev => checked ? [...prev, sym] : prev.filter(s => s !== sym))} />
                        {sym}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 2: Labs */}
          {step === 2 && (
            <>
              {/* AI Lab Extraction from Image/PDF */}
              <div className="p-4 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
                <div className="flex items-center gap-3 mb-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Upload Lab Document</p>
                    <p className="text-xs text-muted-foreground">Upload a lab PDF or photo — AI will extract and auto-fill values</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input type="file" accept=".pdf,image/*" onChange={handleLabUpload} disabled={extracting} className="text-sm" />
                  {extracting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                </div>
                {extractedFields.length > 0 && (
                  <p className="text-xs text-primary mt-2">✓ Auto-filled {extractedFields.length} values. Review highlighted fields below.</p>
                )}
              </div>

              {/* Paste Lab Results Section */}
              <div className="p-4 border-2 border-dashed border-accent/30 rounded-lg bg-accent/5">
                <div className="flex items-center gap-3 mb-2">
                  <FlaskConical className="h-5 w-5 text-accent-foreground/60" />
                  <div>
                    <p className="text-sm font-semibold">Paste Lab Results</p>
                    <p className="text-xs text-muted-foreground">Paste CSV, HL7, or text lab data — AI will parse and extract values</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Paste lab results (e.g., Total Testosterone: 450 ng/dL, Free Testosterone: 12 pg/mL, ...)"
                    value={labPasteText}
                    onChange={e => setLabPasteText(e.target.value)}
                    className="min-h-[100px] text-sm font-mono"
                  />
                  <Button
                    onClick={handleLabPaste}
                    disabled={!labPasteText.trim() || extracting}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                    Extract from Text
                  </Button>
                </div>
              </div>

              {/* Core Labs */}
              {Object.entries(coreLabCategories).map(([cat, fields]) => (
                <div key={cat}>
                  <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-muted-foreground border-b pb-1 mb-3">{cat}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {fields.map(f => (
                      <div key={f.key} className="flex items-end gap-1.5">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">{f.label}</Label>
                          <Input
                            type="number" step="any" placeholder="—"
                            value={labValues[f.key] ?? ""}
                            onChange={e => setLabValues(p => ({ ...p, [f.key]: e.target.value }))}
                            className={`h-8 text-sm ${extractedFields.includes(f.key) ? "border-primary bg-primary/5" : ""}`}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground pb-2 min-w-[40px]">{f.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Peptide-specific labs */}
              {peptideLabsToShow.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-primary border-b border-primary/30 pb-1 mb-3">
                    <Syringe className="h-3 w-3 inline mr-1" />Peptide-Specific Labs
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {peptideLabsToShow.map(f => (
                      <div key={f.key} className="flex items-end gap-1.5">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">{f.label}</Label>
                          <Input type="number" step="any" placeholder="—" value={labValues[f.key] ?? ""} onChange={e => setLabValues(p => ({ ...p, [f.key]: e.target.value }))} className={`h-8 text-sm ${extractedFields.includes(f.key) ? "border-primary bg-primary/5" : ""}`} />
                        </div>
                        <span className="text-[10px] text-muted-foreground pb-2 min-w-[40px]">{f.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {peptideQualToShow.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-primary border-b border-primary/30 pb-1 mb-3">Qualitative Labs</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {peptideQualToShow.map(f => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{f.label}</Label>
                        <Input placeholder={f.placeholder} value={labValues[f.key] ?? ""} onChange={e => setLabValues(p => ({ ...p, [f.key]: e.target.value }))} className={`h-8 text-sm ${extractedFields.includes(f.key) ? "border-primary bg-primary/5" : ""}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 3: History & Contraindications */}
          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Medications</Label>
                <Textarea placeholder="List current medications, separated by commas" value={medications} onChange={e => setMedications(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prior Hormone/Peptide Therapy</Label>
                <Textarea placeholder="Describe any prior HRT/TRT/peptide therapy — compounds, doses, duration, response" value={priorTherapy} onChange={e => setPriorTherapy(e.target.value)} rows={3} />
              </div>
              <div>
                <p className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Contraindication Screening
                </p>
                <div className="space-y-2">
                  {CONTRAINDICATION_ITEMS.map(c => (
                    <label key={c.key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${contraindications.includes(c.key) ? (c.severity === "absolute" ? "border-destructive bg-destructive/5" : "border-warning bg-warning/5") : "border-border hover:border-muted-foreground/30"}`}>
                      <Checkbox checked={contraindications.includes(c.key)} onCheckedChange={checked => setContraindications(prev => checked ? [...prev, c.key] : prev.filter(x => x !== c.key))} />
                      <div className="flex-1">
                        <span className="text-sm">{c.label}</span>
                        <div className="flex gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{c.category}</Badge>
                          <Badge variant={c.severity === "absolute" ? "destructive" : "secondary"} className="text-[10px]">{c.severity}</Badge>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {absoluteContraindications.length > 0 && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-sm font-bold text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    ⚠️ HARD STOP — Absolute Contraindications Detected
                  </p>
                  <ul className="mt-2 space-y-1">
                    {absoluteContraindications.map(c => (
                      <li key={c.key} className="text-sm text-destructive">• {c.label}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-destructive/80 mt-2">These contraindications must be resolved before initiating therapy. The AI recommendation will flag these issues.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Additional Notes</Label>
                <Textarea placeholder="Any additional clinical notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {/* STEP 4: Goals & Review */}
          {step === 4 && (
            <>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-3">Treatment Goals:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {GOAL_OPTIONS.map(g => (
                    <label key={g} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${goals.includes(g) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <Checkbox checked={goals.includes(g)} onCheckedChange={checked => setGoals(prev => checked ? [...prev, g] : prev.filter(x => x !== g))} />
                      {g}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-3">Preferred Administration Routes:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROUTE_OPTIONS.map(r => (
                    <label key={r} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${preferredRoutes.includes(r) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <Checkbox checked={preferredRoutes.includes(r)} onCheckedChange={checked => setPreferredRoutes(prev => checked ? [...prev, r] : prev.filter(x => x !== r))} />
                      {r}
                    </label>
                  ))}
                </div>
              </div>

              {/* Review Summary */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <p className="text-sm font-bold">Review Summary</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Patient:</span>
                  <span className="font-medium">{selectedPatientData ? `${selectedPatientData.first_name} ${selectedPatientData.last_name}` : "—"}</span>
                  <span className="text-muted-foreground">Sex:</span>
                  <span className="font-medium capitalize">{sex || "—"}</span>
                  <span className="text-muted-foreground">Focus areas:</span>
                  <span className="font-medium">{focus.length} selected</span>
                  <span className="text-muted-foreground">Symptoms:</span>
                  <span className="font-medium">{symptoms.length} reported</span>
                  <span className="text-muted-foreground">Labs entered:</span>
                  <span className="font-medium">{Object.values(labValues).filter(v => v).length} values</span>
                  <span className="text-muted-foreground">Contraindications:</span>
                  <span className={`font-medium ${absoluteContraindications.length > 0 ? "text-destructive" : ""}`}>
                    {contraindications.length} ({absoluteContraindications.length} absolute)
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
            Next<ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => submitIntake.mutate()} disabled={!canProceed() || submitIntake.isPending} className="gap-1 text-xs sm:text-sm">
            {submitIntake.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="hidden sm:inline">Submit & Generate AI Recommendation</span>
            <span className="sm:hidden">Submit & AI Rec</span>
          </Button>
        )}
      </div>

      {/* AI Result Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Clinical Recommendation
            </DialogTitle>
          </DialogHeader>
          {aiLoading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing intake data, labs, and clinical history...</p>
              <p className="text-xs text-muted-foreground">Applying {focus.filter(f => f.startsWith("peptide_")).length > 0 ? "hormone + peptide" : "hormone"} clinical decision framework</p>
            </div>
          ) : aiResult ? (
            <div className="space-y-4">
              {absoluteContraindications.length > 0 && (
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1">⚠️ Contraindication Alert</p>
                  <p className="text-sm text-destructive">{absoluteContraindications.map(c => c.label).join("; ")}</p>
                </div>
              )}
              <div className="p-3 bg-primary/5 rounded-lg">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Summary</p>
                <p className="text-sm">{aiResult.summary}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Treatment Recommendation</p>
                <p className="text-sm whitespace-pre-wrap">{aiResult.treatment_recommendation}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Monitoring Plan</p>
                <p className="text-sm whitespace-pre-wrap">{aiResult.monitoring_plan}</p>
              </div>
              <div className="p-3 bg-destructive/5 rounded-lg">
                <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1">Risk Flags & Escalation</p>
                <p className="text-sm whitespace-pre-wrap">{aiResult.risk_flags}</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => { setAiDialogOpen(false); navigate(`/physician-approval?visit=${submitIntake.data?.id || ""}`); }}>
                  <ShieldCheck className="h-4 w-4 mr-2" />Route to Physician Approval
                </Button>
                <Button variant="outline" onClick={() => { setAiDialogOpen(false); navigate("/hormone-visits"); }}>
                  <FileText className="h-4 w-4 mr-2" />View in Hormone Labs
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No recommendation generated</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

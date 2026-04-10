import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight, ArrowLeft, Upload, Loader2, AlertTriangle,
  CheckCircle, FlaskConical, Shield, Target, ClipboardList, Activity,
  FileSignature, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

// ── Reuse constants from HormoneIntake ────────────────────────────────────────
const FOCUS_OPTIONS = [
  { value: "hormone_male", label: "Male Hormone Optimization (TRT)", icon: "💪" },
  { value: "hormone_female", label: "Female Hormone Optimization (HRT)", icon: "🌸" },
  { value: "peptide_gh", label: "GH Secretagogues", icon: "📈" },
  { value: "peptide_glp1", label: "GLP-1 Agents (Semaglutide)", icon: "⚖️" },
  { value: "peptide_sexual", label: "Sexual Health (PT-141)", icon: "❤️" },
  { value: "peptide_tissue", label: "Tissue Repair (BPC-157)", icon: "🩹" },
  { value: "peptide_cognitive", label: "Cognitive Enhancement", icon: "🧠" },
  { value: "peptide_immune", label: "Immune Support", icon: "🛡️" },
  { value: "peptide_sleep", label: "Sleep & Recovery", icon: "😴" },
];

const SYMPTOM_OPTIONS: Record<string, string[]> = {
  hormone_male: ["Fatigue/low energy", "Low libido", "Erectile dysfunction", "Brain fog", "Muscle loss", "Weight gain", "Mood changes", "Sleep disturbance"],
  hormone_female: ["Hot flashes", "Night sweats", "Vaginal dryness", "Low libido", "Fatigue", "Brain fog", "Mood swings", "Weight gain", "Hair thinning", "Sleep disruption"],
  peptide_gh: ["Poor sleep quality", "Slow recovery", "Low energy", "Increased body fat", "Decreased muscle mass"],
  peptide_glp1: ["Uncontrolled appetite", "Insulin resistance", "Difficulty losing weight", "Metabolic syndrome"],
  peptide_sexual: ["Low libido", "Arousal difficulty", "Sexual dysfunction"],
  peptide_tissue: ["Chronic tendon/ligament injury", "Slow wound healing", "Joint pain", "Gut issues"],
  peptide_cognitive: ["Brain fog", "Poor focus", "Memory issues", "Anxiety", "Stress sensitivity"],
  peptide_immune: ["Frequent infections", "Chronic fatigue", "Autoimmune concerns"],
  peptide_sleep: ["Insomnia", "Poor sleep quality", "Difficulty staying asleep", "Daytime fatigue"],
};

const GOAL_OPTIONS = ["Optimize hormone levels", "Improve energy & vitality", "Weight management", "Improve body composition", "Enhance sexual function", "Improve sleep", "Cognitive performance", "Athletic recovery", "Anti-aging / longevity", "Immune support"];

const CONTRAINDICATION_ITEMS = [
  { key: "active_cancer", label: "Active cancer or cancer history (<5 years)", severity: "absolute" },
  { key: "pregnant", label: "Pregnant or trying to conceive", severity: "absolute" },
  { key: "breastfeeding", label: "Currently breastfeeding", severity: "absolute" },
  { key: "liver_disease", label: "Active liver disease", severity: "relative" },
  { key: "dvt_pe_history", label: "History of DVT/PE or blood clots", severity: "relative" },
  { key: "uncontrolled_htn", label: "Uncontrolled high blood pressure", severity: "relative" },
  { key: "pancreatitis", label: "History of pancreatitis", severity: "absolute" },
];

const CORE_LAB_FIELDS = [
  { key: "lab_tt", label: "Total Testosterone", unit: "ng/dL" },
  { key: "lab_ft", label: "Free Testosterone", unit: "pg/mL" },
  { key: "lab_e2", label: "Estradiol (E2)", unit: "pg/mL" },
  { key: "lab_tsh", label: "TSH", unit: "mIU/L" },
  { key: "lab_hgb", label: "Hemoglobin", unit: "g/dL" },
  { key: "lab_hct", label: "Hematocrit", unit: "%" },
  { key: "lab_a1c", label: "HbA1c", unit: "%" },
  { key: "lab_psa", label: "PSA", unit: "ng/mL" },
];

const STEPS = [
  { title: "About You", icon: ClipboardList },
  { title: "Treatment Interest", icon: Target },
  { title: "Lab Results", icon: FlaskConical },
  { title: "Health History", icon: Shield },
  { title: "Goals & Consent", icon: FileSignature },
];

export default function RemoteIntake() {
  const [searchParams] = useSearchParams();
  const clinicName = searchParams.get("clinic") || "Meridian Wellness";
  
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Step 0: Demographics
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [menoStatus, setMenoStatus] = useState("");

  // Step 1: Focus & Symptoms
  const [focus, setFocus] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);

  // Step 2: Labs
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractedCount, setExtractedCount] = useState(0);

  // Step 3: History
  const [medications, setMedications] = useState("");
  const [priorTherapy, setPriorTherapy] = useState("");
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");

  // Step 4: Goals & Consent
  const [goals, setGoals] = useState<string[]>([]);
  const [consentChecked, setConsentChecked] = useState(false);
  const [teleHealthConsent, setTeleHealthConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const relevantSymptoms = [...new Set(focus.flatMap(f => SYMPTOM_OPTIONS[f] ?? []))];
  const absoluteFlags = CONTRAINDICATION_ITEMS.filter(c => c.severity === "absolute" && contraindications.includes(c.key));

  // Lab upload
  const handleLabUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      let mediaType = file.type;
      let base64: string;
      if (file.type === "application/pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const ab = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: ab }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        base64 = canvas.toDataURL("image/png").split(",")[1];
        mediaType = "image/png";
      } else {
        const reader = new FileReader();
        base64 = await new Promise<string>((res, rej) => { reader.onload = () => res((reader.result as string).split(",")[1]); reader.onerror = rej; reader.readAsDataURL(file); });
      }
      const { data, error } = await supabase.functions.invoke("ai-extract-labs", { body: { mediaType, base64Data: base64 } });
      if (error) throw error;
      if (data?.labs) {
        let count = 0;
        for (const [key, val] of Object.entries(data.labs)) {
          if (val != null && val !== "") { setLabValues(p => ({ ...p, [`lab_${key}`]: String(val) })); count++; }
        }
        setExtractedCount(count);
        toast.success(`Extracted ${count} lab values`);
      }
    } catch (err: any) { toast.error(err.message || "Failed to extract labs"); }
    finally { setExtracting(false); }
  }, []);

  // Submit
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Create patient
      const { data: patient, error: pErr } = await supabase.from("patients").insert({
        first_name: firstName, last_name: lastName, email, phone, date_of_birth: dob || null,
        gender: sex || null, is_active: true,
      } as any).select("id").single();
      if (pErr) throw pErr;

      // Build lab data
      const labData: Record<string, any> = {};
      CORE_LAB_FIELDS.forEach(f => { const v = labValues[f.key]; labData[f.key] = v ? parseFloat(v) : null; });

      // Create intake form record
      await supabase.from("intake_forms").insert({
        patient_id: patient.id,
        form_type: "remote_hormone",
        responses: {
          focus, symptoms, goals, medications, priorTherapy, contraindications, allergies,
          sex, weightLbs, heightIn, menoStatus,
          consent: { general: consentChecked, telehealth: teleHealthConsent, timestamp: new Date().toISOString() },
        },
        submitted_at: new Date().toISOString(),
      });

      // Create hormone visit with labs
      await supabase.from("hormone_visits").insert({
        patient_id: patient.id,
        ...labData,
        intake_symptoms: symptoms, intake_goals: goals, intake_focus: focus,
        peptide_categories: focus.filter(f => f.startsWith("peptide_")),
        peptide_contraindications: contraindications,
      } as any);

      setSubmitted(true);
      toast.success("Intake submitted successfully!");
    } catch (err: any) { toast.error(err.message || "Submission failed"); }
    finally { setSubmitting(false); }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return firstName.trim() && lastName.trim() && email.trim() && sex;
      case 1: return focus.length > 0;
      case 2: return true;
      case 3: return true;
      case 4: return goals.length > 0 && consentChecked && teleHealthConsent;
      default: return true;
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="py-12 space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-2xl font-serif font-bold">Intake Complete!</h2>
            <p className="text-muted-foreground">
              Thank you for completing your intake form. Our clinical team will review your information and reach out to schedule your consultation.
            </p>
            <p className="text-sm text-muted-foreground">You can close this window.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-serif font-semibold text-lg">{clinicName}</h1>
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-primary">REMOTE INTAKE</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                i === step ? "bg-primary text-accent-foreground" :
                i < step ? "bg-primary/10 text-primary" :
                "bg-muted text-muted-foreground"
              }`}>
                <s.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.title}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
              {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              {(() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
              {STEPS[step].title}
            </CardTitle>
            <CardDescription>
              {step === 0 && "Please provide your basic information."}
              {step === 1 && "What areas of health are you looking to optimize?"}
              {step === 2 && "Upload or enter your most recent lab results."}
              {step === 3 && "Help us understand your medical background."}
              {step === 4 && "Select your goals and review consent."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* STEP 0: Demographics */}
            {step === 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Biological Sex *</Label>
                    <Select value={sex} onValueChange={setSex}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Weight (lbs)</Label>
                    <Input type="number" value={weightLbs} onChange={e => setWeightLbs(e.target.value)} placeholder="185" />
                  </div>
                </div>
                {sex === "female" && (
                  <div className="p-4 bg-primary/5 rounded-lg">
                    <Label>Menopausal Status</Label>
                    <Select value={menoStatus} onValueChange={setMenoStatus}>
                      <SelectTrigger className="mt-2"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre">Pre-menopausal</SelectItem>
                        <SelectItem value="peri">Peri-menopausal</SelectItem>
                        <SelectItem value="post">Post-menopausal</SelectItem>
                        <SelectItem value="surgical">Surgical menopause</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* STEP 1: Focus & Symptoms */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-1 gap-2">
                  {FOCUS_OPTIONS.map(opt => (
                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${focus.includes(opt.value) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                      <Checkbox checked={focus.includes(opt.value)} onCheckedChange={c => setFocus(p => c ? [...p, opt.value] : p.filter(f => f !== opt.value))} />
                      <span className="text-lg">{opt.icon}</span>
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {relevantSymptoms.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-3">Current Symptoms</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {relevantSymptoms.map(sym => (
                        <label key={sym} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${symptoms.includes(sym) ? "border-primary bg-primary/5" : "border-border"}`}>
                          <Checkbox checked={symptoms.includes(sym)} onCheckedChange={c => setSymptoms(p => c ? [...p, sym] : p.filter(s => s !== sym))} />
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
                <div className="p-4 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
                  <div className="flex items-center gap-3 mb-2">
                    <Upload className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Upload Lab Results</p>
                      <p className="text-xs text-muted-foreground">Upload a PDF or photo of your labs — AI will extract values automatically</p>
                    </div>
                  </div>
                  <Input type="file" accept=".pdf,image/*" onChange={handleLabUpload} disabled={extracting} className="text-sm" />
                  {extracting && <div className="flex items-center gap-2 mt-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing your lab document…</div>}
                  {extractedCount > 0 && <p className="text-xs text-primary mt-2 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Auto-filled {extractedCount} values</p>}
                </div>

                <p className="text-sm text-muted-foreground">Or enter values manually:</p>
                <div className="grid grid-cols-2 gap-3">
                  {CORE_LAB_FIELDS.map(f => (
                    <div key={f.key} className="flex items-end gap-1.5">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">{f.label}</Label>
                        <Input type="number" step="any" placeholder="—" value={labValues[f.key] ?? ""} onChange={e => setLabValues(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <span className="text-[10px] text-muted-foreground pb-2">{f.unit}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Don't worry if you don't have all values — we can order labs after your consultation.</p>
              </>
            )}

            {/* STEP 3: History */}
            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Current Medications</Label>
                  <Textarea placeholder="List any medications you're currently taking" value={medications} onChange={e => setMedications(e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Known Allergies</Label>
                  <Input placeholder="e.g. Penicillin, Sulfa" value={allergies} onChange={e => setAllergies(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Prior Hormone or Peptide Therapy</Label>
                  <Textarea placeholder="Describe any prior hormone/peptide therapy, including compounds used and how you responded" value={priorTherapy} onChange={e => setPriorTherapy(e.target.value)} rows={3} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" /> Health Screening
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">Please check any that apply:</p>
                  <div className="space-y-2">
                    {CONTRAINDICATION_ITEMS.map(c => (
                      <label key={c.key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${contraindications.includes(c.key) ? "border-destructive bg-destructive/5" : "border-border"}`}>
                        <Checkbox checked={contraindications.includes(c.key)} onCheckedChange={ch => setContraindications(p => ch ? [...p, c.key] : p.filter(x => x !== c.key))} />
                        <span className="text-sm">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {absoluteFlags.length > 0 && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                    <p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Important Notice</p>
                    <p className="mt-1 text-xs">Some of your responses may require additional evaluation before treatment. Our medical team will discuss these with you during your consultation.</p>
                  </div>
                )}
              </>
            )}

            {/* STEP 4: Goals & Consent */}
            {step === 4 && (
              <>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-3">What are your treatment goals?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {GOAL_OPTIONS.map(g => (
                      <label key={g} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${goals.includes(g) ? "border-primary bg-primary/5" : "border-border"}`}>
                        <Checkbox checked={goals.includes(g)} onCheckedChange={c => setGoals(p => c ? [...p, g] : p.filter(x => x !== g))} />
                        {g}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Consent */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="text-sm font-bold">Consent & Acknowledgments</h3>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox checked={consentChecked} onCheckedChange={c => setConsentChecked(!!c)} className="mt-0.5" />
                    <span className="text-xs text-muted-foreground">
                      I consent to the collection and use of my health information for clinical evaluation. I understand that this intake form does not establish a patient-provider relationship and that all treatment recommendations will be reviewed by a licensed physician.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox checked={teleHealthConsent} onCheckedChange={c => setTeleHealthConsent(!!c)} className="mt-0.5" />
                    <span className="text-xs text-muted-foreground">
                      I consent to receive telehealth services and understand that telehealth consultations have limitations compared to in-person visits. I acknowledge that my provider may determine that an in-person visit is necessary.
                    </span>
                  </label>
                </div>

                {/* Summary */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-2 text-sm">
                  <p className="font-bold">Summary</p>
                  <div className="grid grid-cols-2 gap-1">
                    <span className="text-muted-foreground">Name:</span><span>{firstName} {lastName}</span>
                    <span className="text-muted-foreground">Email:</span><span>{email}</span>
                    <span className="text-muted-foreground">Focus areas:</span><span>{focus.length} selected</span>
                    <span className="text-muted-foreground">Symptoms:</span><span>{symptoms.length} reported</span>
                    <span className="text-muted-foreground">Lab values:</span><span>{Object.values(labValues).filter(Boolean).length} entered</span>
                    <span className="text-muted-foreground">Goals:</span><span>{goals.length} selected</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canProceed() || submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting…</> : <><CheckCircle className="h-4 w-4 mr-1" /> Submit Intake</>}
            </Button>
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Powered by {clinicName} • Your data is encrypted and HIPAA-compliant
        </p>
      </div>
    </div>
  );
}

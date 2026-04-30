import { useState, useCallback, useEffect } from "react";
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
  FileSignature, Sparkles, Clock, Heart,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import SignaturePad from "@/components/SignaturePad";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ── Constants ─────────────────────────────────────────────────────────────────
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

const GENERAL_CONSENT_TEXT = `I consent to the collection and use of my health information for clinical evaluation and treatment planning. I understand that this intake form does not establish a patient-provider relationship and that all treatment recommendations will be reviewed by a licensed physician. I acknowledge that the information I have provided is accurate and complete to the best of my knowledge. I understand that I may withdraw my consent at any time by contacting the clinic.`;

const TELEHEALTH_CONSENT_TEXT = `I consent to receive telehealth services, which involve the delivery of healthcare services using electronic communications, information technology, or other means. I understand that telehealth consultations have limitations compared to in-person visits, including the inability to perform a physical examination. I acknowledge that my provider may determine that an in-person visit is necessary and that I have the right to refuse telehealth services at any time. I understand that electronic communications carry some level of risk and that the clinic uses reasonable safeguards to protect my information.`;

const STEPS = [
  { title: "Welcome", icon: Heart },
  { title: "About You", icon: ClipboardList },
  { title: "Treatment Interest", icon: Target },
  { title: "Lab Results", icon: FlaskConical },
  { title: "Health History", icon: Shield },
  { title: "Goals & Consent", icon: FileSignature },
];

// Phase 3 #7: PII no longer goes to localStorage.
// - For tokened invitations: drafts are stored server-side via the
//   submit-remote-intake edge function. Patient data never persists on disk.
// - For ref-mode / cold-form (no token): drafts use sessionStorage so PII at
//   least clears when the tab closes. Cross-session resume isn't possible
//   without a token, which is the right tradeoff — there's no secure way to
//   key persistent storage to an anonymous patient.
//
// SAVE_KEY is still used as the sessionStorage key for the no-token path.
const SAVE_KEY = "meridian_intake_draft";

// Shape of what we serialize for either path. Keeping it explicit makes it
// obvious at a glance which fields cross the trust boundary.
type IntakeDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  sex: string;
  step: number;
};

export default function RemoteIntake() {
  const [searchParams] = useSearchParams();
  const clinicName = searchParams.get("clinic") || "Meridian Wellness";
  const invitationToken = searchParams.get("token");
  const refPatientId = searchParams.get("ref");
  const focusParam = searchParams.get("focus");

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Step 1: Demographics
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [menoStatus, setMenoStatus] = useState("");

  // Step 2: Focus & Symptoms
  const [focus, setFocus] = useState<string[]>(focusParam ? focusParam.split(",") : []);
  const [symptoms, setSymptoms] = useState<string[]>([]);

  // Step 3: Labs
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [extractedCount, setExtractedCount] = useState(0);

  // Step 4: History
  const [medications, setMedications] = useState("");
  const [priorTherapy, setPriorTherapy] = useState("");
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");

  // Step 5: Goals & Consent
  const [goals, setGoals] = useState<string[]>([]);
  const [generalSig, setGeneralSig] = useState<string | null>(null);
  const [telehealthSig, setTelehealthSig] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const relevantSymptoms = [...new Set(focus.flatMap(f => SYMPTOM_OPTIONS[f] ?? []))];
  const absoluteFlags = CONTRAINDICATION_ITEMS.filter(c => c.severity === "absolute" && contraindications.includes(c.key));
  const progressPct = Math.round((step / (STEPS.length - 1)) * 100);

  // Mark invitation as opened + pre-fill from patient record
  useEffect(() => {
    if (invitationToken) {
      // Mark opened via edge function (service role handles RLS)
      supabase.functions.invoke("submit-remote-intake", {
        body: { _markOpened: true, token: invitationToken },
      }).catch(() => {});
      // Actually let's use a simpler approach — the edge function is for submission.
      // We'll just track opened status when they submit.
    }
    if (invitationToken) {
      // Fetch patient demographics via edge function (no anon table access needed)
      const fetchPatient = async () => {
        try {
          const { data } = await supabase.functions.invoke("submit-remote-intake", {
            body: { _lookupToken: true, token: invitationToken },
          });
          if (data?.invitation?.patients) {
            const p = data.invitation.patients as any;
            if (p.first_name && !firstName) setFirstName(p.first_name);
            if (p.last_name && !lastName) setLastName(p.last_name);
            if (p.email && !email) setEmail(p.email);
            if (p.phone && !phone) setPhone(p.phone);
            if (p.date_of_birth && !dob) setDob(p.date_of_birth);
            if (p.gender && !sex) setSex(p.gender);
          }
        } catch { /* ignore */ }
      };
      fetchPatient();
    }
  }, [invitationToken, refPatientId]);

  // Phase 3 #7: restore draft on mount. Server-side load if we have a
  // token; otherwise fall back to sessionStorage for the no-token flow.
  useEffect(() => {
    let cancelled = false;
    const applyDraft = (d: Partial<IntakeDraft>) => {
      if (cancelled) return;
      if (d.firstName && !firstName) setFirstName(d.firstName);
      if (d.lastName && !lastName) setLastName(d.lastName);
      if (d.email && !email) setEmail(d.email);
      if (d.phone && !phone) setPhone(d.phone);
      if (d.dob && !dob) setDob(d.dob);
      if (d.sex && !sex) setSex(d.sex);
      if (d.step) setStep(d.step);
    };

    if (invitationToken) {
      supabase.functions
        .invoke("submit-remote-intake", {
          body: { _loadDraft: true, token: invitationToken },
        })
        .then(({ data }) => {
          if (data?.draft) applyDraft(data.draft as Partial<IntakeDraft>);
        })
        .catch(() => { /* silent — start fresh */ });
    } else {
      try {
        const saved = sessionStorage.getItem(SAVE_KEY);
        if (saved) applyDraft(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationToken]);

  // Phase 3 #7: save draft on field/step change. Server-side via edge
  // function when tokened; otherwise sessionStorage. Saves are best-effort —
  // a failed save shouldn't block the patient from filling the form.
  useEffect(() => {
    if (step <= 0 || !email) return;
    const draft: IntakeDraft = { firstName, lastName, email, phone, dob, sex, step };

    if (invitationToken) {
      // Debounce-light: a single fire-and-forget per dependency change is
      // fine at this scale (form has ~5 steps, ~20 inputs total). If we
      // observe traffic spikes, switch to a setTimeout debounce.
      supabase.functions
        .invoke("submit-remote-intake", {
          body: { _saveDraft: true, token: invitationToken, draft_data: draft },
        })
        .catch(() => { /* silent — already in memory */ });
    } else {
      try {
        sessionStorage.setItem(SAVE_KEY, JSON.stringify(draft));
      } catch { /* ignore */ }
    }
  }, [step, firstName, lastName, email, phone, dob, sex, invitationToken]);

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

  // Submit via secure edge function
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-remote-intake", {
        body: {
          firstName, lastName, email, phone, dob, sex,
          weightLbs, heightIn, menoStatus,
          focus, symptoms, goals, medications, priorTherapy,
          contraindications, allergies, labValues,
          generalSig, telehealthSig,
          generalConsentText: GENERAL_CONSENT_TEXT,
          telehealthConsentText: TELEHEALTH_CONSENT_TEXT,
          userAgent: navigator.userAgent,
          invitation_token: invitationToken || undefined,
          existing_patient_id: refPatientId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Phase 3 #7: clean up local + remote draft state. The submit edge
      // function already deletes the server-side draft on completion, but
      // we make a defensive call here in case the user re-opens the form
      // mid-submit. sessionStorage cleanup covers the no-token flow.
      try { sessionStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      // Server-side already cleaned by the submit handler.
      setSubmitted(true);
      toast.success("Intake submitted successfully!");
    } catch (err: any) { toast.error(err.message || "Submission failed"); }
    finally { setSubmitting(false); }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return true; // Welcome
      case 1: return firstName.trim() && lastName.trim() && email.trim() && sex;
      case 2: return focus.length > 0;
      case 3: return true;
      case 4: return true;
      case 5: return goals.length > 0 && !!generalSig && !!telehealthSig;
      default: return true;
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center shadow-lg">
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/5">
      {/* Branded Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-serif font-semibold text-lg">{clinicName}</h1>
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-primary">REMOTE INTAKE</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">{progressPct}% Complete</Badge>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-primary rounded-full h-1.5 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-shrink-0">
                <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  i === step ? "bg-primary text-primary-foreground" :
                  i < step ? "bg-primary/10 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  <s.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{i}</span>
                </div>
                {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              {(() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
              {STEPS[step].title}
            </CardTitle>
            <CardDescription>
              {step === 0 && `Welcome to ${clinicName}. Let's get you started.`}
              {step === 1 && "Please provide your basic information."}
              {step === 2 && "What areas of health are you looking to optimize?"}
              {step === 3 && "Upload or enter your most recent lab results."}
              {step === 4 && "Help us understand your medical background."}
              {step === 5 && "Select your goals and sign your consent forms."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* STEP 0: Welcome */}
            {step === 0 && (
              <div className="space-y-6 py-4">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Activity className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-serif font-bold">Welcome to {clinicName}</h2>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    This intake form will help our clinical team understand your health goals and create a personalized treatment plan.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <Clock className="h-5 w-5 text-primary mx-auto mb-2" />
                    <p className="text-xs font-semibold">~10 minutes</p>
                    <p className="text-[11px] text-muted-foreground">Estimated time</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <Shield className="h-5 w-5 text-primary mx-auto mb-2" />
                    <p className="text-xs font-semibold">HIPAA Secure</p>
                    <p className="text-[11px] text-muted-foreground">Encrypted & private</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <FlaskConical className="h-5 w-5 text-primary mx-auto mb-2" />
                    <p className="text-xs font-semibold">AI-Assisted</p>
                    <p className="text-[11px] text-muted-foreground">Lab auto-extraction</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">Your progress is saved automatically. You can return to finish later.</p>
              </div>
            )}

            {/* STEP 1: Demographics */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="intake-first-name">First Name *</Label>
                    <Input id="intake-first-name" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-last-name">Last Name *</Label>
                    <Input id="intake-last-name" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" autoComplete="family-name" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="intake-email">Email *</Label>
                    <Input id="intake-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-phone">Phone</Label>
                    <Input id="intake-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" autoComplete="tel" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="intake-dob">Date of Birth</Label>
                    <Input id="intake-dob" type="date" value={dob} onChange={e => setDob(e.target.value)} autoComplete="bday" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-sex">Biological Sex *</Label>
                    <Select value={sex} onValueChange={setSex}>
                      <SelectTrigger id="intake-sex"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-weight">Weight (lbs)</Label>
                    <Input id="intake-weight" type="number" value={weightLbs} onChange={e => setWeightLbs(e.target.value)} placeholder="185" />
                  </div>
                </div>
                {sex === "female" && (
                  <div className="p-4 bg-primary/5 rounded-lg">
                    <Label htmlFor="intake-meno">Menopausal Status</Label>
                    <Select value={menoStatus} onValueChange={setMenoStatus}>
                      <SelectTrigger id="intake-meno" className="mt-2"><SelectValue placeholder="Select" /></SelectTrigger>
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

            {/* STEP 2: Focus & Symptoms */}
            {step === 2 && (
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

            {/* STEP 3: Labs */}
            {step === 3 && (
              <>
                <div className="p-4 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5">
                  <div className="flex items-center gap-3 mb-2">
                    <Upload className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Upload Lab Results</p>
                      <p className="text-xs text-muted-foreground">Upload a PDF or photo — AI will extract values automatically</p>
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
                        <Label htmlFor={`intake-${f.key}`} className="text-xs text-muted-foreground">{f.label}</Label>
                        <Input id={`intake-${f.key}`} type="number" step="any" placeholder="—" value={labValues[f.key] ?? ""} onChange={e => setLabValues(p => ({ ...p, [f.key]: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <span className="text-[11px] text-muted-foreground pb-2">{f.unit}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Don't worry if you don't have all values — we can order labs after your consultation.</p>
              </>
            )}

            {/* STEP 4: History */}
            {step === 4 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="intake-medications">Current Medications</Label>
                  <Textarea id="intake-medications" placeholder="List any medications you're currently taking" value={medications} onChange={e => setMedications(e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-allergies">Known Allergies</Label>
                  <Input id="intake-allergies" placeholder="e.g. Penicillin, Sulfa" value={allergies} onChange={e => setAllergies(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-prior-therapy">Prior Hormone or Peptide Therapy</Label>
                  <Textarea id="intake-prior-therapy" placeholder="Describe any prior therapy, including compounds and response" value={priorTherapy} onChange={e => setPriorTherapy(e.target.value)} rows={3} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" /> Health Screening
                  </p>
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
                    <p className="mt-1 text-xs">Some of your responses may require additional evaluation before treatment.</p>
                  </div>
                )}
              </>
            )}

            {/* STEP 5: Goals & Consent */}
            {step === 5 && (
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

                {/* E-Consent with Signatures */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold flex items-center gap-2"><FileSignature className="h-4 w-4 text-primary" /> E-Consent & Signature</h3>

                  {/* General Consent */}
                  <Collapsible>
                    <div className={`border rounded-lg overflow-hidden ${generalSig ? "border-primary" : "border-border"}`}>
                      <CollapsibleTrigger className="w-full p-3 flex items-center justify-between text-left hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          {generalSig ? <CheckCircle className="h-4 w-4 text-primary" /> : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                          <span className="text-sm font-medium">General Consent</span>
                        </div>
                        <Badge variant={generalSig ? "default" : "outline"} className="text-[11px]">{generalSig ? "Signed" : "Required"}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-3 border-t">
                          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{GENERAL_CONSENT_TEXT}</p>
                          <SignaturePad onSignature={setGeneralSig} width={360} height={120} />
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>

                  {/* Telehealth Consent */}
                  <Collapsible>
                    <div className={`border rounded-lg overflow-hidden ${telehealthSig ? "border-primary" : "border-border"}`}>
                      <CollapsibleTrigger className="w-full p-3 flex items-center justify-between text-left hover:bg-muted/50">
                        <div className="flex items-center gap-2">
                          {telehealthSig ? <CheckCircle className="h-4 w-4 text-primary" /> : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                          <span className="text-sm font-medium">Telehealth Consent</span>
                        </div>
                        <Badge variant={telehealthSig ? "default" : "outline"} className="text-[11px]">{telehealthSig ? "Signed" : "Required"}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-3 border-t">
                          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{TELEHEALTH_CONSENT_TEXT}</p>
                          <SignaturePad onSignature={setTelehealthSig} width={360} height={120} />
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
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
                    <span className="text-muted-foreground">Consents:</span><span>{[generalSig, telehealthSig].filter(Boolean).length}/2 signed</span>
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

        <p className="text-center text-[11px] text-muted-foreground">
          Powered by {clinicName} • Your data is encrypted and HIPAA-compliant
        </p>
      </div>
    </div>
  );
}

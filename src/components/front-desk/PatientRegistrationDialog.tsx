import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  UserPlus, Loader2, AlertTriangle, CheckCircle2, Sparkles, Shield,
  Phone, Mail, Heart, Users,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientRegistrationDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("basic");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [form, setForm] = useState({
    first_name: "", last_name: "", preferred_name: "", email: "", phone: "",
    date_of_birth: "", gender: "", sex_at_birth: "", gender_identity: "",
    referral_source: "", preferred_contact_channel: "sms",
    emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relationship: "",
    address: "", city: "", state: "", zip: "",
  });

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  // QA #44 — names allow letters, spaces, hyphens, apostrophes, periods only.
  // 1-50 chars after trim. Empty trimmed = invalid (covers QA #43 required gate).
  const validateName = (raw: string): string | null => {
    const v = raw.trim();
    if (!v) return "Required";
    if (v.length > 50) return "Must be 50 characters or fewer";
    if (!/^[a-zA-Z][a-zA-Z\s\-'.]*$/.test(v)) {
      return "Letters, spaces, hyphens, apostrophes only";
    }
    return null;
  };

  // QA #47 — email is optional, but if provided must be a valid format.
  const validateEmail = (raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "Invalid email format (e.g. you@example.com)";
    if (v.length > 255) return "Email too long";
    return null;
  };

  const firstNameError = form.first_name.length > 0 ? validateName(form.first_name) : null;
  const lastNameError = form.last_name.length > 0 ? validateName(form.last_name) : null;
  const emailError = validateEmail(form.email);
  const basicInfoValid =
    form.first_name.trim().length > 0 &&
    form.last_name.trim().length > 0 &&
    !validateName(form.first_name) &&
    !validateName(form.last_name) &&
    !emailError;

  const runAiValidation = async () => {
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-patient-registration", {
        body: {
          firstName: form.first_name,
          lastName: form.last_name,
          email: form.email,
          phone: form.phone,
          dob: form.date_of_birth,
        },
      });
      if (error) throw error;
      setValidation(data?.validation || null);
      setDuplicates(data?.duplicates || []);
      if (data?.validation?.overallRisk === "high" || (data?.duplicates?.length ?? 0) > 0) {
        toast.warning("Review AI findings before saving");
      } else {
        toast.success("Validation passed — no issues found");
      }
    } catch {
      toast.error("AI validation unavailable — you can still save");
    }
    setValidating(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // QA #42 — block duplicate patient registration. Match on email, on
      // normalized phone, or on (first_name + last_name + dob) — those are
      // the standard keys that identify the same person across re-entries.
      const email = form.email.trim().toLowerCase();
      const phoneDigits = form.phone.trim().replace(/\D/g, "");
      const first = form.first_name.trim();
      const last = form.last_name.trim();
      const dob = form.date_of_birth || "";

      const orFilters: string[] = [];
      if (email) orFilters.push(`email.ilike.${email}`);
      if (phoneDigits.length >= 10) orFilters.push(`phone.ilike.%${phoneDigits.slice(-10)}%`);

      let dupes: any[] = [];
      if (orFilters.length > 0) {
        const { data } = await supabase
          .from("patients")
          .select("id, first_name, last_name, email, phone, date_of_birth")
          .or(orFilters.join(","))
          .limit(5);
        dupes = data ?? [];
      }
      // Name+DOB exact match needs a separate query (no OR support across two AND'd fields).
      if (first && last && dob) {
        const { data } = await supabase
          .from("patients")
          .select("id, first_name, last_name, email, phone, date_of_birth")
          .ilike("first_name", first)
          .ilike("last_name", last)
          .eq("date_of_birth", dob)
          .limit(5);
        for (const p of data ?? []) {
          if (!dupes.find(d => d.id === p.id)) dupes.push(p);
        }
      }

      if (dupes.length > 0) {
        const d = dupes[0];
        const reason =
          d.email && email && d.email.toLowerCase() === email ? `email ${email}` :
          d.phone && phoneDigits && d.phone.replace(/\D/g, "").endsWith(phoneDigits.slice(-10)) ? `phone ${form.phone}` :
          `name ${d.first_name} ${d.last_name} + DOB ${d.date_of_birth}`;
        throw new Error(`A patient with the same ${reason} already exists. Open the existing record instead of creating a duplicate.`);
      }

      const { error } = await supabase.from("patients").insert({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        preferred_name: form.preferred_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        sex_at_birth: form.sex_at_birth || null,
        gender_identity: form.gender_identity || null,
        referral_source: form.referral_source || null,
        preferred_contact_channel: form.preferred_contact_channel,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["all-patients-fd"] });
      toast.success("Patient registered successfully");
      onOpenChange(false);
      resetForm();
    },
    // Surface the real DB/RLS error message so future schema mismatches
    // (the QA #19 root cause was a column that didn't exist) don't get
    // swallowed into a generic "Failed to register patient" toast.
    onError: (err: Error) => toast.error("Failed to register patient", {
      description: err.message || "Unknown error",
    }),
  });

  const resetForm = () => {
    setForm({
      first_name: "", last_name: "", preferred_name: "", email: "", phone: "",
      date_of_birth: "", gender: "", sex_at_birth: "", gender_identity: "",
      referral_source: "", preferred_contact_channel: "sms",
      emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relationship: "",
      address: "", city: "", state: "", zip: "",
    });
    setValidation(null);
    setDuplicates([]);
    setTab("basic");
  };

  const allIssues = [
    ...(validation?.emailIssues || []),
    ...(validation?.phoneIssues || []),
    ...(validation?.dobIssues || []),
    ...(validation?.duplicateWarnings || []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />Register New Patient
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="contact">Contact & Emergency</TabsTrigger>
            <TabsTrigger value="review">AI Review</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name *</Label>
                <Input
                  value={form.first_name}
                  onChange={e => set("first_name", e.target.value)}
                  aria-invalid={!!firstNameError}
                  className={firstNameError ? "border-destructive focus-visible:ring-destructive" : ""}
                  maxLength={50}
                  required
                />
                {firstNameError && <p className="text-[11px] text-destructive">{firstNameError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name *</Label>
                <Input
                  value={form.last_name}
                  onChange={e => set("last_name", e.target.value)}
                  aria-invalid={!!lastNameError}
                  className={lastNameError ? "border-destructive focus-visible:ring-destructive" : ""}
                  maxLength={50}
                  required
                />
                {lastNameError && <p className="text-[11px] text-destructive">{lastNameError}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preferred Name</Label>
              <Input value={form.preferred_name} onChange={e => set("preferred_name", e.target.value)} placeholder="Nickname or preferred name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  aria-invalid={!!emailError}
                  className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
                  placeholder="patient@example.com"
                  inputMode="email"
                  maxLength={255}
                />
                {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date of Birth</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sex at Birth</Label>
                <select aria-label="Sex at birth" value={form.sex_at_birth} onChange={e => set("sex_at_birth", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="intersex">Intersex</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Gender Identity</Label>
                <Input value={form.gender_identity} onChange={e => set("gender_identity", e.target.value)} placeholder="e.g. Non-binary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Referral Source</Label>
              <select aria-label="Referral source" value={form.referral_source} onChange={e => set("referral_source", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="google">Google Search</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="friend_family">Friend/Family</option>
                <option value="physician">Physician Referral</option>
                <option value="walk_in">Walk-In</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => setTab("contact")}
              disabled={!basicInfoValid}
              title={basicInfoValid ? "" : "Fill in First Name and Last Name to continue"}
            >
              Next →
            </Button>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4 mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />Address
            </h3>
            <div className="space-y-1.5">
              <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street address" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" />
              <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="State" />
              <Input value={form.zip} onChange={e => set("zip", e.target.value)} placeholder="ZIP" />
            </div>

            <Separator />

            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Heart className="h-3 w-3" />Emergency Contact
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={form.emergency_contact_name} onChange={e => set("emergency_contact_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input type="tel" value={form.emergency_contact_phone} onChange={e => set("emergency_contact_phone", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Relationship</Label>
              <select aria-label="Emergency contact relationship" value={form.emergency_contact_relationship} onChange={e => set("emergency_contact_relationship", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="sibling">Sibling</option>
                <option value="child">Child</option>
                <option value="friend">Friend</option>
                <option value="other">Other</option>
              </select>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />Preferred Contact Channel</Label>
              <select aria-label="Preferred contact channel" value={form.preferred_contact_channel} onChange={e => set("preferred_contact_channel", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="phone">Phone Call</option>
              </select>
            </div>

            <Button className="w-full" onClick={() => { setTab("review"); runAiValidation(); }}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />Run AI Validation & Review
            </Button>
          </TabsContent>

          <TabsContent value="review" className="space-y-4 mt-4">
            {validating ? (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground mt-2">AI is checking for duplicates and validating…</p>
              </div>
            ) : (
              <>
                {/* Duplicates */}
                {duplicates.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-1">
                      <Users className="h-3 w-3" />Possible Duplicates ({duplicates.length})
                    </h3>
                    {duplicates.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div>
                          <p className="text-sm font-medium">{d.first_name} {d.last_name}</p>
                          <p className="text-xs text-muted-foreground">{d.email || d.phone || "No contact"} {d.date_of_birth && `• DOB: ${d.date_of_birth}`}</p>
                        </div>
                        <Badge variant="destructive" className="text-[11px]">Possible Match</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Findings */}
                {validation && allIssues.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />AI Findings
                    </h3>
                    {allIssues.map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded bg-warning/5 border border-warning/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                        <p className="text-xs">{issue}</p>
                      </div>
                    ))}
                  </div>
                )}

                {validation && allIssues.length === 0 && duplicates.length === 0 && (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-success" />
                    <p className="text-sm font-medium mt-2">All checks passed</p>
                    <p className="text-xs text-muted-foreground">No duplicates or validation issues found</p>
                  </div>
                )}

                {!validation && !validating && (
                  <div className="py-6 text-center">
                    <Shield className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground mt-2">Click "Run AI Validation" to check</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={runAiValidation}>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />Run AI Validation
                    </Button>
                  </div>
                )}

                <Separator />

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || !form.first_name.trim() || !form.last_name.trim()}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                    Register Patient
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, UserCircle, Plus, X, Upload, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

export default function ProviderProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [bio, setBio] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [credentials, setCredentials] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [npi, setNpi] = useState("");
  const [marketplaceBio, setMarketplaceBio] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [newModality, setNewModality] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchProvider = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("providers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setProvider(data);
        setBio(data.bio || "");
        setSpecialty(data.specialty || "");
        setCredentials(data.credentials || "");
        setPhone(data.phone || "");
        setLicenseNumber(data.license_number || "");
        setNpi(data.npi || "");
        setMarketplaceBio(data.marketplace_bio || "");
        setModalities(data.modalities || []);
        setAvatarUrl(data.headshot_url || null);
      }
      setLoading(false);
    };
    fetchProvider();
  }, [user]);

  const completeness = useMemo(() => {
    const fields = [bio, specialty, credentials, phone, licenseNumber, npi, marketplaceBio];
    const filled = fields.filter((f) => f.trim().length > 0).length;
    const hasModalities = modalities.length > 0;
    const hasAvatar = !!avatarUrl;
    const total = fields.length + 2;
    const filledTotal = filled + (hasModalities ? 1 : 0) + (hasAvatar ? 1 : 0);
    return { percent: Math.round((filledTotal / total) * 100), filled: filledTotal, total };
  }, [bio, specialty, credentials, phone, licenseNumber, npi, marketplaceBio, modalities, avatarUrl]);

  const handleSave = async () => {
    if (!provider) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("providers")
        .update({ bio, specialty, credentials, phone, license_number: licenseNumber, npi, marketplace_bio: marketplaceBio, modalities })
        .eq("id", provider.id);
      if (error) throw error;
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !provider) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${provider.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("clinical-photos").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("clinical-photos").getPublicUrl(path);
      const url = urlData.publicUrl;
      await supabase.from("providers").update({ headshot_url: url }).eq("id", provider.id);
      setAvatarUrl(url);
      toast({ title: "Photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleAiBioDraft = async () => {
    if (!provider) return;
    setAiDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-coach", {
        body: {
          mode: "bio_draft",
          provider_id: provider.id,
          context: {
            first_name: provider.first_name,
            last_name: provider.last_name,
            specialty,
            credentials,
            modalities,
          },
        },
      });
      if (error) throw error;
      if (data?.bio) setMarketplaceBio(data.bio);
      toast({ title: "AI bio drafted", description: "Review and edit the generated bio below." });
    } catch (err: any) {
      toast({ title: "AI draft failed", description: err.message, variant: "destructive" });
    } finally {
      setAiDrafting(false);
    }
  };

  const addModality = () => {
    const trimmed = newModality.trim();
    if (trimmed && !modalities.includes(trimmed)) {
      setModalities([...modalities, trimmed]);
      setNewModality("");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!provider) {
    return <BasicProfileForm />;
  }

  // (placeholder so the original block below stays intact — return statement
  // continues with the provider-flavored form)
  if (false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <UserCircle className="mx-auto h-10 w-10 mb-2" />
            <p>No provider record is linked to your account.</p>
            <p className="text-xs">Ask an admin to link your user to a provider record.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="text-lg">{provider.first_name?.[0]}{provider.last_name?.[0]}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {uploadingPhoto ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Upload className="h-5 w-5 text-white" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
            <p className="text-sm text-muted-foreground">
              {provider.first_name} {provider.last_name} — Edit your professional information
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      {/* Completeness bar */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          {completeness.percent === 100 ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">Profile completeness</p>
              <span className="text-sm font-bold">{completeness.percent}%</span>
            </div>
            <Progress value={completeness.percent} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground shrink-0">{completeness.filled}/{completeness.total} fields</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Professional Details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Professional Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Specialty</Label>
              <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Aesthetic Medicine" />
            </div>
            <div className="space-y-1.5">
              <Label>Credentials</Label>
              <Input value={credentials} onChange={(e) => setCredentials(e.target.value)} placeholder="e.g. RN, NP, PA-C" />
            </div>
            <div className="space-y-1.5">
              <Label>License Number</Label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="State license #" />
            </div>
            <div className="space-y-1.5">
              <Label>NPI</Label>
              <Input value={npi} onChange={(e) => setNpi(e.target.value)} placeholder="National Provider Identifier" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contact number" />
            </div>
          </CardContent>
        </Card>

        {/* Bio & Marketplace */}
        <Card>
          <CardHeader><CardTitle className="text-base">Bio & Marketplace</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Professional bio…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Marketplace Bio</Label>
                <Button variant="ghost" size="sm" onClick={handleAiBioDraft} disabled={aiDrafting} className="h-7 text-xs gap-1">
                  {aiDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  AI Draft
                </Button>
              </div>
              <Textarea value={marketplaceBio} onChange={(e) => setMarketplaceBio(e.target.value)} placeholder="Public-facing bio for the marketplace…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Modalities</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {modalities.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1">
                    {m}
                    <button onClick={() => setModalities(modalities.filter((x) => x !== m))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newModality}
                  onChange={(e) => setNewModality(e.target.value)}
                  placeholder="Add modality"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModality())}
                />
                <Button variant="outline" size="sm" onClick={addModality} type="button"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── BasicProfileForm ────────────────────────────────────────────────────────
// Used for users without a `providers` row (super_admin, admin, billing, etc.)
// Edits the public.profiles + auth user_metadata directly.

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Anchorage", "America/Honolulu", "UTC", "Europe/London", "Europe/Berlin",
  "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney",
];

function BasicProfileForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("display_name, phone, title, timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName(data.display_name || "");
        setPhone(data.phone || "");
        setTitle(data.title || "");
        setTimezone(data.timezone || "America/Los_Angeles");
      } else {
        // Seed display_name from auth metadata if profile row missing
        const meta = (user.user_metadata || {}) as Record<string, string>;
        setDisplayName(meta.full_name || meta.name || (user.email?.split("@")[0] ?? ""));
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert(
        { user_id: user.id, display_name: displayName, phone, title, timezone },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      // Sync display_name to auth.users metadata so it appears in admin lists
      await supabase.auth.updateUser({ data: { full_name: displayName } });
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your name, phone, and personal preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-5 w-5" /> Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-name">Full name</Label>
            <Input
              id="bp-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Aloysius Fobi"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-title">Title</Label>
            <Input
              id="bp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Owner / Practice Manager"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-phone">Phone</Label>
            <Input
              id="bp-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-tz">Personal timezone</Label>
            <select
              id="bp-tz"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used for displaying dates and times in your view. Clinic-wide
              default is set in Settings.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email || ""} disabled />
            <p className="text-xs text-muted-foreground">
              To change your sign-in email, contact a super admin.
            </p>
          </div>
          <Button onClick={save} disabled={saving || !displayName.trim()}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

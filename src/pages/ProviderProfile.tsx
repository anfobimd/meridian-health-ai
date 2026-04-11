import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, UserCircle, Plus, X } from "lucide-react";

export default function ProviderProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<any>(null);

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
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
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
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    if (!provider) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("providers")
        .update({
          bio,
          specialty,
          credentials,
          phone,
          license_number: licenseNumber,
          npi,
          marketplace_bio: marketplaceBio,
          modalities,
        })
        .eq("id", provider.id);
      if (error) throw error;
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!provider) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
          <p className="text-sm text-muted-foreground">
            {provider.first_name} {provider.last_name} — Edit your professional information
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Professional Details</CardTitle>
          </CardHeader>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bio & Marketplace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Professional bio…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Marketplace Bio</Label>
              <Textarea value={marketplaceBio} onChange={(e) => setMarketplaceBio(e.target.value)} placeholder="Public-facing bio for the marketplace…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Modalities</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {modalities.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1">
                    {m}
                    <button onClick={() => setModalities(modalities.filter((x) => x !== m))}>
                      <X className="h-3 w-3" />
                    </button>
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
                <Button variant="outline" size="sm" onClick={addModality} type="button">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

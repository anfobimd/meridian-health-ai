import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, Loader2, QrCode, Trash2 } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const fetchFactors = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setMfaFactors(data.totp || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFactors();
  }, []);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Meridian Authenticator",
      });
      if (error) throw error;
      setQrUri(data.totp.uri);
      setFactorId(data.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerify = async () => {
    if (!factorId || !verifyCode) return;
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      toast({ title: "MFA Enabled", description: "Two-factor authentication is now active." });
      setQrUri(null);
      setFactorId(null);
      setVerifyCode("");
      fetchFactors();
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const handleUnenroll = async (id: string) => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast({ title: "MFA Removed" });
      fetchFactors();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const verifiedFactors = mfaFactors.filter((f) => f.status === "verified");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account security</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication (MFA)
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account with a TOTP authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading MFA status…
            </div>
          ) : (
            <>
              {/* Current factors */}
              {verifiedFactors.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">MFA is enabled</span>
                    <Badge variant="outline" className="text-primary border-primary/20">Active</Badge>
                  </div>
                  {verifiedFactors.map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{f.friendly_name || "TOTP"}</p>
                        <p className="text-xs text-muted-foreground">
                          Added {new Date(f.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleUnenroll(f.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No authenticator configured. Enable MFA to protect your account.
                </p>
              )}

              {/* Enrollment flow */}
              {qrUri ? (
                <div className="space-y-4 rounded-md border p-4">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium">Scan this QR code with your authenticator app</p>
                    <div className="bg-white p-3 rounded-lg">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                        alt="MFA QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center max-w-sm break-all">
                      Or manually enter: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{qrUri}</code>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totp-code">Enter the 6-digit code from your app</Label>
                    <div className="flex gap-2">
                      <Input
                        id="totp-code"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="w-32 text-center font-mono text-lg tracking-widest"
                      />
                      <Button onClick={handleVerify} disabled={verifyCode.length !== 6 || verifying}>
                        {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Verify & Enable
                      </Button>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setQrUri(null); setFactorId(null); setVerifyCode(""); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={handleEnroll} disabled={enrolling}>
                  {enrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <QrCode className="mr-2 h-4 w-4" />
                  {verifiedFactors.length > 0 ? "Add Another Device" : "Enable MFA"}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

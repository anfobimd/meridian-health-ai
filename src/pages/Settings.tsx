import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, Loader2, QrCode, Trash2, KeyRound, Check, X, UserCog } from "lucide-react";

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, label: "Weak", color: "bg-destructive" };
  if (score === 2) return { score: 40, label: "Fair", color: "bg-orange-500" };
  if (score === 3) return { score: 60, label: "Good", color: "bg-yellow-500" };
  if (score === 4) return { score: 80, label: "Strong", color: "bg-primary" };
  return { score: 100, label: "Excellent", color: "bg-green-500" };
}

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

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmitPassword = newPassword.length >= 8 && passwordsMatch && strength.score >= 60;

  const handlePasswordChange = async () => {
    if (!canSubmitPassword) return;
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password Updated", description: "Your password has been changed successfully." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

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

      {/* Password Change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password. Must be at least 8 characters with good strength.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
            {newPassword.length > 0 && (
              <div className="space-y-1.5">
                <Progress value={strength.score} className="h-1.5" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Strength: <span className="font-medium">{strength.label}</span></span>
                  <div className="flex gap-2">
                    <span className={`flex items-center gap-0.5 ${newPassword.length >= 8 ? "text-primary" : "text-muted-foreground"}`}>
                      {newPassword.length >= 8 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} 8+ chars
                    </span>
                    <span className={`flex items-center gap-0.5 ${/[A-Z]/.test(newPassword) ? "text-primary" : "text-muted-foreground"}`}>
                      {/[A-Z]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} Uppercase
                    </span>
                    <span className={`flex items-center gap-0.5 ${/[0-9]/.test(newPassword) ? "text-primary" : "text-muted-foreground"}`}>
                      {/[0-9]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} Number
                    </span>
                    <span className={`flex items-center gap-0.5 ${/[^A-Za-z0-9]/.test(newPassword) ? "text-primary" : "text-muted-foreground"}`}>
                      {/[^A-Za-z0-9]/.test(newPassword) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} Symbol
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            {confirmPassword.length > 0 && (
              <p className={`text-xs flex items-center gap-1 ${passwordsMatch ? "text-primary" : "text-destructive"}`}>
                {passwordsMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {passwordsMatch ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </div>
          <Button onClick={handlePasswordChange} disabled={!canSubmitPassword || changingPassword}>
            {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* MFA Card */}
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

      {/* Admin: Reset User Password */}
      {role === "admin" && <AdminPasswordReset />}
    </div>
  );
}

function AdminPasswordReset() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{id: string; email: string}[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => {
      if (data) setUsers(data.map(p => ({ id: p.user_id, email: p.display_name || p.user_id })));
    });
  }, []);

  const handleReset = async () => {
    if (!selectedUserId || !newPw) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { target_user_id: selectedUserId, new_password: newPw },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Password reset", description: "User password has been updated" });
      setNewPw("");
      setSelectedUserId("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(newPw);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" />Admin: Reset User Password</CardTitle>
        <CardDescription>Reset any user's password (admin only)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Select User</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
          >
            <option value="">Choose a user…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </div>
        <div>
          <Label>New Password</Label>
          <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
          {newPw && (
            <div className="mt-2 space-y-1">
              <Progress value={strength.score} className="h-1.5" />
              <p className="text-xs text-muted-foreground">{strength.label}</p>
            </div>
          )}
        </div>
        <Button onClick={handleReset} disabled={!selectedUserId || newPw.length < 8 || loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reset Password
        </Button>
      </CardContent>
    </Card>
  );
}

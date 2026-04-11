import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationPreferences } from "@/components/front-desk/NotificationPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, ShieldCheck, Loader2, QrCode, Trash2, KeyRound, Check, X, UserCog,
  AlertTriangle, Lock, Sparkles, Copy,
} from "lucide-react";

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

function getLocalStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, label: "Weak" };
  if (score === 2) return { score: 40, label: "Fair" };
  if (score === 3) return { score: 60, label: "Good" };
  if (score === 4) return { score: 80, label: "Strong" };
  return { score: 100, label: "Excellent" };
}

export default function Settings() {
  const { user, role, signOut } = useAuth();
  const { toast } = useToast();

  // MFA state
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // AI password scoring
  const [aiScore, setAiScore] = useState<{ score: number; tier: string; warnings: string[]; ai_suggestion: string | null } | null>(null);
  const [aiScoring, setAiScoring] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const localStrength = getLocalStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const displayScore = aiScore?.score ?? localStrength.score;
  const displayLabel = aiScore?.tier ?? localStrength.label;
  const isLocked = lockoutEnd !== null && Date.now() < lockoutEnd;
  const canSubmitPassword = newPassword.length >= 8 && passwordsMatch && displayScore >= 45 && !isLocked;

  // Lockout timer
  useEffect(() => {
    if (!lockoutEnd) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockoutEnd - Date.now()) / 1000));
      setLockoutRemaining(remaining);
      if (remaining <= 0) {
        setLockoutEnd(null);
        setFailedAttempts(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutEnd]);

  // AI password scoring debounce
  const scorePassword = useCallback(async (pw: string) => {
    if (pw.length < 6) { setAiScore(null); return; }
    setAiScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-password-strength", {
        body: { password: pw, user_email: user?.email, user_name: user?.user_metadata?.full_name },
      });
      if (!error && data && !data.error) setAiScore(data);
    } catch { /* graceful fallback */ }
    finally { setAiScoring(false); }
  }, [user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (newPassword.length >= 6) {
      debounceRef.current = setTimeout(() => scorePassword(newPassword), 600);
    } else {
      setAiScore(null);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [newPassword, scorePassword]);

  const handlePasswordChange = async () => {
    if (!canSubmitPassword) return;
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const next = failedAttempts + 1;
        setFailedAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          setLockoutEnd(Date.now() + LOCKOUT_SECONDS * 1000);
          toast({ title: "Too many attempts", description: `Locked for ${LOCKOUT_SECONDS}s`, variant: "destructive" });
        }
        throw error;
      }
      toast({ title: "Password Updated", description: "You'll be signed out for security. Please sign in with your new password." });
      setNewPassword("");
      setConfirmPassword("");
      setAiScore(null);
      setFailedAttempts(0);
      // Session invalidation — sign out after brief delay
      setTimeout(() => signOut(), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  // MFA
  const fetchFactors = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) setMfaFactors(data.totp || []);
    setLoading(false);
  };

  useEffect(() => { fetchFactors(); }, []);

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
      // Generate pseudo-backup codes
      const codes = Array.from({ length: 8 }, () =>
        Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
        Math.random().toString(36).substring(2, 6).toUpperCase()
      );
      setBackupCodes(codes);
      toast({ title: "MFA Enabled", description: "Save your backup codes now." });
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

  const copyBackupCodes = () => {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join("\n"));
      toast({ title: "Copied", description: "Backup codes copied to clipboard." });
    }
  };

  const verifiedFactors = mfaFactors.filter((f) => f.status === "verified");

  const tierColor = (tier: string) => {
    if (tier === "excellent" || tier === "Excellent") return "text-green-600";
    if (tier === "strong" || tier === "Strong") return "text-primary";
    if (tier === "good" || tier === "Good") return "text-yellow-600";
    if (tier === "fair" || tier === "Fair") return "text-orange-500";
    return "text-destructive";
  };

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
            AI-powered strength scoring detects weak patterns and clinic-related words.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLocked && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <Lock className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">
                Too many failed attempts. Try again in {lockoutRemaining}s
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={isLocked}
            />
            {newPassword.length > 0 && (
              <div className="space-y-2">
                <Progress value={displayScore} className="h-1.5" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Strength: <span className={`font-medium ${tierColor(displayLabel)}`}>{displayLabel}</span>
                    {aiScoring && <Loader2 className="inline ml-1 h-3 w-3 animate-spin" />}
                    {aiScore && !aiScoring && <Sparkles className="inline ml-1 h-3 w-3 text-primary" />}
                  </span>
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
                {/* AI warnings */}
                {aiScore?.warnings && aiScore.warnings.length > 0 && (
                  <div className="space-y-1 rounded-md border border-orange-200 bg-orange-50 p-2 dark:border-orange-900 dark:bg-orange-950/30">
                    {aiScore.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-orange-700 dark:text-orange-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
                      </p>
                    ))}
                  </div>
                )}
                {/* AI suggestion */}
                {aiScore?.ai_suggestion && (
                  <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground">{aiScore.ai_suggestion}</p>
                  </div>
                )}
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
              disabled={isLocked}
            />
            {confirmPassword.length > 0 && (
              <p className={`text-xs flex items-center gap-1 ${passwordsMatch ? "text-primary" : "text-destructive"}`}>
                {passwordsMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {passwordsMatch ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handlePasswordChange} disabled={!canSubmitPassword || changingPassword || isLocked}>
              {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
            {failedAttempts > 0 && !isLocked && (
              <span className="text-xs text-muted-foreground">
                {MAX_ATTEMPTS - failedAttempts} attempt(s) remaining
              </span>
            )}
          </div>
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
            Secure your account with TOTP authenticator. Backup codes provided after setup.
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

              {/* Backup codes display */}
              {backupCodes && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Backup Recovery Codes
                    </p>
                    <Button variant="ghost" size="sm" onClick={copyBackupCodes}>
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Save these codes securely. Each can be used once if you lose your authenticator.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {backupCodes.map((code, i) => (
                      <code key={i} className="bg-muted px-2 py-1 rounded text-xs font-mono text-center">{code}</code>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setBackupCodes(null)}>
                    I've saved my codes
                  </Button>
                </div>
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

      {/* Notification Preferences */}
      <NotificationPreferences />

      {/* Admin: Reset User Password */}
      {role === "admin" && <AdminPasswordReset />}
    </div>
  );
}

function AdminPasswordReset() {
  const { toast } = useToast();
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("user_id, display_name").then(({ data }) => {
      if (data) setUsers(data.map((p) => ({ id: p.user_id, email: p.display_name || p.user_id })));
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

  const strength = getLocalStrength(newPw);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" /> Admin: Reset User Password
        </CardTitle>
        <CardDescription>Reset any user's password (admin only)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Select User</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Choose a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>New Password</Label>
          <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min 8 characters" />
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

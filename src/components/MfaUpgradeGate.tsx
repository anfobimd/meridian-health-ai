// src/components/MfaUpgradeGate.tsx
//
// Blocks protected routes until the user completes a TOTP challenge, for
// accounts that have MFA enrolled but whose current session is still AAL1.
// This covers two specific scenarios QA #4 surfaced:
//   1. Sessions persisted from before the Auth.tsx login-time MFA fix
//      shipped — those sessions never saw the TOTP prompt.
//   2. A user who enrolls MFA in Settings while already signed in — their
//      existing session is still AAL1 until they re-challenge.
//
// Rather than force-signing them out (annoying), we render this inline
// gate that lets them complete the missing step in place.

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/RBACContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function MfaUpgradeGate() {
  const { signOut, markMfaUpgraded } = useAuth();
  const { toast } = useToast();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Kick off the challenge on mount — we already know the user has a
  // verified TOTP factor (that's why this component is rendering), we
  // just need to pick the first one and start a challenge.
  useEffect(() => {
    (async () => {
      try {
        const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
        if (factorsErr) throw factorsErr;
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (!totp) {
          // Shouldn't happen — the gate shouldn't be visible without a factor
          markMfaUpgraded();
          return;
        }
        setFactorId(totp.id);
        const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (chErr) throw chErr;
        setChallengeId(challenge.id);
      } catch (err: any) {
        setInitError(err.message || "Couldn't start MFA challenge");
      }
    })();
  }, [markMfaUpgraded]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId || code.length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      toast({ title: "Verified", description: "MFA session upgraded." });
      markMfaUpgraded();
    } catch (err: any) {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
      setCode("");
      // Start a fresh challenge so the user can retry.
      try {
        const { data: challenge } = await supabase.auth.mfa.challenge({ factorId });
        if (challenge) setChallengeId(challenge.id);
      } catch { /* swallow */ }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-serif text-xl font-semibold tracking-tight">Meridian</span>
          </div>
          <CardTitle className="text-xl">Verify your identity</CardTitle>
          <CardDescription>
            Your account has two-factor authentication enabled. Enter the
            6-digit code from your authenticator app to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initError ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">{initError}</p>
              <Button variant="outline" className="w-full" onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out and try again
              </Button>
            </div>
          ) : !challengeId ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Starting challenge…
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-upgrade-code">Authentication code</Label>
                <Input
                  id="mfa-upgrade-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="text-center font-mono text-lg tracking-widest"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

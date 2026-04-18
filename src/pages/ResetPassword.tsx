import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PageState = "loading" | "ready" | "invalid" | "error";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    // Parse hash for recovery tokens
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    const errorDescription = params.get("error_description") || params.get("error");

    if (errorDescription) {
      setErrorMessage(errorDescription.replace(/\+/g, " "));
      setState("invalid");
      return;
    }

    // Listener for PASSWORD_RECOVERY event (fires after Supabase restores session from hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && type === "recovery")) {
        setState("ready");
      }
    });

    // If tokens are in the hash, set the session explicitly (covers cases where the
    // auth listener doesn't fire, e.g. page refreshed after hash was already cleared)
    if (accessToken && refreshToken && type === "recovery") {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (cancelled) return;
          if (error) {
            setErrorMessage(error.message);
            setState("invalid");
          } else {
            setState("ready");
            // Clean up the hash so tokens aren't visible in the URL
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        });
    } else {
      // Fallback: check if already in a recovery session (user clicked link, page hydrated fine)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session) {
          // We have a session; assume recovery context
          setState("ready");
        } else if (state === "loading") {
          // Give the auth listener ~1.5s to fire. If nothing, treat as invalid.
          setTimeout(() => {
            if (!cancelled && state === "loading") {
              setState("invalid");
            }
          }, 1500);
        }
      });
    }

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);

    // Safety timeout — if the call hangs for 10s, stop the spinner and show an error
    const timeoutId = setTimeout(() => {
      setLoading(false);
      toast({
        title: "Request timed out",
        description: "The server took too long. Please request a new reset link.",
        variant: "destructive",
      });
    }, 10000);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      clearTimeout(timeoutId);
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      // Sign out so they have to explicitly sign in with the new password
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error updating password", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  // ── Invalid/expired link ──────────────────────────────────────
  if (state === "invalid") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="font-serif text-xl font-semibold tracking-tight">Meridian</span>
            </div>
            <CardTitle>Invalid or expired link</CardTitle>
            <CardDescription>
              {errorMessage || "This password reset link has expired or is no longer valid. Please request a new one."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/auth")}>Back to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Reset form ────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="font-serif text-xl font-semibold tracking-tight">Meridian</span>
          </div>
          <CardTitle>Set new password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">At least 6 characters.</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

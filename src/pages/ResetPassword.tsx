import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PageState = "loading" | "ready" | "invalid" | "error";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { toast } = useToast();
  const navigate = useNavigate();
  // Ref mirror of state so async callbacks see the latest value (the effect
  // setTimeout was reading a stale "loading" closure and never flipping to
  // "invalid" — QA #3 "stuck on loading indefinitely").
  const stateRef = useRef<PageState>("loading");
  useEffect(() => { stateRef.current = state; }, [state]);

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
        } else if (stateRef.current === "loading") {
          // Give the auth listener ~1.5s to fire. If nothing, treat as invalid.
          setTimeout(() => {
            if (!cancelled && stateRef.current === "loading") {
              setState("invalid");
            }
          }, 1500);
        }
      });
    }

    // Absolute-last-resort: if something else goes wrong and we're still
    // "loading" after 5 seconds, show the invalid screen so the user isn't
    // stuck on a spinner.
    const hardTimeout = setTimeout(() => {
      if (!cancelled && stateRef.current === "loading") {
        setState("invalid");
        setErrorMessage("The reset link couldn't be verified. Please request a new one.");
      }
    }, 5000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(hardTimeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast({ title: "Password too short", description: "Use at least 10 characters.", variant: "destructive" });
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
      // Route through the self-change-password edge function. It updates
      // the password server-side with the service role (bypassing the
      // AAL2 constraint that silently stalls supabase.auth.updateUser for
      // MFA-enrolled users — that was QA #5's real root cause: the hash
      // never changed so the "old" password kept working), verifies the
      // new password actually takes, and revokes every session atomically.
      const { data, error } = await supabase.functions.invoke("self-change-password", {
        body: { new_password: password },
      });
      clearTimeout(timeoutId);
      // Friendly {success:false,error} bodies arrive as HTTP 200 so the
      // real policy message (weak password, HIBP match, etc.) reaches
      // the user. Only treat `error` as authoritative if `data` has no
      // structured message.
      const serverError = (data && typeof data === "object" && data.error) ? String(data.error) : null;
      if (serverError) throw new Error(serverError);
      if (error) throw error;
      if (!data?.success) throw new Error("Password update did not complete — please request a new reset link.");

      toast({ title: "Password updated", description: "All sessions revoked. Sign in with your new password." });

      // Clean up local storage + hard-navigate. Sessions are already
      // revoked server-side by the edge function, so we don't need to
      // await signOut.
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      window.location.assign("/auth");
      return;
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={10}
                  autoFocus
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                At least 10 characters with uppercase, lowercase, and a number.
              </p>
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

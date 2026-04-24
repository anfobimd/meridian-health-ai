import { useState, useEffect, useRef } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { useAuth, type AppRole, type Permission } from "@/contexts/RBACContext";
import { MfaUpgradeGate } from "./MfaUpgradeGate";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  /** Require a specific permission */
  require?: Permission;
  /** Require one of these roles */
  roles?: AppRole[];
  /** Require at least this role level */
  minRole?: AppRole;
}

// QA #14: "Access Denied" was flashing when the session auto-refreshed in
// the background and the role briefly dropped to null/"user". Rather than
// show the scary red screen, we now transparently auto-retry the role
// fetch up to `MAX_AUTO_RETRIES` times before falling back to the visible
// denial. Users with real permission never see Access Denied on a
// transient race; users who truly lack permission still get the message
// after the retries complete.
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 600;

export function ProtectedRoute({ require, roles, minRole }: ProtectedRouteProps) {
  const { user, role, loading, mfaUpgradeRequired, refreshRole, hasPermission, hasRole, hasMinRole } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [autoRetries, setAutoRetries] = useState(0);
  // Reset auto-retry counter whenever the role actually resolves to
  // something non-empty — next time a clobber happens we get a fresh
  // budget of silent retries.
  const lastResolvedRole = useRef<AppRole | null>(role);
  useEffect(() => {
    if (role) {
      lastResolvedRole.current = role;
      setAutoRetries(0);
    }
  }, [role]);

  // Compute permission check (kept outside early-returns so the effect
  // below can react to its result).
  let allowed = true;
  if (require) allowed = hasPermission(require);
  if (roles) allowed = hasRole(...roles);
  if (minRole) allowed = hasMinRole(minRole);

  // Auto-retry on a likely race: signed in, not currently loading, MFA
  // gate clear, but role is missing or check failed. Fire off a silent
  // refreshRole and bump the counter. Loading screen renders below.
  useEffect(() => {
    if (loading || !user || mfaUpgradeRequired) return;
    if (allowed) return;
    if (autoRetries >= MAX_AUTO_RETRIES) return;
    const t = setTimeout(() => {
      refreshRole().finally(() => setAutoRetries((n) => n + 1));
    }, autoRetries === 0 ? 0 : RETRY_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, loading, user, mfaUpgradeRequired, autoRetries]);

  // Re-fetch role whenever the tab regains focus — catches the case
  // where a background token refresh completed and the role state is
  // out of sync.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshRole();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, refreshRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Stale AAL1 sessions (signed in before MFA was enrolled, or from before
  // the Auth.tsx MFA enforcement fix was deployed) need to complete a TOTP
  // challenge before accessing any protected content (QA #4).
  if (mfaUpgradeRequired) {
    return <MfaUpgradeGate />;
  }

  // Under the silent-retry budget: show a loading screen instead of the
  // scary red Access Denied. Users with real permission see this for
  // <1.5s at most while the role repopulates.
  if (!allowed && autoRetries < MAX_AUTO_RETRIES) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Refreshing your permissions…</p>
      </div>
    );
  }

  if (!allowed) {
    const handleRetry = async () => {
      setRetrying(true);
      try {
        await refreshRole();
        setAutoRetries(0); // give the silent retries a fresh budget
      } finally {
        setRetrying(false);
      }
    };
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4 mx-auto" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-md mb-4">
          Your role ({role || "none"}) does not have permission to access this page.
          {!role && " This can happen during a session refresh — click Retry to reload your role."}
        </p>
        <Button variant="outline" onClick={handleRetry} disabled={retrying}>
          {retrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Retry
        </Button>
      </div>
    );
  }

  return <Outlet />;
}

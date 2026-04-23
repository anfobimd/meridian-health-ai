import { useState } from "react";
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

export function ProtectedRoute({ require, roles, minRole }: ProtectedRouteProps) {
  const { user, role, loading, mfaUpgradeRequired, refreshRole, hasPermission, hasRole, hasMinRole } = useAuth();
  const [retrying, setRetrying] = useState(false);

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

  // Check RBAC if specified
  let allowed = true;
  if (require) allowed = hasPermission(require);
  if (roles) allowed = hasRole(...roles);
  if (minRole) allowed = hasMinRole(minRole);

  if (!allowed) {
    const handleRetry = async () => {
      setRetrying(true);
      try { await refreshRole(); } finally { setRetrying(false); }
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

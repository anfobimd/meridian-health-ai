import { Navigate, Outlet } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth, type AppRole, type Permission } from "@/contexts/RBACContext";

interface ProtectedRouteProps {
  /** Require a specific permission */
  require?: Permission;
  /** Require one of these roles */
  roles?: AppRole[];
  /** Require at least this role level */
  minRole?: AppRole;
}

export function ProtectedRoute({ require, roles, minRole }: ProtectedRouteProps) {
  const { user, role, loading, hasPermission, hasRole, hasMinRole } = useAuth();

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

  // Check RBAC if specified
  let allowed = true;
  if (require) allowed = hasPermission(require);
  if (roles) allowed = hasRole(...roles);
  if (minRole) allowed = hasMinRole(minRole);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4 mx-auto" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          Your role ({role || "none"}) does not have permission to access this page.
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return <Outlet />;
}

// src/components/RoleGuard.tsx
//
// Role-based route guard and UI visibility component.
// Works with the expanded 14-role RBAC system from Phase 1.
//
// Usage as route guard:
//   <Route element={<RoleGuard require="clearance.approve" />}>
//     <Route path="/physician-approval" element={<PhysicianApproval />} />
//   </Route>
//
// Usage as UI wrapper:
//   <RoleGuard require="billing.refund" fallback={null}>
//     <Button onClick={handleRefund}>Issue Refund</Button>
//   </RoleGuard>
//
// Usage with role list:
//   <RoleGuard roles={["admin", "medical_director"]} fallback={<AccessDenied />}>
//     <AdminPanel />
//   </RoleGuard>
//
// Usage with minimum role:
//   <RoleGuard minRole="provider">
//     <ClinicalContent />
//   </RoleGuard>

import { Navigate, Outlet } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth, type AppRole, type Permission } from "@/contexts/RBACContext";

interface RoleGuardProps {
  /** Require a specific permission */
  require?: Permission;
  /** Require one of these roles */
  roles?: AppRole[];
  /** Require at least this role level */
  minRole?: AppRole;
  /** Redirect path on denied (default: show denied message) */
  redirectTo?: string;
  /** Fallback content when denied (for UI wrapper mode) */
  fallback?: React.ReactNode;
  /** Children (for UI wrapper mode) */
  children?: React.ReactNode;
}

export function RoleGuard({
  require,
  roles,
  minRole,
  redirectTo,
  fallback,
  children,
}: RoleGuardProps) {
  const { user, role, loading, hasPermission, hasRole, hasMinRole } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check access
  let allowed = true;
  if (require) allowed = hasPermission(require);
  if (roles) allowed = hasRole(...roles);
  if (minRole) allowed = hasMinRole(minRole);

  if (!allowed) {
    // If used as a UI wrapper, render fallback (or nothing)
    if (children !== undefined) {
      return <>{fallback ?? null}</>;
    }

    // If used as a route guard, redirect or show denied
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          Your role ({role || "none"}) does not have permission to access this page.
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  // If used as a UI wrapper, render children
  if (children !== undefined) {
    return <>{children}</>;
  }

  // If used as a route guard, render outlet
  return <Outlet />;
}

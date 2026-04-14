// src/contexts/RBACContext.tsx
//
// UPGRADED AuthContext replacement that supports the expanded 14-role system
// from Phase 1 migration (003_rbac_expansion.sql).
//
// Changes from original AuthContext:
//   - AppRole expanded from 4 to 14+ values
//   - Added permissions matrix (from Piyush's auth.js ROLE_PERMISSIONS)
//   - Added multi-clinic context support
//   - Added hasPermission() and hasRole() helpers
//   - Backwards-compatible: existing "admin", "provider", "front_desk" still work
//
// MIGRATION: Replace AuthContext with this, then update imports throughout.
// The existing useAuth() hook signature is preserved for backwards compat.

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

// ─── Role hierarchy (from Piyush's ROLE_RANK) ───────────────────────────────

export type AppRole =
  | "super_admin"
  | "admin"
  | "clinic_owner"
  | "medical_director"
  | "physician"
  | "nurse_practitioner"
  | "physician_assistant"
  | "registered_nurse"
  | "provider"
  | "aesthetician"
  | "front_desk"
  | "billing"
  | "marketing"
  | "user";

/** Numeric rank for role comparison. Higher = more privileged. */
const ROLE_RANK: Record<AppRole, number> = {
  super_admin: 100,
  admin: 90,
  clinic_owner: 85,
  medical_director: 80,
  physician: 75,
  nurse_practitioner: 70,
  physician_assistant: 65,
  registered_nurse: 60,
  provider: 55,
  aesthetician: 50,
  front_desk: 40,
  billing: 35,
  marketing: 30,
  user: 10,
};

// ─── Permission matrix (from Piyush's ROLE_PERMISSIONS) ─────────────────────

export type Permission =
  | "dashboard.view"
  | "patients.view" | "patients.create" | "patients.edit" | "patients.delete"
  | "appointments.view" | "appointments.create" | "appointments.edit" | "appointments.cancel"
  | "encounters.view" | "encounters.create" | "encounters.sign"
  | "prescriptions.view" | "prescriptions.create" | "prescriptions.approve"
  | "labs.view" | "labs.order" | "labs.review"
  | "clearance.view" | "clearance.approve" | "clearance.decline"
  | "billing.view" | "billing.charge" | "billing.refund"
  | "marketplace.view" | "marketplace.manage"
  | "providers.view" | "providers.manage"
  | "settings.view" | "settings.manage"
  | "reports.view" | "reports.export"
  | "audit.view"
  | "clinic.switch";

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit", "patients.delete",
    "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel",
    "encounters.view", "encounters.create", "encounters.sign",
    "prescriptions.view", "prescriptions.create", "prescriptions.approve",
    "labs.view", "labs.order", "labs.review",
    "clearance.view", "clearance.approve", "clearance.decline",
    "billing.view", "billing.charge", "billing.refund",
    "marketplace.view", "marketplace.manage",
    "providers.view", "providers.manage",
    "settings.view", "settings.manage",
    "reports.view", "reports.export",
    "audit.view", "clinic.switch",
  ],
  admin: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit", "patients.delete",
    "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel",
    "encounters.view", "encounters.create", "encounters.sign",
    "prescriptions.view", "prescriptions.create", "prescriptions.approve",
    "labs.view", "labs.order", "labs.review",
    "clearance.view", "clearance.approve", "clearance.decline",
    "billing.view", "billing.charge", "billing.refund",
    "marketplace.view", "marketplace.manage",
    "providers.view", "providers.manage",
    "settings.view", "settings.manage",
    "reports.view", "reports.export",
    "audit.view",
  ],
  clinic_owner: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel",
    "encounters.view",
    "prescriptions.view",
    "labs.view",
    "clearance.view", "clearance.approve",
    "billing.view", "billing.charge", "billing.refund",
    "marketplace.view", "marketplace.manage",
    "providers.view", "providers.manage",
    "settings.view", "settings.manage",
    "reports.view", "reports.export",
  ],
  medical_director: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit",
    "encounters.view", "encounters.create", "encounters.sign",
    "prescriptions.view", "prescriptions.create", "prescriptions.approve",
    "labs.view", "labs.order", "labs.review",
    "clearance.view", "clearance.approve", "clearance.decline",
    "billing.view",
    "reports.view",
    "audit.view",
  ],
  physician: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit",
    "encounters.view", "encounters.create", "encounters.sign",
    "prescriptions.view", "prescriptions.create", "prescriptions.approve",
    "labs.view", "labs.order", "labs.review",
    "clearance.view", "clearance.approve", "clearance.decline",
    "billing.view",
  ],
  nurse_practitioner: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit",
    "encounters.view", "encounters.create", "encounters.sign",
    "prescriptions.view", "prescriptions.create",
    "labs.view", "labs.order", "labs.review",
    "clearance.view", "clearance.approve",
    "billing.view",
  ],
  physician_assistant: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit",
    "encounters.view", "encounters.create",
    "prescriptions.view", "prescriptions.create",
    "labs.view", "labs.order",
    "clearance.view",
    "billing.view",
  ],
  registered_nurse: [
    "dashboard.view", "patients.view", "patients.edit",
    "appointments.view", "appointments.edit",
    "encounters.view", "encounters.create",
    "prescriptions.view",
    "labs.view", "labs.order",
    "clearance.view",
  ],
  provider: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit",
    "encounters.view", "encounters.create", "encounters.sign",
    "prescriptions.view", "prescriptions.create",
    "labs.view", "labs.order",
    "clearance.view",
    "billing.view",
    "marketplace.view",
  ],
  aesthetician: [
    "dashboard.view", "patients.view", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit",
    "encounters.view", "encounters.create",
    "labs.view",
    "marketplace.view",
  ],
  front_desk: [
    "dashboard.view", "patients.view", "patients.create", "patients.edit",
    "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel",
    "billing.view", "billing.charge",
    "marketplace.view",
  ],
  billing: [
    "dashboard.view", "patients.view",
    "appointments.view",
    "billing.view", "billing.charge", "billing.refund",
    "reports.view", "reports.export",
  ],
  marketing: [
    "dashboard.view", "patients.view",
    "marketplace.view", "marketplace.manage",
    "reports.view",
  ],
  user: [
    "dashboard.view",
  ],
};

// ─── Context ─────────────────────────────────────────────────────────────────

interface RBACState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  clinicId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasPermission: (perm: Permission) => boolean;
  hasRole: (...roles: AppRole[]) => boolean;
  hasMinRole: (minRole: AppRole) => boolean;
}

const RBACContext = createContext<RBACState>({
  user: null,
  session: null,
  role: null,
  clinicId: null,
  loading: true,
  signOut: async () => {},
  hasPermission: () => false,
  hasRole: () => false,
  hasMinRole: () => false,
});

/** Drop-in replacement for useAuth() — same interface + new RBAC helpers */
export const useAuth = () => useContext(RBACContext);

/** Alias for clarity when using RBAC features */
export const useRBAC = () => useContext(RBACContext);

export function RBACProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    // Try role_permissions table first (Phase 1 migration), fall back to user_roles
    const { data: rpData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const fetchedRole = (rpData?.role as AppRole) ?? "user";
    setRole(fetchedRole);

    // Fetch clinic context if multi-clinic is active
    const { data: staffData } = await supabase
      .from("clinic_staff")
      .select("clinic_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (staffData?.clinic_id) {
      setClinicId(staffData.clinic_id);
    }
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => fetchRole(sess.user.id), 0);
      } else {
        setRole(null);
        setClinicId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        fetchRole(existing.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setClinicId(null);
  };

  /** Check if current user has a specific permission */
  const hasPermission = useCallback(
    (perm: Permission): boolean => {
      if (!role) return false;
      return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
    },
    [role],
  );

  /** Check if current user has one of the specified roles */
  const hasRole = useCallback(
    (...roles: AppRole[]): boolean => {
      if (!role) return false;
      return roles.includes(role);
    },
    [role],
  );

  /** Check if current user has at least the specified role level */
  const hasMinRole = useCallback(
    (minRole: AppRole): boolean => {
      if (!role) return false;
      return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 999);
    },
    [role],
  );

  return (
    <RBACContext.Provider
      value={{ user, session, role, clinicId, loading, signOut, hasPermission, hasRole, hasMinRole }}
    >
      {children}
    </RBACContext.Provider>
  );
}

// ─── Export role utilities for use outside React ─────────────────────────────

export { ROLE_RANK, ROLE_PERMISSIONS };

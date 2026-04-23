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
  | "patients.view"
  | "patients.create"
  | "patients.edit"
  | "patients.delete"
  | "appointments.view"
  | "appointments.create"
  | "appointments.edit"
  | "appointments.cancel"
  | "encounters.view"
  | "encounters.create"
  | "encounters.sign"
  | "prescriptions.view"
  | "prescriptions.create"
  | "prescriptions.approve"
  | "labs.view"
  | "labs.order"
  | "labs.review"
  | "clearance.view"
  | "clearance.approve"
  | "clearance.decline"
  | "billing.view"
  | "billing.charge"
  | "billing.refund"
  | "marketplace.view"
  | "marketplace.manage"
  | "providers.view"
  | "providers.manage"
  | "settings.view"
  | "settings.manage"
  | "reports.view"
  | "reports.export"
  | "audit.view"
  | "clinic.switch";

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "patients.delete",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "appointments.cancel",
    "encounters.view",
    "encounters.create",
    "encounters.sign",
    "prescriptions.view",
    "prescriptions.create",
    "prescriptions.approve",
    "labs.view",
    "labs.order",
    "labs.review",
    "clearance.view",
    "clearance.approve",
    "clearance.decline",
    "billing.view",
    "billing.charge",
    "billing.refund",
    "marketplace.view",
    "marketplace.manage",
    "providers.view",
    "providers.manage",
    "settings.view",
    "settings.manage",
    "reports.view",
    "reports.export",
    "audit.view",
    "clinic.switch",
  ],
  admin: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "patients.delete",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "appointments.cancel",
    "encounters.view",
    "encounters.create",
    "encounters.sign",
    "prescriptions.view",
    "prescriptions.create",
    "prescriptions.approve",
    "labs.view",
    "labs.order",
    "labs.review",
    "clearance.view",
    "clearance.approve",
    "clearance.decline",
    "billing.view",
    "billing.charge",
    "billing.refund",
    "marketplace.view",
    "marketplace.manage",
    "providers.view",
    "providers.manage",
    "settings.view",
    "settings.manage",
    "reports.view",
    "reports.export",
    "audit.view",
  ],
  clinic_owner: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "appointments.cancel",
    "encounters.view",
    "prescriptions.view",
    "labs.view",
    "clearance.view",
    "clearance.approve",
    "billing.view",
    "billing.charge",
    "billing.refund",
    "marketplace.view",
    "marketplace.manage",
    "providers.view",
    "providers.manage",
    "settings.view",
    "settings.manage",
    "reports.view",
    "reports.export",
  ],
  medical_director: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "encounters.sign",
    "prescriptions.view",
    "prescriptions.create",
    "prescriptions.approve",
    "labs.view",
    "labs.order",
    "labs.review",
    "clearance.view",
    "clearance.approve",
    "clearance.decline",
    "billing.view",
    "reports.view",
    "audit.view",
  ],
  physician: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "encounters.sign",
    "prescriptions.view",
    "prescriptions.create",
    "prescriptions.approve",
    "labs.view",
    "labs.order",
    "labs.review",
    "clearance.view",
    "clearance.approve",
    "clearance.decline",
    "billing.view",
  ],
  nurse_practitioner: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "encounters.sign",
    "prescriptions.view",
    "prescriptions.create",
    "labs.view",
    "labs.order",
    "labs.review",
    "clearance.view",
    "clearance.approve",
    "billing.view",
  ],
  physician_assistant: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "prescriptions.view",
    "prescriptions.create",
    "labs.view",
    "labs.order",
    "clearance.view",
    "billing.view",
  ],
  registered_nurse: [
    "dashboard.view",
    "patients.view",
    "patients.edit",
    "appointments.view",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "prescriptions.view",
    "labs.view",
    "labs.order",
    "clearance.view",
  ],
  provider: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "encounters.sign",
    "prescriptions.view",
    "prescriptions.create",
    "labs.view",
    "labs.order",
    "clearance.view",
    "billing.view",
    "marketplace.view",
  ],
  aesthetician: [
    "dashboard.view",
    "patients.view",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "encounters.view",
    "encounters.create",
    "labs.view",
    "marketplace.view",
  ],
  front_desk: [
    "dashboard.view",
    "patients.view",
    "patients.create",
    "patients.edit",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "appointments.cancel",
    "billing.view",
    "billing.charge",
    "marketplace.view",
  ],
  billing: [
    "dashboard.view",
    "patients.view",
    "appointments.view",
    "billing.view",
    "billing.charge",
    "billing.refund",
    "reports.view",
    "reports.export",
  ],
  marketing: ["dashboard.view", "patients.view", "marketplace.view", "marketplace.manage", "reports.view"],
  user: ["dashboard.view"],
};

// ─── Context ─────────────────────────────────────────────────────────────────

interface RBACState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  clinicId: string | null;
  loading: boolean;
  /** True if the account has a verified MFA factor but the current session
   *  is only AAL1. The app should force a TOTP challenge before showing any
   *  protected content — catches stale sessions from before the MFA fix
   *  was deployed (QA #4). */
  mfaUpgradeRequired: boolean;
  signOut: () => Promise<void>;
  /** Revokes every server-side session for the current user (kills all
   *  outstanding access tokens too, unlike signOut({scope:"global"}) which
   *  only nukes refresh tokens). Used after password change / reset. */
  revokeAllSessionsAndSignOut: () => Promise<void>;
  /** Clears the mfaUpgradeRequired flag after a successful TOTP verify. */
  markMfaUpgraded: () => void;
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
  mfaUpgradeRequired: false,
  signOut: async () => {},
  revokeAllSessionsAndSignOut: async () => {},
  markMfaUpgraded: () => {},
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
  const [mfaUpgradeRequired, setMfaUpgradeRequired] = useState(false);

  // Runs whenever the user/session changes. Checks whether the account has
  // a verified MFA factor while the current session is only AAL1 — in that
  // state the session is "under-authenticated" and must complete a TOTP
  // challenge before getting access to protected content (QA #4 for stale
  // sessions that predate the Auth.tsx enforce-on-login fix).
  const evaluateMfaGate = useCallback(async (userId: string | undefined) => {
    if (!userId) { setMfaUpgradeRequired(false); return; }
    try {
      const [{ data: factors }, { data: aal }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      const hasVerifiedTotp = !!factors?.totp?.find((f) => f.status === "verified");
      const atAal1 = aal?.currentLevel !== "aal2";
      setMfaUpgradeRequired(hasVerifiedTotp && atAal1);
    } catch {
      // Network errors — fail open (don't lock users out due to transient
      // connectivity). The Auth.tsx login-time gate still enforces MFA on
      // fresh sign-ins.
      setMfaUpgradeRequired(false);
    }
  }, []);

  const markMfaUpgraded = useCallback(() => setMfaUpgradeRequired(false), []);

  const fetchRole = async (_userId: string) => {
    try {
      // Use the SECURITY DEFINER RPC `get_my_roles` so the query can't be
      // blocked by a stale JWT/RLS race on hard refresh or tab-refocus
      // (QA #12 / #14). Fall back to direct SELECT only if the RPC errors —
      // e.g. migration not yet deployed.
      let allRoles: AppRole[] = [];

      const rpc = await supabase.rpc("get_my_roles");
      if (!rpc.error && Array.isArray(rpc.data)) {
        allRoles = rpc.data.map((r: { role: AppRole }) => r.role);
      } else {
        const fallback = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", _userId);
        if (fallback.error) {
          console.warn("[RBAC] Role fetch failed (RPC + direct):", rpc.error, fallback.error);
          // Do NOT clobber existing role on transient failure. The sidebar
          // keeps whatever we last resolved (QA #14).
          return;
        }
        allRoles = (fallback.data ?? []).map((r: { role: AppRole }) => r.role);
      }

      if (allRoles.length === 0) {
        // Only downgrade to "user" if we have never resolved a real role. If
        // we already have one cached (role !== null), keep it — the empty
        // response is almost always RLS starvation, not a real role removal.
        setRole((prev) => prev ?? "user");
        return;
      }
      const priority: AppRole[] = [
        "super_admin", "admin", "clinic_owner", "medical_director",
        "physician", "nurse_practitioner", "physician_assistant",
        "registered_nurse", "provider", "aesthetician", "front_desk",
        "billing", "marketing", "user",
      ];
      const best = priority.find((r) => allRoles.includes(r)) ?? "user";
      setRole(best);
    } catch (err) {
      console.error("[RBAC] Unexpected error in fetchRole:", err);
      // Don't reset role on errors — keep last-known-good value
    }
  };

  useEffect(() => {
    // Track whether the initial session has been handled to avoid double-loading
    let initialSessionHandled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // Only re-fetch role on genuine sign-in or initial session. TOKEN_REFRESHED
      // and USER_UPDATED fire frequently while the app is open; re-fetching on
      // those was causing the role to transiently flip to "user" during the
      // network round-trip, which blanked the sidebar and triggered "you have
      // no access" errors (QA issues #12 and #14).
      const needsRoleFetch =
        event === "INITIAL_SESSION" || event === "SIGNED_IN";
      if (sess?.user && needsRoleFetch) {
        await fetchRole(sess.user.id);
        // Re-evaluate the MFA gate on every initial/sign-in event so that
        // stale AAL1 sessions are caught and a fresh AAL2 session flips
        // the gate off.
        evaluateMfaGate(sess.user.id);
      } else if (!sess?.user) {
        setRole(null);
        setClinicId(null);
        setMfaUpgradeRequired(false);
      }
      // Mark initial load complete after first auth event
      if (!initialSessionHandled) {
        initialSessionHandled = true;
        setLoading(false);
      }
    });

    // Fallback: if onAuthStateChange doesn't fire, use getSession
    // (handles broken Supabase connections, network issues, etc.)
    supabase.auth
      .getSession()
      .then(async ({ data: { session: existing } }) => {
        // Only process if onAuthStateChange hasn't already handled it
        if (!initialSessionHandled) {
          setSession(existing);
          setUser(existing?.user ?? null);
          if (existing?.user) {
            await fetchRole(existing.user.id);
            evaluateMfaGate(existing.user.id);
          }
          initialSessionHandled = true;
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[RBAC] Failed to get session:", err);
        // Ensure loading state is cleared even on error
        if (!initialSessionHandled) {
          initialSessionHandled = true;
          setLoading(false);
        }
      });

    // Safety timeout: if nothing resolves within 8 seconds, stop the spinner
    const safetyTimeout = setTimeout(() => {
      if (!initialSessionHandled) {
        console.warn("[RBAC] Safety timeout reached - forcing loading=false");
        initialSessionHandled = true;
        setLoading(false);
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  // Idle session timeout. Reads `session_timeout_minutes` from clinic_settings.
  // Resets on every user interaction — when the timer fires, signs out.
  useEffect(() => {
    if (!user) return;
    let timeoutMs = 60 * 60 * 1000; // default 1h until we read settings
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        console.log("[RBAC] Idle timeout reached — signing out");
        signOut();
      }, timeoutMs);
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    // Pull configured timeout (don't block UI on this). Use limit(1) so
    // multiple settings rows (shouldn't happen, but) don't throw and leave
    // the default 60-min value in place. `as any` because clinic_settings
    // isn't in the generated types yet — created by the QA round-two
    // migration and Lovable hasn't regenerated them.
    (supabase as any)
      .from("clinic_settings")
      .select("session_timeout_minutes")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (error) {
          console.warn("[RBAC] clinic_settings fetch failed, using default timeout:", error.message);
          return;
        }
        const m = data?.session_timeout_minutes;
        if (typeof m === "number" && m > 0) {
          timeoutMs = m * 60 * 1000;
          reset();
        }
      });
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const purgeLocalSessionAndRedirect = () => {
    setUser(null);
    setSession(null);
    setRole(null);
    setClinicId(null);
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* localStorage may be unavailable */ }
    window.location.assign("/auth");
  };

  const signOut = async () => {
    // Defense in depth: whether or not the network call succeeds, we want to
    // end up on /auth with no session. Issue #13 (sign-out stops working
    // after re-login) was caused by the global signOut hanging on a stale
    // refresh token — we'd await forever, nothing happened on screen.
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "global" }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (err) {
      console.warn("[RBAC] signOut network call errored, continuing:", err);
    }
    purgeLocalSessionAndRedirect();
  };

  // Kills *all* active access tokens server-side via the admin API (the only
  // way to invalidate outstanding JWTs before their natural 1-hour expiry).
  // Must be called after any password change so the pre-change JWT can't be
  // used by an attacker who captured it (QA #5).
  const revokeAllSessionsAndSignOut = async () => {
    try {
      await Promise.race([
        supabase.functions.invoke("revoke-my-sessions", {}),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch (err) {
      console.warn("[RBAC] revoke-my-sessions errored, continuing:", err);
    }
    // Still fire the client-side signOut so the local storage is clean even
    // if the server call didn't return in time.
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "global" }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch { /* swallow */ }
    purgeLocalSessionAndRedirect();
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
      value={{ user, session, role, clinicId, loading, mfaUpgradeRequired, signOut, revokeAllSessionsAndSignOut, markMfaUpgraded, hasPermission, hasRole, hasMinRole }}
    >
      {children}
    </RBACContext.Provider>
  );
}

// ─── Export role utilities for use outside React ─────────────────────────────

export { ROLE_RANK, ROLE_PERMISSIONS };

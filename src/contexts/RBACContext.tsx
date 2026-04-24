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
  /** Force an immediate re-fetch of the current user's roles. Used by the
   *  Access Denied screen's "Retry" button so users can recover from a
   *  transient role clobber without fully signing out (QA #14). */
  refreshRole: () => Promise<void>;
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
  refreshRole: async () => {},
  hasPermission: () => false,
  hasRole: () => false,
  hasMinRole: () => false,
});

// Ranks for deciding whether a new role fetch represents a downgrade we
// should treat with suspicion. When a previously-resolved super_admin
// suddenly returns as "user" or null on a re-fetch, that's almost always
// a stale-JWT/RLS race — not an actual role change.
const ROLE_SUSPICION_RANK: Record<string, number> = {
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

  const fetchRoleOnce = async (_userId: string): Promise<AppRole[] | null> => {
    // Returns null on transient failure (caller should keep existing role),
    // or an array of roles (possibly empty → user has truly no roles).
    const rpc = await supabase.rpc("get_my_roles");
    if (!rpc.error && Array.isArray(rpc.data)) {
      return rpc.data.map((r: { role: AppRole }) => r.role);
    }
    const fallback = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", _userId);
    if (fallback.error) {
      console.warn("[RBAC] Role fetch failed (RPC + direct):", rpc.error, fallback.error);
      return null;
    }
    return (fallback.data ?? []).map((r: { role: AppRole }) => r.role);
  };

  const fetchRole = useCallback(async (userId: string) => {
    try {
      // Retry loop — on cold page load, the JWT stored in localStorage
      // is being refreshed by Supabase in the background, and RLS/RPC
      // calls made during that window can come back EMPTY even when the
      // user genuinely has roles. A single fetch is not enough for a
      // page refresh. We try up to 4 times with back-off, accepting an
      // empty response only if we see it consistently (2+ times) which
      // signals it really is an empty-role user and not a race. QA #12.
      const MAX_ATTEMPTS = 4;
      const BACKOFFS = [0, 300, 700, 1200];
      let allRoles: AppRole[] | null = null;
      let emptyCount = 0;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (BACKOFFS[i]) await new Promise((r) => setTimeout(r, BACKOFFS[i]));
        const result = await fetchRoleOnce(userId);
        if (result === null) {
          // transient failure — keep trying
          continue;
        }
        if (result.length === 0) {
          emptyCount++;
          // One empty response could still be a race. Only trust it
          // after a second confirming empty, AND only for cold loads
          // where we don't already have a role cached.
          if (emptyCount >= 2) {
            allRoles = [];
            break;
          }
          continue;
        }
        allRoles = result;
        break;
      }

      if (allRoles === null) {
        // All retries failed to get a definitive answer — keep whatever
        // role we already had rather than clobbering to null/user.
        return;
      }

      if (allRoles.length === 0) {
        // Consistently empty across retries — safe to conclude the user
        // really has no roles. Still honor prev if set (paranoia).
        setRole((prev) => prev ?? "user");
        return;
      }
      const priority: AppRole[] = [
        "super_admin", "admin", "clinic_owner", "medical_director",
        "physician", "nurse_practitioner", "physician_assistant",
        "registered_nurse", "provider", "aesthetician", "front_desk",
        "billing", "marketing", "user",
      ];
      const best = priority.find((r) => allRoles!.includes(r)) ?? "user";

      // Suspicion check: if the new role is dramatically lower than what
      // we previously resolved, don't apply it. E.g. super_admin (100) →
      // user (10) on a single flaky re-fetch is not a real demotion.
      setRole((prev) => {
        if (!prev) return best;
        const prevRank = ROLE_SUSPICION_RANK[prev] ?? 0;
        const newRank = ROLE_SUSPICION_RANK[best] ?? 0;
        if (prevRank >= 80 && newRank < prevRank - 40) {
          console.warn(
            `[RBAC] Refusing to downgrade ${prev} → ${best} from a single re-fetch; keeping ${prev}.`,
          );
          return prev;
        }
        return best;
      });
    } catch (err) {
      console.error("[RBAC] Unexpected error in fetchRole:", err);
      // Don't reset role on errors — keep last-known-good value
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user?.id) return;
    await fetchRole(user.id);
  }, [user?.id, fetchRole]);

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

  // Idle session timeout (QA #15). Previous implementation relied solely
  // on setTimeout, which browsers throttle or suspend entirely in
  // background tabs — so a user who walked away with the tab still open
  // could stay "logged in" far past the configured window because the
  // timer never fired.
  //
  // New approach:
  //   - Record the timestamp of the last user interaction in a ref.
  //   - Poll every 30s: compare now() vs lastActivityAt; if the gap
  //     exceeds the configured timeout, sign out.
  //   - Also fire a signOut when the tab regains visibility if the gap
  //     exceeded the timeout while we were away (setInterval is
  //     throttled in hidden tabs too, so this is the belt to the poll's
  //     suspenders).
  //   - Re-read clinic_settings on every visibility-regained event, so
  //     changing the timeout in Settings actually applies without the
  //     user having to sign out and back in.
  useEffect(() => {
    if (!user) return;

    let timeoutMs = 60 * 60 * 1000; // default 1h
    let lastActivityAt = Date.now();
    let signedOutByIdle = false;

    const recordActivity = () => {
      lastActivityAt = Date.now();
    };

    const checkIdle = () => {
      if (signedOutByIdle) return;
      const idleFor = Date.now() - lastActivityAt;
      if (idleFor >= timeoutMs) {
        signedOutByIdle = true;
        console.log(`[RBAC] Idle for ${Math.round(idleFor / 1000)}s (limit ${Math.round(timeoutMs / 1000)}s) — signing out`);
        signOut();
      }
    };

    const refreshTimeoutFromSettings = () => {
      (supabase as any)
        .from("clinic_settings")
        .select("session_timeout_minutes")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }: any) => {
          if (error) {
            console.warn("[RBAC] clinic_settings fetch failed, using previous timeout:", error.message);
            return;
          }
          const m = data?.session_timeout_minutes;
          if (typeof m === "number" && m > 0) {
            const nextMs = m * 60 * 1000;
            if (nextMs !== timeoutMs) {
              console.log(`[RBAC] session timeout updated: ${Math.round(nextMs / 60000)} min`);
              timeoutMs = nextMs;
            }
          }
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Re-read the setting (in case it was changed in another tab)
        // and evaluate idle immediately.
        refreshTimeoutFromSettings();
        checkIdle();
      }
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Poll every 30s — if mouse/keyboard stopped but the tab is still
    // foregrounded, we'll catch the idle.
    const poll = setInterval(checkIdle, 30_000);

    // Initial load
    refreshTimeoutFromSettings();

    return () => {
      events.forEach((e) => window.removeEventListener(e, recordActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(poll);
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
      value={{ user, session, role, clinicId, loading, mfaUpgradeRequired, signOut, revokeAllSessionsAndSignOut, markMfaUpgraded, refreshRole, hasPermission, hasRole, hasMinRole }}
    >
      {children}
    </RBACContext.Provider>
  );
}

// ─── Export role utilities for use outside React ─────────────────────────────

export { ROLE_RANK, ROLE_PERMISSIONS };

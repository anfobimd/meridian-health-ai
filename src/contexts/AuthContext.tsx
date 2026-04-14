// src/contexts/AuthContext.tsx
//
// BACKWARDS-COMPAT SHIM: Re-exports useAuth from RBACContext so that
// existing imports `from "@/contexts/AuthContext"` continue to work.
// The real implementation lives in RBACContext.tsx.
//
// DO NOT add new imports from this file — use RBACContext directly.

export { useAuth } from "./RBACContext";
export type { AppRole } from "./RBACContext";

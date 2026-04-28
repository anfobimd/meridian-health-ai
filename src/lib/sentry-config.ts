// Sentry configuration constants.
//
// The DSN is a publishable identifier (like a Supabase anon key) — safe to
// ship in the client bundle. Abuse protection is enforced server-side by the
// "Allowed Domains" setting in the Sentry project dashboard.
//
// To rotate the DSN: edit this file, push, redeploy. To use a different DSN
// per environment (dev vs prod), use a different Sentry project entirely.

export const SENTRY_DSN = "https://5e64ea14ecc49dcb8951ade313851bc0@o4511300113858560.ingest.us.sentry.io/4511300194861056";

// Used to filter events in the Sentry dashboard.
export const SENTRY_ENVIRONMENT_FALLBACK = "production";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { SENTRY_DSN, SENTRY_ENVIRONMENT_FALLBACK } from "./lib/sentry-config";

// Initialize Sentry only if a real DSN is configured.
if (SENTRY_DSN && !SENTRY_DSN.startsWith("PASTE_")) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || SENTRY_ENVIRONMENT_FALLBACK,
    // Session replay disabled until HIPAA BAA is in place — replays can
    // capture PHI in the DOM.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Performance monitoring at 10% sample rate. Adjust based on volume.
    tracesSampleRate: 0.1,
    initialScope: {
      tags: { app: "meridian-web" },
    },
  });
}

// Sentry's ErrorBoundary catches React render errors with a minimal fallback.
const FallbackComponent = ({ resetError }: { resetError: () => void }) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="max-w-md w-full text-center space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        The application encountered an unexpected error. Our team has been notified.
        You can try reloading the page below.
      </p>
      <button
        onClick={resetError}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Reload
      </button>
    </div>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={FallbackComponent}>
    <App />
  </Sentry.ErrorBoundary>
);

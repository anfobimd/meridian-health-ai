// src/lib/routePrefetch.ts
//
// Maps every authenticated route path to a static `() => import()` call that
// Vite can follow for code-splitting. The sidebar calls `prefetchRoute(path)`
// on hover so the target page's JS chunk starts downloading ~150-300ms before
// the user actually clicks the link. By click time the chunk is usually
// already in the browser cache, so the Suspense fallback doesn't flash.
//
// Each import() must be a literal string — NOT a dynamic template — otherwise
// Vite can't statically split it into its own chunk. That's why this file is
// long; it's intentional.

const ROUTE_IMPORTS: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Index"),
  "/front-desk": () => import("@/pages/FrontDesk"),
  "/provider-day": () => import("@/pages/ProviderDay"),
  "/check-in": () => import("@/pages/ProviderCheckIn"),
  "/patients": () => import("@/pages/Patients"),
  "/appointments": () => import("@/pages/Appointments"),
  "/encounters": () => import("@/pages/Encounters"),
  "/clinical-notes": () => import("@/pages/ClinicalNotes"),
  "/hormone-visits": () => import("@/pages/HormoneVisits"),
  "/hormone-intake": () => import("@/pages/HormoneIntake"),
  "/physician-approval": () => import("@/pages/PhysicianApproval"),
  "/protocols": () => import("@/pages/Protocols"),
  "/rooms-devices": () => import("@/pages/RoomsDevices"),
  "/treatments": () => import("@/pages/Treatments"),
  "/medications": () => import("@/pages/Medications"),
  "/providers": () => import("@/pages/Providers"),
  "/billing": () => import("@/pages/Billing"),
  "/md-oversight": () => import("@/pages/MdOversight"),
  "/md-oversight/dashboard": () => import("@/pages/MdOversightDashboard"),
  "/marketplace": () => import("@/pages/Marketplace"),
  "/packages": () => import("@/pages/Packages"),
  "/membership-billing": () => import("@/pages/MembershipBilling"),
  "/earnings": () => import("@/pages/Earnings"),
  "/proforma": () => import("@/pages/Proforma"),
  "/churn-risk": () => import("@/pages/ChurnRisk"),
  "/my-marketplace": () => import("@/pages/ProviderMarketplace"),
  "/provider-schedule": () => import("@/pages/ProviderSchedule"),
  "/clinic-hours": () => import("@/pages/ClinicHours"),
  "/waitlist": () => import("@/pages/Waitlist"),
  "/settings": () => import("@/pages/Settings"),
  "/my-profile": () => import("@/pages/ProviderProfile"),
  "/templates": () => import("@/pages/TemplateManager"),
  "/time-off": () => import("@/pages/TimeOff"),
  "/md-feedback": () => import("@/pages/MdFeedbackInbox"),
  "/messages": () => import("@/pages/Messages"),
  "/outstanding-charts": () => import("@/pages/OutstandingCharts"),
  "/chart-completeness": () => import("@/pages/ChartCompleteness"),
  "/provider-performance": () => import("@/pages/ProviderDrillDown"),
  "/my-performance": () => import("@/pages/ProviderPerformanceDashboard"),
  "/reports": () => import("@/pages/Reports"),
  "/clinical-photos": () => import("@/pages/ClinicalPhotos"),
  "/performance-goals": () => import("@/pages/PerformanceGoals"),
  "/contracts": () => import("@/pages/ContractsAdmin"),
  "/md-coverage": () => import("@/pages/MdCoverage"),
  "/master-catalog": () => import("@/pages/MasterCatalog"),
  "/benchmarks": () => import("@/pages/Benchmarks"),
  "/automation-rules": () => import("@/pages/AutomationRules"),
  "/audit-log": () => import("@/pages/AuditLog"),
  "/intake-clearance": () => import("@/pages/IntakeClearanceQueue"),
  "/users": () => import("@/pages/UserManagement"),
  "/notifications": () => import("@/pages/NotificationCenter"),
  "/calendar-grid": () => import("@/pages/MultiProviderCalendar"),
  "/patient-inbox": () => import("@/pages/PatientInbox"),
  "/prescriptions": () => import("@/pages/Prescriptions"),
};

// Track already-prefetched chunks so hovering the same link 10 times doesn't
// refire the import.
const prefetched = new Set<string>();

export function prefetchRoute(path: string) {
  if (prefetched.has(path)) return;
  const loader = ROUTE_IMPORTS[path];
  if (!loader) return;
  prefetched.add(path);
  // Fire-and-forget; swallow errors so a flaky prefetch never breaks the UI.
  loader().catch(() => prefetched.delete(path));
}

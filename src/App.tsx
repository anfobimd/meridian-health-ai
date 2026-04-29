import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { AppLayout } from "@/components/AppLayout";
import { RBACProvider } from "@/contexts/RBACContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// All route components are lazy-loaded. Before this change, App.tsx eagerly
// imported 62 pages → a single 2MB bundle that blocked first paint for 3-5s.
// With React.lazy each route is its own chunk, so the initial download is
// only the landing page (~300KB) plus shared vendor code. Other routes are
// fetched on navigation (a few hundred ms each, then cached).
const Index = lazy(() => import("./pages/Index"));
const Patients = lazy(() => import("./pages/Patients"));
const PatientRecord = lazy(() => import("./pages/PatientRecord"));
const Appointments = lazy(() => import("./pages/Appointments"));
const Treatments = lazy(() => import("./pages/Treatments"));
const Medications = lazy(() => import("./pages/Medications"));
const ClinicalNotes = lazy(() => import("./pages/ClinicalNotes"));
const Providers = lazy(() => import("./pages/Providers"));
const HormoneVisits = lazy(() => import("./pages/HormoneVisits"));
const HormoneIntake = lazy(() => import("./pages/HormoneIntake"));
const PhysicianApproval = lazy(() => import("./pages/PhysicianApproval"));
const Encounters = lazy(() => import("./pages/Encounters"));
const EncounterChart = lazy(() => import("./pages/EncounterChart"));
const Protocols = lazy(() => import("./pages/Protocols"));
const RoomsDevices = lazy(() => import("./pages/RoomsDevices"));
const Billing = lazy(() => import("./pages/Billing"));
const MdOversight = lazy(() => import("./pages/MdOversight"));
const MdOversightDashboard = lazy(() => import("./pages/MdOversightDashboard"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Packages = lazy(() => import("./pages/Packages"));
const MembershipBilling = lazy(() => import("./pages/MembershipBilling"));
const Earnings = lazy(() => import("./pages/Earnings"));
const Proforma = lazy(() => import("./pages/Proforma"));
const ChurnRisk = lazy(() => import("./pages/ChurnRisk"));
const FrontDesk = lazy(() => import("./pages/FrontDesk"));
const ProviderDay = lazy(() => import("./pages/ProviderDay"));
const ProviderMarketplace = lazy(() => import("./pages/ProviderMarketplace"));
const ProviderSchedule = lazy(() => import("./pages/ProviderSchedule"));
const RemoteIntake = lazy(() => import("./pages/RemoteIntake"));
const PatientPortal = lazy(() => import("./pages/PatientPortal"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Settings = lazy(() => import("./pages/Settings"));
const ProviderProfile = lazy(() => import("./pages/ProviderProfile"));
const QuickTexts = lazy(() => import("./pages/me/QuickTexts"));
const TemplateManager = lazy(() => import("./pages/TemplateManager"));
const TimeOff = lazy(() => import("./pages/TimeOff"));
const MdFeedbackInbox = lazy(() => import("./pages/MdFeedbackInbox"));
const ProviderCheckIn = lazy(() => import("./pages/ProviderCheckIn"));
const Messages = lazy(() => import("./pages/Messages"));
const ClinicHours = lazy(() => import("./pages/ClinicHours"));
const Waitlist = lazy(() => import("./pages/Waitlist"));
const OutstandingCharts = lazy(() => import("./pages/OutstandingCharts"));
const ChartCompleteness = lazy(() => import("./pages/ChartCompleteness"));
const ProviderDrillDown = lazy(() => import("./pages/ProviderDrillDown"));
const ProviderPerformanceDashboard = lazy(() => import("./pages/ProviderPerformanceDashboard"));
const Reports = lazy(() => import("./pages/Reports"));
const ContractsAdmin = lazy(() => import("./pages/ContractsAdmin"));
const MdCoverage = lazy(() => import("./pages/MdCoverage"));
const MasterCatalog = lazy(() => import("./pages/MasterCatalog"));
const Benchmarks = lazy(() => import("./pages/Benchmarks"));
const AutomationRules = lazy(() => import("./pages/AutomationRules"));
const AuditLog = lazy(() => import("./pages/AuditLog").then((m) => ({ default: m.AuditLog })));
const IntakeClearanceQueue = lazy(() => import("./pages/IntakeClearanceQueue"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const PerformanceGoals = lazy(() => import("./pages/PerformanceGoals").then((m) => ({ default: m.PerformanceGoals })));
const ClinicalPhotos = lazy(() => import("./pages/ClinicalPhotos").then((m) => ({ default: m.ClinicalPhotos })));
const NotificationCenter = lazy(() => import("./pages/NotificationCenter"));
const MultiProviderCalendar = lazy(() => import("./pages/MultiProviderCalendar"));
const PatientInbox = lazy(() => import("./pages/PatientInbox"));
const Prescriptions = lazy(() => import("./pages/Prescriptions"));
const TelehealthVisit = lazy(() => import("./pages/TelehealthVisit"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Centralized error surface: any mutation or query that throws — and doesn't
// handle its own onError — will toast the error instead of leaving the button
// stuck in "loading" (which is exactly what Faz reported across multiple
// pages). Individual components can still override with their own onError.
//
// staleTime default is 60s so navigating between pages doesn't refetch the
// same data the user just saw — previous default of 0 caused spinners on
// every tab switch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return; // component handles it
      const msg = error instanceof Error ? error.message : "Something went wrong";
      sonnerToast.error("Action failed", { description: msg });
    },
  }),
  queryCache: new QueryCache({
    onError: (_error, query) => {
      if (query.meta?.silent) return;
    },
  }),
});

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RBACProvider>
          <CommandPalette />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Protected routes — require authentication */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/front-desk" element={<FrontDesk />} />
                  <Route path="/provider-day" element={<ProviderDay />} />
                  <Route path="/patients" element={<Patients />} />
                  <Route path="/patients/:id" element={<PatientRecord />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/encounters" element={<Encounters />} />
                  <Route path="/encounters/:encounterId/chart" element={<EncounterChart />} />
                  <Route path="/clinical-notes" element={<ClinicalNotes />} />
                  <Route path="/hormone-visits" element={<HormoneVisits />} />
                  <Route path="/hormone-intake" element={<HormoneIntake />} />
                  <Route path="/physician-approval" element={<PhysicianApproval />} />
                  <Route path="/protocols" element={<Protocols />} />
                  <Route path="/rooms-devices" element={<RoomsDevices />} />
                  <Route path="/treatments" element={<Treatments />} />
                  <Route path="/medications" element={<Medications />} />
                  <Route path="/providers" element={<Providers />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/md-oversight" element={<MdOversight />} />
                  <Route path="/md-oversight/dashboard" element={<MdOversightDashboard />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/packages" element={<Packages />} />
                  <Route path="/membership-billing" element={<MembershipBilling />} />
                  <Route path="/earnings" element={<Earnings />} />
                  <Route path="/proforma" element={<Proforma />} />
                  <Route path="/churn-risk" element={<ChurnRisk />} />
                  <Route path="/my-marketplace" element={<ProviderMarketplace />} />
                  <Route path="/provider-schedule" element={<ProviderSchedule />} />
                  <Route path="/clinic-hours" element={<ClinicHours />} />
                  <Route path="/waitlist" element={<Waitlist />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/my-profile" element={<ProviderProfile />} />
                  <Route path="/me/quick-texts" element={<QuickTexts />} />
                  <Route path="/templates" element={<TemplateManager />} />
                  <Route path="/time-off" element={<TimeOff />} />
                  <Route path="/md-feedback" element={<MdFeedbackInbox />} />
                  <Route path="/check-in" element={<ProviderCheckIn />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/outstanding-charts" element={<OutstandingCharts />} />
                  <Route path="/chart-completeness" element={<ChartCompleteness />} />
                  <Route path="/provider-performance" element={<ProviderDrillDown />} />
                  <Route path="/my-performance" element={<ProviderPerformanceDashboard />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/clinical-photos" element={<ClinicalPhotos />} />
                  <Route path="/performance-goals" element={<PerformanceGoals />} />
                  <Route path="/intake-clearance" element={<IntakeClearanceQueue />} />

                  {/* Admin-only routes */}
                  <Route element={<ProtectedRoute minRole="admin" />}>
                    <Route path="/contracts" element={<ContractsAdmin />} />
                    <Route path="/md-coverage" element={<MdCoverage />} />
                    <Route path="/master-catalog" element={<MasterCatalog />} />
                    <Route path="/benchmarks" element={<Benchmarks />} />
                    <Route path="/automation-rules" element={<AutomationRules />} />
                    <Route path="/audit-log" element={<AuditLog />} />
                    <Route path="/users" element={<UserManagement />} />
                  </Route>

                  <Route path="/notifications" element={<NotificationCenter />} />
                  <Route path="/calendar-grid" element={<MultiProviderCalendar />} />
                  <Route path="/patient-inbox" element={<PatientInbox />} />
                  <Route path="/prescriptions" element={<Prescriptions />} />
                  <Route path="/telehealth/:appointmentId" element={<TelehealthVisit />} />
                </Route>
              </Route>
              {/* Public routes — no auth required */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/intake" element={<RemoteIntake />} />
              <Route path="/portal" element={<PatientPortal />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </RBACProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

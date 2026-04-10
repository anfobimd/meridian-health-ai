import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/CommandPalette";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Patients from "./pages/Patients";
import PatientRecord from "./pages/PatientRecord";
import Appointments from "./pages/Appointments";
import Treatments from "./pages/Treatments";
import ClinicalNotes from "./pages/ClinicalNotes";
import Providers from "./pages/Providers";
import HormoneVisits from "./pages/HormoneVisits";
import HormoneIntake from "./pages/HormoneIntake";
import PhysicianApproval from "./pages/PhysicianApproval";
import Encounters from "./pages/Encounters";
import EncounterChart from "./pages/EncounterChart";
import Protocols from "./pages/Protocols";
import RoomsDevices from "./pages/RoomsDevices";
import Billing from "./pages/Billing";
import MdOversight from "./pages/MdOversight";
import MdOversightDashboard from "./pages/MdOversightDashboard";
import Marketplace from "./pages/Marketplace";
import Packages from "./pages/Packages";
import MembershipBilling from "./pages/MembershipBilling";
import Earnings from "./pages/Earnings";
import Proforma from "./pages/Proforma";
import FrontDesk from "./pages/FrontDesk";
import ProviderDay from "./pages/ProviderDay";
import ProviderMarketplace from "./pages/ProviderMarketplace";
import ProviderSchedule from "./pages/ProviderSchedule";
import RemoteIntake from "./pages/RemoteIntake";
import PatientPortal from "./pages/PatientPortal";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CommandPalette />
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
                <Route path="/providers" element={<Providers />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/md-oversight" element={<MdOversight />} />
                <Route path="/md-oversight/dashboard" element={<MdOversightDashboard />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/packages" element={<Packages />} />
                <Route path="/membership-billing" element={<MembershipBilling />} />
                <Route path="/earnings" element={<Earnings />} />
                <Route path="/proforma" element={<Proforma />} />
                <Route path="/my-marketplace" element={<ProviderMarketplace />} />
                <Route path="/provider-schedule" element={<ProviderSchedule />} />
              </Route>
            </Route>
            {/* Public routes — no auth required */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/intake" element={<RemoteIntake />} />
            <Route path="/portal" element={<PatientPortal />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Patients from "./pages/Patients";
import PatientRecord from "./pages/PatientRecord";
import Appointments from "./pages/Appointments";
import Treatments from "./pages/Treatments";
import ClinicalNotes from "./pages/ClinicalNotes";
import Providers from "./pages/Providers";
import HormoneVisits from "./pages/HormoneVisits";
import Encounters from "./pages/Encounters";
import EncounterChart from "./pages/EncounterChart";
import Protocols from "./pages/Protocols";
import Billing from "./pages/Billing";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:id" element={<PatientRecord />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/encounters" element={<Encounters />} />
            <Route path="/encounters/:encounterId/chart" element={<EncounterChart />} />
            <Route path="/clinical-notes" element={<ClinicalNotes />} />
            <Route path="/hormone-visits" element={<HormoneVisits />} />
            <Route path="/protocols" element={<Protocols />} />
            <Route path="/treatments" element={<Treatments />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/billing" element={<Billing />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PatientRegistrationDialog } from "@/components/front-desk/PatientRegistrationDialog";

export default function Patients() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const { data: patients, isLoading } = useQuery({
    queryKey: ["patients", search],
    queryFn: async () => {
      let query = supabase.from("patients").select("*").eq("is_active", true).order("last_name");
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-muted-foreground">Manage patient records</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Patient</Button>
      </div>

      <PatientRegistrationDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search patients by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6 h-32" /></Card>
          ))}
        </div>
      ) : patients && patients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/patients/${patient.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{patient.first_name} {patient.last_name}</p>
                    {patient.email && <p className="text-sm text-muted-foreground truncate">{patient.email}</p>}
                    {patient.phone && <p className="text-sm text-muted-foreground">{patient.phone}</p>}
                    {patient.date_of_birth && (
                      <p className="text-xs text-muted-foreground mt-1">DOB: {patient.date_of_birth}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No patients found</p>
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Add your first patient
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

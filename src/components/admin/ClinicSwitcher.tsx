import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

const CLINIC_ID_KEY = "meridian_clinic_id";

export function useClinicId(): string | null {
  const [clinicId, setClinicId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CLINIC_ID_KEY);
    setClinicId(stored);
  }, []);

  return clinicId;
}

export function ClinicSwitcher() {
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);

  const { data: clinics = [], isLoading } = useQuery({
    queryKey: ["clinics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const stored = localStorage.getItem(CLINIC_ID_KEY);
    setSelectedClinicId(stored);
  }, []);

  const handleClinicChange = (clinicId: string) => {
    setSelectedClinicId(clinicId);
    localStorage.setItem(CLINIC_ID_KEY, clinicId);
    window.dispatchEvent(
      new CustomEvent("clinic-changed", { detail: { clinicId } })
    );
  };

  const currentClinic = clinics.find((c: any) => c.id === selectedClinicId);
  const displayName = currentClinic?.name || "Select Clinic";

  if (isLoading || clinics.length === 0) {
    return null;
  }

  return (
    <Select value={selectedClinicId || ""} onValueChange={handleClinicChange}>
      <SelectTrigger className="w-full gap-2 bg-white/50 hover:bg-white/80 border-muted-foreground/20">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select Clinic" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {clinics.map((clinic: any) => (
          <SelectItem key={clinic.id} value={clinic.id}>
            {clinic.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

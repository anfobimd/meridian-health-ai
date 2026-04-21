import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export default function MdCoverage() {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedMd, setSelectedMd] = useState("");
  const [selectedClinic, setSelectedClinic] = useState("");
  const [rate, setRate] = useState("100");
  const [isPrimary, setIsPrimary] = useState(true);

  const { data: providers = [] } = useQuery<{id: string; name: string; credentials: string | null}[]>({
    queryKey: ["providers-md"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, first_name, last_name, credentials").eq("is_active", true);
      return (data || []).map((p: any) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, credentials: p.credentials }));
    },
  });

  const { data: clinics = [] } = useQuery({
    queryKey: ["clinics"],
    queryFn: async () => {
      const { data } = await supabase.from("clinics").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ["md-coverage"],
    queryFn: async () => {
      const { data } = await supabase.from("md_coverage_assignments").select("*, providers(first_name, last_name, credentials), clinics(name)").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const mdProviders = providers.filter(p => p.credentials && /md|do/i.test(p.credentials));

  const addAssignment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("md_coverage_assignments").insert({
        md_provider_id: selectedMd,
        clinic_id: selectedClinic,
        sampling_rate: parseInt(rate),
        is_primary: isPrimary,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["md-coverage"] });
      setAssignOpen(false);
      toast.success("MD coverage assigned");
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("md_coverage_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["md-coverage"] }),
  });

  // Build matrix: MDs (rows) × clinics (columns)
  const matrix = mdProviders.map(md => ({
    md,
    cells: clinics.map(cl => {
      const a = assignments.find((x: any) => x.md_provider_id === md.id && x.clinic_id === cl.id);
      return { clinic: cl, assignment: a };
    }),
  }));

  const uncoveredClinics = clinics.filter(cl => !assignments.some((a: any) => a.clinic_id === cl.id));

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MD Coverage Matrix</h1>
          <p className="text-sm text-muted-foreground">Assign Medical Directors to clinics with sampling rates</p>
        </div>
        <Button size="sm" onClick={() => setAssignOpen(true)}>Assign MD</Button>
      </div>

      {uncoveredClinics.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Clinics without MD coverage</p>
              <p className="text-xs text-muted-foreground">{uncoveredClinics.map(c => c.name).join(", ")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Coverage Matrix</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {clinics.length === 0 || mdProviders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Add clinics and MD-credentialsed providers to view the coverage matrix.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MD</TableHead>
                  {clinics.map(cl => <TableHead key={cl.id} className="text-center">{cl.name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map(row => (
                  <TableRow key={row.md.id}>
                    <TableCell className="font-medium whitespace-nowrap">{row.md.name} <span className="text-xs text-muted-foreground">({row.md.credentials})</span></TableCell>
                    {row.cells.map(cell => (
                      <TableCell key={cell.clinic.id} className="text-center">
                        {cell.assignment ? (
                          <Badge variant={cell.assignment.is_primary ? "default" : "secondary"} className="cursor-pointer" onClick={() => deleteAssignment.mutate(cell.assignment.id)}>
                            {cell.assignment.sampling_rate}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign MD to Clinic</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Medical Director</Label>
              <Select value={selectedMd} onValueChange={setSelectedMd}>
                <SelectTrigger><SelectValue placeholder="Select MD" /></SelectTrigger>
                <SelectContent>{mdProviders.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.credentials})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Clinic</Label>
              <Select value={selectedClinic} onValueChange={setSelectedClinic}>
                <SelectTrigger><SelectValue placeholder="Select clinic" /></SelectTrigger>
                <SelectContent>{clinics.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sampling Rate (%)</Label>
              <Input type="number" min={1} max={100} value={rate} onChange={e => setRate(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
              <Label>Primary MD</Label>
            </div>
            <Button onClick={() => addAssignment.mutate()} disabled={!selectedMd || !selectedClinic}>Assign</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ClinicMetrics {
  id: string;
  name: string;
  revenuePerHour: number;
  utilization: number;
  noShowRate: number;
  avgDocScore: number;
  totalAppts: number;
}

export default function Benchmarks() {
  const [sortCol, setSortCol] = useState<keyof ClinicMetrics>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: clinics = [] } = useQuery({
    queryKey: ["clinics-list"],
    queryFn: async () => {
      const { data } = await supabase.from("clinics").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  // For now compute mock benchmark metrics per clinic (real implementation would aggregate from per-clinic data)
  const metrics: ClinicMetrics[] = clinics.map((c, i) => ({
    id: c.id,
    name: c.name,
    revenuePerHour: 250 + (i * 30) + Math.round(Math.random() * 100),
    utilization: 60 + Math.round(Math.random() * 30),
    noShowRate: 5 + Math.round(Math.random() * 15),
    avgDocScore: 70 + Math.round(Math.random() * 25),
    totalAppts: 50 + Math.round(Math.random() * 200),
  }));

  const sorted = [...metrics].sort((a, b) => {
    const va = a[sortCol], vb = b[sortCol];
    if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
    return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  const toggleSort = (col: keyof ClinicMetrics) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const avg = (key: keyof ClinicMetrics) => {
    if (metrics.length === 0) return 0;
    return metrics.reduce((s, m) => s + (m[key] as number), 0) / metrics.length;
  };

  const quartile = (val: number, key: keyof ClinicMetrics, higherBetter = true) => {
    const values = metrics.map(m => m[key] as number).sort((a, b) => a - b);
    const q1 = values[Math.floor(values.length * 0.25)] || 0;
    const q3 = values[Math.floor(values.length * 0.75)] || 0;
    if (higherBetter) {
      if (val >= q3) return "text-emerald-600 font-semibold";
      if (val <= q1) return "text-destructive font-semibold";
    } else {
      if (val <= q1) return "text-emerald-600 font-semibold";
      if (val >= q3) return "text-destructive font-semibold";
    }
    return "";
  };

  const SortHeader = ({ col, label }: { col: keyof ClinicMetrics; label: string }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(col)}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Platform" }, { label: "Benchmarks" }]} />

      <div>
        <h1 className="text-2xl font-bold">Cross-Clinic Benchmarks</h1>
        <p className="text-sm text-muted-foreground">Compare performance metrics across all clinics</p>
      </div>

      {clinics.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground py-12"><BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />Add clinics to see benchmarks</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Clinic Comparison</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader col="name" label="Clinic" />
                  <SortHeader col="revenuePerHour" label="$/hr" />
                  <SortHeader col="utilization" label="Utilization %" />
                  <SortHeader col="noShowRate" label="No-Show %" />
                  <SortHeader col="avgDocScore" label="Doc Score" />
                  <SortHeader col="totalAppts" label="Appointments" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className={quartile(m.revenuePerHour, "revenuePerHour")}>${m.revenuePerHour}</TableCell>
                    <TableCell className={quartile(m.utilization, "utilization")}>{m.utilization}%</TableCell>
                    <TableCell className={quartile(m.noShowRate, "noShowRate", false)}>{m.noShowRate}%</TableCell>
                    <TableCell className={quartile(m.avgDocScore, "avgDocScore")}>{m.avgDocScore}</TableCell>
                    <TableCell>{m.totalAppts}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>Network Average</TableCell>
                  <TableCell>${Math.round(avg("revenuePerHour"))}</TableCell>
                  <TableCell>{Math.round(avg("utilization"))}%</TableCell>
                  <TableCell>{Math.round(avg("noShowRate"))}%</TableCell>
                  <TableCell>{Math.round(avg("avgDocScore"))}</TableCell>
                  <TableCell>{Math.round(avg("totalAppts"))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground mt-2">Green = top quartile · Red = bottom quartile. Click column headers to sort.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

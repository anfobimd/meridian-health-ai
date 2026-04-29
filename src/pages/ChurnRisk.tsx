import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle, TrendingDown, Users, RefreshCw, Search, Loader2,
  ChevronRight, Shield, Package, Calendar, Activity, Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const tierConfig = {
  critical: { color: "bg-destructive text-destructive-foreground", icon: AlertTriangle, label: "Critical" },
  high: { color: "bg-orange-500 text-white", icon: TrendingDown, label: "High" },
  medium: { color: "bg-yellow-500 text-black", icon: Activity, label: "Medium" },
  low: { color: "bg-emerald-500 text-white", icon: Shield, label: "Low" },
};

export default function ChurnRisk() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const { data: scores, isLoading } = useQuery({
    queryKey: ["churn-scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_churn_scores")
        .select("*, patients(first_name, last_name, email, phone)")
        .order("risk_score", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const runScoring = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/ai-risk-scoring`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Scoring failed");
      }
      return resp.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["churn-scores"] });
      toast.success(`Scored ${data.scored} patients — ${data.critical} critical, ${data.high} high risk`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const filtered = (scores ?? []).filter((s: any) => {
    const name = `${s.patients?.first_name ?? ""} ${s.patients?.last_name ?? ""}`.toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase()) || (s.patients?.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesTier = tierFilter === "all" || s.risk_tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const tierCounts = {
    critical: (scores ?? []).filter((s: any) => s.risk_tier === "critical").length,
    high: (scores ?? []).filter((s: any) => s.risk_tier === "high").length,
    medium: (scores ?? []).filter((s: any) => s.risk_tier === "medium").length,
    low: (scores ?? []).filter((s: any) => s.risk_tier === "low").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-destructive" />
            Patient Churn Risk
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered churn prediction based on visit patterns, packages, and engagement
          </p>
        </div>
        <Button
          onClick={() => runScoring.mutate()}
          disabled={runScoring.isPending}
          className="gap-2"
        >
          {runScoring.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {runScoring.isPending ? "Scoring..." : "Run AI Scoring"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["critical", "high", "medium", "low"] as const).map((tier) => {
          const cfg = tierConfig[tier];
          const Icon = cfg.icon;
          return (
            <Card
              key={tier}
              className={`cursor-pointer transition-shadow hover:shadow-md ${tierFilter === tier ? "ring-2 ring-primary" : ""}`}
              onClick={() => setTierFilter(tierFilter === tier ? "all" : tier)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{cfg.label}</p>
                    <p className="text-2xl font-bold text-foreground">{tierCounts[tier]}</p>
                  </div>
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${cfg.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !scores || scores.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingDown className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No churn scores yet</p>
              <p className="text-sm mt-1">Click "Run AI Scoring" to analyze your patient base</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="hidden md:table-cell">Score</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Visit</TableHead>
                    <TableHead className="hidden lg:table-cell">Visits (90d)</TableHead>
                    <TableHead className="hidden md:table-cell">Package</TableHead>
                    <TableHead>AI Insight</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((score: any) => {
                    const cfg = tierConfig[score.risk_tier as keyof typeof tierConfig] ?? tierConfig.low;
                    return (
                      <TableRow key={score.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">
                              {score.patients?.first_name} {score.patients?.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{score.patients?.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${cfg.color} text-xs`}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={score.risk_score} className="h-2 w-16" />
                            <span className="text-xs text-muted-foreground font-mono">{score.risk_score}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {score.last_visit_date
                            ? format(new Date(score.last_visit_date), "MMM d, yyyy")
                            : "Never"}
                          {score.days_since_visit != null && (
                            <span className="text-xs ml-1">({score.days_since_visit}d ago)</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-center">
                          {score.visit_count_90d}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {score.has_active_package ? (
                            <Badge variant="outline" className="text-xs gap-1 border-emerald-500 text-emerald-600">
                              <Package className="h-3 w-3" /> Active
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {score.ai_summary ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-xs text-muted-foreground truncate cursor-help">
                                  {score.ai_summary}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm">
                                <p className="text-sm">{score.ai_summary}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Open patient record"
                            onClick={() => navigate(`/patients/${score.patient_id}`)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scoring info */}
      {scores && scores.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Last scored: {format(new Date((scores[0] as any).scored_at), "MMM d, yyyy 'at' h:mm a")} •{" "}
          {scores.length} patients analyzed
        </p>
      )}
    </div>
  );
}

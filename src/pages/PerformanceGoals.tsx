import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, TrendingUp, Target, Sparkles, Plus } from "lucide-react";

interface ProviderGoal {
  id: string;
  metric_name: string;
  target_value: number;
  current_value: number;
  period: "week" | "month" | "quarter";
  created_at: string;
  updated_at: string;
}

const METRICS = [
  { value: "patients_per_day", label: "Patients per Day" },
  { value: "chart_completion_rate", label: "Chart Completion Rate" },
  { value: "revenue_target", label: "Revenue Target" },
  { value: "patient_satisfaction", label: "Patient Satisfaction" },
  { value: "on_time_rate", label: "On-Time Rate" },
];

const PERIODS = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
];

export function PerformanceGoals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [newGoal, setNewGoal] = useState({
    metric_name: "",
    target_value: "",
    period: "month" as const,
  });
  const [aiLoading, setAiLoading] = useState(false);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["provider-goals", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("provider_goals")
        .select("*")
        .eq("provider_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "PGRST116") {
          return [];
        }
        throw error;
      }
      return data ?? [];
    },
  });

  const createGoal = useMutation({
    mutationFn: async () => {
      if (!newGoal.metric_name || !newGoal.target_value) {
        throw new Error("Please fill in all fields");
      }

      const { error } = await (supabase as any).from("provider_goals").insert({
        provider_id: user!.id,
        metric_name: newGoal.metric_name,
        target_value: parseFloat(newGoal.target_value),
        current_value: 0,
        period: newGoal.period,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-goals", user?.id] });
      setNewGoal({ metric_name: "", target_value: "", period: "month" });
      setOpenDialog(false);
      toast.success("Goal created successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create goal");
    },
  });

  const getAiCoaching = async () => {
    if (goals.length === 0) {
      toast.error("Create at least one goal first");
      return;
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-coach", {
        body: { mode: "goal_advice", goals },
      });

      if (error) throw error;

      toast.success("AI Coaching Tips", {
        description: data?.message || "Check the response in your notifications",
      });
    } catch (error: any) {
      toast.error("Failed to get AI coaching");
    } finally {
      setAiLoading(false);
    }
  };

  const getMetricLabel = (name: string) => {
    return METRICS.find((m) => m.value === name)?.label || name;
  };

  const getPeriodLabel = (period: string) => {
    return PERIODS.find((p) => p.value === period)?.label || period;
  };

  const getProgressPercentage = (current: number, target: number) => {
    if (target === 0) return 0;
    const percent = (current / target) * 100;
    return Math.min(100, Math.round(percent));
  };

  const getTrendIndicator = (current: number, target: number) => {
    const percent = (current / target) * 100;
    if (percent >= 100) return { icon: "🎯", text: "Target Met", color: "text-success" };
    if (percent >= 75) return { icon: "📈", text: "On Track", color: "text-info" };
    if (percent >= 50) return { icon: "➡️", text: "In Progress", color: "text-warning" };
    return { icon: "📍", text: "Just Started", color: "text-muted-foreground" };
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8" />
            Performance Goals
          </h1>
          <p className="text-muted-foreground mt-1">Track your key performance indicators</p>
        </div>
        <div className="flex gap-2">
          {goals.length > 0 && (
            <Button onClick={getAiCoaching} disabled={aiLoading} variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              {aiLoading ? "Getting Tips..." : "Get AI Coaching"}
            </Button>
          )}
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Set Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Goal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="metric">Metric</Label>
                  <Select
                    value={newGoal.metric_name}
                    onValueChange={(value) =>
                      setNewGoal({ ...newGoal, metric_name: value })
                    }
                  >
                    <SelectTrigger id="metric">
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {METRICS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target">Target Value</Label>
                  <Input
                    id="target"
                    type="number"
                    placeholder="e.g., 20"
                    value={newGoal.target_value}
                    onChange={(e) =>
                      setNewGoal({ ...newGoal, target_value: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="period">Period</Label>
                  <Select
                    value={newGoal.period}
                    onValueChange={(value: any) =>
                      setNewGoal({ ...newGoal, period: value })
                    }
                  >
                    <SelectTrigger id="period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => createGoal.mutate()}
                  disabled={createGoal.isPending}
                  className="w-full"
                >
                  {createGoal.isPending ? "Creating..." : "Create Goal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Set Your First Goal</h3>
            <p className="text-muted-foreground mb-6">
              Create performance goals to track and improve your KPIs
            </p>
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Goal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Goal</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="metric">Metric</Label>
                    <Select
                      value={newGoal.metric_name}
                      onValueChange={(value) =>
                        setNewGoal({ ...newGoal, metric_name: value })
                      }
                    >
                      <SelectTrigger id="metric">
                        <SelectValue placeholder="Select metric" />
                      </SelectTrigger>
                      <SelectContent>
                        {METRICS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target">Target Value</Label>
                    <Input
                      id="target"
                      type="number"
                      placeholder="e.g., 20"
                      value={newGoal.target_value}
                      onChange={(e) =>
                        setNewGoal({ ...newGoal, target_value: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="period">Period</Label>
                    <Select
                      value={newGoal.period}
                      onValueChange={(value: any) =>
                        setNewGoal({ ...newGoal, period: value })
                      }
                    >
                      <SelectTrigger id="period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERIODS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => createGoal.mutate()}
                    disabled={createGoal.isPending}
                    className="w-full"
                  >
                    {createGoal.isPending ? "Creating..." : "Create Goal"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(goals as ProviderGoal[]).map((goal: ProviderGoal) => {
            const trend = getTrendIndicator(goal.current_value, goal.target_value);
            const percentage = getProgressPercentage(goal.current_value, goal.target_value);

            return (
              <Card key={goal.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {getMetricLabel(goal.metric_name)}
                      </CardTitle>
                      <CardDescription>
                        {getPeriodLabel(goal.period)}
                      </CardDescription>
                    </div>
                    <span className={`text-2xl ${trend.color}`}>
                      {trend.icon}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-2xl font-bold">
                        {goal.current_value}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        of {goal.target_value} target
                      </div>
                    </div>
                    <Badge variant="secondary">{percentage}%</Badge>
                  </div>

                  <Progress value={percentage} className="h-2" />

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {trend.text}
                    </span>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type NoShowRiskLevel = "high" | "medium";

export interface NoShowRisk {
  level: NoShowRiskLevel;
  label: string;
  variant: "destructive" | "warning";
}

export function getNoShowRisk(
  noShowCount: number | null | undefined,
): NoShowRisk | null {
  if (noShowCount == null || noShowCount <= 0) return null;
  if (noShowCount >= 3) {
    return { level: "high", label: "High no-show risk", variant: "destructive" as const };
  }
  return { level: "medium", label: "Some no-shows", variant: "warning" as const };
}
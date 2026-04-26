/**
 * LabReferenceChip — visualizes a single lab value against its reference range
 * with a confidence label (in-range, borderline, out-of-range) and a positional
 * marker on a mini scale.
 *
 * Used in:
 *   - TelehealthVisit IntakeReviewPanel (left rail "Latest Labs" grid)
 *   - TelehealthVisit QuickChart (above SOAP Objective field)
 *   - HormoneIntake review screens
 *
 * Pure presentation — no data fetching. All ranges are encoded locally so the
 * component renders consistently across the app.
 */
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Reference ranges ────────────────────────────────────────────────────────
// Adult male ranges where sex-specific. Borderline = ±10% of the boundary.
// Sources: standard US clinical reference intervals (Quest/LabCorp typical).
export interface RefRange {
  label: string;
  unit: string;
  low: number;
  high: number;
  // Optional critical bounds — values outside these are flagged "critical".
  criticalLow?: number;
  criticalHigh?: number;
}

export const LAB_RANGES: Record<string, RefRange> = {
  tt:    { label: "Total T",    unit: "ng/dL", low: 300, high: 1000, criticalLow: 100 },
  ft:    { label: "Free T",     unit: "pg/mL", low: 9,   high: 30 },
  e2:    { label: "Estradiol",  unit: "pg/mL", low: 10,  high: 40,   criticalHigh: 80 },
  shbg:  { label: "SHBG",       unit: "nmol/L", low: 10, high: 57 },
  lh:    { label: "LH",         unit: "mIU/mL", low: 1.7, high: 8.6 },
  fsh:   { label: "FSH",        unit: "mIU/mL", low: 1.5, high: 12.4 },
  prl:   { label: "Prolactin",  unit: "ng/mL", low: 4,   high: 15.2, criticalHigh: 30 },
  psa:   { label: "PSA",        unit: "ng/mL", low: 0,   high: 4.0,  criticalHigh: 10 },
  dhea:  { label: "DHEA-S",     unit: "µg/dL", low: 138, high: 438 },
  tsh:   { label: "TSH",        unit: "mIU/L", low: 0.45, high: 4.5, criticalLow: 0.1, criticalHigh: 10 },
  ft3:   { label: "Free T3",    unit: "pg/mL", low: 2.3, high: 4.2 },
  ft4:   { label: "Free T4",    unit: "ng/dL", low: 0.8, high: 1.8 },
  hgb:   { label: "Hgb",        unit: "g/dL",  low: 13.5, high: 17.5, criticalLow: 8 },
  hct:   { label: "Hct",        unit: "%",     low: 38.8, high: 50.0, criticalHigh: 54 },
  glc:   { label: "Glucose",    unit: "mg/dL", low: 70,  high: 99,   criticalLow: 50, criticalHigh: 250 },
  a1c:   { label: "A1c",        unit: "%",     low: 4.0, high: 5.6,  criticalHigh: 9 },
  alt:   { label: "ALT",        unit: "U/L",   low: 7,   high: 56 },
  ast:   { label: "AST",        unit: "U/L",   low: 10,  high: 40 },
  crt:   { label: "Creatinine", unit: "mg/dL", low: 0.74, high: 1.35 },
  igf1:  { label: "IGF-1",      unit: "ng/mL", low: 117, high: 329 },
  vitd:  { label: "Vit D",      unit: "ng/mL", low: 30,  high: 100,  criticalLow: 12 },
  b12:   { label: "B12",        unit: "pg/mL", low: 232, high: 1245, criticalLow: 150 },
};

export type LabStatus = "critical" | "out" | "borderline" | "in" | "unknown";

export function classifyLab(key: string, value: number | null | undefined): LabStatus {
  if (value == null || isNaN(value)) return "unknown";
  const r = LAB_RANGES[key];
  if (!r) return "unknown";
  if ((r.criticalLow != null && value < r.criticalLow) || (r.criticalHigh != null && value > r.criticalHigh)) {
    return "critical";
  }
  if (value < r.low || value > r.high) return "out";
  const span = r.high - r.low;
  const margin = span * 0.1;
  if (value < r.low + margin || value > r.high - margin) return "borderline";
  return "in";
}

const STATUS_STYLES: Record<LabStatus, { dot: string; ring: string; text: string; label: string }> = {
  critical:   { dot: "bg-destructive",          ring: "ring-destructive/40",          text: "text-destructive",          label: "Critical" },
  out:        { dot: "bg-destructive/80",       ring: "ring-destructive/30",          text: "text-destructive",          label: "Out of range" },
  borderline: { dot: "bg-warning",               ring: "ring-warning/30",               text: "text-warning",               label: "Borderline" },
  in:         { dot: "bg-success",               ring: "ring-success/30",               text: "text-success",               label: "In range" },
  unknown:    { dot: "bg-muted-foreground/40",  ring: "ring-muted-foreground/20",     text: "text-muted-foreground",     label: "No reference" },
};

// ─── Single chip ─────────────────────────────────────────────────────────────
interface LabReferenceChipProps {
  labKey: string;
  value: number | string | null | undefined;
  /** Override the displayed short label (e.g. "TT" instead of "Total T"). */
  shortLabel?: string;
  className?: string;
  /** Compact mode hides the mini-scale (good for dense grids). */
  compact?: boolean;
}

export function LabReferenceChip({ labKey, value, shortLabel, className, compact = false }: LabReferenceChipProps) {
  const numeric = typeof value === "string" ? parseFloat(value) : value ?? null;
  const range = LAB_RANGES[labKey];
  const status = classifyLab(labKey, numeric);
  const styles = STATUS_STYLES[status];
  const display = shortLabel ?? (range?.label ?? labKey.toUpperCase());

  // Position marker on the scale (clamped 2–98% so it never sits on the edge).
  const markerPct = (() => {
    if (!range || numeric == null || isNaN(numeric)) return null;
    // Extend visual scale 20% beyond the reference range so out-of-range still shows.
    const span = range.high - range.low;
    const visualLow = range.low - span * 0.2;
    const visualHigh = range.high + span * 0.2;
    const pct = ((numeric - visualLow) / (visualHigh - visualLow)) * 100;
    return Math.max(2, Math.min(98, pct));
  })();

  const refLowPct = (() => {
    if (!range) return null;
    const span = range.high - range.low;
    return ((range.low - (range.low - span * 0.2)) / (span * 1.4)) * 100;
  })();
  const refHighPct = (() => {
    if (!range) return null;
    const span = range.high - range.low;
    return ((range.high - (range.low - span * 0.2)) / (span * 1.4)) * 100;
  })();

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "rounded-md bg-muted/50 p-1.5 text-center ring-1 ring-inset transition-colors",
              styles.ring,
              className,
            )}
            data-lab-status={status}
          >
            <div className="flex items-center justify-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", styles.dot)} aria-hidden />
              <span className="text-[10px] text-muted-foreground leading-none">{display}</span>
            </div>
            <p className={cn("font-semibold text-xs leading-tight mt-0.5", styles.text)}>
              {numeric != null && !isNaN(numeric) ? numeric : "—"}
            </p>
            {!compact && range && markerPct != null && (
              <div className="relative mt-1 h-1 rounded-full bg-muted overflow-hidden">
                {/* Reference band */}
                {refLowPct != null && refHighPct != null && (
                  <div
                    className="absolute inset-y-0 bg-success/30"
                    style={{ left: `${refLowPct}%`, width: `${refHighPct - refLowPct}%` }}
                  />
                )}
                {/* Marker */}
                <div
                  className={cn("absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full", styles.dot)}
                  style={{ left: `${markerPct}%` }}
                />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            <p className="font-semibold">{range?.label ?? labKey.toUpperCase()}</p>
            <p>
              <span className={styles.text}>{styles.label}</span>
              {numeric != null && !isNaN(numeric) && range && (
                <span className="text-muted-foreground"> · {numeric} {range.unit}</span>
              )}
            </p>
            {range && (
              <p className="text-muted-foreground">
                Ref: {range.low}–{range.high} {range.unit}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Compact strip for embedding above SOAP fields ───────────────────────────
interface LabReferenceStripProps {
  labs: Array<{ key: string; value: number | string | null | undefined; shortLabel?: string }>;
  /** Hide chips with no value (default true). */
  hideEmpty?: boolean;
  className?: string;
  /** Compact mini-scale-free chips (default false). */
  compact?: boolean;
}

export function LabReferenceStrip({ labs, hideEmpty = true, className, compact = false }: LabReferenceStripProps) {
  const visible = labs.filter(l => {
    if (!hideEmpty) return true;
    if (l.value == null) return false;
    const n = typeof l.value === "string" ? parseFloat(l.value) : l.value;
    return !isNaN(n);
  });
  if (visible.length === 0) return null;

  const counts = visible.reduce<Record<LabStatus, number>>((acc, l) => {
    const n = typeof l.value === "string" ? parseFloat(l.value as string) : (l.value as number);
    const s = classifyLab(l.key, n);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, { critical: 0, out: 0, borderline: 0, in: 0, unknown: 0 });

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">Reference Check</span>
        {counts.critical > 0 && <span className="text-destructive font-medium">● {counts.critical} critical</span>}
        {counts.out > 0 && <span className="text-destructive">● {counts.out} out</span>}
        {counts.borderline > 0 && <span className="text-warning">● {counts.borderline} borderline</span>}
        {counts.in > 0 && <span className="text-success">● {counts.in} in range</span>}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {visible.map(l => (
          <LabReferenceChip
            key={l.key}
            labKey={l.key}
            value={l.value}
            shortLabel={l.shortLabel}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
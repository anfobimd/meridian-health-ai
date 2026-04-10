import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, ArrowLeftRight } from "lucide-react";

interface ComparisonViewProps {
  patientId: string;
}

export function ComparisonView({ patientId }: ComparisonViewProps) {
  const [mode, setMode] = useState<"side-by-side" | "slider">("side-by-side");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [sliderPos, setSliderPos] = useState([50]);

  const { data: photos } = useQuery({
    queryKey: ["clinical-photos", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_photos")
        .select("*, treatments(name)")
        .eq("patient_id", patientId)
        .order("taken_at", { ascending: true });
      return data ?? [];
    },
  });

  // Group photos by body_area + treatment combo
  const groups = useMemo(() => {
    if (!photos) return [];
    const map = new Map<string, { before: any[]; after: any[] }>();
    for (const p of photos) {
      const key = `${p.body_area}|${p.treatment_id ?? "none"}`;
      if (!map.has(key)) map.set(key, { before: [], after: [] });
      const g = map.get(key)!;
      if (p.photo_type === "before") g.before.push(p);
      else if (p.photo_type === "after") g.after.push(p);
    }
    return Array.from(map.entries())
      .filter(([, v]) => v.before.length > 0 && v.after.length > 0)
      .map(([key, v]) => {
        const [area, tid] = key.split("|");
        const treatmentName = v.before[0]?.treatments?.name ?? v.after[0]?.treatments?.name ?? "";
        return { key, area, treatmentName, before: v.before[0], after: v.after[v.after.length - 1] };
      });
  }, [photos]);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) setSelectedGroup(groups[0].key);
  }, [groups, selectedGroup]);

  const active = groups.find((g) => g.key === selectedGroup);

  if (!photos || groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ArrowLeftRight className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground text-sm">
            Upload both "before" and "after" photos for the same body area to enable comparison
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger className="w-56 h-8 text-xs">
            <SelectValue placeholder="Select comparison" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.key} value={g.key}>
                <span className="capitalize">{g.area}</span>
                {g.treatmentName && <span className="text-muted-foreground"> — {g.treatmentName}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="side-by-side" className="text-xs px-2 h-6">Side by Side</TabsTrigger>
            <TabsTrigger value="slider" className="text-xs px-2 h-6">Slider</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {active && (
        mode === "side-by-side" ? (
          <SideBySide before={active.before} after={active.after} />
        ) : (
          <SliderOverlay before={active.before} after={active.after} pos={sliderPos[0]} onPosChange={(v) => setSliderPos([v])} />
        )
      )}
    </div>
  );
}

function useSignedUrl(path: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    supabase.storage.from("clinical-photos").createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? ""));
  }, [path]);
  return url;
}

function SideBySide({ before, after }: { before: any; after: any }) {
  const beforeUrl = useSignedUrl(before.storage_path);
  const afterUrl = useSignedUrl(after.storage_path);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Badge variant="outline" className="text-xs">Before — {before.taken_at}</Badge>
        <div className="rounded-lg overflow-hidden border aspect-square bg-muted">
          {beforeUrl ? <img src={beforeUrl} alt="Before" className="w-full h-full object-cover" /> :
            <div className="w-full h-full flex items-center justify-center"><Camera className="h-6 w-6 text-muted-foreground animate-pulse" /></div>}
        </div>
      </div>
      <div className="space-y-2">
        <Badge variant="outline" className="text-xs">After — {after.taken_at}</Badge>
        <div className="rounded-lg overflow-hidden border aspect-square bg-muted">
          {afterUrl ? <img src={afterUrl} alt="After" className="w-full h-full object-cover" /> :
            <div className="w-full h-full flex items-center justify-center"><Camera className="h-6 w-6 text-muted-foreground animate-pulse" /></div>}
        </div>
      </div>
    </div>
  );
}

function SliderOverlay({ before, after, pos, onPosChange }: { before: any; after: any; pos: number; onPosChange: (v: number) => void }) {
  const beforeUrl = useSignedUrl(before.storage_path);
  const afterUrl = useSignedUrl(after.storage_path);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative rounded-lg overflow-hidden border aspect-square bg-muted">
        {afterUrl && <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />}
        {beforeUrl && (
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
            <img src={beforeUrl} alt="Before" className="w-full h-full object-cover" style={{ minWidth: containerRef.current?.offsetWidth }} />
          </div>
        )}
        <div className="absolute top-0 bottom-0" style={{ left: `${pos}%` }}>
          <div className="w-0.5 h-full bg-primary shadow-lg" />
        </div>
        <div className="absolute top-2 left-2"><Badge className="text-[10px]">Before</Badge></div>
        <div className="absolute top-2 right-2"><Badge variant="secondary" className="text-[10px]">After</Badge></div>
      </div>
      <Slider value={[pos]} onValueChange={(v) => onPosChange(v[0])} min={0} max={100} step={1} />
    </div>
  );
}

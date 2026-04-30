import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Camera } from "lucide-react";

const BODY_AREAS = ["all", "face", "neck", "chest", "abdomen", "arms", "back", "legs", "hands", "other"];

interface PhotoGalleryProps {
  patientId: string;
}

export function PhotoGallery({ patientId }: PhotoGalleryProps) {
  const [areaFilter, setAreaFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [lightbox, setLightbox] = useState<any>(null);

  const { data: photos, isLoading } = useQuery({
    queryKey: ["clinical-photos", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_photos")
        .select("*, treatments(name)")
        .eq("patient_id", patientId)
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = photos?.filter((p: any) => {
    if (areaFilter !== "all" && p.body_area !== areaFilter) return false;
    if (typeFilter !== "all" && p.photo_type !== typeFilter) return false;
    return true;
  }) ?? [];

  const getUrl = (path: string) => {
    const { data } = supabase.storage.from("clinical-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage.from("clinical-photos").createSignedUrl(path, 3600);
    return data?.signedUrl ?? "";
  };

  // Use signed URLs since bucket is private
  const PhotoThumbnail = ({ photo }: { photo: any }) => {
    const [url, setUrl] = useState<string>("");
    if (!url) {
      getSignedUrl(photo.storage_path).then(setUrl);
    }
    return (
      <div
        className="relative group cursor-pointer rounded-lg overflow-hidden border bg-muted aspect-square"
        onClick={() => setLightbox(photo)}
      >
        {url ? (
          <img src={url} alt={photo.body_area} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Camera className="h-6 w-6 text-muted-foreground animate-pulse" />
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-background/80 to-transparent p-2">
          <div className="flex gap-1">
            <Badge variant="secondary" className="text-[11px] capitalize">{photo.photo_type}</Badge>
            <Badge variant="outline" className="text-[11px] capitalize">{photo.body_area}</Badge>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Loading photos…</p>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 flex-wrap">
          {BODY_AREAS.map((area) => (
            <button
              key={area}
              onClick={() => setAreaFilter(area)}
              className={`px-2.5 py-1 rounded-full text-xs capitalize transition-colors ${
                areaFilter === area
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="before">Before</SelectItem>
            <SelectItem value="after">After</SelectItem>
            <SelectItem value="progress">Progress</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((photo: any) => (
            <PhotoThumbnail key={photo.id} photo={photo} />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center">
          <Camera className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground text-sm">No photos found</p>
        </div>
      )}

      {/* Lightbox */}
      <LightboxDialog photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function LightboxDialog({ photo, onClose }: { photo: any; onClose: () => void }) {
  const [url, setUrl] = useState<string>("");

  if (photo && !url) {
    supabase.storage.from("clinical-photos").createSignedUrl(photo.storage_path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? ""));
  }

  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-2">
        {url && <img src={url} alt="" className="w-full rounded" />}
        {photo && (
          <div className="flex gap-2 p-2">
            <Badge variant="secondary" className="capitalize">{photo.photo_type}</Badge>
            <Badge variant="outline" className="capitalize">{photo.body_area}</Badge>
            {photo.treatments?.name && <Badge variant="outline">{photo.treatments.name}</Badge>}
            {photo.notes && <span className="text-xs text-muted-foreground ml-2">{photo.notes}</span>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, X, ImagePlus, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

const BODY_AREAS = ["face", "neck", "chest", "abdomen", "arms", "back", "legs", "hands", "other"];
const PHOTO_TYPES = ["before", "after", "progress"];

interface PhotoUploadProps {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhotoUpload({ patientId, open, onOpenChange }: PhotoUploadProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [bodyArea, setBodyArea] = useState("face");
  const [photoType, setPhotoType] = useState("before");
  const [treatmentId, setTreatmentId] = useState<string>("");
  const [takenAt, setTakenAt] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);

  const { data: treatments } = useQuery({
    queryKey: ["treatments-list"],
    queryFn: async () => {
      const { data } = await supabase.from("treatments").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("No files selected");
      if (!photoConsent) throw new Error("Photo release consent required");

      const user = (await supabase.auth.getUser()).data.user;

      // Record photo release consent
      await supabase.from("e_consents").insert({
        patient_id: patientId,
        consent_type: "photo_release" as any,
        consent_text: "Patient consents to the capture and storage of clinical photographs for treatment documentation purposes.",
        signed_at: new Date().toISOString(),
      });

      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `${patientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from("clinical-photos")
          .upload(path, file, { contentType: file.type });
        if (storageError) throw storageError;

        const { error: dbError } = await supabase.from("clinical_photos").insert({
          patient_id: patientId,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          storage_path: path,
          treatment_id: treatmentId || null,
          body_area: bodyArea,
          photo_type: photoType,
          taken_at: takenAt,
          notes: notes || null,
        });
        if (dbError) throw dbError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical-photos", patientId] });
      toast({ title: `${files.length} photo(s) uploaded` });
      setFiles([]);
      setNotes("");
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...dropped]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Clinical Photos</DialogTitle>
        </DialogHeader>

        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Drag & drop images or <span className="text-primary underline">browse</span>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
          />
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative group">
                <img
                  src={URL.createObjectURL(f)}
                  alt=""
                  className="w-16 h-16 object-cover rounded border"
                />
                <button
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Body Area</Label>
            <Select value={bodyArea} onValueChange={setBodyArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BODY_AREAS.map((a) => (
                  <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Photo Type</Label>
            <Select value={photoType} onValueChange={setPhotoType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHOTO_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Treatment</Label>
            <Select value={treatmentId} onValueChange={setTreatmentId}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {treatments?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date Taken</Label>
            <Input type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
        </div>

        <div className="flex items-start gap-2 bg-muted/50 rounded-md p-3">
          <Checkbox
            id="photo-consent"
            checked={photoConsent}
            onCheckedChange={(v) => setPhotoConsent(v === true)}
            className="mt-0.5"
          />
          <label htmlFor="photo-consent" className="text-xs text-muted-foreground cursor-pointer">
            <ShieldCheck className="h-3.5 w-3.5 inline mr-1 text-primary" />
            Patient has provided photo release consent for clinical documentation purposes.
          </label>
        </div>

        <Button onClick={() => upload.mutate()} disabled={files.length === 0 || !photoConsent || upload.isPending}>
          <Upload className="h-4 w-4 mr-1" />
          {upload.isPending ? "Uploading…" : `Upload ${files.length} Photo${files.length !== 1 ? "s" : ""}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

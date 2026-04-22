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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BeforeAfterCompare } from "@/components/clinical-photos/BeforeAfterCompare";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  Plus,
  X,
} from "lucide-react";

interface ClinicalPhoto {
  id: string;
  patient_id: string;
  patients?: { first_name: string; last_name: string };
  body_area: string;
  photo_type: string;
  storage_path: string;
  taken_at: string;
  created_at: string;
  encounter_id?: string;
  treatment_id?: string;
  notes?: string;
  uploaded_by?: string;
}

const TREATMENT_TYPES = [
  { value: "botox", label: "Botox" },
  { value: "filler", label: "Filler" },
  { value: "laser", label: "Laser" },
  { value: "microneedling", label: "Microneedling" },
  { value: "chemical_peel", label: "Chemical Peel" },
  { value: "other", label: "Other" },
];

export function ClinicalPhotos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [filterPatient, setFilterPatient] = useState("");
  const [filterTreatment, setFilterTreatment] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const [uploadData, setUploadData] = useState({
    patient_id: "",
    treatment_type: "",
    photo_type: "before" as "before" | "after",
    file: null as File | null,
  });

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["clinical-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_photos")
        .select("*, patients(first_name, last_name)")
        .order("taken_at", { ascending: false });
      if (error) {
        if (error.code === "PGRST116") {
          return [];
        }
        throw error;
      }
      return data ?? [];
    },
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients-for-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploadPhoto = useMutation({
    mutationFn: async () => {
      if (!uploadData.patient_id || !uploadData.treatment_type || !uploadData.file) {
        throw new Error("Please fill in all fields");
      }

      const fileExt = uploadData.file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `clinical-photos/${uploadData.patient_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("meridian-storage")
        .upload(filePath, uploadData.file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("meridian-storage")
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase.from("clinical_photos").insert({
        patient_id: uploadData.patient_id,
        body_area: uploadData.treatment_type,
        photo_type: uploadData.photo_type,
        storage_path: urlData.publicUrl,
        taken_at: new Date().toISOString(),
      });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical-photos"] });
      setUploadData({
        patient_id: "",
        treatment_type: "",
        photo_type: "before",
        file: null,
      });
      setUploadDialogOpen(false);
      toast.success("Photo uploaded successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to upload photo");
    },
  });

  const filteredPhotos = photos.filter((photo: ClinicalPhoto) => {
    if (filterPatient && filterPatient !== "all" && photo.patient_id !== filterPatient) return false;
    if (filterTreatment && filterTreatment !== "all" && photo.body_area !== filterTreatment) return false;
    if (filterStartDate) {
      const photoDate = new Date(photo.taken_at);
      if (photoDate < new Date(filterStartDate)) return false;
    }
    if (filterEndDate) {
      const photoDate = new Date(photo.taken_at);
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      if (photoDate > end) return false;
    }
    return true;
  });

  const getTreatmentLabel = (type: string) => {
    return TREATMENT_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getPatientName = (photo: ClinicalPhoto) => {
    if (photo.patients) {
      return `${photo.patients.first_name} ${photo.patients.last_name}`;
    }
    return "Unknown Patient";
  };

  const canCompare = selectedPhotos.length === 2;
  const selectedPhotoObjects = filteredPhotos.filter((p: ClinicalPhoto) =>
    selectedPhotos.includes(p.id)
  );
  const samePatient =
    canCompare &&
    selectedPhotoObjects[0]?.patient_id === selectedPhotoObjects[1]?.patient_id;

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ImageIcon className="h-8 w-8" />
            Clinical Photos
          </h1>
          <p className="text-muted-foreground mt-1">Before and after photos gallery</p>
        </div>
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload Photo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Clinical Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patient">Patient</Label>
                <Select
                  value={uploadData.patient_id}
                  onValueChange={(value) =>
                    setUploadData({ ...uploadData, patient_id: value })
                  }
                >
                  <SelectTrigger id="patient">
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="treatment">Treatment Type</Label>
                <Select
                  value={uploadData.treatment_type}
                  onValueChange={(value) =>
                    setUploadData({ ...uploadData, treatment_type: value })
                  }
                >
                  <SelectTrigger id="treatment">
                    <SelectValue placeholder="Select treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    {TREATMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Photo Type</Label>
                <RadioGroup
                  value={uploadData.photo_type}
                  onValueChange={(value: any) =>
                    setUploadData({ ...uploadData, photo_type: value })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="before" id="before" />
                    <Label htmlFor="before">Before</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="after" id="after" />
                    <Label htmlFor="after">After</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Photo</Label>
                <Input
                  id="file"
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setUploadData({
                      ...uploadData,
                      file: e.target.files?.[0] || null,
                    })
                  }
                />
                {uploadData.file && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {uploadData.file.name}
                  </p>
                )}
              </div>

              <Button
                onClick={() => uploadPhoto.mutate()}
                disabled={uploadPhoto.isPending}
                className="w-full"
              >
                {uploadPhoto.isPending ? "Uploading..." : "Upload Photo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {compareMode && canCompare && samePatient ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Before & After Comparison</CardTitle>
                <CardDescription>
                  {getPatientName(selectedPhotoObjects[0])} -{" "}
                  {getTreatmentLabel(selectedPhotoObjects[0]?.body_area)}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCompareMode(false);
                  setSelectedPhotos([]);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <BeforeAfterCompare
              beforeUrl={
                selectedPhotoObjects[0]?.photo_type === "before"
                  ? selectedPhotoObjects[0]?.storage_path
                  : selectedPhotoObjects[1]?.storage_path
              }
              afterUrl={
                selectedPhotoObjects[0]?.photo_type === "after"
                  ? selectedPhotoObjects[0]?.storage_path
                  : selectedPhotoObjects[1]?.storage_path
              }
              beforeDate={
                selectedPhotoObjects[0]?.photo_type === "before"
                  ? selectedPhotoObjects[0]?.taken_at
                  : selectedPhotoObjects[1]?.taken_at
              }
              afterDate={
                selectedPhotoObjects[0]?.photo_type === "after"
                  ? selectedPhotoObjects[0]?.taken_at
                  : selectedPhotoObjects[1]?.taken_at
              }
              treatmentName={getTreatmentLabel(
                selectedPhotoObjects[0]?.body_area
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filter-patient">Patient</Label>
              <Select value={filterPatient || "all"} onValueChange={setFilterPatient}>
                <SelectTrigger id="filter-patient">
                  <SelectValue placeholder="All Patients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  {patients.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-treatment">Treatment Type</Label>
              <Select value={filterTreatment || "all"} onValueChange={setFilterTreatment}>
                <SelectTrigger id="filter-treatment">
                  <SelectValue placeholder="All Treatments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Treatments</SelectItem>
                  {TREATMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-start-date">Start Date</Label>
              <Input
                id="filter-start-date"
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-end-date">End Date</Label>
              <Input
                id="filter-end-date"
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div>
          {compareMode && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div className="text-sm">
                <p className="font-semibold">
                  {selectedPhotos.length === 2 && samePatient
                    ? "Ready to compare"
                    : "Select 2 photos from the same patient"}
                </p>
                {selectedPhotos.length === 2 && !samePatient && (
                  <p className="text-xs text-destructive mt-1">
                    Selected photos must be from the same patient
                  </p>
                )}
              </div>
              {canCompare && samePatient && (
                <Button size="sm">Compare</Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPhotos.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No photos found</h3>
                  <p className="text-muted-foreground">
                    Upload clinical photos to get started
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPhotos.map((photo: ClinicalPhoto) => (
                <Card
                  key={photo.id}
                  className={`overflow-hidden cursor-pointer transition-all ${
                    selectedPhotos.includes(photo.id)
                      ? "ring-2 ring-blue-500"
                      : "hover:shadow-lg"
                  }`}
                  onClick={() => {
                    if (compareMode) {
                      if (selectedPhotos.includes(photo.id)) {
                        setSelectedPhotos(
                          selectedPhotos.filter((id) => id !== photo.id)
                        );
                      } else if (selectedPhotos.length < 2) {
                        setSelectedPhotos([...selectedPhotos, photo.id]);
                      }
                    }
                  }}
                >
                  <div className="relative bg-gray-100 aspect-square overflow-hidden">
                    <img
                      src={photo.storage_path}
                      alt={`${photo.body_area} photo`}
                      className="w-full h-full object-cover"
                    />
                    {compareMode && selectedPhotos.includes(photo.id) && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                        <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                          {selectedPhotos.indexOf(photo.id) + 1}
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div>
                        <p className="font-semibold text-sm">
                          {getPatientName(photo)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(photo.taken_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getTreatmentLabel(photo.body_area)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {photo.photo_type}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {compareMode && (
            <div className="mt-6 flex gap-2 justify-center">
              <Button
                onClick={() => {
                  setCompareMode(false);
                  setSelectedPhotos([]);
                }}
                variant="outline"
              >
                Cancel Comparison
              </Button>
            </div>
          )}

          {filteredPhotos.length > 0 && !compareMode && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setCompareMode(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Compare Photos
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ClinicalPhotos;

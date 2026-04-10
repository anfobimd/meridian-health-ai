
-- Create clinical_photos table
CREATE TABLE public.clinical_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  uploaded_by UUID,
  storage_path TEXT NOT NULL,
  treatment_id UUID REFERENCES public.treatments(id),
  body_area TEXT,
  photo_type TEXT NOT NULL DEFAULT 'before',
  taken_at DATE,
  notes TEXT,
  encounter_id UUID REFERENCES public.encounters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clinical_photos ENABLE ROW LEVEL SECURITY;

-- Staff can do everything
CREATE POLICY "Staff can view all clinical photos"
  ON public.clinical_photos FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert clinical photos"
  ON public.clinical_photos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can update clinical photos"
  ON public.clinical_photos FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete clinical photos"
  ON public.clinical_photos FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Patients can view own photos
CREATE POLICY "Patients can view own clinical photos"
  ON public.clinical_photos FOR SELECT
  TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM public.patients WHERE auth_user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX idx_clinical_photos_patient ON public.clinical_photos(patient_id);
CREATE INDEX idx_clinical_photos_body_area ON public.clinical_photos(body_area);
CREATE INDEX idx_clinical_photos_type ON public.clinical_photos(photo_type);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('clinical-photos', 'clinical-photos', false);

-- Storage RLS: staff can upload
CREATE POLICY "Staff can upload clinical photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'clinical-photos' AND public.is_staff(auth.uid()));

-- Storage RLS: staff can view
CREATE POLICY "Staff can view clinical photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'clinical-photos' AND public.is_staff(auth.uid()));

-- Storage RLS: staff can delete
CREATE POLICY "Staff can delete clinical photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'clinical-photos' AND public.is_staff(auth.uid()));

-- Storage RLS: patients can view own photos (folder structure: patient_id/...)
CREATE POLICY "Patients can view own photos in storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinical-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.patients WHERE auth_user_id = auth.uid()
    )
  );

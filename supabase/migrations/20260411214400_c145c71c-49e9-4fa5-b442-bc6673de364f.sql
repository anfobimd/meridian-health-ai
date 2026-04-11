
DROP TRIGGER IF EXISTS update_patient_insurance_updated_at ON public.patient_insurance;
CREATE TRIGGER update_patient_insurance_updated_at
  BEFORE UPDATE ON public.patient_insurance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Add priority_score and ai_rank_reason to waitlist for AI ranking
ALTER TABLE public.appointment_waitlist
ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS ai_rank_reason text,
ADD COLUMN IF NOT EXISTS auto_notified_at timestamptz;

-- Add late_cancel_count default if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='late_cancel_count') THEN
    ALTER TABLE public.patients ADD COLUMN late_cancel_count integer DEFAULT 0;
  END IF;
END $$;

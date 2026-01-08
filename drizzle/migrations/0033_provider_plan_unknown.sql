DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'provider_plan' AND e.enumlabel = 'unknown'
  ) THEN
    ALTER TYPE provider_plan ADD VALUE 'unknown';
  END IF;
END $$;

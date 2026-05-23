CREATE TABLE recognition_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original JSONB NOT NULL,
  corrected JSONB NOT NULL,
  field_diffs JSONB,
  series TEXT,
  parallel TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

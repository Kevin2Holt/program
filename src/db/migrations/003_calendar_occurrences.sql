-- UP

-- Calendar occurrences: specific bookable instances for timed offerings.
-- Date-only items do NOT require any rows here.

CREATE TABLE IF NOT EXISTS calendar_occurrences (
  id              BIGSERIAL PRIMARY KEY,
  item_id         BIGINT NOT NULL REFERENCES calendar_items(id) ON DELETE CASCADE,
  service_date    DATE NOT NULL,
  start_time      TIME,
  end_time        TIME,
  duration_minutes INTEGER,
  label           TEXT,
  -- nullable: when null, fall back to the parent item's capacity.
  capacity_override INTEGER CHECK (capacity_override IS NULL OR capacity_override > 0),
  -- 'active' | 'archived' | 'not_offered'. We archive rather than hard delete
  -- once bookings reference an occurrence so reporting/history remains intact.
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_occurrence_end CHECK (
    (start_time IS NULL AND end_time IS NULL AND duration_minutes IS NULL)
    OR (start_time IS NOT NULL AND (end_time IS NOT NULL OR duration_minutes IS NOT NULL))
  )
);
CREATE INDEX IF NOT EXISTS idx_occurrences_item_date ON calendar_occurrences (item_id, service_date);
CREATE INDEX IF NOT EXISTS idx_occurrences_date ON calendar_occurrences (service_date);
CREATE INDEX IF NOT EXISTS idx_occurrences_status ON calendar_occurrences (status);

-- DOWN
DROP TABLE IF EXISTS calendar_occurrences;

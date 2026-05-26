-- UP

-- Calendar bookings + booking selections.
--
-- One booking parent record holds registrant data and metadata; many child
-- selection rows represent individual item/date or item/occurrence choices.
--
-- Booking-selection snapshot columns preserve simple history so old bookings
-- remain understandable even after items/occurrences change.

CREATE TABLE IF NOT EXISTS calendar_bookings (
  id                  BIGSERIAL PRIMARY KEY,
  event_id            BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  calendar_config_id  BIGINT NOT NULL REFERENCES calendar_configs(id) ON DELETE CASCADE,
  -- Public confirmation reference: opaque, non-sequential, scoped to one
  -- booking, safe for public-by-possession-of-link viewing.
  confirmation_ref    TEXT NOT NULL UNIQUE,
  -- Submission token used for anti-double-submit / dedupe protection.
  submission_token    TEXT UNIQUE,
  -- Registrant data snapshot. Structured fields are kept in JSONB so the
  -- supported form-field set can evolve without further migrations.
  registrant          JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes               TEXT,
  email               TEXT,
  -- Confirmation/email metadata (e.g. delivery state, message id).
  confirmation_meta   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Minimal status model for now: 'active' | 'canceled'.
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON calendar_bookings (event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_config ON calendar_bookings (calendar_config_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON calendar_bookings (status);

CREATE TABLE IF NOT EXISTS calendar_booking_selections (
  id              BIGSERIAL PRIMARY KEY,
  booking_id      BIGINT NOT NULL REFERENCES calendar_bookings(id) ON DELETE CASCADE,
  item_id         BIGINT NOT NULL REFERENCES calendar_items(id),
  -- Date the user signed up for. Always present, even for occurrence
  -- selections (mirrors occurrence.service_date for fast lookups).
  selected_date   DATE NOT NULL,
  -- Null for date-only selections; set when this selection targets a
  -- specific timed occurrence.
  occurrence_id   BIGINT REFERENCES calendar_occurrences(id),
  -- 'date_only' | 'occurrence'
  selection_type  TEXT NOT NULL,
  -- History-preserving snapshots so old bookings remain readable after the
  -- live item/occurrence changes or is archived.
  item_name_snapshot       TEXT NOT NULL,
  occurrence_label_snapshot TEXT,
  occurrence_start_snapshot TIME,
  occurrence_end_snapshot   TIME,
  occurrence_duration_minutes_snapshot INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_selections_booking ON calendar_booking_selections (booking_id);
CREATE INDEX IF NOT EXISTS idx_selections_item_date ON calendar_booking_selections (item_id, selected_date);
CREATE INDEX IF NOT EXISTS idx_selections_occurrence ON calendar_booking_selections (occurrence_id);

-- DOWN
DROP TABLE IF EXISTS calendar_booking_selections;
DROP TABLE IF EXISTS calendar_bookings;

-- UP

-- Calendar module: event-level config + items.
--
-- CalendarConfig is one row per event when the module is enabled. Bounded
-- structured configuration (form field enablement, export defaults, confirmation
-- options) is stored in a JSONB column so callers do not have to add a new
-- column for every minor option.

CREATE TABLE IF NOT EXISTS calendar_configs (
  id                       BIGSERIAL PRIMARY KEY,
  event_id                 BIGINT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL DEFAULT 'Calendar',
  enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
  public_visibility_state  TEXT NOT NULL DEFAULT 'draft',
  -- 'fixed' or 'rolling'
  date_window_mode         TEXT NOT NULL DEFAULT 'fixed',
  fixed_start_date         DATE,
  fixed_end_date           DATE,
  -- 'days' | 'weeks' | 'months'
  rolling_window_unit      TEXT,
  rolling_window_size      INTEGER,
  -- 'date_only' | 'timed'
  time_behavior_mode       TEXT NOT NULL DEFAULT 'date_only',
  -- Canonical event time zone (IANA, e.g. 'America/New_York').
  event_time_zone          TEXT NOT NULL DEFAULT 'UTC',
  notes_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  email_confirmation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  add_to_calendar_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'combined' | 'separate'
  calendar_export_mode     TEXT NOT NULL DEFAULT 'combined',
  -- Structured form-field configuration (which fields enabled / required).
  form_config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Saved organizer export defaults (filters, detail level, fields).
  export_defaults          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_items (
  id                BIGSERIAL PRIMARY KEY,
  calendar_config_id BIGINT NOT NULL REFERENCES calendar_configs(id) ON DELETE CASCADE,
  event_id          BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  capacity          INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  color             TEXT NOT NULL,
  shape             TEXT NOT NULL,
  -- 'active' | 'archived'. Phase 3 requires archive over hard delete once
  -- bookings may reference an item.
  status            TEXT NOT NULL DEFAULT 'active',
  -- Optional item-level time metadata (e.g. fixed start/duration). Bounded
  -- structured config keeps schema stable.
  time_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_items_event ON calendar_items (event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_items_config ON calendar_items (calendar_config_id);
CREATE INDEX IF NOT EXISTS idx_calendar_items_status ON calendar_items (status);

-- DOWN
DROP TABLE IF EXISTS calendar_items;
DROP TABLE IF EXISTS calendar_configs;

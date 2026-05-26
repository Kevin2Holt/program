-- UP

-- Availability rules: one-time or recurring blocking rules.
-- Rules remain rules — they are NOT pre-generated as blackout occurrence rows.
--
-- Each rule targets a single item, selected items, or all items. The targets
-- table holds the rows for the "selected items" case; "all items" is encoded
-- by target_scope='all' with no target rows.

CREATE TABLE IF NOT EXISTS calendar_availability_rules (
  id                  BIGSERIAL PRIMARY KEY,
  calendar_config_id  BIGINT NOT NULL REFERENCES calendar_configs(id) ON DELETE CASCADE,
  -- 'one_time' | 'recurring'
  rule_type           TEXT NOT NULL,
  -- 'single' | 'selected' | 'all'
  target_scope        TEXT NOT NULL,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  -- One-time rule fields
  blocked_date        DATE,
  -- Recurring rule fields
  -- 'daily' | 'weekly' | 'biweekly' | 'monthly_by_date' | 'monthly_by_weekday'
  recurrence_pattern  TEXT,
  -- Recurrence detail in a flexible structured shape, e.g.
  --   { "weekdays":[1,3,5] }
  --   { "day_of_month": 15 }
  --   { "week_of_month": 1, "weekday": 1 }
  recurrence_detail   JSONB NOT NULL DEFAULT '{}'::jsonb,
  recurrence_start_date DATE,
  recurrence_end_date   DATE,
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rule_shape CHECK (
    (rule_type = 'one_time' AND blocked_date IS NOT NULL)
    OR (rule_type = 'recurring' AND recurrence_pattern IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_rules_config ON calendar_availability_rules (calendar_config_id);
CREATE INDEX IF NOT EXISTS idx_rules_active ON calendar_availability_rules (active);
CREATE INDEX IF NOT EXISTS idx_rules_blocked_date ON calendar_availability_rules (blocked_date);

CREATE TABLE IF NOT EXISTS calendar_availability_rule_targets (
  rule_id BIGINT NOT NULL REFERENCES calendar_availability_rules(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES calendar_items(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, item_id)
);

-- DOWN
DROP TABLE IF EXISTS calendar_availability_rule_targets;
DROP TABLE IF EXISTS calendar_availability_rules;

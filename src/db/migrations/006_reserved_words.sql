-- UP

-- Reserved-words table. Event codes must not collide with these. The list
-- starts small and covers app-system paths plus a handful of standard
-- placeholders; the broader product spec keeps the full seed list as a
-- later concern. New words can be added at any time without a code change.
--
-- Lookups happen in lower-case via the unique index below.

CREATE TABLE IF NOT EXISTS reserved_words (
  word        TEXT PRIMARY KEY,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO reserved_words (word, reason) VALUES
  ('admin',         'system'),
  ('api',           'system'),
  ('account',       'system'),
  ('auth',          'system'),
  ('dashboard',     'system'),
  ('events',        'system'),
  ('healthz',       'system'),
  ('login',         'system'),
  ('logout',        'system'),
  ('signup',        'system'),
  ('register',      'system'),
  ('settings',      'system'),
  ('public',        'system'),
  ('static',        'system'),
  ('c',             'reserved-prefix'),
  ('css',           'system'),
  ('js',            'system'),
  ('img',           'system'),
  ('images',        'system'),
  ('assets',        'system'),
  ('robots.txt',    'system'),
  ('favicon.ico',   'system'),
  ('about',         'reserved-marketing'),
  ('help',          'reserved-marketing'),
  ('support',       'reserved-marketing'),
  ('terms',         'reserved-marketing'),
  ('privacy',       'reserved-marketing'),
  ('contact',       'reserved-marketing')
ON CONFLICT (word) DO NOTHING;

-- DOWN
DROP TABLE IF EXISTS reserved_words;

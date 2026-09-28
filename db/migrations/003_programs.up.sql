-- Program versions (draft / published / previous) and their blocks.

create table program_versions (
	id integer generated always as identity primary key,
	event_id integer not null references events (id) on delete cascade,
	kind text not null check (kind in ('draft', 'published', 'previous')),
	-- Plain-text header shown above the blocks: eyebrow, title, date, time, place.
	header jsonb not null default '{}'::jsonb check (jsonb_typeof(header) = 'object'),
	-- Source of truth for block order: an array of program_blocks ids.
	block_order jsonb not null default '[]'::jsonb check (jsonb_typeof(block_order) = 'array'),
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Deferrable so rollback can swap published/previous in one statement.
	unique (event_id, kind) deferrable initially immediate
);


create table program_blocks (
	id integer generated always as identity primary key,
	version_id integer not null references program_versions (id) on delete cascade,
	type text not null check (type in ('text', 'label_value', 'separator')),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	-- Sanitized HTML for text blocks (rendering); content keeps the editor JSON.
	html text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index program_blocks_version_id_idx on program_blocks (version_id);


-- Every event gets a draft; existing events get one now.
insert into program_versions (event_id, kind) select id, 'draft' from events;

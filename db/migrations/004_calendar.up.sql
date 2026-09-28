-- Signup calendar: configuration, Items and their times, availability rules,
-- bookings and their selections, and a booking activity log.
-- Child tables carry event_id and use composite foreign keys, so nothing can
-- reference another event's Items, times, rules, or bookings.

create table calendar_configs (
	event_id integer primary key references events (id) on delete cascade,
	title text not null default 'Sign up' check (length(title) between 1 and 120),
	status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
	time_zone text not null,
	window_mode text not null default 'rolling' check (window_mode in ('fixed', 'rolling')),
	fixed_start date,
	fixed_end date,
	rolling_size integer not null default 3 check (rolling_size between 0 and 366),
	rolling_unit text not null default 'weeks' check (rolling_unit in ('days', 'weeks', 'months')),
	min_days_ahead integer not null default 0 check (min_days_ahead between 0 and 60),
	timed boolean not null default false,
	prevent_overlap boolean not null default true,
	form_fields jsonb not null default '{}'::jsonb,
	email_confirmation boolean not null default false,
	ics_enabled boolean not null default true,
	ics_mode text not null default 'combined' check (ics_mode in ('combined', 'separate')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (window_mode <> 'fixed' or (fixed_start is not null and fixed_end is not null and fixed_end >= fixed_start))
);


create table calendar_items (
	id integer generated always as identity primary key,
	event_id integer not null references events (id) on delete cascade,
	name text not null check (length(name) between 1 and 120),
	capacity integer not null check (capacity between 1 and 10000),
	color text not null check (color in ('red', 'orange', 'amber', 'lime', 'green', 'teal', 'sky', 'blue', 'violet', 'pink', 'brown', 'slate')),
	shape text not null check (shape in ('circle', 'square', 'triangle', 'diamond', 'hexagon', 'star', 'glyph')),
	glyph text check (glyph ~ '^[A-Z0-9]$'),
	sort_order integer not null default 0,
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (event_id, id),
	check ((shape = 'glyph') = (glyph is not null))
);

create index calendar_items_event_id_idx on calendar_items (event_id);


-- When an Item is offered in timed mode. only_date null = every open day.
create table calendar_item_times (
	id integer generated always as identity primary key,
	event_id integer not null,
	item_id integer not null,
	start_time time not null,
	duration_minutes integer not null check (duration_minutes between 5 and 1440),
	label text not null default '' check (length(label) <= 80),
	capacity_override integer check (capacity_override between 1 and 10000),
	only_date date,
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (event_id, id),
	foreign key (event_id, item_id) references calendar_items (event_id, id) on delete cascade,
	-- Times don't cross midnight.
	check (extract(epoch from start_time) / 60 + duration_minutes <= 1440)
);

create index calendar_item_times_item_id_idx on calendar_item_times (item_id);


create table calendar_rules (
	id integer generated always as identity primary key,
	event_id integer not null references events (id) on delete cascade,
	effect text not null check (effect in ('allow', 'block')),
	kind text not null check (kind in ('once', 'recurring')),
	once_date date,
	frequency text check (frequency in ('daily', 'weekly', 'biweekly', 'monthly_date', 'monthly_weekday')),
	weekdays smallint[] not null default '{}',
	month_day smallint check (month_day between 1 and 31),
	-- 1–4 = first..fourth; -1 = last (reference key: LAST_WEEK_OF_MONTH).
	month_week smallint check (month_week in (1, 2, 3, 4, -1)),
	month_weekday smallint check (month_weekday between 0 and 6),
	starts_on date,
	ends_on date,
	applies_to text not null default 'all' check (applies_to in ('all', 'selected')),
	label text not null default '' check (length(label) <= 120),
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (event_id, id),
	check (kind <> 'once' or once_date is not null),
	check (kind <> 'recurring' or frequency is not null),
	check (frequency not in ('weekly', 'biweekly') or cardinality(weekdays) > 0),
	check (frequency <> 'biweekly' or starts_on is not null),
	check (frequency <> 'monthly_date' or month_day is not null),
	check (frequency <> 'monthly_weekday' or (month_week is not null and month_weekday is not null)),
	check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index calendar_rules_event_id_idx on calendar_rules (event_id);


create table calendar_rule_items (
	event_id integer not null,
	rule_id integer not null,
	item_id integer not null,
	primary key (rule_id, item_id),
	foreign key (event_id, rule_id) references calendar_rules (event_id, id) on delete cascade,
	foreign key (event_id, item_id) references calendar_items (event_id, id) on delete cascade
);


create table calendar_bookings (
	id integer generated always as identity primary key,
	event_id integer not null references events (id) on delete cascade,
	-- 32 random bytes, base64url: the only way to open a confirmation page.
	confirmation_ref text not null unique,
	idempotency_key uuid not null,
	status text not null default 'active' check (status in ('active', 'canceled')),
	name text not null check (length(name) between 1 and 120),
	phone text not null default '',
	contact_method text check (contact_method in ('call', 'text')),
	number_type text check (number_type in ('cell', 'whatsapp')),
	email text not null default '',
	notes text not null default '' check (length(notes) <= 2000),
	email_sent_at timestamptz,
	canceled_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (event_id, id),
	unique (event_id, idempotency_key)
);

create index calendar_bookings_event_id_idx on calendar_bookings (event_id);


-- One selected offering. Snapshots keep old bookings readable after changes.
create table calendar_selections (
	id integer generated always as identity primary key,
	event_id integer not null,
	booking_id integer not null,
	item_id integer not null,
	time_id integer,
	service_date date not null,
	item_name text not null,
	time_label text not null default '',
	start_time time,
	duration_minutes integer,
	created_at timestamptz not null default now(),
	foreign key (event_id, booking_id) references calendar_bookings (event_id, id) on delete cascade,
	foreign key (event_id, item_id) references calendar_items (event_id, id),
	foreign key (event_id, time_id) references calendar_item_times (event_id, id)
);

create index calendar_selections_offering_idx on calendar_selections (event_id, service_date, item_id, time_id);
create index calendar_selections_booking_idx on calendar_selections (booking_id);
-- The same Item can't be booked twice on one date in one booking (date-only);
-- nor the same time twice.
create unique index calendar_selections_date_only_key on calendar_selections (booking_id, item_id, service_date) where time_id is null;
create unique index calendar_selections_timed_key on calendar_selections (booking_id, time_id, service_date) where time_id is not null;


create table calendar_booking_log (
	id integer generated always as identity primary key,
	event_id integer not null,
	booking_id integer not null,
	actor_user_id integer references users (id) on delete set null,
	action text not null,
	detail jsonb not null default '{}'::jsonb,
	at timestamptz not null default now(),
	foreign key (event_id, booking_id) references calendar_bookings (event_id, id) on delete cascade
);

create index calendar_booking_log_booking_idx on calendar_booking_log (booking_id);

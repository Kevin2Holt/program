-- Events, their public codes (current and retired), membership, and reserved words.

create table reserved_words (
	word text primary key,
	reason text not null
);

insert into reserved_words (word, reason) values
	('about', 'marketing'), ('account', 'system'), ('admin', 'system'), ('api', 'system'),
	('app', 'system'), ('assets', 'system'), ('auth', 'system'), ('blog', 'marketing'),
	('c', 'reserved prefix'), ('calendar', 'system'), ('contact', 'marketing'), ('dashboard', 'system'),
	('design-system', 'system'), ('docs', 'marketing'), ('edit', 'system'), ('events', 'system'),
	('health', 'system'), ('healthz', 'system'), ('help', 'marketing'), ('home', 'marketing'),
	('log-in', 'system'), ('login', 'system'), ('logout', 'system'), ('mail', 'system'),
	('new', 'system'), ('pricing', 'marketing'), ('privacy', 'marketing'), ('public', 'system'),
	('register', 'system'), ('settings', 'system'), ('sign-up', 'system'), ('signup', 'system'),
	('static', 'system'), ('status', 'marketing'), ('support', 'marketing'), ('terms', 'marketing'),
	('www', 'system');


create table events (
	id integer generated always as identity primary key,
	name text not null check (length(name) between 1 and 120),
	code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) between 3 and 32),
	created_by integer not null references users (id),
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);


-- Retired codes keep redirecting to the event's current code.
create table event_old_codes (
	code text primary key check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	event_id integer not null references events (id) on delete cascade,
	retired_at timestamptz not null default now()
);

create index event_old_codes_event_id_idx on event_old_codes (event_id);


-- Current and retired codes share one namespace. The service checks first; this
-- trigger makes it impossible even if two requests race.
create function check_event_code_free_of_old_codes() returns trigger language plpgsql as $$
begin
	if exists (select 1 from event_old_codes where code = new.code and event_id <> new.id) then
		raise exception 'event code % is taken', new.code using errcode = 'unique_violation';
	end if;
	return new;
end;
$$;

create function check_old_code_free_of_event_codes() returns trigger language plpgsql as $$
begin
	if exists (select 1 from events where code = new.code) then
		raise exception 'event code % is taken', new.code using errcode = 'unique_violation';
	end if;
	return new;
end;
$$;

create trigger events_code_namespace before insert or update of code on events
	for each row execute function check_event_code_free_of_old_codes();

create trigger event_old_codes_namespace before insert or update of code on event_old_codes
	for each row execute function check_old_code_free_of_event_codes();

-- Roles: only owner is used today; editor and viewer are modeled for later.
create table event_members (
	event_id integer not null references events (id) on delete cascade,
	user_id integer not null references users (id) on delete cascade,
	role text not null check (role in ('owner', 'editor', 'viewer')),
	created_at timestamptz not null default now(),
	primary key (event_id, user_id)
);

create index event_members_user_id_idx on event_members (user_id);

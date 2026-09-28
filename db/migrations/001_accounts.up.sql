-- Accounts, sessions, and rate-limit counters.

create table users (
	id integer generated always as identity primary key,
	email text not null check (length(email) between 3 and 254),
	display_name text not null check (length(display_name) between 1 and 80),
	password_hash text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Emails are unique regardless of case.
create unique index users_email_lower_key on users (lower(email));


-- Only a SHA-256 hash of the cookie token is stored, so a database leak can't
-- be replayed as live sessions.
create table sessions (
	token_hash bytea primary key,
	user_id integer not null references users (id) on delete cascade,
	created_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	expires_at timestamptz not null
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);


-- Fixed-window counters for rate limits (auth and public writes).
create table rate_limit_buckets (
	bucket_key text not null,
	window_start timestamptz not null,
	hits integer not null default 0,
	primary key (bucket_key, window_start)
);

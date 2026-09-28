-- The accent color an event uses on its public pages (see src/lib/accentColors.js).
alter table events add column accent_color text not null default 'indigo'
	check (accent_color in ('indigo', 'blue', 'teal', 'green', 'amber', 'red', 'pink', 'violet', 'slate'));

-- Calendar files: add "one event per day" and make it the default for new calendars.
-- Existing calendars keep the mode they already have.
alter table calendar_configs drop constraint calendar_configs_ics_mode_check;
alter table calendar_configs add constraint calendar_configs_ics_mode_check check (ics_mode in ('combined', 'per_day', 'separate'));
alter table calendar_configs alter column ics_mode set default 'per_day';

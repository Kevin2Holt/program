update calendar_configs set ics_mode = 'combined' where ics_mode = 'per_day';
alter table calendar_configs alter column ics_mode set default 'combined';
alter table calendar_configs drop constraint calendar_configs_ics_mode_check;
alter table calendar_configs add constraint calendar_configs_ics_mode_check check (ics_mode in ('combined', 'separate'));

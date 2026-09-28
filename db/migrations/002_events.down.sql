drop table if exists event_members;
drop trigger if exists event_old_codes_namespace on event_old_codes;
drop trigger if exists events_code_namespace on events;
drop table if exists event_old_codes;
drop table if exists events;
drop function if exists check_old_code_free_of_event_codes();
drop function if exists check_event_code_free_of_old_codes();
drop table if exists reserved_words;

-- =====================================================================
--  Weekly scrape, step 4 of 4: empty the legs
--
--  Run by database/scripts/weekly.ps1 only after export_schedule.py has
--  written this week's departure boards, timetables and airport carrier lists
--  to Storage. Everything else the site reads from the legs was copied into
--  small tables by 3_refresh.sql (51_schedule_summaries.sql), so the 209 MB of
--  mv_legs -- every departure, per aircraft -- is not needed again until next
--  week's 3_refresh.sql rebuilds it from the next merge.
--
--  WITH NO DATA empties it and hands the space back at once. Anything that
--  still selects from it (or from mv_leg_departures, the view over it) gets
--  "materialized view has not been populated", never last week's rows.
-- =====================================================================
\set ON_ERROR_STOP on
\timing on

set statement_timeout = 0;

refresh materialized view public.mv_legs with no data;

select pg_size_pretty(pg_database_size(current_database())) as database_size;

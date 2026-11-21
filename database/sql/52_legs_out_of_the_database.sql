-- =====================================================================
--  Echo United Alliances -- the legs leave the database between weekly builds
--
--  The site now reads its departure boards, carrier timetables and airport
--  carrier lists from files in Supabase Storage (web/src/lib/schedule.ts,
--  written by database/scripts/export_schedule.py), and everything else it
--  read from the legs from the tables 51_schedule_summaries.sql added. So:
--
--    board_departures, airline_timetable, airport_carriers
--        dropped: the site no longer calls them, and with mv_legs empty they
--        could only ever answer with an error.
--
--    mv_legs
--        emptied, as database/weekly/4_finish.sql will empty it every week
--        once the files are written: 209 MB the free plan does not hold.
--        It, and the mv_leg_departures view over it, stay defined, because
--        3_refresh.sql rebuilds them each week and builds everything from them.
--
--  Run only after export_schedule.py has uploaded the files and the site that
--  reads them is published.
-- =====================================================================

begin;

set local statement_timeout = 0;

drop function if exists public.board_departures(text, integer, text, timestamp with time zone);
drop function if exists public.airline_timetable(uuid, text, text);
drop function if exists public.airport_carriers(text);

refresh materialized view public.mv_legs with no data;

comment on materialized view public.mv_legs is
    'Every departure, per aircraft. EMPTY between weekly builds (52_legs_out_of_the_database.sql): database/weekly/3_refresh.sql fills it, export_schedule.py writes the boards and timetables out of it, 4_finish.sql empties it again.';

commit;

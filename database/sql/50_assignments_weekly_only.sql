-- =====================================================================
--  Echo United Alliances -- flight_assignments lives only during the weekly build
--
--  On 21 November 2026 the free plan's dashboard read 514 of 500 MB.
--  flight_assignments -- which aircraft flies which flight, 657k rows, 120 MB
--  with its indexes -- had become the second-largest thing in the database,
--  yet nothing the site shows reads it:
--
--    mv_legs            is BUILT from it, but is a materialised view: it keeps
--                       its rows after the table is emptied, until the next
--                       REFRESH, and only database/weekly/3_refresh.sql
--                       refreshes it.
--    v_airline_metrics  reads it for each airline's cheapest economy fare,
--                       and the only thing that reads that column is
--                       mv_airline_directory -- also refreshed only by
--                       3_refresh.sql, while the table is full.
--
--  (Booking, the one feature that read assignments live, went in 45.)
--
--  So it is emptied here, and from now on every weekly merge reloads it in
--  full from the scrape, 3_refresh.sql builds everything from it, and then
--  empties it again (3_refresh.sql guards the mv_legs refresh, so a refresh
--  run on its own can never rebuild the legs from an empty table).
--
--  Nothing is lost: the week's assignments are in database/csv/
--  flight_assignments.csv on the machine that runs the weekly scrape, and the
--  next scrape writes them again.
-- =====================================================================

begin;

comment on table public.flight_assignments is
    'Which aircraft flies which flight. Filled by database/weekly/2_merge.sql, read by 3_refresh.sql to build mv_legs and mv_airline_directory, and emptied again at the end of 3_refresh.sql: it is EMPTY between weekly builds (50_assignments_weekly_only.sql). Never refresh mv_legs while it is empty.';

truncate public.flight_assignments;

commit;

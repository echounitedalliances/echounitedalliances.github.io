-- =====================================================================
--  Echo United Alliances -- Aegis changes colour
--
--  30 October 2026: Aegis moved from lime (#D0FF4D) to the coral of its
--  new in-game alliance logo, #FF456A. The division takes it, and so does
--  every Aegis carrier still wearing the old lime -- the same guard
--  19_division_colours and 29_airline_division_moves use, so a carrier
--  given a colour of its own by hand keeps it.
--
--  The materialised views carry these colours, so this is applied before
--  the weekly refresh rebuilds them (or followed by 3_refresh.sql).
-- =====================================================================

begin;

update public.airlines
   set accent_color = '#FF456A'
 where division_code = 'aegis'
   and upper(accent_color) = '#D0FF4D';

update public.divisions
   set accent_color = '#FF456A'
 where division_code = 'aegis';

commit;

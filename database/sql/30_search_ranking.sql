-- =====================================================================
--  Echo United Alliances -- an airline you name comes first
--
--  search_airlines matched on a substring of each carrier's search text and
--  then ordered purely by size. That text includes the division name, so a
--  short query matches far more than the airline it names.
--
--  Found 16 September 2026, testing the airlines that joined that week: ROX
--  (Elysium) could not be found by typing "ROX". The query matched "p-ROX-ima"
--  in all 73 Proxima carriers, every one of them larger, and ROX landed below
--  the first page of 60 results -- a member of the alliance that its own name
--  did not find.
--
--  What was typed is now ranked before what merely contains it:
--
--      0  the airline's name, or its carrier or game code, exactly
--      1  a name that starts with what was typed
--      2  anything else that contains it
--
--  and size breaks ties within each, as before. With no query at all every
--  row ranks 0, so the home page spotlight and the division lists come out in
--  exactly the order they always did.
--
--  Same signature and return type as 26_airline_overrides.sql, which this
--  replaces; it still reads v_airline_directory_live, so admin renames and
--  division moves are searchable immediately. Safe to run on its own: it
--  replaces one function and drops nothing.
-- =====================================================================

begin;

create or replace function public.search_airlines(
    p_query    text default null,
    p_division text default null,
    p_country  text default null,
    p_limit    integer default 60,
    p_offset   integer default 0
)
returns setof public.mv_airline_directory
language sql stable parallel safe as $$
    with q as (select nullif(lower(btrim(coalesce(p_query, ''))), '') as t)
    select d.*
      from public.v_airline_directory_live d, q
     where (q.t is null or d.search_blob like '%' || q.t || '%')
       and (p_division is null or p_division = '' or d.division_code = p_division)
       and (p_country  is null or p_country  = '' or d.airline_country = upper(p_country))
     order by case
                when q.t is null                          then 0
                when lower(d.airline_name) = q.t
                  or lower(d.carrier_code) = q.t
                  or lower(d.airline_code) = q.t          then 0
                when lower(d.airline_name) like q.t || '%' then 1
                else 2
              end,
              d.prominence desc,
              d.airline_name
     limit  greatest(coalesce(p_limit, 60), 1)
    offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_airlines(text, text, text, integer, integer) is
    'Carriers matching a query, the airline actually named first: exact name or code, then name prefix, then anything containing it, each by size.';

grant execute on function public.search_airlines(text, text, text, integer, integer)
    to anon, authenticated;

commit;

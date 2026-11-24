-- =====================================================================
--  Echo United Alliances -- "claimed" moves from the airline page to the
--  claim search box
--
--  Airline.tsx showed a "Claimed" badge on every carrier's own public
--  page, fetched one row at a time from airline_claim_holder(). Moved
--  instead to the one place it actually helps a decision: the search box
--  in MyAirlineClaim.tsx that asks which airline to request, so someone
--  about to ask for a carrier can see straight away that it already has
--  a holder, rather than finding out only after an admin turns the
--  request down (or, worse, approves it and bumps the existing holder).
--
--  search_airlines (30_search_ranking.sql) stays as it is -- Directory,
--  Division, Home and the admin search boxes all call it for carriers in
--  general and none of them need claim status. search_airlines_claimable
--  wraps it instead of duplicating its ranking: same query, same order,
--  one more column joined from the live airline_claims table (never the
--  materialised directory, which only refreshes with the weekly data
--  import and would show a claim made an hour ago as still open).
--
--  airline_claim_holder(uuid) has no caller left once Airline.tsx stops
--  asking it, so it goes with the badge rather than staying as unused
--  surface area.
-- =====================================================================

begin;

create or replace function public.search_airlines_claimable(
    p_query    text default null,
    p_division text default null,
    p_country  text default null,
    p_limit    integer default 60,
    p_offset   integer default 0
)
returns table (
    uid           uuid,
    carrier_code  text,
    airline_name  text,
    division_name text,
    claimed       boolean
)
language sql stable parallel safe as $$
    select a.uid, a.carrier_code, a.airline_name, a.division_name,
           exists (
               select 1 from public.airline_claims c
                where c.airline_uid = a.uid and c.status = 'approved'
           )
      from public.search_airlines(p_query, p_division, p_country, p_limit, p_offset) a;
$$;

comment on function public.search_airlines_claimable(text, text, text, integer, integer) is
    'search_airlines, plus whether each result already has an approved holder -- for the claim search box only. Reads airline_claims live, not the materialised directory, so a claim approved moments ago already shows.';

grant execute on function public.search_airlines_claimable(text, text, text, integer, integer)
    to authenticated;

drop function if exists public.airline_claim_holder(uuid);

commit;

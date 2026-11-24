-- =====================================================================
--  Echo United Alliances -- fixing search_airlines_claimable's missing
--  security definer
--
--  61_claim_search_shows_claimed.sql's search_airlines_claimable queries
--  public.airline_claims directly (the exists() checking for an approved
--  claim), but that table has row level security on and
--  `revoke all ... from anon, authenticated` (54_airline_claims.sql) --
--  nothing reaches it except through a function that explicitly steps
--  around that, the same way every other function touching this table
--  already does. This one was plain `language sql stable parallel safe`,
--  no security definer, so it ran as the CALLING role (authenticated)
--  and hit exactly that wall: the query failed, supabase.rpc() returned
--  an error MyAirlineClaim.tsx was not even checking, and the dropdown
--  silently showed nothing at all.
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
language sql stable security definer set search_path = public as $$
    select a.uid, a.carrier_code, a.airline_name, a.division_name,
           exists (
               select 1 from public.airline_claims c
                where c.airline_uid = a.uid and c.status = 'approved'
           )
      from public.search_airlines(p_query, p_division, p_country, p_limit, p_offset) a;
$$;

comment on function public.search_airlines_claimable(text, text, text, integer, integer) is
    'search_airlines, plus whether each result already has an approved holder -- for the claim search box only. security definer: airline_claims has no direct grant for authenticated, same as every other function reading it.';

commit;

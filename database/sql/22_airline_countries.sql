-- =====================================================================
--  Echo United Alliances -- the countries carriers are registered in
--
--  The directory's country filter counted the rows it had already fetched.
--  That page is 60 carriers ordered by prominence, so Vietnam showed "VN 1"
--  and then returned 16 when you clicked it -- the count was of the page, not
--  of the database, and there was no way to tell from looking.
--
--  It also meant a country with no carrier in the first 60 had no chip at all
--  and could not be reached, and the list was capped at 24 besides.
--
--  This counts the whole set, and narrows with the filters already applied:
--  pick Kyra first and the list becomes the countries Kyra flies from, with
--  Kyra's numbers. Names come from the countries table, so the menu can say
--  "Vietnam" rather than make people know what VN is.
-- =====================================================================

begin;

create or replace function public.airline_countries(
    p_query    text default null,
    p_division text default null
)
returns table (
    country_code text,
    country_name text,
    carriers     bigint
)
language sql stable parallel safe as $$
    select d.airline_country,
           coalesce(c.country_name, d.airline_country),
           count(*)::bigint
      from public.mv_airline_directory d
      left join public.countries c on c.country_code = d.airline_country
     where d.airline_country is not null
       and d.airline_country <> ''
       and (nullif(btrim(coalesce(p_division, '')), '') is null
            or d.division_code = lower(btrim(p_division)))
       and (nullif(btrim(coalesce(p_query, '')), '') is null
            or d.search_blob like '%' || lower(btrim(p_query)) || '%')
     group by d.airline_country, c.country_name
     order by count(*) desc, coalesce(c.country_name, d.airline_country);
$$;

comment on function public.airline_countries(text, text) is
    'Countries the published carriers are registered in, counted across the whole directory rather than one page of it, and narrowed by the same query and division filters the list uses.';

grant execute on function public.airline_countries(text, text) to anon, authenticated;

commit;

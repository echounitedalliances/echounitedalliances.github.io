-- =====================================================================
--  Echo United Alliances -- the divisions' own colours
--
--  The first set was read off the chevron marks by eye, which got the hue
--  roughly right and the value wrong: they were saturated mid-tones picked
--  against a white assumption, and this site is dark. These are the colours
--  the group actually uses.
--
--  Two things cache them, and both have to be rebuilt or the site keeps
--  showing the old palette in the places that matter most:
--
--    mv_airline_directory  every carrier's accent, which is what the
--                          directory, the search results and the spotlight
--                          all colour themselves by
--    mv_network_arcs       the colour of every line on the network map
--
--  Kept in step with 02_load_from_csv.sql, which sets the same values on a
--  full rebuild. Change both together.
-- =====================================================================

begin;

-- Carriers inherit their division's accent, so an airline still wearing the
-- OLD division colour is one that was never given its own and should move
-- with the division. One that differs was set by hand and is left alone.
create temporary table echo_colour_change (
    code text primary key,
    old_accent text not null,
    new_accent text not null
) on commit drop;

insert into echo_colour_change (code, old_accent, new_accent) values
    ('kyra',    '#8B5CF6', '#7B35FF'),
    ('aegis',   '#B9F227', '#D0FF4D'),
    ('elysium', '#E549C9', '#E46EFF'),
    ('proxima', '#45C8F0', '#81FBFE'),
    ('vilis',   '#F4622A', '#FF7E42'),
    ('rhea',    '#2FBF5B', '#5DFE95'),
    ('elion',   '#2E6FF2', '#7EA0F4'),
    ('aura',    '#F0605F', '#EF9D9E');

-- Every division must be named, or one silently keeps the old colour.
do $$
declare missing text;
begin
    select string_agg(d.division_code, ', ' order by d.division_code) into missing
      from public.divisions d
     where not exists (select 1 from echo_colour_change c where c.code = d.division_code);
    if missing is not null then
        raise exception 'division(s) missing from the colour table: %', missing;
    end if;
end $$;

update public.airlines a
   set accent_color = c.new_accent
  from echo_colour_change c
 where a.division_code = c.code
   and upper(a.accent_color) = upper(c.old_accent);

update public.divisions d
   set accent_color = c.new_accent
  from echo_colour_change c
 where d.division_code = c.code;

commit;

-- Outside the transaction: REFRESH MATERIALIZED VIEW takes its own locks and
-- there is no reason to hold the writes open across them.
refresh materialized view public.mv_airline_directory;
refresh materialized view public.mv_network_arcs;

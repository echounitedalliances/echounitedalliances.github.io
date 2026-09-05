-- =====================================================================
--  Echo United Alliances -- the running order of the divisions
--
--  sort_order arrived from the scrape as the order the divisions were pulled
--  in, which is alphabetical after Proxima and means nothing. The group runs a
--  policy order instead, and every surface that lists divisions reads
--  sort_order, so setting it here moves all of them at once.
--
--  Kept in step with DISPLAY_ORDER in database/scripts/build_database.py, which
--  is what a rebuild from the JSON exports would write. Change both together.
-- =====================================================================

begin;

-- sort_order is unique and not deferrable, so a straight permutation would
-- collide partway through. Park the values out of range first.
update public.divisions set sort_order = sort_order + 100;

update public.divisions d
   set sort_order = v.rank
  from (values
        ('kyra',    1),   -- main
        ('aegis',   2),
        ('elysium', 3),   -- the realism alliance
        ('proxima', 4),
        ('rhea',    5),
        ('vilis',   6),
        ('elion',   7),
        ('aura',    8)
       ) as v(code, rank)
 where d.division_code = v.code;

-- Every division must have been named above, or one is left parked at 100+
-- and sorts to the end of every list on the site without anyone noticing.
do $$
declare stray text;
begin
    select string_agg(division_code, ', ' order by division_code)
      into stray
      from public.divisions where sort_order > 8;
    if stray is not null then
        raise exception 'division(s) missing from the policy order: %', stray;
    end if;
end $$;

commit;

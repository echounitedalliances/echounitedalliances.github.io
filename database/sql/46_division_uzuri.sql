-- =====================================================================
--  Echo United Alliances -- Uzuri, the tenth division
--
--  Founded 30 October 2026 and led by Ahnaf, who also leads Lior (the
--  division whose code is still "proxima"), Elion and Aura. Its row, its
--  place at the end of the order and its colour: the gold of its in-game
--  alliance logo, #FAE246. The weekly merge refuses a division the site
--  does not know, so this runs before Uzuri's first scrape is loaded.
--
--  The same day Proxima was renamed Lior. That needs nothing here: the
--  name comes from build_database.py and the merge writes it.
-- =====================================================================

begin;

insert into public.divisions (division_code, division_name, sort_order, accent_color)
values ('uzuri', 'Uzuri', 10, '#FAE246')
on conflict (division_code) do nothing;

commit;

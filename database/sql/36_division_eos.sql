-- =====================================================================
--  Echo United Alliances -- Eos, the ninth division
--
--  Opened 2 October 2026: "Echo Eos" in the game, 29 founding carriers.
--
--  The weekly merge only refreshes divisions the database already has, and
--  refuses a scrape holding one it does not (database/weekly/2_merge.sql),
--  so a division starts here. What this file decides is group policy, not
--  game data: the division's row, its place in the order, and its colour.
--  Everything the game knows about it -- the alliance id, its name and
--  description, its leader -- arrives with the next merge.
--
--  The colour is the alliance's own logo colour in the game, #FDECD8. Every
--  other division's accent is its in-game colour to within a shade, so Eos
--  takes its own exactly.
--
--  Kept in step with 02_load_from_csv.sql, 16_division_policy.sql and
--  19_division_colours.sql (a rebuild), DIVISIONS and DISPLAY_ORDER in
--  database/scripts/build_database.py, and --division-eos in
--  web/src/styles.css. Re-runnable: an existing row is left alone.
-- =====================================================================

begin;

insert into public.divisions (division_code, division_name, sort_order, accent_color)
values ('eos', 'Eos', 9, '#FDECD8')
on conflict (division_code) do nothing;

comment on table public.divisions is
    'The member divisions of Echo United Alliances. division_code doubles as the URL segment, e.g. /d/proxima.';

commit;

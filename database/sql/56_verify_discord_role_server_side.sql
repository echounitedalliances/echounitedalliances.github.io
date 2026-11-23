-- =====================================================================
--  Echo United Alliances -- the Discord role check moves server-side
--
--  Reported: resonants.discord_role_verified_at (53_discord_resonant_badge)
--  was never actually being set. lib/auth.tsx wrote it with a plain client
--  update the moment the browser's own Discord check passed, and that
--  update has been silently refused since 5 October 2026
--  (40_lock_admin_flag.sql), which narrowed the client's write grant on
--  resonants to display_name, given_name, family_name, home_airport and
--  home_division only. discord_role_verified_at was never on that list.
--  The call used void ... .then(...) with no error handled, so the refusal
--  was invisible: Discord sign-in appeared to work, the badge never
--  appeared, and 55_claims_require_discord_verification.sql's gate kept
--  refusing everyone, including people who really had the role. On the
--  live database: 0 of 68 resonants had the column set.
--
--  The fix is not to grant that column to authenticated. That would let any
--  signed-in account do
--      PATCH /rest/v1/resonants?user_id=eq.<self>
--             {"discord_role_verified_at": "2026-01-01"}
--  and pass the claim gate without ever proving anything to Discord -- the
--  exact shape of the is_admin hole 40_lock_admin_flag.sql closed, on a
--  different column.
--
--  Nothing here changes: this file adds no column and no grant. The actual
--  fix is supabase/functions/verify-discord-role, which re-does the same
--  guild-member check lib/auth.tsx used to trust itself to report, and
--  writes the result with the service role -- the one key that bypasses
--  the column grant deliberately, not by a mistake a client request could
--  repeat. See that function's own header for the rest of it, and
--  53_discord_resonant_badge.sql's corrected note.
--
--  This file is only the historical record of why, plus one more column
--  this same audit found broken the identical way.
--
--  WHY release_claimed_airline() IS NEEDED TOO
--
--  MyAirlineClaim.tsx's "Release this airline" button wrote
--  claimed_airline_uid = null the same way: a direct client update. That
--  column is not in the client's grant either (43_claim_airline.sql added
--  it after 40_lock_admin_flag.sql, and never widened the grant), so
--  releasing a held airline has been failing the same silent way. Unlike
--  the Discord column, this one needs no re-verification against anything
--  external -- clearing your own claim is safe for you to do outright, the
--  same way admin_remove_resonant lets an admin act on a row a plain
--  update could not reach. A small security definer function, scoped to
--  only ever write null and only to the caller's own row, is the narrow
--  fix: it does not need, and does not get, a column grant.
-- =====================================================================

begin;

create or replace function public.release_claimed_airline()
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
    update public.resonants
       set claimed_airline_uid = null, updated_at = now()
     where user_id = public.echo_current_user_id();
end;
$$;

comment on function public.release_claimed_airline() is
    'Clears the caller''s own claimed_airline_uid. Exists because that column is not in the client''s update grant (40_lock_admin_flag.sql) -- a direct client update silently failed the same way discord_role_verified_at did.';

revoke all on function public.release_claimed_airline() from public, anon;
grant execute on function public.release_claimed_airline() to authenticated;

commit;
